import type { ItineraryItem } from "../src/domain";
import type { DuriReportIssue } from "../src/features/duri/types";
import type { TravelDocument } from "../src/features/trip-documents/types";
import {
  createDocumentOcrConfirmationTodoSeed,
  createDuriIssueTodoSeed,
  createScheduleImpactTodoSeed,
  createScheduleRemovalImpactTodoSeed,
  createWorkspaceScheduleImpactTodoSeeds,
  getDocumentOcrConfirmationTodoAction,
  getDuriTodoResolvableDedupePrefixes,
  isDuriIssueTodoActionable,
  isSuccessfulWorkspaceMutation,
  runFreshDuriTodoSync,
  runWorkspaceTodoPostCommit,
} from "../src/features/trip-todos/logic/todoAutomation";
import {
  createEmptyTripTodoDraft,
  createGeneratedTripTodo,
  createTripTodo,
  getTripTodoDueState,
  normalizeDismissedGeneratedKeys,
  normalizeTripTodo,
  normalizeTripTodosByTripId,
  mergeGeneratedTripTodo,
  reconcileTripTodoLinks,
  resolveGeneratedTripTodo,
  shouldArchiveMissingGeneratedTodo,
  shouldRememberGeneratedTodoDismissal,
  sortTripTodos,
  tripTodoToDraft,
  updateTripTodo,
  validateTripTodoDraft,
} from "../src/features/trip-todos/logic/tripTodoState";

let scenarioCount = 0;
function assert(condition: unknown, message: string): asserts condition {
  scenarioCount += 1;
  if (!condition) throw new Error(message);
}

const now = "2026-08-19T03:00:00.000Z";
const draft = createEmptyTripTodoDraft({
  title: " KTX 시간 확인 ",
  description: "승차권과 일정 비교",
  priority: "high",
  dueDate: "2026-08-20",
  dueTime: "09:30",
  reminderMinutesBefore: 60,
  assigneeUserIds: ["owner", "owner"],
  checklist: [{ id: "check-1", title: "승차 시각 확인", completed: false }],
  tags: ["교통", "교통"],
  links: { itineraryItemIds: ["item-1"], documentIds: ["doc-1"], duriIssueIds: [], placeIds: ["station"] },
});
assert(Object.keys(validateTripTodoDraft(draft)).length === 0, "실용 필드가 채워진 TODO draft를 허용한다");
assert(Boolean(validateTripTodoDraft({ ...draft, title: "" }).title), "제목 없는 TODO를 거부한다");
assert(Boolean(validateTripTodoDraft({ ...draft, dueDate: "2026-02-30" }).dueDate), "달력에 없는 날짜를 거부한다");
assert(Boolean(validateTripTodoDraft({ ...draft, dueDate: "", dueTime: "09:30" }).dueTime), "날짜 없는 시각을 거부한다");
assert(Boolean(validateTripTodoDraft({ ...draft, dueTime: "24:00" }).dueTime), "Backend와 기기에서 표현할 수 없는 TODO 시각을 거부한다");

const createdResult = createTripTodo(draft, { tripId: "trip-1", createdByUserId: "owner", now, existingIds: [] });
assert(createdResult.ok, "정상 TODO를 생성한다");
const created = createdResult.todo;
assert(created.title === "KTX 시간 확인" && created.assigneeUserIds.length === 1 && created.tags.length === 1, "문자열·담당자·태그를 정규화한다");
assert(created.links.documentIds[0] === "doc-1" && created.checklist.length === 1, "문서·일정 연결과 체크리스트를 보존한다");
const completedResult = updateTripTodo(created, { ...tripTodoToDraft(created), status: "completed", checklist: [{ ...tripTodoToDraft(created).checklist[0], completed: true }] }, "2026-08-19T04:00:00.000Z");
assert(completedResult.ok && completedResult.todo.completedAt === "2026-08-19T04:00:00.000Z", "완료 시각과 체크 완료 시각을 기록한다");
assert(completedResult.ok && tripTodoToDraft(completedResult.todo).links.documentIds[0] === "doc-1", "수정 중 연결 정보를 잃지 않는다");

