import type { ApiClient, ApiRequest } from "../src/services/apiClient";
import {
  RoomPreferenceApiContractError,
  buildUpdateRoomCandidateSignalPayload,
  createRoomPreferenceApiGateway,
  parseRoomPreferenceEvidence,
} from "../src/features/duri/services/roomPreferenceApi";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectContractError(run: () => unknown, message: string) {
  try {
    run();
  } catch (error) {
    assert(error instanceof RoomPreferenceApiContractError, `${message}: 계약 오류 타입이어야 한다`);
    return;
  }
  throw new Error(`${message}: 오류가 필요하다`);
}

const roomId = "111111111111111111111111";
const memberA = "222222222222222222222222";
const memberB = "333333333333333333333333";
const placeId = "444444444444444444444444";

function axis(value: number) {
  return { value, unit: "score", range: [0, 100], resolution: 1, source: "quiz", method: "rule-based-4axis" };
}

function payload() {
  return {
    factsVersion: 7,
    scheduleVersion: 3,
    members: [
      {
        userId: memberA,
        nickname: "가",
        travelType: { name: "로컬형", tags: ["시장"], emoji: "🧭" },
        personalityAxes: {
          scheduleDensity: axis(0),
          landmarkNecessity: axis(25),
          localInterest: axis(75),
          challenging: axis(50),
        },
        mobilityConstraints: { values: [], status: "missing", source: "user", version: 1, updatedAt: null },
        preferenceUpdatedAt: "2026-08-26T00:00:00.000Z",
        interestTags: ["전통시장"],
      },
      {
        userId: memberB,
        nickname: null,
        travelType: null,
        personalityAxes: null,
        mobilityConstraints: { values: ["LONG_WALK"], status: "present", source: "user", version: 2, updatedAt: "2026-08-25T00:00:00.000Z" },
        preferenceUpdatedAt: null,
        interestTags: [],
      },
    ],
    candidateSignals: [{
      placeId,
      signals: [
        { userId: memberA, mustVisit: true, avoid: null, preferenceStrength: 5, version: 2, updatedAt: "2026-08-26T00:00:00.000Z" },
        { userId: memberB, mustVisit: null, avoid: true, preferenceStrength: null, version: 1, updatedAt: null },
      ],
    }],
  };
}

const parsed = parseRoomPreferenceEvidence(payload(), {
  roomId,
  memberIds: [memberA, memberB],
  candidatePlaceIds: [placeId],
});
assert(parsed.members[0].personalityAxes?.scheduleDensity.value === 0, "실제 0점은 보존해야 한다");
assert(parsed.members[1].personalityAxes === null, "미응답 axes null을 0점 객체로 바꾸면 안 된다");
assert(parsed.candidateSignals[0].signals[1].preferenceStrength === null, "미응답 강도 null을 보존해야 한다");

const duplicateCandidateRows = payload();
duplicateCandidateRows.candidateSignals.push({
  placeId,
  signals: [{ userId: memberA, mustVisit: false, avoid: null, preferenceStrength: 2, version: 1, updatedAt: "2026-08-25T00:00:00.000Z" }],
});
const mergedCandidateRows = parseRoomPreferenceEvidence(duplicateCandidateRows, {
  roomId,
  memberIds: [memberA, memberB],
  candidatePlaceIds: [placeId],
});
assert(mergedCandidateRows.candidateSignals.length === 1, "같은 장소의 Backend 후보 row를 하나로 병합해야 한다");
assert(mergedCandidateRows.candidateSignals[0].signals.find((signal) => signal.userId === memberA)?.version === 2, "중복 row에서는 최신 신호 revision을 보존해야 한다");

const conflictingCandidateRows = payload();
conflictingCandidateRows.candidateSignals.push({
  placeId,
  signals: [{ userId: memberA, mustVisit: false, avoid: null, preferenceStrength: 1, version: 2, updatedAt: "2026-08-26T00:00:00.000Z" }],
});
expectContractError(() => parseRoomPreferenceEvidence(conflictingCandidateRows, {
  roomId,
  memberIds: [memberA, memberB],
  candidatePlaceIds: [placeId],
}), "동일 revision 후보 신호 충돌");

expectContractError(() => parseRoomPreferenceEvidence(payload(), {
  roomId,
  memberIds: [memberA],
  candidatePlaceIds: [placeId],
}), "멤버 scope 불일치");

const duplicateSignalPayload = payload();
duplicateSignalPayload.candidateSignals[0].signals.push({ ...duplicateSignalPayload.candidateSignals[0].signals[0] });
expectContractError(() => parseRoomPreferenceEvidence(duplicateSignalPayload, {
  roomId,
  memberIds: [memberA, memberB],
  candidatePlaceIds: [placeId],
}), "후보 신호 userId 중복");

const offGridPayload = payload();
offGridPayload.members[0].personalityAxes!.scheduleDensity.value = 0.5;
expectContractError(() => parseRoomPreferenceEvidence(offGridPayload, {
  roomId,
  memberIds: [memberA, memberB],
  candidatePlaceIds: [placeId],
}), "축 해상도 위반");

assert(JSON.stringify(buildUpdateRoomCandidateSignalPayload({ mustVisit: false, preferenceStrength: 1 })) === JSON.stringify({ mustVisit: false, preferenceStrength: 1 }), "false와 strength=1을 누락하면 안 된다");
expectContractError(() => buildUpdateRoomCandidateSignalPayload({}), "빈 신호 변경");
expectContractError(() => buildUpdateRoomCandidateSignalPayload({ mustVisit: true, avoid: true }), "동일 요청의 must/avoid 모순");

class FakeClient implements ApiClient {
  requests: ApiRequest[] = [];
  responses: unknown[] = [];

  async request<Response>(request: ApiRequest): Promise<Response> {
    this.requests.push(request);
    if (!this.responses.length) throw new Error("fixture response가 없습니다");
    return this.responses.shift() as Response;
  }
}

async function main() {
  const client = new FakeClient();
  const gateway = createRoomPreferenceApiGateway(client);
  client.responses.push(payload());
  const fetched = await gateway.fetch(roomId, { memberIds: [memberA, memberB], candidatePlaceIds: [placeId] });
  assert(fetched.factsVersion === 7, "GET factsVersion 보존");
  assert(client.requests[0].path === `/rooms/${roomId}/preferences` && client.requests[0].auth === true, "인증 GET 경로");

  client.responses.push({
    placeId,
    signal: { userId: memberA, mustVisit: false, avoid: null, preferenceStrength: 1, version: 3, updatedAt: "2026-08-26T01:00:00.000Z" },
    factsVersion: 8,
  });
  const updated = await gateway.updateCandidateSignal(roomId, placeId, { mustVisit: false, preferenceStrength: 1 }, { userId: memberA });
  const request = client.requests[1];
  assert(request.path === `/rooms/${roomId}/candidates/${placeId}/signals` && request.method === "PUT" && request.auth === true, "인증 PUT 경로");
  assert(JSON.stringify(request.body) === JSON.stringify({ mustVisit: false, preferenceStrength: 1 }), "nullable 필드를 임의 추가하지 않는 PUT body");
  assert(updated.factsVersion === 8 && updated.signal.preferenceStrength === 1, "PUT 응답 revision과 ordinal 보존");

  console.log("Room preference API verification passed: 13 scenarios");
}

void main();
