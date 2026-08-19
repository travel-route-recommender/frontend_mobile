import type { ItineraryItem } from "../../../domain";
import { createUniqueEntityId } from "../../../utils/ids";
import { redactSensitiveText } from "../../../utils/sensitiveText";
import type {
  TripTodo,
  TripTodoAutomationScope,
  TripTodoDraft,
  TripTodoDue,
  TripTodoDueState,
  TripTodoGeneratedSeed,
  TripTodoLinks,
  TripTodoMutationResult,
  TripTodoPriority,
  TripTodoSource,
  TripTodoStatus,
  TripTodoValidationErrors,
} from "../types";

type UnknownRecord = Record<string, unknown>;

export const TRIP_TODO_LIMITS = {
  title: 80,
  description: 2_000,
  checklistItems: 30,
  checklistTitle: 160,
  tags: 12,
  tag: 30,
  assignees: 50,
  linksPerType: 100,
} as const;

export const EMPTY_TODO_LINKS: TripTodoLinks = {
  itineraryItemIds: [],
  documentIds: [],
  duriIssueIds: [],
  placeIds: [],
};

const statuses: TripTodoStatus[] = ["open", "in-progress", "blocked", "completed", "archived"];
const priorities: TripTodoPriority[] = ["urgent", "high", "normal", "low"];
const sourceKinds: TripTodoSource["kind"][] = ["manual", "duri", "document-ocr", "schedule-impact"];
const scopes: TripTodoAutomationScope[] = ["duri-analysis", "document-ocr", "schedule-impact"];
const reminderOptions = [0, 15, 60, 180, 24 * 60, 48 * 60, 7 * 24 * 60];

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isTimestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const isTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function uniqueTrimmedStrings(value: unknown, maxCount: number, maxLength = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((entry) => typeof entry === "string" && entry.trim()
    ? [entry.trim().slice(0, maxLength)]
    : []);
  return [...new Set(normalized)].slice(0, maxCount);
}

export function normalizeTodoLinks(value: unknown): TripTodoLinks {
  const source = isRecord(value) ? value : {};
  return {
    itineraryItemIds: uniqueTrimmedStrings(source.itineraryItemIds, TRIP_TODO_LIMITS.linksPerType),
    documentIds: uniqueTrimmedStrings(source.documentIds, TRIP_TODO_LIMITS.linksPerType),
    duriIssueIds: uniqueTrimmedStrings(source.duriIssueIds, TRIP_TODO_LIMITS.linksPerType),
    placeIds: uniqueTrimmedStrings(source.placeIds, TRIP_TODO_LIMITS.linksPerType),
  };
}

function normalizeDue(value: unknown): TripTodoDue | undefined {
  if (!isRecord(value) || !isValidCalendarDate(value.date)) return undefined;
  const time = isTime(value.time) ? value.time : undefined;
  const reminderMinutesBefore = typeof value.reminderMinutesBefore === "number"
    && Number.isInteger(value.reminderMinutesBefore)
    && reminderOptions.includes(value.reminderMinutesBefore)
    ? value.reminderMinutesBefore
    : undefined;
  const timezone = typeof value.timezone === "string" && value.timezone.trim()
    ? value.timezone.trim().slice(0, 80)
    : undefined;
  const snoozedUntil = isTimestamp(value.snoozedUntil) ? value.snoozedUntil : undefined;
  return {
    date: value.date,
    ...(time ? { time } : {}),
    ...(timezone ? { timezone } : {}),
    ...(reminderMinutesBefore !== undefined ? { reminderMinutesBefore } : {}),
    ...(snoozedUntil ? { snoozedUntil } : {}),
  };
}

function normalizeSource(value: unknown): TripTodoSource {
  if (!isRecord(value) || !sourceKinds.includes(value.kind as TripTodoSource["kind"])) return { kind: "manual" };
  const scope = scopes.includes(value.scope as TripTodoAutomationScope) ? value.scope as TripTodoAutomationScope : undefined;
  const referenceId = typeof value.referenceId === "string" && value.referenceId.trim()
    ? value.referenceId.trim().slice(0, 160)
    : undefined;
  return { kind: value.kind as TripTodoSource["kind"], ...(scope ? { scope } : {}), ...(referenceId ? { referenceId } : {}) };
}

