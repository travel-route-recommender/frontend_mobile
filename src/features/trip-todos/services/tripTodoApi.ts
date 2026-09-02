import { ApiError, apiClient } from "../../../services/apiClient";

type UnknownRecord = Record<string, unknown>;

export type ApiRoomTodoStatus = "open" | "in_progress" | "done" | "cancelled";
export type ApiRoomTodoPriority = "low" | "medium" | "high" | "urgent";
export type ApiRoomTodoSourceKind = "manual" | "duriAnalysis" | "ocrConfirm" | "scheduleChange";
export type ApiRoomTodoLinkType = "scheduleItem" | "reservation" | "ticket" | "document";

export type ApiRoomTodoChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
};

export type ApiRoomTodoLink = {
  type: ApiRoomTodoLinkType;
  targetId: string;
  scheduleItemId: string | null;
};

export type ApiRoomTodo = {
  id: string;
  roomId: string;
  title: string;
  description: string;
  status: ApiRoomTodoStatus;
  priority: ApiRoomTodoPriority;
  dueDate: string | null;
  dueTime: string | null;
  timezone: string;
  remindAt: string | null;
  assigneeId: string | null;
  checklist: ApiRoomTodoChecklistItem[];
  links: ApiRoomTodoLink[];
  source: {
    kind: ApiRoomTodoSourceKind;
    dedupeKey: string | null;
    cause: string | null;
    baseRevision: string | null;
    userEdited: boolean;
    suppressed: boolean;
  };
  archived: boolean;
  createdBy: string;
  updatedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiTodoUiStatus = "open" | "in-progress" | "completed" | "cancelled";
export type ApiTodoUiPriority = "low" | "normal" | "high" | "urgent";

export type ApiRoomTodoDraft = {
  title: string;
  description: string;
  status: ApiTodoUiStatus;
  priority: ApiTodoUiPriority;
  dueDate: string;
  dueTime: string;
  timezone: string;
  assigneeId: string | null;
  checklist: { id: string; title: string; done: boolean }[];
  links: ApiRoomTodoLink[];
};

export type ApiRoomTodoRevisionConflict = {
  expectedRevision?: number;
  currentRevision?: number;
  latestTodo?: ApiRoomTodo;
};

export class ApiRoomTodoContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ApiRoomTodoContractError";
    this.path = path;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const serverStatuses: readonly ApiRoomTodoStatus[] = ["open", "in_progress", "done", "cancelled"];
const serverPriorities: readonly ApiRoomTodoPriority[] = ["low", "medium", "high", "urgent"];
const sourceKinds: readonly ApiRoomTodoSourceKind[] = ["manual", "duriAnalysis", "ocrConfirm", "scheduleChange"];
const linkTypes: readonly ApiRoomTodoLinkType[] = ["scheduleItem", "reservation", "ticket", "document"];

function fail(path: string, message: string): never {
  throw new ApiRoomTodoContractError(path, message);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "객체여야 합니다.");
  return value as UnknownRecord;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "배열이어야 합니다.");
  return value;
}

function asString(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) return fail(path, "문자열이어야 합니다.");
  return allowEmpty ? value : value.trim();
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return asString(value, path);
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return fail(path, "boolean이어야 합니다.");
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) return fail(path, "1 이상의 정수여야 합니다.");
  return value as number;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) return fail(path, "0 이상의 정수여야 합니다.");
  return value as number;
}

function nullableTimestamp(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  const text = asString(value, path);
  if (!Number.isFinite(Date.parse(text))) return fail(path, "ISO 날짜·시간이어야 합니다.");
  return text;
}

function requiredTimestamp(value: unknown, path: string): string {
  const parsed = nullableTimestamp(value, path);
  return parsed ?? fail(path, "날짜·시간이 필요합니다.");
}

function nullableDate(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  const text = asString(value, path);
  if (!DATE_PATTERN.test(text)) return fail(path, "YYYY-MM-DD 형식이어야 합니다.");
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) return fail(path, "유효한 날짜여야 합니다.");
  return text;
}

