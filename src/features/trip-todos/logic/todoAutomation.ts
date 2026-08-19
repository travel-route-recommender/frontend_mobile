import type { ItineraryItem } from "../../../domain";
import { redactSensitiveTextPreview } from "../../../utils/sensitiveText";
import type { DuriAnalysisCoverage, DuriReportIssue } from "../../duri/types";
import type { TravelDocument, TravelDocumentKind } from "../../trip-documents/types";
import { hasScheduleRelevantChange, isValidCalendarDate } from "./tripTodoState";
import type { TripTodoGeneratedSeed, TripTodoPriority } from "../types";

const priorityFromDuriIssue = (issue: Pick<DuriReportIssue, "severity" | "constraintType">): TripTodoPriority => {
  if (issue.severity === "high" && issue.constraintType === "hard") return "urgent";
  if (issue.severity === "high" || issue.severity === "medium") return "high";
  return "normal";
};

const documentKindLabel: Record<TravelDocumentKind, string> = {
  accommodation: "숙소 예약",
  admission: "입장권",
  train: "기차표",
  bus: "버스표",
  "rental-car": "렌터카 예약",
  other: "여행 문서",
};

/**
 * '이번 분석에서 사라짐 = 해결됨'으로 처리해도 되는 개별 판정만 반환한다.
 * category 전체를 보관하면 같은 category 안의 별도 외부 근거(주차·요금·혼잡도 등)가
 * 일시적으로 빠졌을 때 사용자의 TODO까지 잘못 닫을 수 있으므로 issue ID prefix까지 좁힌다.
 */
export function getDuriTodoResolvableDedupePrefixes(coverage: DuriAnalysisCoverage): string[] {
  const prefixes = [
    "duri:time-conflict:time-conflict-",
    "duri:day-balance:day-balance-",
    "duri:end-condition:end-condition-",
    "duri:duplicate-visit:duplicate-visit-",
    "duri:overnight-recovery:overnight-recovery-",
  ];
  if (coverage.itinerary === "complete") {
    prefixes.push("duri:density:density-", "duri:meal:meal-");
  }
  if (coverage.preferences === "complete") {
    prefixes.push(
      "duri:preference:preference-member-",
      "duri:preference:preference-count-gap",
      "duri:preference:preference-balance",
      "duri:preference:preference-coordination-",
      "duri:preference:preference-mobility-no-common-",
      "duri:preference:preference-budget-priority-",
      "duri:preference:preference-mobility-mode-",
      "duri:preference:preference-category-coverage-",
      "duri:preference:preference-representation-",
    );
  }
  if (coverage.routeData === "available") {
    prefixes.push("duri:route:route-time-");
    if (coverage.preferences === "complete") prefixes.push("duri:preference:preference-daily-load-");
  }
  if (coverage.operatingData === "available") {
    prefixes.push(
      "duri:opening-hours:event-period-",
      "duri:opening-hours:closed-day-",
      "duri:opening-hours:opening-hours-",
    );
  }
  if (coverage.documentData === "available") {
    prefixes.push("duri:confirmed-schedule:confirmed-schedule-");
  }
  return prefixes;
}

export function createDuriIssueTodoSeed(
  tripId: string,
  issue: DuriReportIssue,
  createdByUserId: string,
): TripTodoGeneratedSeed {
  const evidence = issue.evidence.slice(0, 3).map((entry) => `${entry.label}: ${entry.value}`).join("\n");
  return {
    tripId,
    title: issue.title,
    description: [issue.summary, evidence].filter(Boolean).join("\n\n"),
    priority: priorityFromDuriIssue(issue),
    assigneeUserIds: [...new Set(issue.affectedMemberIds)],
    ...(issue.date && isValidCalendarDate(issue.date) ? { due: { date: issue.date } } : {}),
    checklist: [
      { id: `${issue.id}:evidence`, title: "두리가 제시한 근거를 확인하기", completed: false },
      { id: `${issue.id}:decision`, title: "일정 수정 여부를 동행자와 결정하기", completed: false },
    ],
    tags: ["두리 점검", issue.constraintType === "hard" ? "필수 확인" : "개선 제안"],
    links: {
      itineraryItemIds: issue.affectedItemIds,
      placeIds: issue.affectedPlaceIds,
      duriIssueIds: [issue.id],
    },
    source: { kind: "duri", scope: "duri-analysis", referenceId: issue.id },
    dedupeKey: `duri:${issue.category}:${issue.id}`,
    createdByUserId,
  };
}