export function validateTripTodoDraft(draft: TripTodoDraft): TripTodoValidationErrors {
  const errors: TripTodoValidationErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "제목을 입력해 주세요.";
  else if (title.length > TRIP_TODO_LIMITS.title) errors.title = `제목은 ${TRIP_TODO_LIMITS.title}자 이하로 입력해 주세요.`;
  if (draft.description.trim().length > TRIP_TODO_LIMITS.description) errors.description = `내용은 ${TRIP_TODO_LIMITS.description}자 이하로 입력해 주세요.`;
  if (draft.dueDate && !isValidCalendarDate(draft.dueDate)) errors.dueDate = "날짜는 YYYY-MM-DD 형식의 실제 날짜로 입력해 주세요.";
  if (draft.dueTime && !draft.dueDate) errors.dueTime = "시간을 정하려면 날짜를 먼저 입력해 주세요.";
  else if (draft.dueTime && !isTime(draft.dueTime)) errors.dueTime = "시간은 HH:mm 형식으로 입력해 주세요.";
  if (draft.reminderMinutesBefore !== undefined && !reminderOptions.includes(draft.reminderMinutesBefore)) errors.reminder = "지원하는 미리 알림 시간을 선택해 주세요.";
  if (draft.reminderMinutesBefore !== undefined && !draft.dueDate) errors.reminder = "미리 알림을 쓰려면 마감 날짜를 정해 주세요.";
  if (new Set(draft.assigneeUserIds.filter(Boolean)).size > TRIP_TODO_LIMITS.assignees) errors.assignees = "담당자가 너무 많아요.";
  if (draft.checklist.length > TRIP_TODO_LIMITS.checklistItems) errors.checklist = `체크 항목은 ${TRIP_TODO_LIMITS.checklistItems}개까지 추가할 수 있어요.`;
  else if (draft.checklist.some((entry) => !entry.title.trim() || entry.title.trim().length > TRIP_TODO_LIMITS.checklistTitle)) errors.checklist = `체크 항목은 1~${TRIP_TODO_LIMITS.checklistTitle}자로 입력해 주세요.`;
  const tags = [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > TRIP_TODO_LIMITS.tags || tags.some((tag) => tag.length > TRIP_TODO_LIMITS.tag)) errors.tags = `태그는 ${TRIP_TODO_LIMITS.tags}개, 각 ${TRIP_TODO_LIMITS.tag}자까지 저장할 수 있어요.`;
  const rawLinks = [draft.links.itineraryItemIds, draft.links.documentIds, draft.links.duriIssueIds, draft.links.placeIds];
  if (rawLinks.some((entries) => entries.length > TRIP_TODO_LIMITS.linksPerType)) errors.links = "연결 항목이 너무 많아요.";
  return errors;
}

function draftDue(draft: TripTodoDraft): TripTodoDue | undefined {
  if (!draft.dueDate) return undefined;
  return {
    date: draft.dueDate,
    ...(draft.dueTime ? { time: draft.dueTime } : {}),
    ...(draft.reminderMinutesBefore !== undefined ? { reminderMinutesBefore: draft.reminderMinutesBefore } : {}),
  };
}

function createChecklist(draft: TripTodoDraft, now: string, previous?: TripTodo["checklist"]) {
  const previousById = new Map(previous?.map((entry) => [entry.id, entry]));
  const existingIds = new Set<string>();
  return draft.checklist.map((entry) => {
    const prior = previousById.get(entry.id);
    const id = entry.id || createUniqueEntityId("todo-check", existingIds);
    existingIds.add(id);
    const completedAt = entry.completed ? prior?.completedAt ?? entry.completedAt ?? now : undefined;
    return {
      id,
      title: entry.title.trim().slice(0, TRIP_TODO_LIMITS.checklistTitle),
      completed: entry.completed,
      createdAt: prior?.createdAt ?? entry.createdAt ?? now,
      ...(completedAt ? { completedAt } : {}),
    };
  });
}

