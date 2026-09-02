import { configureApiAuth } from "../src/services/apiClient";
import { fetchApiTripDetail, fetchApiTripList } from "../src/features/trips/tripRoomApi";
import { workspaceScheduleApiGateway } from "../src/features/workspace/services/workspaceScheduleApi";
import { buildApiDuriAnalysisInput } from "../src/features/duri/logic/apiAnalysisInput";
import { createDuriAnalysisSession } from "../src/features/duri/logic/analysisSession";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../src/features/duri/logic/analysisSnapshot";
import { derivePreferenceAutoFillDefaults, planPreferenceAutoFill } from "../src/features/duri/logic/preferenceAutoFill";
import { selectTripHomeDuriState } from "../src/features/trips/logic/selectTripHomeDuriState";

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
      installationId: "duri-api-contract-verifier",
      platform: "unknown",
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
  const analysisSession = createDuriAnalysisSession(analysisInput, new Date().toISOString());
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
  if (process.env.DURI_API_VERIFY_DRAFT === "1") {
    const defaults = derivePreferenceAutoFillDefaults(analysisInput);
    assert(defaults.dailyStartTime && defaults.dailyEndTime, "부분 일정의 실제 시간 범위에서 자동 생성 시간창을 만들어야 합니다.");
    const draft = planPreferenceAutoFill(analysisInput);
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
    draftSummary = `${draft.assignments.map((assignment) => `${assignment.date} ${assignment.placeName}`).join(", ")} / ${draft.certificate.selectionBasis} / ${draft.certificate.countBasis}`;
  }

  let verifiedVersion = detail.scheduleSnapshot?.scheduleVersion;
  if (process.env.DURI_API_VERIFY_WRITE === "1") {
    const snapshot = detail.scheduleSnapshot;
    assert(snapshot && detail.room.startDate && detail.room.endDate, "쓰기 검증에는 날짜가 확정된 schedule snapshot이 필요합니다.");
    const saved = await workspaceScheduleApiGateway.save({
      roomId: detail.room.id,
      tripId: detail.room.id,
      startDate: detail.room.startDate,
      endDate: detail.room.endDate,
      snapshot,
      itinerary: snapshot.itinerary,
      metadataByItemId: snapshot.metadataByItemId,
    });
    assert(saved.scheduleVersion > snapshot.scheduleVersion, "동일 일정 저장도 새 scheduleVersion을 반환해야 합니다.");
    const reread = await fetchApiTripDetail(target.id, login.user.id);
    assert(reread.scheduleSnapshot?.scheduleVersion === saved.scheduleVersion, "저장 후 재조회한 scheduleVersion이 일치해야 합니다.");
    assert(JSON.stringify(reread.itinerary) === JSON.stringify(saved.itinerary), "동일 일정 저장 왕복에서 프론트 일정이 달라지면 안 됩니다.");
    verifiedVersion = saved.scheduleVersion;
  }

  console.log(`API trip contract verification passed: rooms=${rooms.length}, members=${detail.room.members.length}, candidates=${detail.candidates.length}, itinerary=${detail.itinerary.length}, analysisIssues=${analysisSession.issues.length}, scheduleVersion=${verifiedVersion ?? "n/a"}, draft=${draftSummary}, write=${process.env.DURI_API_VERIFY_WRITE === "1" ? "verified" : "skipped"}`);
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
