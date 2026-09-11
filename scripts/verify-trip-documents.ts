import { configureApiAuth } from "../src/services/apiClient";
import { deleteApiTripDocument, fetchApiTripDocuments, parseApiTripDocumentCollection, parseApiTripDocumentList, parseApiTripDocumentUpload } from "../src/features/trip-documents/services/tripDocumentApi";
import {
  discardExpiredWebSessionDocuments,
  normalizeTravelDocument,
  normalizeTravelDocumentsByTripId,
  reconcileTravelDocumentLinks,
  setItineraryDocumentLinks,
} from "../src/features/trip-documents/logic/travelDocumentState";
import {
  buildConfirmedScheduleConstraintsFromDocuments,
  buildDuriDocumentReferencesFromDocuments,
  confirmTravelDocumentFact,
  createManualTravelDocumentExtraction,
  createUnavailableTextRecognizer,
  extractTravelDocumentFactsFromText,
  getNextTravelDocumentFactForReview,
  normalizeTravelDocumentExtraction,
  runTravelDocumentTextExtraction,
  type TravelDocumentTextRecognizer,
} from "../src/features/trip-documents/logic/documentExtraction";
import { TRAVEL_DOCUMENT_SESSION_ID, type TravelDocument } from "../src/features/trip-documents/types";
import { normalizeExternalTravelDocumentUrl } from "../src/features/trip-documents/logic/externalDocumentUrl";
import { buildLockedDocumentScheduleDraft, findEquivalentLockedDocumentSchedule, prepareLockedDocumentScheduleAddition } from "../src/features/trip-documents/logic/documentSchedule";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const document = (id: string, itineraryItemIds: string[] = []): TravelDocument => ({
  id,
  tripId: "trip-1",
  itineraryItemIds,
  kind: "admission",
  displayName: id + ".pdf",
  fileName: id + ".pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  localUri: "file:///documents/" + id + ".pdf",
  storage: "native-private",
  createdByUserId: "owner",
  createdAt: "2026-07-28T00:00:00.000Z",
});

assert(!normalizeTravelDocument({ id: "broken" }), "필수 파일 metadata가 없으면 복원하지 않는다");
assert(normalizeExternalTravelDocumentUrl("https://tickets.example.com/r/123") === "https://tickets.example.com/r/123", "표준 https 예약 링크를 정규화한다");
assert(!normalizeExternalTravelDocumentUrl("javascript:alert(1)") && !normalizeExternalTravelDocumentUrl("kakaotalk://booking/1"), "임의 스크립트·앱 스킴을 예약 문서로 저장하지 않는다");
const externalDocument = normalizeTravelDocument({
  ...document("external"),
  storage: "external-url",
  localUri: "https://tickets.example.com/r/123",
  mimeType: "text/uri-list",
  sizeBytes: 0,
});
assert(externalDocument?.storage === "external-url", "유효한 외부 예약 링크 metadata를 복원한다");
assert(!normalizeTravelDocument({ ...externalDocument, localUri: "file:///private/other-app" }), "외부 링크 storage에 로컬 파일 URI를 위장해 복원하지 않는다");
const normalized = normalizeTravelDocument({ ...document("ticket"), itineraryItemIds: ["item-1", "item-1", 4] });
assert(normalized?.itineraryItemIds.join() === "item-1", "일정 연결 ID를 문자열 중복 없이 정규화한다");

const normalizedByTrip = normalizeTravelDocumentsByTripId({
  "trip-1": [document("ticket"), document("ticket"), { ...document("wrong-trip"), tripId: "trip-2" }],
});
assert(normalizedByTrip["trip-1"]?.length === 1, "중복 문서와 다른 여행방 문서를 격리한다");

const linked = setItineraryDocumentLinks([document("ticket"), document("hotel", ["item-old"])], "item-1", ["ticket"]);
assert(linked.find((entry) => entry.id === "ticket")?.itineraryItemIds.join() === "item-1", "선택 문서를 일정에 연결한다");
assert(linked.find((entry) => entry.id === "hotel")?.itineraryItemIds.join() === "item-old", "다른 일정 연결은 보존한다");

const replaced = setItineraryDocumentLinks(linked, "item-1", ["hotel"]);
assert(!replaced.find((entry) => entry.id === "ticket")?.itineraryItemIds.includes("item-1"), "선택 해제 문서 연결을 제거한다");
assert(replaced.find((entry) => entry.id === "hotel")?.itineraryItemIds.sort().join() === "item-1,item-old", "새 문서 연결과 기존 연결을 함께 보존한다");