function nullableTime(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  const text = asString(value, path);
  return TIME_PATTERN.test(text) ? text : fail(path, "HH:mm 형식이어야 합니다.");
}

function parseChecklistItem(value: unknown, path: string): ApiRoomTodoChecklistItem {
  const record = asRecord(value, path);
  return {
    id: asString(record.id, `${path}.id`),
    title: asString(record.title, `${path}.title`),
    done: asBoolean(record.done, `${path}.done`),
    doneAt: nullableTimestamp(record.doneAt, `${path}.doneAt`),
    doneBy: nullableString(record.doneBy, `${path}.doneBy`),
  };
}

function parseLink(value: unknown, path: string): ApiRoomTodoLink {
  const record = asRecord(value, path);
  const type = asString(record.type, `${path}.type`);
  if (!linkTypes.includes(type as ApiRoomTodoLinkType)) return fail(`${path}.type`, "지원하지 않는 연결 종류입니다.");
  return {
    type: type as ApiRoomTodoLinkType,
    targetId: asString(record.targetId, `${path}.targetId`),
    scheduleItemId: nullableString(record.scheduleItemId, `${path}.scheduleItemId`),
  };
}

export function parseApiRoomTodo(value: unknown, path = "todo"): ApiRoomTodo {
  const record = asRecord(value, path);
  const status = asString(record.status, `${path}.status`);
  const priority = asString(record.priority, `${path}.priority`);
  if (!serverStatuses.includes(status as ApiRoomTodoStatus)) return fail(`${path}.status`, "알 수 없는 상태입니다.");
  if (!serverPriorities.includes(priority as ApiRoomTodoPriority)) return fail(`${path}.priority`, "알 수 없는 우선순위입니다.");
  const source = asRecord(record.source, `${path}.source`);
  const sourceKind = asString(source.kind, `${path}.source.kind`);
  if (!sourceKinds.includes(sourceKind as ApiRoomTodoSourceKind)) return fail(`${path}.source.kind`, "알 수 없는 생성 출처입니다.");
  const checklist = asArray(record.checklist, `${path}.checklist`).map((entry, index) => parseChecklistItem(entry, `${path}.checklist[${index}]`));
  const links = asArray(record.links, `${path}.links`).map((entry, index) => parseLink(entry, `${path}.links[${index}]`));
  if (new Set(checklist.map((entry) => entry.id)).size !== checklist.length) return fail(`${path}.checklist`, "id가 중복될 수 없습니다.");
  const dueDate = nullableDate(record.dueDate, `${path}.dueDate`);
  const dueTime = nullableTime(record.dueTime, `${path}.dueTime`);
  if (dueTime && !dueDate) return fail(`${path}.dueTime`, "날짜 없는 마감 시간은 사용할 수 없습니다.");
  return {
    id: asString(record.id, `${path}.id`),
    roomId: asString(record.roomId, `${path}.roomId`),
    title: asString(record.title, `${path}.title`),
    description: asString(record.description, `${path}.description`, true),
    status: status as ApiRoomTodoStatus,
    priority: priority as ApiRoomTodoPriority,
    dueDate,
    dueTime,
    timezone: asString(record.timezone, `${path}.timezone`),
    remindAt: nullableTimestamp(record.remindAt, `${path}.remindAt`),
    assigneeId: nullableString(record.assigneeId, `${path}.assigneeId`),
    checklist,
    links,
    source: {
      kind: sourceKind as ApiRoomTodoSourceKind,
      dedupeKey: nullableString(source.dedupeKey, `${path}.source.dedupeKey`),
      cause: nullableString(source.cause, `${path}.source.cause`),
      baseRevision: nullableString(source.baseRevision, `${path}.source.baseRevision`),
      userEdited: asBoolean(source.userEdited, `${path}.source.userEdited`),
      suppressed: asBoolean(source.suppressed, `${path}.source.suppressed`),
    },
    archived: asBoolean(record.archived, `${path}.archived`),
    createdBy: asString(record.createdBy, `${path}.createdBy`),
    updatedBy: nullableString(record.updatedBy, `${path}.updatedBy`),
    completedAt: nullableTimestamp(record.completedAt, `${path}.completedAt`),
    completedBy: nullableString(record.completedBy, `${path}.completedBy`),
    revision: positiveInteger(record.revision, `${path}.revision`),
    createdAt: requiredTimestamp(record.createdAt, `${path}.createdAt`),
    updatedAt: requiredTimestamp(record.updatedAt, `${path}.updatedAt`),
  };
}

