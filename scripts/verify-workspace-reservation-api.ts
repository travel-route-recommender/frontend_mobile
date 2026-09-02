import {
  ApiError,
  type ApiClient,
  type ApiRequest,
} from "../src/services/apiClient";
import {
  buildWorkspaceScheduleReservationBody,
  HttpWorkspaceScheduleReservationApiGateway,
  parseWorkspaceScheduleReservation,
  WorkspaceScheduleReservationContractError,
  WorkspaceScheduleReservationReplacementRequiredError,
  WorkspaceScheduleReservationVersionConflictError,
} from "../src/features/workspace/services/workspaceScheduleReservationApi";

const ROOM_ID = "665abc123def456789012345";
const PLACE_ID = "665abc123def456789012346";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(action: () => unknown, constructor: new (...args: never[]) => Error, message: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof constructor, `${message}: 다른 오류가 발생했습니다.`);
    return error;
  }
  throw new Error(`${message}: 오류가 발생하지 않았습니다.`);
}

const reservationPayload = {
  id: "res-1",
  status: "confirmed",
  date: "2026-08-27",
  startTime: "09:15",
  endTime: "10:45",
  timeWindowStart: null,
  timeWindowEnd: null,
  timezone: "Asia/Seoul",
  placeId: PLACE_ID,
  externalId: null,
  confirmationCode: "BUSAN-1",
  note: "QR 확인",
  documentTicketIds: ["ticket-1", "document-1"],
  confirmedBy: ROOM_ID,
  confirmedAt: "2026-08-26T05:00:00.000Z",
  revision: 1,
};

const parsed = parseWorkspaceScheduleReservation(reservationPayload);
assert(parsed.status === "confirmed" && parsed.startTime === "09:15", "1. 확정 예약 응답을 엄격 파싱");
assert(parsed.documentTicketIds.join() === "ticket-1,document-1", "2. 연결 문서·티켓 ID 보존");

assertThrows(
  () => parseWorkspaceScheduleReservation({ ...reservationPayload, date: "2026-02-30" }),
  WorkspaceScheduleReservationContractError,
  "3. 달력에 없는 날짜 차단",
);
assertThrows(
  () => parseWorkspaceScheduleReservation({ ...reservationPayload, timeWindowStart: "08:00", timeWindowEnd: "11:00" }),
  WorkspaceScheduleReservationContractError,
  "4. 정확한 시각과 허용 시간창이 섞인 서버 응답 차단",
);
assertThrows(
  () => parseWorkspaceScheduleReservation({ ...reservationPayload, endTime: "09:00" }),
  WorkspaceScheduleReservationContractError,
  "5. 역전된 정확한 시각 차단",
);
assertThrows(
  () => parseWorkspaceScheduleReservation({ ...reservationPayload, documentTicketIds: ["ticket-1", "ticket-1"] }),
  WorkspaceScheduleReservationContractError,
  "6. 중복 연결 ID 차단",
);

const body = buildWorkspaceScheduleReservationBody({
  status: "confirmed",
  date: "2026-08-27",
  timing: { kind: "exact", startTime: "09:15", endTime: "10:45" },
  timezone: "Asia/Seoul",
  placeId: PLACE_ID,
  confirmationCode: " BUSAN-1 ",
  note: " QR 확인 ",
  documentTicketIds: ["ticket-1"],
}, undefined, 7, "reservation-save-fixture");
assert(body.expectedVersion === 7 && body.clientMutationId === "reservation-save-fixture", "7. expectedVersion과 clientMutationId 필수 전송");
assert(body.startTime === "09:15" && !("timeWindowStart" in body), "8. 정확한 시각 wire body만 생성");
assert(body.note === "QR 확인" && body.confirmationCode === "BUSAN-1", "9. 사용자 문자열 정규화");

assertThrows(
  () => buildWorkspaceScheduleReservationBody({
    status: "confirmed",
    timing: { kind: "exact", startTime: "09:00", endTime: "10:00" },
    documentTicketIds: [],
  }, undefined, 0, "reservation-save-fixture"),
  WorkspaceScheduleReservationContractError,
  "10. 확정 예약의 날짜 누락 차단",
);
assertThrows(
  () => buildWorkspaceScheduleReservationBody({
    status: "confirmed",
    date: "2026-08-27",
    timing: { kind: "window", timeWindowStart: "08:00", timeWindowEnd: "11:00" },
    documentTicketIds: [],
  }, parsed, 7, "reservation-save-fixture"),
  WorkspaceScheduleReservationReplacementRequiredError,
  "11. Backend가 지울 수 없는 시간 표현 전환 차단",
);
assertThrows(
  () => buildWorkspaceScheduleReservationBody({
    status: "unconfirmed",
    date: "",
    timing: { kind: "none" },
    documentTicketIds: [],
  }, parsed, 7, "reservation-save-fixture"),
  WorkspaceScheduleReservationReplacementRequiredError,
  "12. Backend가 지울 수 없는 기존 날짜·시간 제거 차단",
);