const reconciled = reconcileTravelDocumentLinks(replaced, new Set(["item-1"]));
assert(reconciled.find((entry) => entry.id === "hotel")?.itineraryItemIds.join() === "item-1", "삭제된 일정의 고아 연결만 정리한다");
assert(reconciled.length === replaced.length, "일정 삭제가 원본 여행 문서를 삭제하지 않는다");

const noOpLinked = setItineraryDocumentLinks(reconciled, "item-1", ["hotel"]);
assert(noOpLinked === reconciled, "같은 일정 연결을 다시 저장하면 배열 참조를 유지한다");
const noOpReconciled = reconcileTravelDocumentLinks(reconciled, new Set(["item-1"]));
assert(noOpReconciled === reconciled, "고아 연결이 없으면 reconciliation이 상태를 다시 쓰지 않는다");

const currentWebDocument: TravelDocument = {
  ...document("web-current"),
  storage: "web-session",
  localUri: "blob:current",
  sessionId: TRAVEL_DOCUMENT_SESSION_ID,
};
const expiredWebDocument: TravelDocument = {
  ...document("web-expired"),
  storage: "web-session",
  localUri: "blob:expired",
  sessionId: "old-session",
};
const webFiltered = discardExpiredWebSessionDocuments({ "trip-1": [currentWebDocument, expiredWebDocument, document("native")] });
assert(webFiltered["trip-1"]?.some((entry) => entry.id === "web-current"), "현재 웹 탭의 Blob 문서는 유지한다");
assert(!webFiltered["trip-1"]?.some((entry) => entry.id === "web-expired") && webFiltered["trip-1"]?.some((entry) => entry.id === "native"), "새로고침 뒤 만료 Blob만 제거한다");

const extractedFacts = extractTravelDocumentFactsFromText({
  document: { ...document("train-ticket", ["train-item"]), kind: "train" },
  text: "승차일 2026년 8월 20일\n출발 15:20 서울역\n도착 18:10 부산역",
  providerId: "test-on-device",
  providerConfidence: 0.9,
  extractedAt: "2026-08-19T00:00:00.000Z",
  tripStartDate: "2026-08-19",
  tripEndDate: "2026-08-21",
});
assert(extractedFacts[0]?.date === "2026-08-20", "OCR 날짜를 여행 범위 안의 ISO 날짜로 변환한다");
assert(extractedFacts[0]?.startTime === "15:20", "기차표는 도착 시각보다 출발 시각을 우선한다");
assert(extractedFacts[0]?.endTime === "18:10", "명시된 기차 도착 시각을 종료 시각 검토 후보로 보존한다");
assert(extractedFacts[0]?.reviewState === "suggested", "OCR 결과는 confidence와 무관하게 검토 후보로만 만든다");
const singleLineTransport = extractTravelDocumentFactsFromText({
  document: { ...document("single-line-train", ["train-item"]), kind: "train" },
  text: "2026-08-20 출발 15:20 서울역 / 도착 18:10 부산역",
  providerId: "test-on-device",
  extractedAt: "2026-08-19T00:00:00.000Z",
  tripStartDate: "2026-08-19",
  tripEndDate: "2026-08-21",
});
assert(singleLineTransport[0]?.startTime === "15:20" && singleLineTransport[0]?.endTime === "18:10", "한 줄에 함께 있는 출발·도착 시각도 역할을 구분한다");
const explicitAdmissionRange = extractTravelDocumentFactsFromText({
  document: { ...document("show", ["show-item"]), kind: "admission" },
  text: "공연 예약 2026-08-20 19:00-21:00",
  providerId: "test-on-device",
  extractedAt: "2026-08-19T00:00:00.000Z",
  tripStartDate: "2026-08-19",
  tripEndDate: "2026-08-21",
});
assert(explicitAdmissionRange[0]?.startTime === "19:00" && explicitAdmissionRange[0]?.endTime === "21:00", "명시적인 예약 시간 범위의 시작·종료를 분리한다");