const corrupt = normalizeTripTodo({ ...created, status: "mystery", priority: "bad", tags: ["교통", "교통", 1], links: { documentIds: ["doc-1", "doc-1"] } });
assert(corrupt?.status === "open" && corrupt.priority === "normal", "손상된 enum은 안전한 기본값으로 복구한다");
assert(corrupt?.tags.length === 1 && corrupt.links.documentIds.length === 1, "저장값의 배열 중복과 비문자열을 제거한다");
const normalizedMap = normalizeTripTodosByTripId({ "trip-1": [created, { ...created }, { ...created, id: "other", dedupeKey: "same" }, { ...created, id: "other-2", dedupeKey: "same" }] });
assert(normalizedMap["trip-1"].length === 2, "ID 및 자동 생성 dedupeKey 중복을 복원 시 제거한다");
assert(Object.keys(normalizeDismissedGeneratedKeys({ "trip-1": { key: now, broken: "bad" } })["trip-1"]).join() === "key", "유효한 자동 TODO 삭제 표식만 복원한다");

const issue: DuriReportIssue = {
  id: "route-time-item-1-item-2", category: "route", severity: "high", title: "이동시간이 부족해요", summary: "20분 늦을 수 있어요.", date: "2026-08-20",
  affectedItemIds: ["item-1", "item-2"], affectedPlaceIds: ["place-1", "place-2"], affectedMemberIds: ["member-1", "member-1"], evidence: [{ label: "필요 이동시간", value: "50분" }],
  suggestionSupported: true, constraintType: "hard", confidence: "high", source: "external-evidence",
};
const issueSeed = createDuriIssueTodoSeed("trip-1", issue, "owner");
assert(issueSeed.priority === "urgent" && issueSeed.dedupeKey.includes(issue.id), "신뢰도 높은 hard 이슈를 긴급 TODO와 안정 키로 변환한다");
assert(issueSeed.due?.date === issue.date && issueSeed.links?.itineraryItemIds?.length === 2, "Duri 날짜·영향 일정을 TODO에 연결한다");
assert(issueSeed.assigneeUserIds?.length === 1 && issueSeed.assigneeUserIds[0] === "member-1", "영향받는 동행자를 자동 TODO 담당자로 중복 없이 연결한다");
assert(isDuriIssueTodoActionable(issue), "신뢰도 중간 이상인 실제 hard 위반은 공유 TODO 후보여야 한다");
assert(!isDuriIssueTodoActionable({ ...issue, id: "soft-route", constraintType: "soft" }), "동선 최적화 같은 soft 제안은 리포트에만 남기고 TODO로 복제하지 않는다");
assert(!isDuriIssueTodoActionable({ ...issue, id: "low-confidence", confidence: "low" }), "근거 신뢰도가 낮은 hard 경고는 자동 TODO로 승격하지 않는다");
assert(!isDuriIssueTodoActionable({ ...issue, id: "informational", constraintType: "informational", severity: "info" }), "정보성 설명은 여행 준비 TODO에 추가하지 않는다");
const generated = createGeneratedTripTodo(issueSeed, now, [created.id]);
assert(generated?.source.kind === "duri" && generated.id !== created.id, "자동 TODO도 고유 ID와 출처를 가진다");
const editedGenerated = generated && { ...generated, title: "내가 고친 제목", userEditedAt: "2026-08-19T03:30:00.000Z" };
const mergedEdited = editedGenerated && mergeGeneratedTripTodo(editedGenerated, { ...issueSeed, title: "새 분석 제목" }, "2026-08-19T04:00:00.000Z");
assert(mergedEdited?.title === "내가 고친 제목", "사용자가 편집한 자동 TODO 내용을 다음 분석이 덮어쓰지 않는다");
const resolvedGenerated = generated && { ...generated, status: "archived" as const, archivedReason: "resolved" as const, archivedAt: "2026-08-19T03:30:00.000Z" };
const reopened = resolvedGenerated && mergeGeneratedTripTodo(resolvedGenerated, issueSeed, "2026-08-19T05:00:00.000Z");
assert(reopened?.status === "open" && !reopened.archivedAt, "사라졌다가 재발한 자동 이슈 TODO를 다시 연다");
const partialCoveragePrefixes = getDuriTodoResolvableDedupePrefixes({
  itinerary: "complete", preferences: "partial", routeData: "partial", operatingData: "unavailable", documentData: "partial",
  routeMessage: "부분", operatingMessage: "없음", congestionData: "unavailable", congestionMessage: "없음", documentMessage: "검토 중", limitations: [],
});
assert(partialCoveragePrefixes.includes("duri:time-conflict:time-conflict-") && partialCoveragePrefixes.includes("duri:density:density-") && partialCoveragePrefixes.includes("duri:duplicate-visit:duplicate-visit-"), "로컬 일정으로 완결되는 개별 판정만 해결 여부를 갱신한다");
assert(!partialCoveragePrefixes.some((prefix) => prefix.startsWith("duri:route:")) && !partialCoveragePrefixes.some((prefix) => prefix.startsWith("duri:preference:")) && !partialCoveragePrefixes.some((prefix) => prefix.startsWith("duri:opening-hours:")), "부분·누락 외부 근거 판정은 이슈 부재를 해결로 오판하지 않는다");
const fullCoveragePrefixes = getDuriTodoResolvableDedupePrefixes({
  itinerary: "complete", preferences: "complete", routeData: "available", operatingData: "available", documentData: "available",
  routeMessage: "전체", operatingMessage: "전체", congestionData: "unavailable", congestionMessage: "없음", documentMessage: "확정 사실 일부", limitations: [],
});
assert(fullCoveragePrefixes.includes("duri:confirmed-schedule:confirmed-schedule-") && !fullCoveragePrefixes.some((prefix) => prefix.startsWith("duri:document-check:")), "모든 문서가 확인된 경우 확정 일정 판정만 자동 해결하고 문서 검토 TODO는 보존한다");
assert(!fullCoveragePrefixes.some((prefix) => "duri:density:visitor-congestion-place-date".startsWith(prefix)), "같은 density category의 외부 혼잡도 TODO를 로컬 밀도 판정과 함께 닫지 않는다");
assert(!fullCoveragePrefixes.some((prefix) => "duri:opening-hours:parking-unavailable-item".startsWith(prefix)) && !fullCoveragePrefixes.some((prefix) => "duri:preference:place-fee-budget-item".startsWith(prefix)), "주차·요금처럼 별도 근거가 필요한 TODO를 넓은 category 규칙으로 닫지 않는다");
assert(Boolean(generated) && !shouldArchiveMissingGeneratedTodo({ todo: generated, scope: "duri-analysis", activeDedupeKeys: new Set(), archiveMissingDedupePrefixes: partialCoveragePrefixes }), "coverage가 부족한 route TODO를 자동 보관하지 않는다");
assert(Boolean(generated) && shouldArchiveMissingGeneratedTodo({ todo: generated, scope: "duri-analysis", activeDedupeKeys: new Set(), archiveMissingDedupePrefixes: fullCoveragePrefixes }), "coverage가 완전한 실제 이동시간 판정에서 사라진 TODO만 해결 보관한다");
assert(Boolean(editedGenerated) && !shouldArchiveMissingGeneratedTodo({ todo: editedGenerated, scope: "duri-analysis", activeDedupeKeys: new Set(), archiveMissingDedupePrefixes: fullCoveragePrefixes }), "사용자가 손댄 자동 TODO는 분석 결과가 사라져도 독립 작업으로 보존한다");
const reconciledLinks = reconcileTripTodoLinks(created, { itineraryItemIds: [], documentIds: ["doc-1"] }, "2026-08-19T05:00:00.000Z");
assert(reconciledLinks.links.itineraryItemIds.length === 0 && reconciledLinks.links.documentIds[0] === "doc-1", "삭제된 일정 링크만 제거하고 아직 존재하는 문서 링크는 보존한다");

