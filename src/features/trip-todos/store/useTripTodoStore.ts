import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createPersistHydrationStore } from "../../../store/createPersistHydrationStore";
import { activateLocalPrivateDataScope, deactivateLocalPrivateDataScope, inferLegacyLocalPrivateDataOwner, resolveHydratedLocalPrivateDataScope, transferLocalPrivateDataScope } from "../../auth/services/localPrivateDataPolicy";
import {
  createGeneratedTripTodo,
  createTripTodo,
  mergeGeneratedTripTodo,
  normalizeDismissedGeneratedKeys,
  normalizeTripTodosByTripId,
  reconcileTripTodoLinks,
  resolveGeneratedTripTodo,
  type ResolveGeneratedTripTodoResult,
  sortTripTodos,
  shouldArchiveMissingGeneratedTodo,
  shouldRememberGeneratedTodoDismissal,
  tripTodoToDraft,
  updateTripTodo,
} from "../logic/tripTodoState";
import type {
  TripTodo,
  TripTodoAutomationScope,
  TripTodoDraft,
  TripTodoGeneratedSeed,
  TripTodoMutationResult,
  TripTodoStatus,
} from "../types";

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nowIso = () => new Date().toISOString();

export const TRIP_TODO_STORAGE_KEY = "duri-trip-todos";
export const TRIP_TODO_STORAGE_VERSION = 2;

export type GeneratedTodoSyncResult = {
  created: TripTodo[];
  updated: TripTodo[];
  archived: TripTodo[];
  skippedDismissedKeys: string[];
};

type TripTodoState = {
  todosByTripId: Record<string, TripTodo[]>;
  /** 자동 TODO를 사용자가 삭제했을 때 같은 이슈가 즉시 되살아나지 않도록 보관한다. */
  dismissedGeneratedKeysByTripId: Record<string, Record<string, string>>;
  privateDataOwnerUserId: string | null;
  /** undefined는 auth 결정 전, null은 명시적 로그아웃 상태다. persist하지 않는다. */
  requestedPrivateDataOwnerUserId: string | null | undefined;
  privateTodoDataByOwnerUserId: Record<string, PrivateTodoData>;
  legacyQuarantinedTodoData: PrivateTodoData;
  activatePrivateDataScope(userId: string): void;
  deactivatePrivateDataScope(): void;
  transferPrivateDataScope(previousUserId: string, nextUserId: string): void;
  createTodo(tripId: string, createdByUserId: string, draft: TripTodoDraft, now?: string): TripTodoMutationResult;
  updateTodo(tripId: string, todoId: string, draft: TripTodoDraft, now?: string): TripTodoMutationResult;
  setStatus(tripId: string, todoId: string, status: Exclude<TripTodoStatus, "archived">, now?: string, userInitiated?: boolean): TripTodo | undefined;
  archiveTodo(tripId: string, todoId: string, now?: string): TripTodo | undefined;
  resolveGeneratedTodo(tripId: string, todoId: string, now?: string): ResolveGeneratedTripTodoResult | undefined;
  deleteTodo(tripId: string, todoId: string, now?: string): TripTodo | undefined;
  toggleChecklistItem(tripId: string, todoId: string, checklistItemId: string, now?: string): TripTodo | undefined;
  snoozeTodo(tripId: string, todoId: string, until: string, now?: string): TripTodo | undefined;
  reconcileLinks(tripId: string, valid: { itineraryItemIds?: readonly string[]; documentIds?: readonly string[] }, now?: string): TripTodo[];
  upsertGeneratedTodo(seed: TripTodoGeneratedSeed, now?: string): TripTodo | undefined;
  syncGeneratedTodos(tripId: string, scope: TripTodoAutomationScope, seeds: readonly TripTodoGeneratedSeed[], now?: string, archiveMissingDedupePrefixes?: readonly string[]): GeneratedTodoSyncResult;
  allowGeneratedTodoAgain(tripId: string, dedupeKey: string): void;
  removeTripTodos(tripId: string): TripTodo[];
};

export const useTripTodoHydrationState = createPersistHydrationStore();