const lockedSchedule = buildLockedDocumentScheduleDraft({
  kind: "train",
  label: "KTX 서울→부산",
  date: "2026-08-20",
  startTime: "15:01",
  endTime: "18:13",
});
assert(lockedSchedule.ok && lockedSchedule.draft.durationMinutes === 192 && lockedSchedule.draft.itemType === "transport", "사용자가 확인한 1분 단위 시각을 임의 반올림 없이 잠금 일정으로 만든다");
const noArbitraryDuration = buildLockedDocumentScheduleDraft({ kind: "reservation", label: "전시 입장", date: "2026-08-20", startTime: "15:20" });
assert(!noArbitraryDuration.ok, "종료 시각이 없으면 임의 기본 체류시간으로 일정을 만들지 않는다");
if (!lockedSchedule.ok) throw new Error("locked schedule fixture failed");
const equivalent = findEquivalentLockedDocumentSchedule([{
  id: "locked-ticket",
  tripId: "trip-1",
  date: lockedSchedule.draft.date,
  startTime: lockedSchedule.draft.startTime,
  durationMinutes: lockedSchedule.draft.durationMinutes,
  itemType: lockedSchedule.draft.itemType,
  preferredByUserIds: ["owner"],
  note: lockedSchedule.draft.label,
  lockedForDuri: true,
}], lockedSchedule.draft);
assert(equivalent?.id === "locked-ticket", "같은 문서 사실을 재확정할 때 사용할 중복 일정을 식별한다");
const planningTrip = {
  id: "trip-1",
  title: "부산 여행",
  regionId: "busan",
  startDate: "2026-08-19",
  endDate: "2026-08-21",
  status: "planning" as const,
  transport: "public" as const,
  members: [{ userId: "owner", role: "owner" as const }],
};
const firstScheduleCommit = prepareLockedDocumentScheduleAddition({
  trip: planningTrip,
  currentUserId: "owner",
  itinerary: [],
  placesById: {},
  draft: lockedSchedule.draft,
  createItemId: () => "document-item-1",
});
assert(firstScheduleCommit.ok && firstScheduleCommit.created && firstScheduleCommit.itinerary[0]?.lockedForDuri === true, "확정 문서 일정을 잠금 상태로 원자적 preflight한다");
if (!firstScheduleCommit.ok) throw new Error("document schedule commit fixture failed");
const duplicateScheduleCommit = prepareLockedDocumentScheduleAddition({
  trip: planningTrip,
  currentUserId: "owner",
  itinerary: firstScheduleCommit.itinerary,
  placesById: {},
  draft: lockedSchedule.draft,
  createItemId: () => "must-not-be-used",
});
assert(duplicateScheduleCommit.ok && !duplicateScheduleCommit.created && duplicateScheduleCommit.itinerary.length === 1, "같은 확정 사실을 다시 저장해도 일정이 중복 생성되지 않는다");
const overlapScheduleCommit = prepareLockedDocumentScheduleAddition({
  trip: planningTrip,
  currentUserId: "owner",
  itinerary: firstScheduleCommit.itinerary,
  placesById: {},
  draft: { ...lockedSchedule.draft, label: "겹치는 다른 예약", startTime: "16:00", endTime: "17:00", durationMinutes: 60 },
  createItemId: () => "document-item-overlap",
});
assert(!overlapScheduleCommit.ok && overlapScheduleCommit.status === "overlap", "문서 일정도 기존 일정과 겹치면 추가 전에 거부한다");
const endConditionCommit = prepareLockedDocumentScheduleAddition({
  trip: { ...planningTrip, endDate: "2026-08-20", endCondition: { type: "train" as const, location: { name: "부산역" }, deadline: "19:00", travelMinutes: 60, serviceBufferMinutes: 30 } },
  currentUserId: "owner",
  itinerary: [],
  placesById: {},
  draft: { ...lockedSchedule.draft, startTime: "17:00", endTime: "18:00", durationMinutes: 60 },
  createItemId: () => "document-item-too-late",
});
assert(!endConditionCommit.ok && endConditionCommit.status === "end-condition", "복귀 조건을 침범하는 문서 일정은 추가 후 이동하지 않고 추가 자체를 거부한다");