const ocrSeed = createDocumentOcrConfirmationTodoSeed("trip-1", { documentId: "doc-ocr", documentName: "ticket.png", documentKind: "train", candidateDate: "2026-08-21", candidateTime: "15:20", confidence: 0.82 }, "owner");
assert(!ocrSeed.due, "사용자 미확정 OCR 날짜·시간을 마감이나 hard fact로 승격하지 않는다");
assert(ocrSeed.tags?.includes("OCR 미확정") && ocrSeed.links?.documentIds?.[0] === "doc-ocr", "OCR 확인 TODO를 원문 문서에 연결한다");
const sensitiveOcrSeed = createDocumentOcrConfirmationTodoSeed("trip-1", {
  documentId: "doc-private",
  documentName: "ticket.png",
  documentKind: "train",
  candidatePlaceName: "서울역 010-1234-5678",
  extractedTextPreview: "예약번호 PRIVATE1234 user@example.com 010-1234-5678 ".repeat(8),
}, "owner");
assert(!/PRIVATE1234|user@example\.com|010-1234-5678/.test(sensitiveOcrSeed.description)
  && sensitiveOcrSeed.description.includes("[식별정보 숨김]")
  && sensitiveOcrSeed.description.includes("[이메일 숨김]")
  && sensitiveOcrSeed.description.includes("[전화번호 숨김]"),
"OCR 확인 TODO에는 비식별화한 짧은 preview만 복제한다");
const ocrTodo = createGeneratedTripTodo(ocrSeed, now, []);
assert(Boolean(ocrTodo), "OCR 확인 자동 TODO를 생성한다");
const firstSuggestedFact = {
  id: "fact-first", kind: "train" as const, label: "첫 예약", date: "2026-08-21", startTime: "15:20", confidence: 0.9,
  fieldConfidence: { date: 0.9, startTime: 0.9 }, reviewState: "confirmed" as const,
  provenance: { source: "ocr" as const, providerId: "test", extractedAt: now, evidenceSnippets: ["첫 예약"] },
  confirmedAt: now, confirmedByUserId: "owner",
};
const secondSuggestedFact = { ...firstSuggestedFact, id: "fact-second", label: "두 번째 예약", startTime: "18:10", reviewState: "suggested" as const, confirmedAt: undefined, confirmedByUserId: undefined };
const partialReviewAction = getDocumentOcrConfirmationTodoAction({
  id: "doc-ocr", displayName: "ticket.png", kind: "train",
  extraction: { status: "needs-review", providerId: "test", mode: "on-device", attemptedAt: now, facts: [firstSuggestedFact, secondSuggestedFact] },
});
assert(partialReviewAction.action === "upsert" && partialReviewAction.candidate.candidateTime === "18:10", "첫 fact를 확정해도 다음 suggested fact로 OCR TODO를 갱신한다");
const completedOcrTodo = ocrTodo && {
  ...ocrTodo,
  status: "completed" as const,
  completedAt: now,
  checklist: ocrTodo.checklist.map((entry) => ({ ...entry, completed: true, completedAt: now })),
};
const nextOcrSeed = partialReviewAction.action === "upsert"
  ? createDocumentOcrConfirmationTodoSeed("trip-1", partialReviewAction.candidate, "owner")
  : ocrSeed;
