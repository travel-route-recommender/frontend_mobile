import { configureApiAuth } from "../src/services/apiClient";
import { fetchApiTripDetail, fetchApiTripList } from "../src/features/trips/tripRoomApi";
import { workspaceScheduleApiGateway } from "../src/features/workspace/services/workspaceScheduleApi";

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
  const login = await loginResponse.json() as { accessToken?: unknown; user?: { id?: unknown } };
  assert(typeof login.accessToken === "string" && login.accessToken, "fixture accessToken이 필요합니다.");
  assert(typeof login.user?.id === "string" && /^[a-f\d]{24}$/i.test(login.user.id), "fixture user.id 형식이 올바르지 않습니다.");
  configureApiAuth({
    getAccessToken: () => login.accessToken as string,
    onAccessTokenExpired: () => undefined,
    onSessionInvalidated: () => undefined,
  });

  const rooms = await fetchApiTripList(login.user.id);
  assert(rooms.length > 0, "서버 여행방 목록이 비어 있습니다.");
  const target = rooms.find((room) => room.viewModel.title.includes("부산")) ?? rooms[0];
  const detail = await fetchApiTripDetail(target.id, login.user.id);
  assert(detail.room.id === target.id, "목록과 상세 roomId가 같아야 합니다.");
  assert(detail.room.members.some((member) => member.userId === login.user?.id), "로그인 사용자가 여행방 멤버여야 합니다.");
  assert(detail.candidates.length > 0 && Object.keys(detail.placesById).length > 0, "후보 장소와 CommonPlace를 투영해야 합니다.");
  assert(detail.itinerary.length > 0, "Mongoose _doc 호환 schedule을 실제 일정으로 투영해야 합니다.");
  assert(detail.itinerary.every((item) => item.tripId === target.id), "서버 roomId를 일정 tripId로 일관되게 사용해야 합니다.");

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

  console.log(`API trip contract verification passed: rooms=${rooms.length}, members=${detail.room.members.length}, candidates=${detail.candidates.length}, itinerary=${detail.itinerary.length}, scheduleVersion=${verifiedVersion ?? "n/a"}, write=${process.env.DURI_API_VERIFY_WRITE === "1" ? "verified" : "skipped"}`);
}

void main().catch((error: unknown) => { throw error; });