export function createTripTodo(
  draft: TripTodoDraft,
  context: { tripId: string; createdByUserId: string; now: string; existingIds: Iterable<string> },
): TripTodoMutationResult {
  const errors = validateTripTodoDraft(draft);
  if (Object.keys(errors).length) return { ok: false, errors, message: Object.values(errors)[0] ?? "TODO 내용을 확인해 주세요." };
  const status = draft.status;
  const completedAt = status === "completed" ? context.now : undefined;
  const due = draftDue(draft);
  const todo: TripTodo = {
    id: createUniqueEntityId("todo", context.existingIds),
    tripId: context.tripId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    status,
    priority: draft.priority,
    ...(due ? { due } : {}),
    assigneeUserIds: [...new Set(draft.assigneeUserIds.filter(Boolean))],
    checklist: createChecklist(draft, context.now),
    tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
    links: normalizeTodoLinks(draft.links),
    source: { kind: "manual" },
    createdByUserId: context.createdByUserId,
    createdAt: context.now,
    updatedAt: context.now,
    ...(completedAt ? { completedAt } : {}),
  };
  return { ok: true, todo };
}

export function tripTodoToDraft(todo: TripTodo): TripTodoDraft {
  return {
    title: todo.title,
    description: todo.description,
    status: todo.status === "archived" ? "open" : todo.status,
    priority: todo.priority,
    dueDate: todo.due?.date ?? "",
    dueTime: todo.due?.time ?? "",
    reminderMinutesBefore: todo.due?.reminderMinutesBefore,
    assigneeUserIds: [...todo.assigneeUserIds],
    checklist: todo.checklist.map((entry) => ({ ...entry })),
    tags: [...todo.tags],
    links: { ...todo.links, itineraryItemIds: [...todo.links.itineraryItemIds], documentIds: [...todo.links.documentIds], duriIssueIds: [...todo.links.duriIssueIds], placeIds: [...todo.links.placeIds] },
  };
}

export function updateTripTodo(todo: TripTodo, draft: TripTodoDraft, now: string): TripTodoMutationResult {
  const errors = validateTripTodoDraft(draft);
  if (Object.keys(errors).length) return { ok: false, errors, message: Object.values(errors)[0] ?? "TODO 내용을 확인해 주세요." };
  const status = draft.status;
  const completedAt = status === "completed" ? todo.completedAt ?? now : undefined;
  const next: TripTodo = {
    ...todo,
    title: draft.title.trim(),
    description: draft.description.trim(),
    status,
    priority: draft.priority,
    due: draftDue(draft),
    assigneeUserIds: [...new Set(draft.assigneeUserIds.filter(Boolean))],
    checklist: createChecklist(draft, now, todo.checklist),
    tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
    links: normalizeTodoLinks(draft.links),
    updatedAt: now,
    completedAt,
    archivedAt: undefined,
    archivedReason: undefined,
  };
  return { ok: true, todo: next };
}