const reopenedPendingOcrTodo = completedOcrTodo && mergeGeneratedTripTodo(completedOcrTodo, nextOcrSeed, "2026-08-19T04:10:00.000Z");
assert(reopenedPendingOcrTodo?.status === "open" && reopenedPendingOcrTodo.checklist.every((entry) => !entry.completed), "과거 버그로 완료된 OCR TODO도 pending fact가 남으면 active 상태로 복구한다");
const allReviewedAction = getDocumentOcrConfirmationTodoAction({
  id: "doc-ocr", displayName: "ticket.png", kind: "train",
  extraction: { status: "confirmed", providerId: "test", mode: "on-device", attemptedAt: now, facts: [firstSuggestedFact, { ...secondSuggestedFact, reviewState: "rejected" }] },
});
assert(allReviewedAction.action === "resolve", "모든 fact가 confirmed 또는 rejected인 뒤에만 OCR TODO를 resolve한다");
const legacySensitiveOcrTodo = ocrTodo && normalizeTripTodo({
  ...ocrTodo,
  description: "원문 예약번호 OLDPRIVATE1234 old@example.com 연락처 010-9999-8888",
});
assert(!/OLDPRIVATE1234|old@example\.com|010-9999-8888/.test(legacySensitiveOcrTodo?.description ?? ""), "기존 미편집 OCR 자동 TODO도 hydration 중 비식별화한다");
const deletedDocumentResolution = ocrTodo && resolveGeneratedTripTodo(ocrTodo, "2026-08-19T04:30:00.000Z");
assert(deletedDocumentResolution?.status === "resolved"
  && deletedDocumentResolution.todo.status === "archived"
  && deletedDocumentResolution.todo.archivedReason === "resolved",
"문서 삭제 시 미편집 OCR 확인 TODO만 해결 보관한다");
const editedOcrTodo = ocrTodo && { ...ocrTodo, title: "내가 계속 확인할 작업", userEditedAt: "2026-08-19T04:00:00.000Z" };
const preservedDeletedDocumentTodo = editedOcrTodo && resolveGeneratedTripTodo(editedOcrTodo, "2026-08-19T04:30:00.000Z");
assert(preservedDeletedDocumentTodo?.status === "preserved-user-edit"
  && preservedDeletedDocumentTodo.todo.status === "open"
  && preservedDeletedDocumentTodo.todo.title === "내가 계속 확인할 작업",
"문서가 삭제되어도 사용자가 편집한 활성 TODO는 보존한다");

