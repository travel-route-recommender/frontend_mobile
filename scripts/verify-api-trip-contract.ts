import { configureApiAuth } from "../src/services/apiClient";
import { fetchApiTripDetail, fetchApiTripList } from "../src/features/trips/tripRoomApi";
import { workspaceScheduleApiGateway } from "../src/features/workspace/services/workspaceScheduleApi";
import { buildApiDuriAnalysisInput } from "../src/features/duri/logic/apiAnalysisInput";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../src/features/duri/logic/analysisSnapshot";
import {
  buildPreferenceAutoFillSuggestionEnvelope,
  derivePreferenceAutoFillDefaults,
  planPreferenceAutoFill,
} from "../src/features/duri/logic/preferenceAutoFill";
import { createDuriSuggestionPreview } from "../src/features/duri/logic/suggestionPreview";
import { buildApiProposalMetadata } from "../src/features/duri/logic/apiProposalMetadata";
import { enrichDuriAnalysisInput } from "../src/features/duri/services/duriEvidenceService";
import { selectTripHomeDuriState } from "../src/features/trips/logic/selectTripHomeDuriState";
import { getTripDates } from "../src/utils/schedule";
import type { DuriSuggestionEnvelope, DuriSuggestionPreview } from "../src/features/duri/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const baseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1").replace(/\/+$/, "");
  const email = process.env.DURI_API_VERIFY_EMAIL;
  const password = process.env.DURI_API_VERIFY_PASSWORD;
  if (!email || !password) throw new Error("DURI_API_VERIFY_EMAIL과 DURI_API_VERIFY_PASSWORD가 필요합니다.");

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
    }),
  });
  assert(loginResponse.ok, `fixture 로그인 실패: HTTP ${loginResponse.status}`);
  const login = await loginResponse.json() as { accessToken?: unknown; refreshToken?: unknown; user?: { id?: unknown; travelType?: { name?: unknown } } };
  assert(typeof login.accessToken === "string" && login.accessToken, "fixture accessToken이 필요합니다.");
  assert(typeof login.refreshToken === "string" && login.refreshToken, "fixture refreshToken이 필요합니다.");
  assert(typeof login.user?.id === "string" && /^[a-f\d]{24}$/i.test(login.user.id), "fixture user.id 형식이 올바르지 않습니다.");
  try {
  configureApiAuth({
    getAccessToken: () => login.accessToken as string,
    onAccessTokenExpired: () => undefined,
    onSessionInvalidated: () => undefined,
  });

  const rooms = await fetchApiTripList(login.user.id);
  assert(rooms.length > 0, "서버 여행방 목록이 비어 있습니다.");
  const expectedRoomId = process.env.DURI_API_VERIFY_ROOM_ID;
  const target = expectedRoomId
    ? rooms.find((room) => room.id === expectedRoomId)
    : rooms.find((room) => room.viewModel.title.includes("부산")) ?? rooms[0];
  assert(target, "검증할 여행방을 목록에서 찾지 못했습니다.");
  const detail = await fetchApiTripDetail(target.id, login.user.id);
  assert(detail.room.id === target.id, "목록과 상세 roomId가 같아야 합니다.");
  assert(detail.room.members.some((member) => member.userId === login.user?.id), "로그인 사용자가 여행방 멤버여야 합니다.");
  assert(detail.candidates.length > 0 && Object.keys(detail.placesById).length > 0, "후보 장소와 CommonPlace를 투영해야 합니다.");
  assert(detail.itinerary.length > 0, "Mongoose _doc 호환 schedule을 실제 일정으로 투영해야 합니다.");
  assert(detail.itinerary.every((item) => item.tripId === target.id), "서버 roomId를 일정 tripId로 일관되게 사용해야 합니다.");
  const analysisInput = buildApiDuriAnalysisInput(detail, login.user.id);
  assert(analysisInput, "API 일정·planning·성향 스냅샷을 두리 분석 입력으로 연결해야 합니다.");
  const analysisAvailability = getDuriAnalysisAvailability({ input: analysisInput, engineAvailable: true });
  assert(analysisAvailability.canAnalyze, `실제 API 여행방을 분석할 수 있어야 합니다: ${analysisAvailability.message}`);
  const enrichedAnalysisInput = await enrichDuriAnalysisInput(analysisInput);
  const analysisSession = createDuriAnalysisSession(enrichedAnalysisInput, new Date().toISOString());
  const analysisFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(analysisInput));
  assert(analysisSession.tripId === target.id && analysisSession.inputFingerprint === analysisFingerprint, "API roomId와 최신 일정 fingerprint를 분석 session에 보존해야 합니다.");
  const tripHomeDuriState = selectTripHomeDuriState({
    itineraryCount: detail.itinerary.length,
    analysisAvailable: analysisAvailability.canAnalyze,
    analysisStatus: "idle",
    currentFingerprint: analysisFingerprint,
    session: analysisSession,
  });
  assert(tripHomeDuriState.kind === "existing", "API 여행방 홈은 완료된 최신 분석 session을 준비 중으로 표시하면 안 됩니다.");
  const currentPreference = detail.preferenceSummary.members.find((member) => member.userId === login.user?.id);
  if (typeof login.user.travelType?.name === "string" && login.user.travelType.name) {
    assert(currentPreference?.state === "completed", "로그인 최신 travelType이 있으면 여행방에서도 성향 완료로 표시해야 합니다.");
    assert(currentPreference.profileType === login.user.travelType.name, "로그인·마이페이지·여행방의 최신 성향 유형이 같아야 합니다.");
  }

  let draftSummary = "skipped";
  let draftToApply: { envelope: DuriSuggestionEnvelope; preview: DuriSuggestionPreview } | undefined;
  if (process.env.DURI_API_VERIFY_DRAFT === "1") {
    const defaults = derivePreferenceAutoFillDefaults(enrichedAnalysisInput);
    assert(defaults.dailyStartTime && defaults.dailyEndTime, "부분 일정의 실제 시간 범위에서 자동 생성 시간창을 만들어야 합니다.");
    const draft = planPreferenceAutoFill(enrichedAnalysisInput);
    if (draft.status !== "preview-only") {
      console.log(JSON.stringify({
        defaults,
        itinerary: analysisInput.itinerary.map((item) => ({ placeId: item.placeId, date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes })),
        unscheduledCandidates: analysisInput.candidates
          .filter((candidate) => !analysisInput.itinerary.some((item) => item.placeId === candidate.placeId))
          .map((candidate) => ({ placeId: candidate.placeId, name: analysisInput.placesById[candidate.placeId]?.name })),
        endCondition: analysisInput.trip.endCondition,
        draft: { status: draft.status, message: draft.message, limitations: draft.limitations },
      }, null, 2));
    }
    assert(draft.status === "preview-only", `API 데모방 성향 초안이 필요합니다: ${draft.message}`);
    assert(draft.assignments.length >= 2, "API 데모방은 둘 이상의 성향 후보를 제안해야 합니다.");
    assert(draft.certificate.mandatorySharedPlaceIds.every((placeId) => draft.assignments.some((assignment) => assignment.placeId === placeId)), "미배치 must 후보를 모두 포함해야 합니다.");
    assert(draft.certificate.excludedAvoidPlaceIds.length > 0, "명시적 avoid 후보를 제외한 근거가 필요합니다.");
    assert(draft.certificate.geographicPlacement?.comparableAssignmentCount === draft.assignments.length, "모든 제안 장소를 기존 일정 좌표와 비교해 날짜를 골라야 합니다.");
    assert(draft.certificate.localApplyEligible, `정상 API 초안은 적용 가능해야 합니다: ${draft.certificate.localApplyBlockReasons.join(" / ")}`);
    const envelope = buildPreferenceAutoFillSuggestionEnvelope(analysisSession, draft, new Date().toISOString());
    assert(envelope, "생성된 일정 초안을 적용 가능한 제안 계약으로 변환해야 합니다.");
    assert(envelope.suggestion.canApply, `정상 API 제안의 canApply가 true여야 합니다: ${envelope.suggestion.unavailableReason ?? "이유 없음"}`);
    assert(detail.room.startDate && detail.room.endDate, "일정 초안 미리보기에는 확정된 여행 날짜가 필요합니다.");
    const preview = createDuriSuggestionPreview({
      envelope,
      tripDates: getTripDates(detail.room.startDate, detail.room.endDate),
      placesById: enrichedAnalysisInput.placesById,
      candidates: enrichedAnalysisInput.candidates,
      trip: enrichedAnalysisInput.trip,
      protectionInput: enrichedAnalysisInput,
    });
    assert(preview.validation.valid, `생성 초안이 잠금·예약·복귀 조건을 지켜야 합니다: ${preview.validation.valid ? "" : preview.validation.message}`);
    const addedIds = new Set(preview.diff.filter((item) => item.kind === "added").map((item) => item.itemId));
    assert(draft.assignments.every((assignment) => addedIds.has(assignment.itemId)), "미리보기에 생성된 모든 일정이 추가되어야 합니다.");
    assert(preview.after.length === preview.before.length + draft.assignments.length, "초안 적용 미리보기에서 기존 일정이 사라지면 안 됩니다.");
    draftToApply = { envelope, preview };
    draftSummary = `${draft.assignments.map((assignment) => `${assignment.date} ${assignment.placeName}`).join(", ")} / ${draft.certificate.selectionBasis} / ${draft.certificate.countBasis}`;
  }

  let verifiedVersion = detail.scheduleSnapshot?.scheduleVersion;
  if (process.env.DURI_API_VERIFY_WRITE === "1") {
    assert(draftToApply, "핵심 쓰기 검증에는 DURI_API_VERIFY_DRAFT=1이 필요합니다.");
    const latest = await fetchApiTripDetail(target.id, login.user.id);
    const snapshot = latest.scheduleSnapshot;
    assert(snapshot && latest.room.startDate && latest.room.endDate, "쓰기 검증에는 날짜가 확정된 schedule snapshot이 필요합니다.");
    assert(Number.isInteger(latest.room.factsVersion), "제안 적용에는 최신 factsVersion이 필요합니다.");
    assert(snapshot.scheduleVersion === detail.scheduleSnapshot?.scheduleVersion, "분석 후 일정 버전이 바뀌면 초안을 적용하면 안 됩니다.");
    const latestInput = buildApiDuriAnalysisInput(latest, login.user.id);
    assert(latestInput, "적용 직전 최신 API 분석 입력을 다시 구성해야 합니다.");
    assert(
      createDuriInputFingerprint(createDuriAnalysisSnapshot(latestInput)) === draftToApply.envelope.baseFingerprint,
      "분석 후 사실이 변경된 초안은 서버에 보내기 전에 차단해야 합니다.",
    );
    const nextItinerary = draftToApply.preview.after.map(({ order: _order, ...item }) => ({
      ...item,
      preferredByUserIds: [...item.preferredByUserIds],
    }));
    const nextMetadata = buildApiProposalMetadata(snapshot, draftToApply.preview.after, latest.placesById);
    const saved = await workspaceScheduleApiGateway.applyProposal({
      roomId: latest.room.id,
      tripId: latest.room.id,
      startDate: latest.room.startDate,
      endDate: latest.room.endDate,
      snapshot,
      itinerary: nextItinerary,
      metadataByItemId: nextMetadata,
      expectedFactsVersion: latest.room.factsVersion as number,
    });
    assert(saved.scheduleVersion > snapshot.scheduleVersion, "제안 적용은 새 scheduleVersion을 반환해야 합니다.");
    assert(saved.itinerary.length === nextItinerary.length, "서버가 적용한 일정 수가 미리보기와 같아야 합니다.");
    for (const itemId of Object.keys(snapshot.priorityProtectionsByItemId)) {
      const before = snapshot.itinerary.find((item) => item.id === itemId);
      const after = saved.itinerary.find((item) => item.id === itemId);
      assert(before && after, `보호 일정 ${itemId}이 적용 결과에 남아 있어야 합니다.`);
      assert(
        before.placeId === after.placeId
          && before.date === after.date
          && before.startTime === after.startTime
          && before.durationMinutes === after.durationMinutes,
        `보호 일정 ${itemId}의 장소·날짜·시간이 바뀌면 안 됩니다.`,
      );
    }
    const reread = await fetchApiTripDetail(target.id, login.user.id);
    assert(reread.scheduleSnapshot?.scheduleVersion === saved.scheduleVersion, "저장 후 재조회한 scheduleVersion이 일치해야 합니다.");
    assert(reread.itinerary.length === saved.itinerary.length, "재조회 후 적용한 일정 수가 유지되어야 합니다.");
    assert(draftToApply.preview.diff.filter((item) => item.kind === "added").every((item) => reread.itinerary.some((savedItem) => savedItem.id === item.itemId)), "생성한 모든 일정이 서버 재조회 결과에 남아 있어야 합니다.");
    verifiedVersion = saved.scheduleVersion;
  }

  console.log(`API trip contract verification passed: rooms=${rooms.length}, members=${detail.room.members.length}, candidates=${detail.candidates.length}, itinerary=${detail.itinerary.length}, analysisIssues=${analysisSession.issues.length}, scheduleVersion=${verifiedVersion ?? "n/a"}, draft=${draftSummary}, write=${process.env.DURI_API_VERIFY_WRITE === "1" ? "draft-applied" : "skipped"}`);
  } finally {
    // 계약 검증 로그인이 실제 앱의 fixture 계정 Refresh Token 보관 한도를
    // 잠식하지 않도록 검증에 발급된 세션만 정리한다.
    await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${login.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: login.refreshToken }),
    }).catch(() => undefined);
  }
}

void main().catch((error: unknown) => { throw error; });