export type OcrConfirmationCandidate = {
  documentId: string;
  documentName: string;
  documentKind: TravelDocumentKind;
  /** OCR 추정값이다. 사용자가 확인하기 전에는 due나 hard constraint로 승격하지 않는다. */
  candidateDate?: string;
  candidateTime?: string;
  candidatePlaceName?: string;
  extractedTextPreview?: string;
  confidence?: number;
};

export type DocumentOcrConfirmationTodoAction =
  | { action: "upsert"; candidate: OcrConfirmationCandidate }
  | { action: "resolve" };

/** 문서 전체를 기준으로 다음 미확정 fact가 있는 동안 같은 확인 TODO를 유지한다. */
export function getDocumentOcrConfirmationTodoAction(
  document: Pick<TravelDocument, "id" | "displayName" | "kind" | "extraction">,
): DocumentOcrConfirmationTodoAction {
  const pending = document.extraction?.facts.find((fact) => fact.reviewState === "suggested");
  if (!pending) return { action: "resolve" };
  return {
    action: "upsert",
    candidate: {
      documentId: document.id,
      documentName: document.displayName,
      documentKind: document.kind,
      ...(pending.date ? { candidateDate: pending.date } : {}),
      ...(pending.startTime ? { candidateTime: pending.startTime } : {}),
      ...(pending.placeName ? { candidatePlaceName: pending.placeName } : {}),
      ...(pending.provenance.evidenceSnippets.length ? { extractedTextPreview: pending.provenance.evidenceSnippets.join(" · ") } : {}),
      confidence: pending.confidence,
    },
  };
}

export function createDocumentOcrConfirmationTodoSeed(
  tripId: string,
  candidate: OcrConfirmationCandidate,
  createdByUserId: string,
): TripTodoGeneratedSeed {
  const safePlaceName = candidate.candidatePlaceName
    ? redactSensitiveTextPreview(candidate.candidatePlaceName, 80)
    : "";
  const safePreview = candidate.extractedTextPreview
    ? redactSensitiveTextPreview(candidate.extractedTextPreview, 120)
    : "";
  const candidateFacts = [
    candidate.candidateDate ? `추정 날짜: ${candidate.candidateDate}` : "",
    candidate.candidateTime ? `추정 시간: ${candidate.candidateTime}` : "",
    safePlaceName ? `추정 장소: ${safePlaceName}` : "",
    typeof candidate.confidence === "number" ? `OCR 신뢰도: ${Math.round(Math.max(0, Math.min(1, candidate.confidence)) * 100)}%` : "",
    safePreview ? `인식 내용: ${safePreview}` : "",
  ].filter(Boolean);
  return {
    tripId,
    title: `${documentKindLabel[candidate.documentKind]} 정보 확인`,
    description: [
      `${candidate.documentName}에서 읽은 정보는 아직 확정 일정이 아닙니다. 원문과 비교한 뒤 확인해 주세요.`,
      candidateFacts.join("\n"),
    ].filter(Boolean).join("\n\n"),
    priority: "high",
    checklist: [
      { id: `${candidate.documentId}:date`, title: "날짜와 시간을 원문에서 확인하기", completed: false },
      { id: `${candidate.documentId}:place`, title: "장소·출발지·도착지를 확인하기", completed: false },
      { id: `${candidate.documentId}:policy`, title: "취소·변경·입장 마감 조건을 확인하기", completed: false },
      { id: `${candidate.documentId}:link`, title: "관련 일정에 문서를 연결하기", completed: false },
    ],
    tags: ["문서 확인", "OCR 미확정"],
    links: { documentIds: [candidate.documentId] },
    source: { kind: "document-ocr", scope: "document-ocr", referenceId: candidate.documentId },
    dedupeKey: `document-ocr:${candidate.documentId}`,
    createdByUserId,
  };
}