const before: ItineraryItem = { id: "item-ticket", tripId: "trip-1", placeId: "station", date: "2026-08-21", startTime: "15:00", durationMinutes: 30, itemType: "transport", preferredByUserIds: [] };
const after: ItineraryItem = { ...before, startTime: "16:00" };
const document: Pick<TravelDocument, "id" | "kind" | "displayName"> = { id: "doc-ticket", kind: "train", displayName: "KTX.pdf" };
assert(!createScheduleImpactTodoSeed({ before, after, documents: [], createdByUserId: "owner" }), "연결 문서가 없으면 예약 영향 TODO를 만들지 않는다");
assert(!createScheduleImpactTodoSeed({ before, after: before, documents: [document], createdByUserId: "owner" }), "일정이 바뀌지 않으면 예약 영향 TODO를 만들지 않는다");
const impact = createScheduleImpactTodoSeed({ before, after, documents: [document], createdByUserId: "owner", placeName: "부산역" });
assert(impact?.priority === "urgent" && impact.due?.time === "15:00", "문서 연결 일정 변경을 원래 일정 전 확인할 긴급 TODO로 만든다");
assert(impact?.links?.documentIds?.[0] === "doc-ticket" && impact.dedupeKey.includes("item-ticket"), "예약 영향 TODO에 일정·문서 안정 연결을 기록한다");
const removalImpact = createScheduleRemovalImpactTodoSeed({ item: before, documents: [document], createdByUserId: "owner", placeName: "부산역" });
assert(removalImpact?.priority === "urgent" && removalImpact.tags?.includes("일정 삭제"), "문서 연결 일정 삭제도 별도 긴급 TODO로 기록한다");
assert(!removalImpact?.links?.itineraryItemIds?.length && removalImpact?.links?.documentIds?.[0] === "doc-ticket", "삭제된 ID를 활성 일정 링크로 남기지 않고 문서·장소 근거만 보존한다");