type PrivateTodoData = {
  todosByTripId: Record<string, TripTodo[]>;
  dismissedGeneratedKeysByTripId: Record<string, Record<string, string>>;
};

const emptyPrivateTodoData = (): PrivateTodoData => ({ todosByTripId: {}, dismissedGeneratedKeysByTripId: {} });

function normalizePrivateTodoData(value: unknown): PrivateTodoData {
  const source = isRecord(value) ? value : {};
  return {
    todosByTripId: normalizeTripTodosByTripId(source.todosByTripId),
    dismissedGeneratedKeysByTripId: normalizeDismissedGeneratedKeys(source.dismissedGeneratedKeysByTripId),
  };
}

function normalizePrivateTodoScopes(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, data]) => (
    userId ? [[userId, normalizePrivateTodoData(data)] as const] : []
  )));
}

function hasPrivateTodoData(data: PrivateTodoData) {
  return Object.values(data.todosByTripId).some((todos) => todos.length > 0)
    || Object.values(data.dismissedGeneratedKeysByTripId).some((keys) => Object.keys(keys).length > 0);
}

function normalizePersistedTodoState(value: unknown) {
  const source = isRecord(value) ? value : {};
  let active = normalizePrivateTodoData(source);
  let privateDataOwnerUserId = typeof source.privateDataOwnerUserId === "string" && source.privateDataOwnerUserId
    ? source.privateDataOwnerUserId
    : null;
  const privateTodoDataByOwnerUserId = normalizePrivateTodoScopes(source.privateTodoDataByOwnerUserId);
  let legacyQuarantinedTodoData = normalizePrivateTodoData(source.legacyQuarantinedTodoData);
  if (!privateDataOwnerUserId && hasPrivateTodoData(active)) {
    const inferred = inferLegacyLocalPrivateDataOwner(
      Object.values(active.todosByTripId).flat().map((todo) => todo.createdByUserId),
    );
    if (inferred.status === "single-owner") privateDataOwnerUserId = inferred.userId;
    else {
      legacyQuarantinedTodoData = {
        todosByTripId: { ...legacyQuarantinedTodoData.todosByTripId, ...active.todosByTripId },
        dismissedGeneratedKeysByTripId: {
          ...legacyQuarantinedTodoData.dismissedGeneratedKeysByTripId,
          ...active.dismissedGeneratedKeysByTripId,
        },
      };
      active = emptyPrivateTodoData();
    }
  }
  return {
    ...active,
    privateDataOwnerUserId,
    privateTodoDataByOwnerUserId,
    legacyQuarantinedTodoData,
  };
}

function replaceTodo(todos: readonly TripTodo[], nextTodo: TripTodo) {
  return sortTripTodos(todos.map((todo) => todo.id === nextTodo.id ? nextTodo : todo));
}