const sensitiveFacts = extractTravelDocumentFactsFromText({
  document: { ...document("private-ticket", ["train-item"]), kind: "train" },
  text: "승차일 2026년 8월 20일 예약번호 ABCD1234 user@example.com\n출발 15:20 연락처 010-1234-5678",
  providerId: "test-on-device",
  extractedAt: "2026-08-19T00:00:00.000Z",
  tripStartDate: "2026-08-19",
  tripEndDate: "2026-08-21",
});
const storedSensitiveEvidence = sensitiveFacts.flatMap((fact) => fact.provenance.evidenceSnippets);
assert(storedSensitiveEvidence.every((snippet) => snippet.length <= 96), "저장하는 OCR 근거 조각을 짧은 길이로 제한한다");
assert(!storedSensitiveEvidence.some((snippet) => /ABCD1234|user@example\.com|010-1234-5678/.test(snippet)), "OCR 근거에 예약번호·이메일·전화번호 원문을 남기지 않는다");
assert(storedSensitiveEvidence.some((snippet) => snippet.includes("[식별정보 숨김]"))
  && storedSensitiveEvidence.some((snippet) => snippet.includes("[이메일 숨김]"))
  && storedSensitiveEvidence.some((snippet) => snippet.includes("[전화번호 숨김]")),
"OCR 근거의 민감정보를 검토 가능한 마스킹 표기로 대체한다");

const ambiguousFacts = extractTravelDocumentFactsFromText({
  document: document("ambiguous", ["item-1"]),
  text: "2026-08-20 10:00\n2026-08-21 11:00",
  providerId: "test-on-device",
  extractedAt: "2026-08-19T00:00:00.000Z",
  tripStartDate: "2026-08-19",
  tripEndDate: "2026-08-22",
});
assert(!ambiguousFacts[0]?.date && !ambiguousFacts[0]?.startTime, "동률인 날짜·시각은 임의 선택하지 않는다");

const manual = createManualTravelDocumentExtraction({ document: document("manual", ["item-1"]), createdAt: "2026-08-19T00:00:00.000Z" });
const invalidConfirmation = confirmTravelDocumentFact(manual, {
  factId: manual.facts[0].id,
  label: "부산 입장권",
  date: "2026-02-30",
  itineraryItemId: "item-1",
  confirmedByUserId: "owner",
  confirmedAt: "2026-08-19T01:00:00.000Z",
});
assert(!invalidConfirmation.ok, "실재하지 않는 날짜는 확인 사실로 저장하지 않는다");
const confirmation = confirmTravelDocumentFact(manual, {
  factId: manual.facts[0].id,
  label: "부산 입장권",
  date: "2026-08-20",
  startTime: "15:20",
  endTime: "18:10",
  itineraryItemId: "item-1",
  confirmedByUserId: "owner",
  confirmedAt: "2026-08-19T01:00:00.000Z",
});
assert(confirmation.ok && confirmation.fact.reviewState === "confirmed", "날짜·대상·확인자를 명시해야 문서 사실을 확정한다");
if (!confirmation.ok) throw new Error("confirmation fixture failed");
const secondPendingFact = {
  ...manual.facts[0],
  id: `${manual.facts[0].id}-second`,
  label: "두 번째 예약",
  date: "2026-08-21",
};
const multiFactExtraction = { ...manual, facts: [manual.facts[0], secondPendingFact] };
const firstMultiConfirmation = confirmTravelDocumentFact(multiFactExtraction, {
  factId: manual.facts[0].id,
  label: "첫 번째 예약",
  date: "2026-08-20",
  itineraryItemId: "item-1",
  confirmedByUserId: "owner",
  confirmedAt: "2026-08-19T01:10:00.000Z",
});
assert(firstMultiConfirmation.ok && firstMultiConfirmation.extraction.status === "needs-review", "여러 OCR fact 중 하나만 확정하면 문서 전체는 계속 검토 상태다");
assert(firstMultiConfirmation.ok && getNextTravelDocumentFactForReview(firstMultiConfirmation.extraction)?.id === secondPendingFact.id, "다시 열 때 이미 확정한 fact 대신 다음 suggested fact를 선택한다");
const fullyReviewedExtraction = firstMultiConfirmation.ok ? confirmTravelDocumentFact(firstMultiConfirmation.extraction, {
  factId: secondPendingFact.id,
  label: "두 번째 예약",
  date: "2026-08-21",
  itineraryItemId: "item-1",
  confirmedByUserId: "owner",
  confirmedAt: "2026-08-19T01:20:00.000Z",
}) : firstMultiConfirmation;
assert(fullyReviewedExtraction.ok && fullyReviewedExtraction.extraction.status === "confirmed", "모든 suggested fact를 처리한 뒤에만 문서 검토가 완료된다");