const linkedDocument: TravelDocument = {
  id: "doc-ticket", tripId: "trip-1", itineraryItemIds: [before.id], kind: "train", displayName: "KTX.pdf", fileName: "KTX.pdf", mimeType: "application/pdf", sizeBytes: 2000,
  localUri: "file:///KTX.pdf", storage: "native-private", createdByUserId: "owner", createdAt: now,
};
const unchangedSeeds = createWorkspaceScheduleImpactTodoSeeds({ beforeItinerary: [before], afterItinerary: [before], documents: [linkedDocument], createdByUserId: "owner" });
assert(unchangedSeeds.length === 0, "성공 처리라도 일정 사실이 바뀌지 않으면 영향 TODO를 만들지 않는다");
const timeChangeSeeds = createWorkspaceScheduleImpactTodoSeeds({ beforeItinerary: [before], afterItinerary: [after], documents: [linkedDocument], createdByUserId: "owner", placeNameById: { station: "부산역" } });
assert(timeChangeSeeds.length === 1 && timeChangeSeeds[0].description.includes("시각"), "문서 연결 일정의 시간 변경을 감지한다");
const dateChangeSeeds = createWorkspaceScheduleImpactTodoSeeds({ beforeItinerary: [before], afterItinerary: [{ ...before, date: "2026-08-22" }], documents: [linkedDocument], createdByUserId: "owner" });
assert(dateChangeSeeds.length === 1 && dateChangeSeeds[0].description.includes("날짜"), "문서 연결 일정의 날짜 변경을 감지한다");
const deletionSeeds = createWorkspaceScheduleImpactTodoSeeds({ beforeItinerary: [before], afterItinerary: [], documents: [linkedDocument], createdByUserId: "owner" });
assert(deletionSeeds.length === 1 && deletionSeeds[0].tags?.includes("일정 삭제"), "문서 연결 일정 삭제를 전후 snapshot으로 감지한다");
assert(createWorkspaceScheduleImpactTodoSeeds({ beforeItinerary: [before], afterItinerary: [after], documents: [{ ...linkedDocument, itineraryItemIds: [] }], createdByUserId: "owner" }).length === 0, "연결 문서가 없는 일정 변경은 예약 영향 TODO를 만들지 않는다");
const serverTicketChangeSeeds = createWorkspaceScheduleImpactTodoSeeds({
  beforeItinerary: [before],
  afterItinerary: [after],
  documents: [],
  externalReferencesByItemId: { [before.id]: [{ id: "server-ticket-1", label: "KTX 승차권.jpg", sourceLabel: "서버 티켓" }] },
  placeNameByItemId: { [before.id]: "부산역" },
  createdByUserId: "owner",
});
const repeatedServerTicketChangeSeeds = createWorkspaceScheduleImpactTodoSeeds({
  beforeItinerary: [before],
  afterItinerary: [after],
  documents: [],
  externalReferencesByItemId: { [before.id]: [{ id: "server-ticket-1", label: "KTX 승차권.jpg", sourceLabel: "서버 티켓" }] },
  placeNameByItemId: { [before.id]: "부산역" },
  createdByUserId: "owner",
});
assert(serverTicketChangeSeeds.length === 1
  && serverTicketChangeSeeds[0].description.includes("서버 티켓 KTX 승차권.jpg")
  && !serverTicketChangeSeeds[0].links?.documentIds?.length,
"서버 티켓만 연결된 API 일정 변경도 로컬 문서 ID를 날조하지 않고 TODO로 만든다");
assert(serverTicketChangeSeeds[0]?.dedupeKey === repeatedServerTicketChangeSeeds[0]?.dedupeKey,
"같은 API 일정 version 결과를 다시 동기화해도 동일한 idempotent TODO 키를 만든다");
const serverTicketDeletionSeeds = createWorkspaceScheduleImpactTodoSeeds({
  beforeItinerary: [before],
  afterItinerary: [],
  documents: [],
  externalReferencesByItemId: { [before.id]: [{ id: "server-ticket-1", label: "KTX 승차권.jpg", sourceLabel: "서버 티켓" }] },
  createdByUserId: "owner",
});
assert(serverTicketDeletionSeeds.length === 1 && serverTicketDeletionSeeds[0].tags?.includes("일정 삭제"), "서버 티켓 연결 API 일정 삭제도 별도 TODO로 기록한다");
assert(isSuccessfulWorkspaceMutation("success") && isSuccessfulWorkspaceMutation("success-adjusted"), "일정 저장과 종료 조건 자동 조정 성공만 TODO 후처리 대상으로 인정한다");
assert(!isSuccessfulWorkspaceMutation("overlap") && !isSuccessfulWorkspaceMutation("end-condition") && !isSuccessfulWorkspaceMutation("invalid-attachment"), "실패·롤백 mutation은 TODO 후처리 대상에서 제외한다");
const laterImpact = createScheduleImpactTodoSeed({ before: after, after: { ...after, startTime: "17:00" }, documents: [document], createdByUserId: "owner" });
assert(Boolean(impact && laterImpact && impact.dedupeKey !== laterImpact.dedupeKey), "새 일정 변경 사건은 이전에 삭제한 TODO tombstone과 충돌하지 않는 키를 사용한다");
const completedImpactTodo = impact && createGeneratedTripTodo(impact, now, []);
assert(completedImpactTodo ? !shouldRememberGeneratedTodoDismissal(completedImpactTodo) : false, "삭제한 일정 영향 TODO가 이후 같은 변경 사건까지 영구 차단하지 않는다");
assert(generated ? shouldRememberGeneratedTodoDismissal(generated) : false, "반복 분석되는 Duri TODO 삭제는 재생성 방지 표식을 유지한다");
const reopenedImpactTodo = completedImpactTodo && laterImpact && mergeGeneratedTripTodo({
  ...completedImpactTodo,
  status: "completed",
  completedAt: now,
  assigneeUserIds: ["owner"],
  checklist: completedImpactTodo.checklist.map((entry) => ({ ...entry, completed: true, completedAt: now })),
}, laterImpact, "2026-08-19T06:00:00.000Z");
assert(reopenedImpactTodo?.status === "open" && reopenedImpactTodo.dedupeKey === laterImpact?.dedupeKey, "완료 후 다시 변경된 예약 일정은 같은 항목 TODO를 새 사건으로 다시 연다");
assert(reopenedImpactTodo?.checklist.every((entry) => !entry.completed) && reopenedImpactTodo.assigneeUserIds[0] === "owner", "새 변경 사건은 확인 단계를 초기화하되 기존 담당자는 유지한다");