type ScheduleImpactInput = {
  before: ItineraryItem;
  after: ItineraryItem;
  documents: readonly Pick<TravelDocument, "id" | "kind" | "displayName">[];
  createdByUserId: string;
  placeName?: string;
};

function stableShortFingerprint(value: string) {
  const hash = (source: string) => {
    let result = 0x811c9dc5;
    for (let index = 0; index < source.length; index += 1) {
      result ^= source.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return (result >>> 0).toString(36);
  };
  return `${hash(value)}${hash([...value].reverse().join(""))}`;
}

function scheduleOccurrenceKey(item: ItineraryItem, documentIds: readonly string[], kind: "changed" | "removed") {
  const facts = [kind, item.date, item.startTime, String(item.durationMinutes), item.placeId ?? "", item.itemType, ...documentIds].join("|");
  return `schedule-impact:${item.id}:${stableShortFingerprint(facts)}`;
}

export function isSuccessfulWorkspaceMutation(status: string) {
  return status === "success" || status === "success-adjusted";
}

export type WorkspaceTodoPostCommitResult = "skipped" | "completed" | "failed";

export type FreshDuriTodoSyncResult<T> =
  | { status: "stale" }
  | { status: "synced"; value: T };

/**
 * Persist hydration이 끝난 뒤에만 최신 분석 여부를 판정하고, 판정과 동기식 store
 * mutation 사이에는 await 경계를 두지 않는다. 느린 hydration 중 일정이나 분석
 * session이 바뀐 경우 이전 리포트의 TODO를 현재 여행방에 기록하지 않는다.
 */
export async function runFreshDuriTodoSync<T>(input: {
  waitUntilReady(): Promise<void>;
  isCurrent(): boolean;
  commit(): T;
}): Promise<FreshDuriTodoSyncResult<T>> {
  await input.waitUntilReady();
  if (!input.isCurrent()) return { status: "stale" };
  return { status: "synced", value: input.commit() };
}

/**
 * 일정 mutation이 확정된 뒤에만 자동 TODO를 실행한다. TODO 저장 실패는 여기서
 * 흡수하여 이미 성공한 일정 변경이나 화면 피드백으로 역전파하지 않는다.
 */
export async function runWorkspaceTodoPostCommit(
  mutationStatus: string,
  automation: () => Promise<unknown>,
): Promise<WorkspaceTodoPostCommitResult> {
  if (!isSuccessfulWorkspaceMutation(mutationStatus)) return "skipped";
  try {
    await automation();
    return "completed";
  } catch {
    return "failed";
  }
}

export function createScheduleImpactTodoSeed(input: ScheduleImpactInput): TripTodoGeneratedSeed | undefined {
  if (input.before.tripId !== input.after.tripId || !input.documents.length || !hasScheduleRelevantChange(input.before, input.after)) return undefined;
  const changes = [
    input.before.date !== input.after.date ? `날짜 ${input.before.date} → ${input.after.date}` : "",
    input.before.startTime !== input.after.startTime ? `시각 ${input.before.startTime} → ${input.after.startTime}` : "",
    input.before.durationMinutes !== input.after.durationMinutes ? `체류 ${input.before.durationMinutes}분 → ${input.after.durationMinutes}분` : "",
    input.before.placeId !== input.after.placeId ? "장소 변경" : "",
  ].filter(Boolean);
  const documentNames = input.documents.map((document) => `${documentKindLabel[document.kind]} ${document.displayName}`).join(", ");
  const dueDate = [input.before.date, input.after.date].filter(isValidCalendarDate).sort()[0];
  const dueTime = input.before.date === dueDate ? input.before.startTime : input.after.startTime;
  const documentIds = [...new Set(input.documents.map((document) => document.id))].sort();
  return {
    tripId: input.before.tripId,
    title: `예약 정보 재확인: ${input.placeName?.trim() || "연결 일정"}`,
    description: `문서가 연결된 일정이 바뀌었습니다.\n${changes.join("\n")}\n\n연결 문서: ${documentNames}`,
    priority: "urgent",
    ...(dueDate ? { due: { date: dueDate, ...(dueTime ? { time: dueTime } : {}), reminderMinutesBefore: 24 * 60 } } : {}),
    checklist: [
      { id: `${input.before.id}:ticket`, title: "예약·티켓의 날짜와 시간이 새 일정과 맞는지 확인하기", completed: false },
      { id: `${input.before.id}:change`, title: "필요하면 예약 변경 또는 취소 절차 진행하기", completed: false },
      { id: `${input.before.id}:share`, title: "변경 결과를 동행자에게 공유하기", completed: false },
    ],
    tags: ["일정 변경", "예약 확인"],
    links: {
      itineraryItemIds: [input.after.id],
      documentIds,
      placeIds: input.after.placeId ? [input.after.placeId] : [],
    },
    source: { kind: "schedule-impact", scope: "schedule-impact", referenceId: input.after.id },
    dedupeKey: scheduleOccurrenceKey(input.after, documentIds, "changed"),
    createdByUserId: input.createdByUserId,
  };
}

export function createScheduleRemovalImpactTodoSeed(input: {
  item: ItineraryItem;
  documents: readonly Pick<TravelDocument, "id" | "kind" | "displayName">[];
  createdByUserId: string;
  placeName?: string;
}): TripTodoGeneratedSeed | undefined {
  if (!input.documents.length) return undefined;
  const documentIds = [...new Set(input.documents.map((document) => document.id))].sort();
  const documentNames = input.documents.map((document) => `${documentKindLabel[document.kind]} ${document.displayName}`).join(", ");
  return {
    tripId: input.item.tripId,
    title: `삭제된 일정의 예약 확인: ${input.placeName?.trim() || "연결 일정"}`,
    description: `예약·티켓 문서가 연결된 ${input.item.date} ${input.item.startTime} 일정이 삭제되었습니다. 문서 자체는 남아 있으므로 예약 변경·취소 또는 새 일정 연결이 필요한지 확인해 주세요.\n\n연결 문서: ${documentNames}`,
    priority: "urgent",
    due: { date: input.item.date, time: input.item.startTime, reminderMinutesBefore: 24 * 60 },
    checklist: [
      { id: `${input.item.id}:rebind`, title: "예약을 유지한다면 새 일정에 문서 다시 연결하기", completed: false },
      { id: `${input.item.id}:change`, title: "필요하면 예약 변경 또는 취소 절차 진행하기", completed: false },
      { id: `${input.item.id}:share`, title: "변경 결과를 동행자에게 공유하기", completed: false },
    ],
    tags: ["일정 삭제", "예약 확인"],
    links: {
      documentIds,
      placeIds: input.item.placeId ? [input.item.placeId] : [],
    },
    source: { kind: "schedule-impact", scope: "schedule-impact", referenceId: input.item.id },
    dedupeKey: scheduleOccurrenceKey(input.item, documentIds, "removed"),
    createdByUserId: input.createdByUserId,
  };
}

export function createWorkspaceScheduleImpactTodoSeeds(input: {
  beforeItinerary: readonly ItineraryItem[];
  afterItinerary: readonly ItineraryItem[];
  documents: readonly TravelDocument[];
  createdByUserId: string;
  placeNameById?: Readonly<Record<string, string>>;
}) {
  const afterById = new Map(input.afterItinerary.map((item) => [item.id, item]));
  const documentsByItemId = new Map<string, TravelDocument[]>();
  input.documents.forEach((document) => document.itineraryItemIds.forEach((itemId) => {
    documentsByItemId.set(itemId, [...(documentsByItemId.get(itemId) ?? []), document]);
  }));
  return input.beforeItinerary.flatMap((before) => {
    const documents = documentsByItemId.get(before.id) ?? [];
    if (!documents.length) return [];
    const placeName = before.placeId ? input.placeNameById?.[before.placeId] : undefined;
    const after = afterById.get(before.id);
    const seed = after
      ? createScheduleImpactTodoSeed({ before, after, documents, createdByUserId: input.createdByUserId, placeName })
      : createScheduleRemovalImpactTodoSeed({ item: before, documents, createdByUserId: input.createdByUserId, placeName });
    return seed ? [seed] : [];
  });
}