const unconfirmedBuild = buildConfirmedScheduleConstraintsFromDocuments([{ ...document("raw"), extraction: {
  status: "needs-review",
  providerId: "ocr",
  mode: "on-device",
  attemptedAt: "2026-08-19T00:00:00.000Z",
  facts: extractedFacts,
} }]);
assert(unconfirmedBuild.constraints.length === 0 && unconfirmedBuild.skipped.some((entry) => entry.reason === "not-user-confirmed"), "미확정 OCR 결과는 하드 제약으로 변환하지 않는다");
const confirmedBuild = buildConfirmedScheduleConstraintsFromDocuments([{ ...document("manual", ["item-1"]), extraction: confirmation.extraction }]);
assert(confirmedBuild.constraints.length === 1, "사용자 확인 사실만 하드 제약으로 변환한다");
assert(confirmedBuild.constraints[0].sourceDocumentId === "manual" && confirmedBuild.constraints[0].itineraryItemId === "item-1", "하드 제약은 원본 문서와 일정 추적 정보를 유지한다");
assert(confirmedBuild.constraints[0].startTime === "15:20" && confirmedBuild.constraints[0].endTime === "18:10", "사용자가 확인한 예약 시작·종료 시각을 모두 하드 제약과 fingerprint 입력에 보존한다");
const richReference = buildDuriDocumentReferencesFromDocuments([{ ...document("manual", ["item-1"]), extraction: confirmation.extraction }])[0];
assert(richReference.extractionStatus === "confirmed" && richReference.confirmedFactIds.length === 1, "Duri 문서 근거에 구조화·검토 상태를 함께 전달한다");
const placeOnlyDraft = createManualTravelDocumentExtraction({ document: document("missing-place"), createdAt: "2026-08-19T00:00:00.000Z" });
const placeOnlyConfirmation = confirmTravelDocumentFact(placeOnlyDraft, {
  factId: placeOnlyDraft.facts[0].id,
  label: "예약한 미술관",
  date: "2026-08-20",
  placeId: "museum-place",
  confirmedByUserId: "owner",
  confirmedAt: "2026-08-19T01:00:00.000Z",
});
assert(placeOnlyConfirmation.ok, "일정에 아직 없는 여행방 장소도 문서 사실로 확정할 수 있다");
if (!placeOnlyConfirmation.ok) throw new Error("place-only confirmation fixture failed");
assert(buildConfirmedScheduleConstraintsFromDocuments([{ ...document("missing-place"), extraction: placeOnlyConfirmation.extraction }]).constraints[0]?.placeId === "museum-place", "장소 기준 제약을 만들어 실제 예약 누락 검사에 사용한다");

const detached = reconcileTravelDocumentLinks([{ ...document("manual", ["item-1"]), extraction: confirmation.extraction }], new Set());
assert(detached[0].extraction?.facts[0].reviewState === "suggested", "연결 일정 삭제 시 확인 사실을 재검토 상태로 낮춘다");
assert(buildConfirmedScheduleConstraintsFromDocuments(detached).constraints.length === 0, "고아 문서 사실은 하드 제약으로 남지 않는다");

const corrupted = normalizeTravelDocumentExtraction({
  ...confirmation.extraction,
  facts: [{ ...confirmation.fact, date: "not-a-date" }],
});
assert(corrupted?.facts[0].reviewState === "suggested", "손상된 persisted 확인 사실은 안전하게 재검토 상태로 낮춘다");
const legacySensitiveExtraction = normalizeTravelDocumentExtraction({
  ...confirmation.extraction,
  facts: [{
    ...confirmation.fact,
    provenance: { ...confirmation.fact.provenance, evidenceSnippets: ["예매번호 LEGACY1234 담당자 legacy@example.com"] },
  }],
});
assert(!legacySensitiveExtraction?.facts[0].provenance.evidenceSnippets[0]?.includes("LEGACY1234")
  && !legacySensitiveExtraction?.facts[0].provenance.evidenceSnippets[0]?.includes("legacy@example.com"),
"기존 persisted OCR 근거도 hydration 정규화 중 비식별화한다");