assert(getTripTodoDueState({ ...created, due: { date: "2026-08-18", time: "09:00" } }, new Date("2026-08-19T12:00:00")) === "overdue", "기기 현지 시각 기준 기한 지남을 감지한다");
assert(getTripTodoDueState({ ...created, status: "completed" }, new Date("2026-08-19T12:00:00")) === "completed", "완료 TODO는 기한 경고에서 제외한다");
assert(getTripTodoDueState(
  { ...created, due: { date: "2026-08-20", time: "12:00", timezone: "Asia/Seoul" } },
  new Date("2026-08-20T01:00:00.000Z"),
) === "due-today", "기기 timezone과 달라도 TODO에 저장된 지역의 날짜·시각으로 오늘 기한을 계산한다");
assert(getTripTodoDueState(
  { ...created, due: { date: "2026-08-20", time: "09:00", timezone: "Asia/Seoul" } },
  new Date("2026-08-20T00:01:00.000Z"),
) === "overdue", "저장된 timezone의 wall-clock을 실제 instant로 변환해 기한 지남을 판정한다");
assert(getTripTodoDueState(
  { ...created, due: { date: "2026-03-08", time: "02:30", timezone: "America/New_York" } },
  new Date("2026-03-08T00:00:00.000Z"),
) === "none", "DST 전환으로 존재하지 않는 지역 시각을 임의의 다른 시각으로 보정하지 않는다");
assert(getTripTodoDueState(
  { ...created, due: { date: "2026-11-01", time: "01:30", timezone: "America/New_York" } },
  new Date("2026-11-01T06:00:00.000Z"),
) === "due-today", "DST 종료로 두 번 존재하는 지역 시각은 기한을 성급히 넘기지 않도록 뒤의 instant를 선택한다");
const invalidTimezoneTodo = normalizeTripTodo({ ...created, due: { date: "2026-08-20", time: "12:00", timezone: "Not/A_Timezone" } }, created.tripId);
assert(Boolean(invalidTimezoneTodo?.due && !invalidTimezoneTodo.due.timezone), "지원하지 않는 저장 timezone은 안전하게 제거한다");
const timezoneSorted = sortTripTodos([
  { ...created, id: "later", updatedAt: "2026-08-19T01:00:00.000Z", due: { date: "2026-08-20", time: "09:00", timezone: "America/New_York" } },
  { ...created, id: "earlier", updatedAt: "2026-08-19T00:00:00.000Z", due: { date: "2026-08-20", time: "12:00", timezone: "Asia/Seoul" } },
]);
assert(timezoneSorted[0]?.id === "earlier", "서로 다른 timezone TODO를 문자열이 아니라 실제 기한 instant 순서로 정렬한다");