export function normalizeTripTodo(value: unknown, fallbackTripId = ""): TripTodo | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  const tripId = typeof value.tripId === "string" && value.tripId.trim() ? value.tripId.trim() : fallbackTripId;
  const title = typeof value.title === "string" ? value.title.trim().slice(0, TRIP_TODO_LIMITS.title) : "";
  const createdByUserId = typeof value.createdByUserId === "string" ? value.createdByUserId.trim() : "";
  if (!id || !tripId || !title || !createdByUserId || !isTimestamp(value.createdAt)) return undefined;
  const status = statuses.includes(value.status as TripTodoStatus) ? value.status as TripTodoStatus : "open";
  const priority = priorities.includes(value.priority as TripTodoPriority) ? value.priority as TripTodoPriority : "normal";
  const updatedAt = isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt;
  const source = normalizeSource(value.source);
  const userEditedAt = isTimestamp(value.userEditedAt) ? value.userEditedAt : undefined;
  const rawDescription = typeof value.description === "string" ? value.description.trim() : "";
  const description = source.kind === "document-ocr" && !userEditedAt
    ? redactSensitiveText(rawDescription).slice(0, TRIP_TODO_LIMITS.description)
    : rawDescription.slice(0, TRIP_TODO_LIMITS.description);
  const rawChecklist = Array.isArray(value.checklist) ? value.checklist : [];
  const checklistIds = new Set<string>();
  const checklist = rawChecklist.slice(0, TRIP_TODO_LIMITS.checklistItems).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || checklistIds.has(entry.id) || typeof entry.title !== "string" || !entry.title.trim()) return [];
    checklistIds.add(entry.id);
    const completed = entry.completed === true;
    return [{
      id: entry.id,
      title: entry.title.trim().slice(0, TRIP_TODO_LIMITS.checklistTitle),
      completed,
      createdAt: isTimestamp(entry.createdAt) ? entry.createdAt : value.createdAt as string,
      ...(completed && isTimestamp(entry.completedAt) ? { completedAt: entry.completedAt } : {}),
    }];
  });
  const due = normalizeDue(value.due);
  return {
    id,
    tripId,
    title,
    description,
    status,
    priority,
    ...(due ? { due } : {}),
    assigneeUserIds: uniqueTrimmedStrings(value.assigneeUserIds, TRIP_TODO_LIMITS.assignees),
    checklist,
    tags: uniqueTrimmedStrings(value.tags, TRIP_TODO_LIMITS.tags, TRIP_TODO_LIMITS.tag),
    links: normalizeTodoLinks(value.links),
    source,
    ...(typeof value.dedupeKey === "string" && value.dedupeKey.trim() ? { dedupeKey: value.dedupeKey.trim().slice(0, 240) } : {}),
    createdByUserId,
    createdAt: value.createdAt,
    updatedAt,
    ...(status === "completed" && isTimestamp(value.completedAt) ? { completedAt: value.completedAt } : {}),
    ...(status === "archived" && isTimestamp(value.archivedAt) ? { archivedAt: value.archivedAt } : {}),
    ...(status === "archived" && (value.archivedReason === "user" || value.archivedReason === "resolved") ? { archivedReason: value.archivedReason } : {}),
    ...(userEditedAt ? { userEditedAt } : {}),
  };
}

export function normalizeTripTodosByTripId(value: unknown): Record<string, TripTodo[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([tripId, entries]) => {
    if (!tripId || !Array.isArray(entries)) return [];
    const seenIds = new Set<string>();
    const seenDedupeKeys = new Set<string>();
    const todos = entries.flatMap((entry) => {
      const todo = normalizeTripTodo(entry, tripId);
      if (!todo || todo.tripId !== tripId || seenIds.has(todo.id) || (todo.dedupeKey && seenDedupeKeys.has(todo.dedupeKey))) return [];
      seenIds.add(todo.id);
      if (todo.dedupeKey) seenDedupeKeys.add(todo.dedupeKey);
      return [todo];
    });
    return [[tripId, sortTripTodos(todos)]];
  }));
}

export function normalizeDismissedGeneratedKeys(value: unknown): Record<string, Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([tripId, entries]) => {
    if (!tripId || !isRecord(entries)) return [];
    const normalized = Object.fromEntries(Object.entries(entries).flatMap(([dedupeKey, dismissedAt]) => dedupeKey && isTimestamp(dismissedAt) ? [[dedupeKey.slice(0, 240), dismissedAt]] : []));
    return [[tripId, normalized]];
  }));
}

export function createGeneratedTripTodo(seed: TripTodoGeneratedSeed, now: string, existingIds: Iterable<string>): TripTodo | undefined {
  const title = seed.title.trim().slice(0, TRIP_TODO_LIMITS.title);
  if (!seed.tripId || !seed.createdByUserId || !seed.dedupeKey.trim() || !title) return undefined;
  const links = normalizeTodoLinks({ ...EMPTY_TODO_LINKS, ...seed.links });
  const draft: TripTodoDraft = {
    title,
    description: seed.description.trim().slice(0, TRIP_TODO_LIMITS.description),
    status: "open",
    priority: seed.priority,
    dueDate: seed.due?.date ?? "",
    dueTime: seed.due?.time ?? "",
    reminderMinutesBefore: seed.due?.reminderMinutesBefore,
    assigneeUserIds: seed.assigneeUserIds ?? [],
    checklist: seed.checklist ?? [],
    tags: seed.tags ?? [],
    links,
  };
  const result = createTripTodo(draft, { tripId: seed.tripId, createdByUserId: seed.createdByUserId, now, existingIds });
  if (!result.ok) return undefined;
  const due = normalizeDue(seed.due);
  return {
    ...result.todo,
    source: seed.source,
    dedupeKey: seed.dedupeKey.trim().slice(0, 240),
    ...(due ? { due } : {}),
  };
}

