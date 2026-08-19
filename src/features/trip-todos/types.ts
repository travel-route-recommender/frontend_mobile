import type { EntityId, ISODateString, TimeString } from "../../domain";

export type TripTodoStatus = "open" | "in-progress" | "blocked" | "completed" | "archived";
export type TripTodoPriority = "urgent" | "high" | "normal" | "low";
export type TripTodoSourceKind = "manual" | "duri" | "document-ocr" | "schedule-impact";
export type TripTodoAutomationScope = "duri-analysis" | "document-ocr" | "schedule-impact";

export type TripTodoDue = {
  date: ISODateString;
  time?: TimeString;
  /** IANA timezone. 현재 UI에서는 여행방의 timezone 계약이 없어 기기 timezone을 사용한다. */
  timezone?: string;
  /** OS 알림이 아닌 인앱 정렬·표시에 사용하는 사전 알림 설정이다. */
  reminderMinutesBefore?: number;
  snoozedUntil?: string;
};

export type TripTodoChecklistItem = {
  id: EntityId;
  title: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
};

export type TripTodoLinks = {
  itineraryItemIds: EntityId[];
  documentIds: EntityId[];
  duriIssueIds: EntityId[];
  placeIds: EntityId[];
};

export type TripTodoSource = {
  kind: TripTodoSourceKind;
  scope?: TripTodoAutomationScope;
  referenceId?: string;
};

export type TripTodo = {
  id: EntityId;
  tripId: EntityId;
  title: string;
  description: string;
  status: TripTodoStatus;
  priority: TripTodoPriority;
  due?: TripTodoDue;
  assigneeUserIds: EntityId[];
  checklist: TripTodoChecklistItem[];
  tags: string[];
  links: TripTodoLinks;
  source: TripTodoSource;
  /** 같은 분석/문서/일정 이벤트가 중복 TODO를 만들지 않도록 하는 여행방 내 안정 키다. */
  dedupeKey?: string;
  createdByUserId: EntityId;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
  archivedReason?: "user" | "resolved";
  /** 자동 생성 TODO의 내용을 사용자가 수정한 뒤 다음 분석이 덮어쓰지 않게 한다. */
  userEditedAt?: string;
};

export type TripTodoDraftChecklistItem = Pick<TripTodoChecklistItem, "id" | "title" | "completed"> & {
  createdAt?: string;
  completedAt?: string;
};

export type TripTodoDraft = {
  title: string;
  description: string;
  status: Exclude<TripTodoStatus, "archived">;
  priority: TripTodoPriority;
  dueDate: string;
  dueTime: string;
  reminderMinutesBefore?: number;
  assigneeUserIds: EntityId[];
  checklist: TripTodoDraftChecklistItem[];
  tags: string[];
  links: TripTodoLinks;
};

export type TripTodoValidationField =
  | "title"
  | "description"
  | "dueDate"
  | "dueTime"
  | "reminder"
  | "assignees"
  | "checklist"
  | "tags"
  | "links";

export type TripTodoValidationErrors = Partial<Record<TripTodoValidationField, string>>;

export type TripTodoGeneratedSeed = {
  tripId: EntityId;
  title: string;
  description: string;
  priority: TripTodoPriority;
  due?: TripTodoDue;
  assigneeUserIds?: EntityId[];
  checklist?: Pick<TripTodoDraftChecklistItem, "id" | "title" | "completed">[];
  tags?: string[];
  links?: Partial<TripTodoLinks>;
  source: Omit<TripTodoSource, "kind"> & { kind: Exclude<TripTodoSourceKind, "manual"> };
  dedupeKey: string;
  createdByUserId: EntityId;
};

export type TripTodoMutationResult =
  | { ok: true; todo: TripTodo }
  | { ok: false; errors: TripTodoValidationErrors; message: string };

export type TripTodoDueState = "none" | "upcoming" | "reminder" | "due-today" | "overdue" | "completed";