async function verifyPostCommitBoundary() {
  let automationCalls = 0;
  const skipped = await runWorkspaceTodoPostCommit("overlap", async () => { automationCalls += 1; });
  assert(skipped === "skipped" && automationCalls === 0, "실패한 일정 mutation에서는 TODO 자동화를 호출하지 않는다");
  const completed = await runWorkspaceTodoPostCommit("success-adjusted", async () => { automationCalls += 1; });
  assert(completed === "completed" && Number(automationCalls) === 1, "확정된 일정 mutation 뒤에만 TODO 자동화를 호출한다");
  const failed = await runWorkspaceTodoPostCommit("success", async () => {
    automationCalls += 1;
    throw new Error("storage unavailable");
  });
  assert(failed === "failed" && Number(automationCalls) === 2, "TODO 저장 실패를 흡수해 성공한 일정 mutation으로 역전파하지 않는다");

  let releaseHydration: (() => void) | undefined;
  const delayedHydration = new Promise<void>((resolve) => { releaseHydration = resolve; });
  let current = true;
  let syncCalls = 0;
  const pendingStaleSync = runFreshDuriTodoSync({
    waitUntilReady: () => delayedHydration,
    isCurrent: () => current,
    commit: () => { syncCalls += 1; return syncCalls; },
  });
  current = false;
  releaseHydration?.();
  const staleSync = await pendingStaleSync;
  assert(staleSync.status === "stale" && syncCalls === 0, "TODO hydration 중 분석 입력이 바뀌면 이전 Duri TODO를 기록하지 않는다");

  const freshSync = await runFreshDuriTodoSync({
    waitUntilReady: async () => undefined,
    isCurrent: () => true,
    commit: () => { syncCalls += 1; return syncCalls; },
  });
  assert(freshSync.status === "synced" && freshSync.value === 1 && Number(syncCalls) === 1, "hydration 뒤에도 최신인 Duri 분석만 TODO에 한 번 반영한다");
  console.log(`Trip TODO verification passed: ${scenarioCount} scenarios`);
}

void verifyPostCommitBoundary();