export function mergeGeneratedTripTodo(existing: TripTodo, seed: TripTodoGeneratedSeed, now: string): TripTodo {
  const generated = createGeneratedTripTodo(seed, now, [existing.id]);
  if (!generated) return existing;
  const newOccurrence = existing.dedupeKey !== generated.dedupeKey;
  const protectedByUserEdit = Boolean(existing.userEditedAt) && !newOccurrence;
  const reopenPendingOcr = existing.status === "completed" && generated.source.kind === "document-ocr";
  const reopen = (existing.status === "archived" && existing.archivedReason === "resolved")
    || (newOccurrence && (existing.status === "completed" || existing.status === "archived"))
    || reopenPendingOcr;
  return {
    ...existing,
    title: protectedByUserEdit || (newOccurrence && Boolean(existing.userEditedAt)) ? existing.title : generated.title,
    description: protectedByUserEdit ? existing.description : generated.description,
    priority: protectedByUserEdit ? existing.priority : generated.priority,
    due: protectedByUserEdit ? existing.due : generated.due,
    assigneeUserIds: protectedByUserEdit || (newOccurrence && existing.assigneeUserIds.length > 0) ? existing.assigneeUserIds : generated.assigneeUserIds,
    checklist: newOccurrence || reopenPendingOcr ? generated.checklist : protectedByUserEdit || existing.checklist.length ? existing.checklist : generated.checklist,
    tags: newOccurrence && existing.userEditedAt
      ? [...new Set([...existing.tags, ...generated.tags])]
      : protectedByUserEdit ? existing.tags : generated.tags,
    links: generated.links,
    source: generated.source,
    dedupeKey: generated.dedupeKey,
    ...(reopen ? { status: "open" as const, completedAt: undefined, archivedAt: undefined, archivedReason: undefined } : {}),
    updatedAt: now,
  };
}