function parseListPage(value: unknown, path: string) {
  const record = asRecord(value, path);
  const meta = asRecord(record.meta, `${path}.meta`);
  return {
    data: asArray(record.data, `${path}.data`).map((entry, index) => parseApiRoomTodo(entry, `${path}.data[${index}]`)),
    total: nonNegativeInteger(meta.total, `${path}.meta.total`),
    page: positiveInteger(meta.page, `${path}.meta.page`),
    limit: positiveInteger(meta.limit, `${path}.meta.limit`),
  };
}

function endpoint(roomId: string, todoId?: string) {
  const base = `/rooms/${encodeURIComponent(roomId)}/todos`;
  return todoId ? `${base}/${encodeURIComponent(todoId)}` : base;
}

export async function fetchApiRoomTodos(roomId: string, signal?: AbortSignal) {
  const all: ApiRoomTodo[] = [];
  let page = 1;
  let total = 0;
  do {
    const payload = await apiClient.request<unknown>({
      path: endpoint(roomId),
      query: { archived: "all", page, limit: 100 },
      signal,
      auth: true,
    });
    const parsed = parseListPage(payload, `todos.page[${page}]`);
    if (parsed.page !== page) return fail(`todos.page[${page}].meta.page`, "요청한 페이지와 다릅니다.");
    total = parsed.total;
    all.push(...parsed.data);
    if (!parsed.data.length && all.length < total) return fail(`todos.page[${page}]`, "전체 개수보다 먼저 빈 페이지가 반환됐습니다.");
    page += 1;
  } while (all.length < total);
  if (all.length !== total) return fail("todos", "중복되거나 일관되지 않은 페이지 응답입니다.");
  if (new Set(all.map((todo) => todo.id)).size !== all.length) return fail("todos", "TODO id가 중복됐습니다.");
  return all;
}

export function toApiTodoUiStatus(status: ApiRoomTodoStatus): ApiTodoUiStatus {
  if (status === "in_progress") return "in-progress";
  if (status === "done") return "completed";
  return status;
}

export function fromApiTodoUiStatus(status: ApiTodoUiStatus): ApiRoomTodoStatus {
  if (status === "in-progress") return "in_progress";
  if (status === "completed") return "done";
  return status;
}

export function toApiTodoUiPriority(priority: ApiRoomTodoPriority): ApiTodoUiPriority {
  return priority === "medium" ? "normal" : priority;
}

export function fromApiTodoUiPriority(priority: ApiTodoUiPriority): ApiRoomTodoPriority {
  return priority === "normal" ? "medium" : priority;
}

export function apiRoomTodoToDraft(todo: ApiRoomTodo): ApiRoomTodoDraft {
  return {
    title: todo.title,
    description: todo.description,
    status: toApiTodoUiStatus(todo.status),
    priority: toApiTodoUiPriority(todo.priority),
    dueDate: todo.dueDate ?? "",
    dueTime: todo.dueTime ?? "",
    timezone: todo.timezone,
    assigneeId: todo.assigneeId,
    checklist: todo.checklist.map((entry) => ({ id: entry.id, title: entry.title, done: entry.done })),
    links: todo.links.map((link) => ({ ...link })),
  };
}

export type ApiRoomTodoSourceInput = {
  kind: ApiRoomTodoSourceKind;
  dedupeKey?: string;
  cause?: string;
  baseRevision?: string;
};

export type CreateApiRoomTodoInput = ApiRoomTodoDraft & {
  clientMutationId: string;
  source?: ApiRoomTodoSourceInput;
};
export type UpdateApiRoomTodoInput = ApiRoomTodoDraft & { expectedRevision: number; clientMutationId: string };