async function runAsyncChecks() {
  const unavailable = await runTravelDocumentTextExtraction(
    { ...document("image"), fileName: "ticket.jpg", displayName: "ticket.jpg", mimeType: "image/jpeg" },
    createUnavailableTextRecognizer(),
    { attemptedAt: "2026-08-19T00:00:00.000Z" },
  );
  assert(unavailable.status === "unsupported" && unavailable.failureCode === "unsupported-runtime", "OCR 모듈이 없는 빌드는 문서와 무관한 예외 없이 unsupported로 격리한다");

  const throwingRecognizer: TravelDocumentTextRecognizer = {
    id: "throwing-test",
    mode: "on-device",
    getAvailability: () => ({ available: true }),
    recognize: async () => { throw new Error("native crash boundary"); },
  };
  const failed = await runTravelDocumentTextExtraction(
    { ...document("image-fail"), fileName: "ticket.png", displayName: "ticket.png", mimeType: "image/png" },
    throwingRecognizer,
    { attemptedAt: "2026-08-19T00:00:00.000Z" },
  );
  assert(failed.status === "failed" && failed.failureCode === "provider-failed", "네이티브 OCR 오류를 상태값으로 격리한다");

  const pdfResult = await runTravelDocumentTextExtraction(
    document("pdf"),
    throwingRecognizer,
    { attemptedAt: "2026-08-19T00:00:00.000Z" },
  );
  assert(pdfResult.status === "unsupported" && pdfResult.failureCode === "pdf-rendering-required", "PDF를 이미지 OCR에 직접 넘기지 않는다");
}

runAsyncChecks().then(runApiContractChecks).then(() => console.log("Trip document verification passed: 53 scenarios + backend document contract checks")).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function runApiContractChecks() {
  const roomId = "665abc123def456789012345";
  const payload = {
    id: "665abc123def456789012346", roomId,
    fileUrl: `/uploads/documents/${roomId}/ticket.pdf`,
    originalName: "ticket.pdf", mimeType: "application/pdf", size: 100,
    note: null, uploadedBy: "665abc123def456789012347", createdAt: "2026-09-10T00:00:00.000Z", download: null,
  };
  assert(parseApiTripDocumentList({ data: [] }).length === 0, "실제 백엔드의 버전 없는 빈 문서 목록을 받는다");
  assert(parseApiTripDocumentList({ data: [payload] })[0].sizeBytes === 100, "실제 문서 DTO를 화면 데이터로 변환한다");
  const uploaded = parseApiTripDocumentUpload(payload, roomId);
  assert(uploaded.ok && uploaded.document.id === payload.id && uploaded.scheduleVersion === undefined, "업로드 성공을 버전 누락 때문에 실패로 바꾸거나 버전을 조작하지 않는다");
  const versioned = parseApiTripDocumentUpload({ ...payload, scheduleVersion: 2, factsVersion: 3 }, roomId);
  assert(versioned.scheduleVersion === 2 && versioned.factsVersion === 3, "서버가 버전을 반환하면 그대로 보존한다");
  for (const invalid of [
    () => parseApiTripDocumentCollection({ data: [payload] }),
    () => parseApiTripDocumentUpload({ ...payload, scheduleVersion: 2 }, roomId),
    () => parseApiTripDocumentUpload(payload, "665abc123def456789012348"),
    () => parseApiTripDocumentList({ data: [payload, payload] }),
  ]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, "분석용 버전 검증, 불완전한 버전, 방 경계 및 중복 문서 검증을 유지한다");
  }
  const originalFetch = globalThis.fetch;
  const calls: { method: string; auth: string | null }[] = [];
  configureApiAuth({ getAccessToken: () => "document-test-token", onAccessTokenExpired: () => undefined, onSessionInvalidated: () => undefined });
  globalThis.fetch = async (_input, init) => {
    const method = init?.method ?? "GET";
    calls.push({ method, auth: new Headers(init?.headers).get("Authorization") });
    return new Response(JSON.stringify(method === "DELETE" ? { success: true } : { data: [payload] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    assert((await fetchApiTripDocuments(roomId))[0].id === payload.id, "일반 문서 조회는 버전 없는 계약으로 작동한다");
    assert((await deleteApiTripDocument(roomId, payload.id)).scheduleVersion === undefined, "실제 success:true 삭제 응답을 받는다");
    assert(calls.length === 2 && calls.every((call) => call.auth === "Bearer document-test-token"), "문서 조회와 삭제는 로그인 인증을 보낸다");
  } finally {
    globalThis.fetch = originalFetch;
  }
}