export function sortTripTodos(todos: readonly TripTodo[]) {
  const statusOrder: Record<TripTodoStatus, number> = { "in-progress": 0, blocked: 1, open: 2, completed: 3, archived: 4 };
  const priorityOrder: Record<TripTodoPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return [...todos].sort((left, right) => {
    const statusDifference = statusOrder[left.status] - statusOrder[right.status];
    if (statusDifference) return statusDifference;
    const leftDue = left.due ? `${left.due.date}T${left.due.time ?? "23:59"}` : "9999-12-31T23:59";
    const rightDue = right.due ? `${right.due.date}T${right.due.time ?? "23:59"}` : "9999-12-31T23:59";
    return leftDue.localeCompare(rightDue) || priorityOrder[left.priority] - priorityOrder[right.priority] || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function getTripTodoDueState(todo: TripTodo, now = new Date()): TripTodoDueState {
  if (todo.status === "completed" || todo.status === "archived") return "completed";
  if (!todo.due) return "none";
  const due = new Date(`${todo.due.date}T${todo.due.time ?? "23:59"}:00`);
  if (!Number.isFinite(due.getTime())) return "none";
  if (todo.due.snoozedUntil && Number.isFinite(Date.parse(todo.due.snoozedUntil)) && Date.parse(todo.due.snoozedUntil) > now.getTime()) return "upcoming";
  if (due.getTime() < now.getTime()) return "overdue";
  if (todo.due.date === localDateString(now)) return "due-today";
  const reminder = todo.due.reminderMinutesBefore;
  if (reminder !== undefined && due.getTime() - now.getTime() <= reminder * 60_000) return "reminder";
  return "upcoming";
}

export function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function hasScheduleRelevantChange(before: ItineraryItem, after: ItineraryItem) {
  return before.date !== after.date
    || before.startTime !== after.startTime
    || before.durationMinutes !== after.durationMinutes
    || before.placeId !== after.placeId
    || before.itemType !== after.itemType;
}

export function createEmptyTripTodoDraft(overrides: Partial<TripTodoDraft> = {}): TripTodoDraft {
  return {
    title: "",
    description: "",
    status: "open",
    priority: "normal",
    dueDate: "",
    dueTime: "",
    reminderMinutesBefore: undefined,
    assigneeUserIds: [],
    checklist: [],
    tags: [],
    links: { ...EMPTY_TODO_LINKS },
    ...overrides,
  };
}

export function shouldArchiveMissingGeneratedTodo(input: {
  todo: TripTodo;
  scope: TripTodoAutomationScope;
  activeDedupeKeys: ReadonlySet<string>;
  archiveMissingDedupePrefixes?: readonly string[];
}) {
  if (input.todo.source.scope !== input.scope || !input.todo.dedupeKey || input.activeDedupeKeys.has(input.todo.dedupeKey)) return false;
  if (input.todo.status === "completed" || input.todo.status === "archived") return false;
  // 자동 생성 뒤 사용자가 제목뿐 아니라 상태·체크리스트·알림을 바꾼 경우에도
  // 독립적인 실제 작업으로 취급해 분석 결과가 사라졌다는 이유로 보관하지 않는다.
  if (input.todo.userEditedAt) return false;
  if (!input.archiveMissingDedupePrefixes) return true;
  return input.archiveMissingDedupePrefixes.some((prefix) => input.todo.dedupeKey?.startsWith(prefix));
}

export function reconcileTripTodoLinks(
  todo: TripTodo,
  valid: { itineraryItemIds?: readonly string[]; documentIds?: readonly string[] },
  now: string,
) {
  const itineraryItemIds = valid.itineraryItemIds
    ? todo.links.itineraryItemIds.filter((id) => valid.itineraryItemIds?.includes(id))
    : todo.links.itineraryItemIds;
  const documentIds = valid.documentIds
    ? todo.links.documentIds.filter((id) => valid.documentIds?.includes(id))
    : todo.links.documentIds;
  const unchanged = itineraryItemIds.length === todo.links.itineraryItemIds.length
    && documentIds.length === todo.links.documentIds.length;
  return unchanged ? todo : {
    ...todo,
    links: { ...todo.links, itineraryItemIds, documentIds },
    updatedAt: now,
  };
}

/**
 * Duri/OCR는 같은 분석을 다시 실행할 수 있어 삭제 표식이 필요하지만, 일정 영향 TODO는
 * 실제 mutation에서만 생성된다. 이를 영구 표식으로 막으면 나중에 같은 시각으로 다시
 * 변경한 새 사건까지 누락되므로 일정 영향 삭제는 재생성 방지 표식으로 남기지 않는다.
 */
export function shouldRememberGeneratedTodoDismissal(todo: TripTodo) {
  return Boolean(todo.dedupeKey) && todo.source.scope !== "schedule-impact";
}

export type ResolveGeneratedTripTodoResult =
  | { status: "resolved" | "already-resolved"; todo: TripTodo }
  | { status: "preserved-user-edit" | "not-generated"; todo: TripTodo };

/**
 * 생성 근거가 사라진 자동 TODO 하나만 해결 보관한다.
 * 사용자가 내용을 편집한 활성 TODO는 작업 자체로 간주해 그대로 유지한다.
 */
export function resolveGeneratedTripTodo(todo: TripTodo, now: string): ResolveGeneratedTripTodoResult {
  if (todo.source.kind === "manual" || !todo.dedupeKey) {
    return { status: "not-generated", todo };
  }
  if (todo.status === "completed" || todo.status === "archived") {
    return { status: "already-resolved", todo };
  }
  if (todo.userEditedAt) {
    return { status: "preserved-user-edit", todo };
  }
  return {
    status: "resolved",
    todo: {
      ...todo,
      status: "archived",
      archivedAt: now,
      archivedReason: "resolved",
      updatedAt: now,
    },
  };
}
