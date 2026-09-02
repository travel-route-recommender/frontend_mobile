import type { DuriReportIssue } from "../../duri/types";
import { ensureTripTodoStoreHydrated } from "../hooks/useTripTodoHydration";
import {
  createDocumentOcrConfirmationTodoSeed,
  createDuriIssueTodoSeed,
  createScheduleImpactTodoSeed,
  createWorkspaceScheduleImpactTodoSeeds,
  getDocumentOcrConfirmationTodoAction,
  isDuriIssueTodoActionable,
  runFreshDuriTodoSync,
  type OcrConfirmationCandidate,
  type ScheduleImpactExternalReference,
} from "../logic/todoAutomation";
import { useTripTodoStore } from "../store/useTripTodoStore";
import type { ItineraryItem } from "../../../domain";
import type { TravelDocument } from "../../trip-documents/types";

export async function syncDuriIssueTodos(input: {
  tripId: string;
  issues: readonly DuriReportIssue[];
  createdByUserId: string;
  now?: string;
  resolvableDedupePrefixes?: readonly string[];
  /** hydration 이후에도 이 분석 session과 입력이 최신일 때만 true를 반환한다. */
  isCurrent(): boolean;
}) {
  return runFreshDuriTodoSync({
    waitUntilReady: ensureTripTodoStoreHydrated,
    isCurrent: input.isCurrent,
    commit: () => {
      const seeds = input.issues
        .filter(isDuriIssueTodoActionable)
        .map((issue) => createDuriIssueTodoSeed(input.tripId, issue, input.createdByUserId));
      return useTripTodoStore.getState().syncGeneratedTodos(
        input.tripId,
        "duri-analysis",
        seeds,
        input.now,
        input.resolvableDedupePrefixes ?? [],
      );
    },
  });
}

export async function upsertDocumentOcrConfirmationTodo(input: {
  tripId: string;
  candidate: OcrConfirmationCandidate;
  createdByUserId: string;
  now?: string;
}) {
  await ensureTripTodoStoreHydrated();
  const todo = useTripTodoStore.getState().upsertGeneratedTodo(
    createDocumentOcrConfirmationTodoSeed(input.tripId, input.candidate, input.createdByUserId),
    input.now,
  );
  if (todo?.status === "completed" && !todo.userEditedAt) {
    return useTripTodoStore.getState().setStatus(input.tripId, todo.id, "open", input.now, false);
  }
  return todo;
}

export async function resolveDocumentOcrConfirmationTodo(input: {
  tripId: string;
  documentId: string;
  now?: string;
}) {
  await ensureTripTodoStoreHydrated();
  const dedupeKey = `document-ocr:${input.documentId}`;
  const todo = (useTripTodoStore.getState().todosByTripId[input.tripId] ?? []).find((entry) => (
    entry.dedupeKey === dedupeKey && entry.source.kind === "document-ocr"
  ));
  if (!todo) return { status: "missing" as const };
  if (todo.userEditedAt && todo.status !== "completed" && todo.status !== "archived") {
    return { status: "preserved-user-edit" as const, todo };
  }
  if (todo.status === "completed" || todo.status === "archived") return { status: "resolved" as const, todo };
  const completed = useTripTodoStore.getState().setStatus(input.tripId, todo.id, "completed", input.now, false);
  return completed ? { status: "resolved" as const, todo: completed } : { status: "missing" as const };
}

export async function syncDocumentOcrConfirmationTodo(input: {
  tripId: string;
  document: Pick<TravelDocument, "id" | "displayName" | "kind" | "extraction">;
  createdByUserId: string;
  now?: string;
}) {
  const action = getDocumentOcrConfirmationTodoAction(input.document);
  if (action.action === "resolve") {
    return resolveDocumentOcrConfirmationTodo({ tripId: input.tripId, documentId: input.document.id, now: input.now });
  }
  const todo = await upsertDocumentOcrConfirmationTodo({
    tripId: input.tripId,
    candidate: action.candidate,
    createdByUserId: input.createdByUserId,
    now: input.now,
  });
  return todo ? { status: "pending-review" as const, todo } : { status: "missing" as const };
}

/** 문서가 삭제되면 미편집 OCR 확인 TODO만 해결 보관하고 사용자 작업은 보존한다. */
export async function resolveDeletedDocumentOcrConfirmationTodo(input: {
  tripId: string;
  documentId: string;
  now?: string;
}) {
  await ensureTripTodoStoreHydrated();
  const dedupeKey = `document-ocr:${input.documentId}`;
  const todo = (useTripTodoStore.getState().todosByTripId[input.tripId] ?? []).find((entry) => (
    entry.dedupeKey === dedupeKey && entry.source.kind === "document-ocr"
  ));
  if (!todo) return { status: "missing" as const };
  const result = useTripTodoStore.getState().resolveGeneratedTodo(input.tripId, todo.id, input.now);
  if (!result || result.status === "not-generated") return { status: "missing" as const };
  if (result.status === "preserved-user-edit") return result;
  return { status: "resolved" as const, todo: result.todo };
}

export async function upsertScheduleImpactTodo(input: {
  before: ItineraryItem;
  after: ItineraryItem;
  documents: readonly Pick<TravelDocument, "id" | "kind" | "displayName">[];
  externalReferences?: readonly ScheduleImpactExternalReference[];
  createdByUserId: string;
  placeName?: string;
  now?: string;
}) {
  const seed = createScheduleImpactTodoSeed(input);
  if (!seed) return undefined;
  await ensureTripTodoStoreHydrated();
  return useTripTodoStore.getState().upsertGeneratedTodo(seed, input.now);
}

/**
 * 한 번의 Workspace mutation 전후를 비교해 문서가 연결된 변경·삭제만 TODO로 만든다.
 * 호출자는 이 Promise 실패를 일정 mutation 실패로 취급하지 않아야 한다.
 */
export async function syncWorkspaceScheduleImpactTodos(input: {
  beforeItinerary: readonly ItineraryItem[];
  afterItinerary: readonly ItineraryItem[];
  documents: readonly TravelDocument[];
  externalReferencesByItemId?: Readonly<Record<string, readonly ScheduleImpactExternalReference[] | undefined>>;
  createdByUserId: string;
  placeNameById?: Readonly<Record<string, string>>;
  placeNameByItemId?: Readonly<Record<string, string>>;
  now?: string;
  /** hydration 대기 중 계정이 바뀌면 다른 사용자의 private TODO에 기록하지 않는다. */
  isCurrent?: () => boolean;
}) {
  await ensureTripTodoStoreHydrated();
  if (input.isCurrent && !input.isCurrent()) return [];
  const seeds = createWorkspaceScheduleImpactTodoSeeds(input);
  return seeds.flatMap((seed) => {
    const todo = useTripTodoStore.getState().upsertGeneratedTodo(seed, input.now);
    return todo ? [todo] : [];
  });
}