export const useTripTodoStore = create<TripTodoState>()(
  persist(
    (set, get) => ({
      todosByTripId: {},
      dismissedGeneratedKeysByTripId: {},
      privateDataOwnerUserId: null,
      requestedPrivateDataOwnerUserId: undefined,
      privateTodoDataByOwnerUserId: {},
      legacyQuarantinedTodoData: emptyPrivateTodoData(),
      activatePrivateDataScope: (userId) => set((state) => {
        const next = activateLocalPrivateDataScope({
          ownerUserId: state.privateDataOwnerUserId,
          activeData: {
            todosByTripId: state.todosByTripId,
            dismissedGeneratedKeysByTripId: state.dismissedGeneratedKeysByTripId,
          },
          dataByOwnerUserId: state.privateTodoDataByOwnerUserId,
        }, userId, emptyPrivateTodoData);
        return {
          privateDataOwnerUserId: next.ownerUserId,
          requestedPrivateDataOwnerUserId: userId,
          todosByTripId: next.activeData.todosByTripId,
          dismissedGeneratedKeysByTripId: next.activeData.dismissedGeneratedKeysByTripId,
          privateTodoDataByOwnerUserId: next.dataByOwnerUserId,
        };
      }),
      deactivatePrivateDataScope: () => set((state) => {
        const next = deactivateLocalPrivateDataScope({
          ownerUserId: state.privateDataOwnerUserId,
          activeData: {
            todosByTripId: state.todosByTripId,
            dismissedGeneratedKeysByTripId: state.dismissedGeneratedKeysByTripId,
          },
          dataByOwnerUserId: state.privateTodoDataByOwnerUserId,
        }, emptyPrivateTodoData);
        return {
          privateDataOwnerUserId: next.ownerUserId,
          requestedPrivateDataOwnerUserId: null,
          todosByTripId: next.activeData.todosByTripId,
          dismissedGeneratedKeysByTripId: next.activeData.dismissedGeneratedKeysByTripId,
          privateTodoDataByOwnerUserId: next.dataByOwnerUserId,
        };
      }),
      transferPrivateDataScope: (previousUserId, nextUserId) => set((state) => {
        const next = transferLocalPrivateDataScope({
          ownerUserId: state.privateDataOwnerUserId,
          activeData: {
            todosByTripId: state.todosByTripId,
            dismissedGeneratedKeysByTripId: state.dismissedGeneratedKeysByTripId,
          },
          dataByOwnerUserId: state.privateTodoDataByOwnerUserId,
        }, previousUserId, nextUserId, emptyPrivateTodoData);
        return {
          privateDataOwnerUserId: next.ownerUserId,
          requestedPrivateDataOwnerUserId: nextUserId,
          todosByTripId: next.activeData.todosByTripId,
          dismissedGeneratedKeysByTripId: next.activeData.dismissedGeneratedKeysByTripId,
          privateTodoDataByOwnerUserId: next.dataByOwnerUserId,
        };
      }),
      createTodo: (tripId, createdByUserId, draft, now = nowIso()) => {
        const current = get().todosByTripId[tripId] ?? [];
        const result = createTripTodo(draft, { tripId, createdByUserId, now, existingIds: current.map((todo) => todo.id) });
        if (!result.ok) return result;
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: sortTripTodos([...current, result.todo]) } }));
        return result;
      },
      updateTodo: (tripId, todoId, draft, now = nowIso()) => {
        const current = get().todosByTripId[tripId] ?? [];
        const existing = current.find((todo) => todo.id === todoId);
        if (!existing) return { ok: false, errors: {}, message: "수정할 TODO를 찾을 수 없어요." };
        const result = updateTripTodo(existing, draft, now);
        if (!result.ok) return result;
        const edited = { ...result.todo, userEditedAt: now };
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: replaceTodo(state.todosByTripId[tripId] ?? [], edited) } }));
        return { ok: true, todo: edited };
      },
      setStatus: (tripId, todoId, status, now = nowIso(), userInitiated = true) => {
        const existing = (get().todosByTripId[tripId] ?? []).find((todo) => todo.id === todoId);
        if (!existing) return undefined;
        const result = updateTripTodo(existing, { ...tripTodoToDraft(existing), status }, now);
        if (!result.ok) return undefined;
        const edited = userInitiated ? { ...result.todo, userEditedAt: now } : result.todo;
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: replaceTodo(state.todosByTripId[tripId] ?? [], edited) } }));
        return edited;
      },
      archiveTodo: (tripId, todoId, now = nowIso()) => {
        const existing = (get().todosByTripId[tripId] ?? []).find((todo) => todo.id === todoId);
        if (!existing) return undefined;
        const archived = { ...existing, status: "archived" as const, archivedAt: now, archivedReason: "user" as const, updatedAt: now, userEditedAt: now };
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: replaceTodo(state.todosByTripId[tripId] ?? [], archived) } }));
        return archived;
      },
      resolveGeneratedTodo: (tripId, todoId, now = nowIso()) => {
        const existing = (get().todosByTripId[tripId] ?? []).find((todo) => todo.id === todoId);
        if (!existing) return undefined;
        const result = resolveGeneratedTripTodo(existing, now);
        if (result.status !== "resolved") return result;
        set((state) => ({
          todosByTripId: {
            ...state.todosByTripId,
            [tripId]: replaceTodo(state.todosByTripId[tripId] ?? [], result.todo),
          },
        }));
        return result;
      },
      deleteTodo: (tripId, todoId, now = nowIso()) => {
        const existing = (get().todosByTripId[tripId] ?? []).find((todo) => todo.id === todoId);
        if (!existing) return undefined;
        set((state) => {
          const dismissed = shouldRememberGeneratedTodoDismissal(existing) && existing.dedupeKey
            ? { ...state.dismissedGeneratedKeysByTripId, [tripId]: { ...(state.dismissedGeneratedKeysByTripId[tripId] ?? {}), [existing.dedupeKey]: now } }
            : state.dismissedGeneratedKeysByTripId;
          return {
            todosByTripId: { ...state.todosByTripId, [tripId]: (state.todosByTripId[tripId] ?? []).filter((todo) => todo.id !== todoId) },
            dismissedGeneratedKeysByTripId: dismissed,
          };
        });
        return existing;
      },
      toggleChecklistItem: (tripId, todoId, checklistItemId, now = nowIso()) => {
        const existing = (get().todosByTripId[tripId] ?? []).find((todo) => todo.id === todoId);
        if (!existing) return undefined;
        let changed = false;
        const checklist = existing.checklist.map((entry) => {
          if (entry.id !== checklistItemId) return entry;
          changed = true;
          const completed = !entry.completed;
          return { ...entry, completed, completedAt: completed ? now : undefined };
        });
        if (!changed) return undefined;
        const updated = { ...existing, checklist, updatedAt: now, userEditedAt: now };
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: replaceTodo(state.todosByTripId[tripId] ?? [], updated) } }));
        return updated;
      },
      snoozeTodo: (tripId, todoId, until, now = nowIso()) => {
        if (!Number.isFinite(Date.parse(until))) return undefined;
        const existing = (get().todosByTripId[tripId] ?? []).find((todo) => todo.id === todoId);
        if (!existing?.due) return undefined;
        const updated = { ...existing, due: { ...existing.due, snoozedUntil: until }, updatedAt: now, userEditedAt: now };
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: replaceTodo(state.todosByTripId[tripId] ?? [], updated) } }));
        return updated;
      },
      reconcileLinks: (tripId, valid, now = nowIso()) => {
        const current = get().todosByTripId[tripId] ?? [];
        const next = current.map((todo) => reconcileTripTodoLinks(todo, valid, now));
        if (next.every((todo, index) => todo === current[index])) return current;
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: sortTripTodos(next) } }));
        return next;
      },
      upsertGeneratedTodo: (seed, now = nowIso()) => {
        if (get().dismissedGeneratedKeysByTripId[seed.tripId]?.[seed.dedupeKey]) return undefined;
        const current = get().todosByTripId[seed.tripId] ?? [];
        const existing = current.find((todo) => todo.dedupeKey === seed.dedupeKey)
          ?? (seed.source.scope === "schedule-impact" && seed.source.referenceId
            ? current.find((todo) => todo.source.scope === "schedule-impact" && todo.source.referenceId === seed.source.referenceId)
            : undefined);
        const todo = existing
          ? mergeGeneratedTripTodo(existing, seed, now)
          : createGeneratedTripTodo(seed, now, current.map((entry) => entry.id));
        if (!todo) return undefined;
        set((state) => ({
          todosByTripId: {
            ...state.todosByTripId,
            [seed.tripId]: existing
              ? replaceTodo(state.todosByTripId[seed.tripId] ?? [], todo)
              : sortTripTodos([...(state.todosByTripId[seed.tripId] ?? []), todo]),
          },
        }));
        return todo;
      },
      syncGeneratedTodos: (tripId, scope, seeds, now = nowIso(), archiveMissingDedupePrefixes) => {
        const result: GeneratedTodoSyncResult = { created: [], updated: [], archived: [], skippedDismissedKeys: [] };
        const validSeeds = seeds.filter((seed) => seed.tripId === tripId && seed.source.scope === scope);
        const activeKeys = new Set(validSeeds.map((seed) => seed.dedupeKey));
        const dismissed = get().dismissedGeneratedKeysByTripId[tripId] ?? {};
        let next = [...(get().todosByTripId[tripId] ?? [])];
        for (const seed of validSeeds) {
          if (dismissed[seed.dedupeKey]) { result.skippedDismissedKeys.push(seed.dedupeKey); continue; }
          const index = next.findIndex((todo) => todo.dedupeKey === seed.dedupeKey);
          if (index >= 0) {
            const updated = mergeGeneratedTripTodo(next[index], seed, now);
            next[index] = updated;
            result.updated.push(updated);
          } else {
            const created = createGeneratedTripTodo(seed, now, next.map((todo) => todo.id));
            if (created) { next.push(created); result.created.push(created); }
          }
        }
        next = next.map((todo) => {
          if (!shouldArchiveMissingGeneratedTodo({ todo, scope, activeDedupeKeys: activeKeys, archiveMissingDedupePrefixes })) return todo;
          const archived = { ...todo, status: "archived" as const, archivedAt: now, archivedReason: "resolved" as const, updatedAt: now };
          result.archived.push(archived);
          return archived;
        });
        set((state) => ({ todosByTripId: { ...state.todosByTripId, [tripId]: sortTripTodos(next) } }));
        return result;
      },
      allowGeneratedTodoAgain: (tripId, dedupeKey) => set((state) => {
        if (!state.dismissedGeneratedKeysByTripId[tripId]?.[dedupeKey]) return state;
        const nextTrip = { ...state.dismissedGeneratedKeysByTripId[tripId] };
        delete nextTrip[dedupeKey];
        return { dismissedGeneratedKeysByTripId: { ...state.dismissedGeneratedKeysByTripId, [tripId]: nextTrip } };
      }),
      removeTripTodos: (tripId) => {
        const removed = get().todosByTripId[tripId] ?? [];
        set((state) => {
          const todosByTripId = { ...state.todosByTripId };
          const dismissedGeneratedKeysByTripId = { ...state.dismissedGeneratedKeysByTripId };
          delete todosByTripId[tripId];
          delete dismissedGeneratedKeysByTripId[tripId];
          return { todosByTripId, dismissedGeneratedKeysByTripId };
        });
        return removed;
      },
    }),
    {
      name: TRIP_TODO_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: TRIP_TODO_STORAGE_VERSION,
      partialize: (state) => ({
        todosByTripId: state.todosByTripId,
        dismissedGeneratedKeysByTripId: state.dismissedGeneratedKeysByTripId,
        privateDataOwnerUserId: state.privateDataOwnerUserId,
        privateTodoDataByOwnerUserId: state.privateTodoDataByOwnerUserId,
        legacyQuarantinedTodoData: state.legacyQuarantinedTodoData,
      }),
      migrate: (persistedState) => normalizePersistedTodoState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(() => {
          const persisted = normalizePersistedTodoState(persistedState);
          const scoped = resolveHydratedLocalPrivateDataScope({
            ownerUserId: persisted.privateDataOwnerUserId,
            activeData: {
              todosByTripId: persisted.todosByTripId,
              dismissedGeneratedKeysByTripId: persisted.dismissedGeneratedKeysByTripId,
            },
            dataByOwnerUserId: persisted.privateTodoDataByOwnerUserId,
          }, currentState.requestedPrivateDataOwnerUserId, emptyPrivateTodoData);
          return {
            ...persisted,
            privateDataOwnerUserId: scoped.ownerUserId,
            todosByTripId: scoped.activeData.todosByTripId,
            dismissedGeneratedKeysByTripId: scoped.activeData.dismissedGeneratedKeysByTripId,
            privateTodoDataByOwnerUserId: scoped.dataByOwnerUserId,
          };
        })(),
      }),
      onRehydrateStorage: () => {
        useTripTodoHydrationState.getState().begin();
        return (_state, error) => error
          ? useTripTodoHydrationState.getState().fail("저장된 TODO를 불러오지 못했어요. 일정표는 그대로 사용할 수 있어요.")
          : useTripTodoHydrationState.getState().succeed();
      },
    },
  ),
);