function mutationBody(input: ApiRoomTodoDraft) {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    status: fromApiTodoUiStatus(input.status),
    priority: fromApiTodoUiPriority(input.priority),
    dueDate: input.dueDate || null,
    dueTime: input.dueDate && input.dueTime ? input.dueTime : null,
    timezone: input.timezone,
    assigneeId: input.assigneeId,
    checklist: input.checklist.map((entry) => ({ id: entry.id, title: entry.title.trim(), done: entry.done })),
    links: input.links.map((link) => ({
      type: link.type,
      targetId: link.targetId,
      ...(link.scheduleItemId ? { scheduleItemId: link.scheduleItemId } : {}),
    })),
  };
}

export async function createApiRoomTodo(roomId: string, input: CreateApiRoomTodoInput) {
  const payload = await apiClient.request<unknown>({
    path: endpoint(roomId),
    method: "POST",
    body: {
      ...mutationBody(input),
      ...(input.source ? {
        source: {
          kind: input.source.kind,
          ...(input.source.dedupeKey ? { dedupeKey: input.source.dedupeKey.slice(0, 200) } : {}),
          ...(input.source.cause ? { cause: input.source.cause } : {}),
          ...(input.source.baseRevision ? { baseRevision: input.source.baseRevision } : {}),
        },
      } : {}),
      clientMutationId: input.clientMutationId,
    },
    auth: true,
  });
  return parseApiRoomTodo(payload);
}

export async function updateApiRoomTodo(roomId: string, todoId: string, input: UpdateApiRoomTodoInput) {
  const payload = await apiClient.request<unknown>({
    path: endpoint(roomId, todoId),
    method: "PATCH",
    body: {
      ...mutationBody(input),
      expectedRevision: input.expectedRevision,
      clientMutationId: input.clientMutationId,
    },
    auth: true,
  });
  return parseApiRoomTodo(payload);
}

export async function deleteApiRoomTodo(roomId: string, todoId: string, expectedRevision: number, clientMutationId: string) {
  const payload = await apiClient.request<unknown>({
    path: endpoint(roomId, todoId),
    method: "DELETE",
    query: { expectedRevision, clientMutationId },
    auth: true,
  });
  const record = asRecord(payload, "todoDelete");
  if (record.success !== true) return fail("todoDelete.success", "true여야 합니다.");
  return {
    deleted: record.deleted === true,
    suppressed: record.suppressed === true,
    todo: record.todo === undefined ? undefined : parseApiRoomTodo(record.todo, "todoDelete.todo"),
  };
}

export async function resolveApiRoomAutoTodo(roomId: string, dedupeKey: string) {
  const payload = await apiClient.request<unknown>({
    path: `${endpoint(roomId)}/resolve-auto`,
    method: "POST",
    body: { dedupeKey },
    auth: true,
  });
  const record = asRecord(payload, "todoResolveAuto");
  return {
    matched: nonNegativeInteger(record.matched, "todoResolveAuto.matched"),
    modified: nonNegativeInteger(record.modified, "todoResolveAuto.modified"),
    preservedUserEdited: asBoolean(record.preservedUserEdited, "todoResolveAuto.preservedUserEdited"),
  };
}

export function parseApiRoomTodoRevisionConflict(error: unknown): ApiRoomTodoRevisionConflict | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  const record = error.payload && typeof error.payload === "object" && !Array.isArray(error.payload)
    ? error.payload as UnknownRecord
    : undefined;
  if (error.code !== "TODO_REVISION_CONFLICT" && record?.code !== "TODO_REVISION_CONFLICT") return undefined;
  let latestTodo: ApiRoomTodo | undefined;
  try {
    if (record?.todo !== undefined) latestTodo = parseApiRoomTodo(record.todo, "conflict.todo");
  } catch {
    latestTodo = undefined;
  }
  return {
    ...(Number.isInteger(record?.expectedRevision) ? { expectedRevision: record?.expectedRevision as number } : {}),
    ...(Number.isInteger(record?.currentRevision) ? { currentRevision: record?.currentRevision as number } : {}),
    ...(latestTodo ? { latestTodo } : {}),
  };
}

export function createApiTodoMutationId(prefix = "todo") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`.slice(0, 100);
}