class FakeApiClient implements ApiClient {
  requests: ApiRequest[] = [];
  response: unknown = { reservation: reservationPayload, scheduleVersion: 8 };
  error?: Error;

  async request<Response>(request: ApiRequest): Promise<Response> {
    this.requests.push(request);
    if (this.error) throw this.error;
    return this.response as Response;
  }
}

async function verifyGateway() {
  const client = new FakeApiClient();
  const gateway = new HttpWorkspaceScheduleReservationApiGateway(client, (prefix) => `${prefix}-fixture`);
  const saved = await gateway.upsert({
    roomId: ROOM_ID,
    itemId: "item/1",
    expectedVersion: 7,
    previousReservation: undefined,
    draft: {
      status: "confirmed",
      date: "2026-08-27",
      timing: { kind: "exact", startTime: "09:15", endTime: "10:45" },
      timezone: "Asia/Seoul",
      placeId: PLACE_ID,
      confirmationCode: "BUSAN-1",
      note: "QR 확인",
      documentTicketIds: ["ticket-1", "document-1"],
    },
  });
  const saveRequest = client.requests[0];
  assert(saveRequest?.path === `/rooms/${ROOM_ID}/schedule/items/item%2F1/reservation`, "13. room/item path segment 안전 인코딩");
  assert(saveRequest.method === "PUT" && saveRequest.auth === true, "14. 인증 PUT 사용");
  assert((saveRequest.body as { expectedVersion?: number; clientMutationId?: string }).expectedVersion === 7
    && (saveRequest.body as { clientMutationId?: string }).clientMutationId === "reservation-save-fixture", "15. PUT 조건부 쓰기 필드 포함");
  assert(saved.scheduleVersion === 8 && saved.reservation.revision === 1, "16. 예약과 증가한 일정 버전 반환");

  client.response = { reservation: { ...reservationPayload, status: "unconfirmed" }, scheduleVersion: 8 };
  let mismatchedEchoBlocked = false;
  try {
    await gateway.upsert({
      roomId: ROOM_ID,
      itemId: "item-1",
      expectedVersion: 7,
      previousReservation: undefined,
      draft: {
        status: "confirmed",
        date: "2026-08-27",
        timing: { kind: "exact", startTime: "09:15", endTime: "10:45" },
        timezone: "Asia/Seoul",
        placeId: PLACE_ID,
        confirmationCode: "BUSAN-1",
        note: "QR 확인",
        documentTicketIds: ["ticket-1", "document-1"],
      },
    });
  } catch (error) {
    mismatchedEchoBlocked = error instanceof WorkspaceScheduleReservationContractError;
  }
  assert(mismatchedEchoBlocked, "17. 요청과 다른 서버 저장 echo를 성공으로 처리하지 않음");

  client.response = { success: true, scheduleVersion: 9 };
  const deleted = await gateway.delete({ roomId: ROOM_ID, itemId: "item/1", expectedVersion: 8 });
  const deleteRequest = client.requests[2];
  assert(deleteRequest?.method === "DELETE"
    && deleteRequest.query?.expectedVersion === 8
    && deleteRequest.query?.clientMutationId === "reservation-delete-fixture", "18. DELETE query에 버전과 mutation ID 포함");
  assert(deleted.success && deleted.scheduleVersion === 9, "19. 삭제 응답 엄격 파싱");

  client.error = new ApiError("conflict", {
    status: 409,
    code: "SCHEDULE_VERSION_CONFLICT",
    payload: { code: "SCHEDULE_VERSION_CONFLICT", currentVersion: 12, expectedVersion: 9 },
  });
  let conflictMapped = false;
  try {
    await gateway.delete({ roomId: ROOM_ID, itemId: "item-1", expectedVersion: 9 });
  } catch (error) {
    conflictMapped = error instanceof WorkspaceScheduleReservationVersionConflictError
      && error.expectedVersion === 9
      && error.currentVersion === 12;
  }
  assert(conflictMapped, "20. Backend 409를 일정 버전 충돌로 변환");

  client.error = undefined;
  const requestCount = client.requests.length;
  let invalidRoomBlocked = false;
  try {
    await gateway.delete({ roomId: "local-room", itemId: "item-1", expectedVersion: 0 });
  } catch (error) {
    invalidRoomBlocked = error instanceof WorkspaceScheduleReservationContractError;
  }
  assert(invalidRoomBlocked && client.requests.length === requestCount, "21. 잘못된 room ID는 네트워크 전에 차단");
}

verifyGateway()
  .then(() => console.log("Workspace reservation API verification passed: 21 scenarios"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
