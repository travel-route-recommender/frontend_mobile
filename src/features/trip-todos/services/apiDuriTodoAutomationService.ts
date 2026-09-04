import type { DuriReportIssue } from "../../duri/types";
import type { ItineraryItem } from "../../../domain";
import { plainDuriUserText } from "../../duri/presentation/plainDuriUserText";
import {
  createWorkspaceScheduleImpactTodoSeeds,
  isDuriIssueTodoActionable,
  type ScheduleImpactExternalReference,
} from "../logic/todoAutomation";
import {
  createApiRoomTodo,
  createApiTodoMutationId,
  fetchApiRoomTodos,
  resolveApiRoomAutoTodo,
} from "./tripTodoApi";

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function apiDuriIssueTodoDedupeKey(issueId: string) {
  return `duri-analysis:${stableHash(issueId)}:${issueId}`.slice(0, 200);
}

function priorityFor(issue: DuriReportIssue) {
  if (issue.severity === "high") return "urgent" as const;
  if (issue.severity === "medium") return "high" as const;
  return "normal" as const;
}

function descriptionFor(issue: DuriReportIssue) {
  const evidence = issue.evidence.slice(0, 6).map((entry) => `- ${plainDuriUserText(entry.label)}: ${plainDuriUserText(entry.value)}`).join("\n");
  return [plainDuriUserText(issue.summary), evidence && `\n확인 근거\n${evidence}`].filter(Boolean).join("\n").slice(0, 2000);
}

/**
 * API 분석의 actionable issue를 방 공유 TODO와 멱등 동기화한다. 한 항목의
 * 실패가 분석 세션이나 다른 TODO를 되돌리지 않도록 결과를 집계해 반환한다.
 */
export async function syncApiDuriIssueTodos(input: {
  roomId: string;
  issues: readonly DuriReportIssue[];
  baseRevision: string;
  timezone: string;
}) {
  const actionable = input.issues.filter(isDuriIssueTodoActionable);
  const activeKeys = new Set(actionable.map((issue) => apiDuriIssueTodoDedupeKey(issue.id)));
  const existing = await fetchApiRoomTodos(input.roomId);
  const obsoleteKeys = [...new Set(existing.flatMap((todo) => (
    todo.source.kind === "duriAnalysis"
      && todo.source.dedupeKey
      && !activeKeys.has(todo.source.dedupeKey)
      ? [todo.source.dedupeKey]
      : []
  )))];
  const operations = [
    ...actionable.map((issue) => createApiRoomTodo(input.roomId, {
      title: plainDuriUserText(issue.title).slice(0, 200),
      description: descriptionFor(issue),
      status: "open",
      priority: priorityFor(issue),
      dueDate: issue.date ?? "",
      dueTime: "",
      timezone: input.timezone,
      assigneeId: null,
      checklist: [
        { id: `evidence-${stableHash(issue.id)}`, title: "분석 근거 확인", done: false },
        { id: `action-${stableHash(issue.id)}`, title: "일정 조정 또는 예외 사유 기록", done: false },
      ],
      links: issue.affectedItemIds.map((itemId) => ({
        type: "scheduleItem" as const,
        targetId: itemId,
        scheduleItemId: itemId,
      })),
      source: {
        kind: "duriAnalysis",
        dedupeKey: apiDuriIssueTodoDedupeKey(issue.id),
        cause: plainDuriUserText(issue.summary),
        baseRevision: input.baseRevision,
      },
      clientMutationId: createApiTodoMutationId(`duri-${stableHash(issue.id)}`),
    })),
    ...obsoleteKeys.map((dedupeKey) => resolveApiRoomAutoTodo(input.roomId, dedupeKey)),
  ];
  const settled = await Promise.allSettled(operations);
  return {
    createdOrRetained: actionable.length,
    resolved: obsoleteKeys.length,
    failed: settled.filter((entry) => entry.status === "rejected").length,
  };
}

/** 예약·티켓 연결 일정의 변경 영향을 방 공유 TODO로 남긴다. */
export async function syncApiWorkspaceScheduleImpactTodos(input: {
  roomId: string;
  beforeItinerary: readonly ItineraryItem[];
  afterItinerary: readonly ItineraryItem[];
  externalReferencesByItemId: Readonly<Record<string, readonly ScheduleImpactExternalReference[] | undefined>>;
  placeNameByItemId?: Readonly<Record<string, string>>;
  timezone: string;
}) {
  const afterIds = new Set(input.afterItinerary.map((item) => item.id));
  const seeds = createWorkspaceScheduleImpactTodoSeeds({
    beforeItinerary: input.beforeItinerary,
    afterItinerary: input.afterItinerary,
    documents: [],
    externalReferencesByItemId: input.externalReferencesByItemId,
    createdByUserId: "server-member",
    placeNameByItemId: input.placeNameByItemId,
  });
  const settled = await Promise.allSettled(seeds.map((seed) => {
    const itemId = seed.source.referenceId;
    const itemStillExists = Boolean(itemId && afterIds.has(itemId));
    const externalLinks = itemStillExists && itemId
      ? (input.externalReferencesByItemId[itemId] ?? []).map((reference) => ({
          type: reference.linkType === "reservation" ? "reservation" as const : "ticket" as const,
          targetId: reference.id,
          scheduleItemId: itemId,
        }))
      : [];
    return createApiRoomTodo(input.roomId, {
      title: seed.title,
      description: seed.description,
      status: "open",
      priority: seed.priority === "normal" ? "normal" : seed.priority,
      dueDate: seed.due?.date ?? "",
      dueTime: seed.due?.time ?? "",
      timezone: input.timezone,
      assigneeId: null,
      checklist: (seed.checklist ?? []).map((entry) => ({ id: entry.id, title: entry.title, done: entry.completed })),
      links: [
        ...(itemStillExists && itemId ? [{ type: "scheduleItem" as const, targetId: itemId, scheduleItemId: itemId }] : []),
        ...externalLinks,
      ],
      source: {
        kind: "scheduleChange",
        dedupeKey: `schedule-change:${stableHash(seed.dedupeKey)}`,
        cause: seed.description,
        baseRevision: seed.dedupeKey,
      },
      clientMutationId: createApiTodoMutationId(`schedule-${stableHash(seed.dedupeKey)}`),
    });
  }));
  return { createdOrRetained: seeds.length, failed: settled.filter((entry) => entry.status === "rejected").length };
}
