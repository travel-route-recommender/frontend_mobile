import type { ItineraryItem } from "../src/domain";
import { ApiError, type ApiClient, type ApiRequest } from "../src/services/apiClient";
import {
  HttpWorkspacePlanningApiGateway,
  WorkspacePlanningRequestError,
  buildWorkspacePlanningPatch,
} from "../src/features/workspace/services/workspacePlanningApi";
import {
  HttpWorkspaceTripDatesApiGateway,
  WorkspaceTripDateDeletionConfirmationRequiredError,
  WorkspaceTripDateProtectedItemError,
  WorkspaceTripDateResponseError,
  buildWorkspaceTripDateChangePlan,
} from "../src/features/workspace/services/workspaceTripDatesApi";
import { WorkspaceScheduleVersionConflictError } from "../src/features/workspace/services/workspaceScheduleApi";
import type {
  BackendScheduleReservation,
  BackendScheduleTicket,
  WorkspaceScheduleItemMetadata,
  WorkspaceScheduleSnapshot,
} from "../src/features/workspace/services/workspaceScheduleContract";

const ROOM_ID = "66b000000000000000000001";
const USER_ID = "66b000000000000000000002";
const PLACE_IDS = [
  "66b000000000000000000011",
  "66b000000000000000000012",
  "66b000000000000000000013",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Verification failed: ${message}`);
}

function assertThrows(run: () => unknown, constructor: new (...args: never[]) => Error, message: string) {
  try {
    run();
  } catch (error) {
    assert(error instanceof constructor, message);
    return error;
  }
  throw new Error(`Verification failed: ${message}`);
}

const dates = ["2026-08-01", "2026-08-02", "2026-08-03"];

function item(index: number): ItineraryItem {
  return {
    id: `item-${index + 1}`,
    tripId: ROOM_ID,
    placeId: PLACE_IDS[index],
    date: dates[index],
    startTime: "10:00",
    durationMinutes: 60,
    itemType: "place",
    preferredByUserIds: [],
  };
}

const ticket: BackendScheduleTicket = {
  id: "ticket-1",
  imageUrl: "/uploads/ticket-1.png",
  uploadedBy: USER_ID,
  originalName: "ticket.png",
  mimeType: "image/png",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function confirmedReservation(): BackendScheduleReservation {
  return {
    id: "reservation-1",
    status: "confirmed",
    date: dates[1],
    startTime: "10:00",
    endTime: "11:00",
    documentTicketIds: [],
    confirmedBy: USER_ID,
    confirmedAt: "2026-08-01T00:00:00.000Z",
    revision: 1,
  };
}

function metadata(index: number): WorkspaceScheduleItemMetadata {
  return {
    itemId: `item-${index + 1}`,
    placeName: `장소 ${index + 1}`,
    tags: [],
    reason: "",
    priority: "optional",
    wireEndTime: "11:00",
    locked: false,
    tickets: index === 2 ? [ticket] : [],
  };
}

function snapshot(): WorkspaceScheduleSnapshot {
  return {
    scope: { roomId: ROOM_ID, tripId: ROOM_ID, startDate: dates[0], endDate: dates[2] },
    itinerary: [item(0), item(1), item(2)],
    metadataByItemId: {
      "item-1": metadata(0),
      "item-2": metadata(1),
      "item-3": metadata(2),
    },
    priorityProtectionsByItemId: {},
    scheduleVersion: 7,
    planning: {
      timezone: "Asia/Seoul",
      transportMode: {
        value: "car",
        updatedBy: USER_ID,
        updatedAt: "2026-08-01T00:00:00.000Z",
        version: 2,
      },
    },
  };
}

class FakeApiClient implements ApiClient {
  requests: ApiRequest[] = [];
  response: unknown;
  responses: unknown[] = [];
  error?: Error;

  async request<Response>(request: ApiRequest): Promise<Response> {
    this.requests.push(request);
    if (this.error) throw this.error;
    return (this.responses.length ? this.responses.shift() : this.response) as Response;
  }
}

const planningBody = buildWorkspacePlanningPatch({
  timezone: " Asia/Seoul ",
  lodging: { name: " 부산 호텔 ", lat: 35.16, lng: 129.16, source: "manual" },
  returnPoint: null,
  transportMode: "car",
  returnDeadline: "21:15",
  travelBufferMinutes: 20,
  prepBufferMinutes: 15,
  confirm: true,
});
assert(planningBody.timezone === "Asia/Seoul" && planningBody.lodging?.name === "부산 호텔", "1. planning wire 값 정규화");
assert(planningBody.returnPoint === null && planningBody.confirm === true, "2. anchor 명시 삭제와 confirm 보존");
assertThrows(() => buildWorkspacePlanningPatch({ confirm: true }), WorkspacePlanningRequestError, "3. 값 없는 planning PATCH 차단");
assertThrows(() => buildWorkspacePlanningPatch({ timezone: "Not/AZone" }), WorkspacePlanningRequestError, "4. 잘못된 IANA timezone 차단");
assertThrows(
  () => buildWorkspacePlanningPatch({ lodging: { name: "좌표 일부", lat: 35.1 } }),
  WorkspacePlanningRequestError,
  "5. 불완전 좌표 차단",
);
assertThrows(() => buildWorkspacePlanningPatch({ travelBufferMinutes: 1.5 }), WorkspacePlanningRequestError, "6. 정수가 아닌 buffer 차단");
assertThrows(
  () => buildWorkspacePlanningPatch({ transportMode: "car", unsupported: true } as never),
  WorkspacePlanningRequestError,
  "6a. Backend DTO에 없는 planning 필드 차단",
);

const shortened = {
  status: "success" as const,
  startDate: dates[0],
  endDate: dates[1],
  items: snapshot().itinerary.filter((entry) => entry.date !== dates[2]),
  selectedDate: dates[0],
  removedItineraryCount: 1,
};
assert(shortened.status === "success", "7. 기존 날짜 축소 helper와 같은 구조 수용");
const shortenedPlan = buildWorkspaceTripDateChangePlan({ snapshot: snapshot(), result: shortened });
assert(shortenedPlan.deletionImpacts.length === 1
  && shortenedPlan.deletionImpacts[0]?.itemId === "item-3"
  && shortenedPlan.deletionImpacts[0]?.tickets.length === 1
  && shortenedPlan.deletionImpacts[0]?.willDetachTodoLinks,
"8. 축소 시 삭제·티켓·TODO 링크 영향 명시");
assert(shortenedPlan.itemActions.find((action) => action.itemId === "item-3")?.action === "delete", "9. 삭제 itemAction 생성");

const shiftedDates = ["2026-09-01", "2026-09-02", "2026-09-03"];
const shifted = {
  status: "success" as const,
  startDate: shiftedDates[0],
  endDate: shiftedDates[2],
  items: snapshot().itinerary.map((entry, index) => ({ ...entry, date: shiftedDates[index] })),
  selectedDate: shiftedDates[0],
  removedItineraryCount: 0,
};
assert(shifted.status === "success", "10. 같은 길이 날짜 이동 helper와 같은 구조 수용");
const shiftedPlan = buildWorkspaceTripDateChangePlan({ snapshot: snapshot(), result: shifted });
assert(shiftedPlan.itemActions.every((action) => action.action === "keep"), "11. DAY가 같은 범위 이동은 keep으로 서버 재파생");

const reordered = {
  status: "success" as const,
  startDate: dates[0],
  endDate: dates[2],
  items: snapshot().itinerary.map((entry) => (
    entry.date === dates[0] ? { ...entry, date: dates[1] }
      : entry.date === dates[1] ? { ...entry, date: dates[0] }
        : entry
  )),
  selectedDate: dates[1],
  removedItineraryCount: 0,
};
assert(reordered.status === "success", "12. 기존 DAY drag helper와 같은 구조 수용");
const reorderedPlan = buildWorkspaceTripDateChangePlan({ snapshot: snapshot(), result: reordered });
assert(reorderedPlan.itemActions.filter((action) => action.action === "move").length === 2
  && reorderedPlan.itemActions.find((action) => action.itemId === "item-1")?.day === 2
  && reorderedPlan.itemActions.find((action) => action.itemId === "item-2")?.day === 1,
"13. DAY 순서 변경을 양쪽 move action으로 변환");

const lockedSnapshot = snapshot();
lockedSnapshot.metadataByItemId["item-3"].locked = true;
assertThrows(
  () => buildWorkspaceTripDateChangePlan({ snapshot: lockedSnapshot, result: shortened }),
  WorkspaceTripDateProtectedItemError,
  "14. 서버 잠금 일정 삭제 차단",
);

const mustSnapshot = snapshot();
mustSnapshot.metadataByItemId["item-1"].priority = "must";
assertThrows(
  () => buildWorkspaceTripDateChangePlan({ snapshot: mustSnapshot, result: shifted }),
  WorkspaceTripDateProtectedItemError,
  "15. 필수 일정은 전체 날짜 이동으로 실제 날짜가 바뀌는 것도 차단",
);

const reservationSnapshot = snapshot();
reservationSnapshot.metadataByItemId["item-2"].reservation = confirmedReservation();
assertThrows(
  () => buildWorkspaceTripDateChangePlan({ snapshot: reservationSnapshot, result: reordered }),
  WorkspaceTripDateProtectedItemError,
  "16. 확정 예약 DAY 변경 차단",
);

const renumbered = {
  status: "success" as const,
  startDate: dates[1],
  endDate: dates[2],
  items: snapshot().itinerary.filter((entry) => entry.id !== "item-1"),
  selectedDate: dates[1],
  removedItineraryCount: 1,
};
const renumberedLockedSnapshot = snapshot();
renumberedLockedSnapshot.metadataByItemId["item-2"].locked = true;
assertThrows(
  () => buildWorkspaceTripDateChangePlan({ snapshot: renumberedLockedSnapshot, result: renumbered }),
  WorkspaceTripDateProtectedItemError,
  "16a. 실제 날짜가 같아도 잠금 일정의 DAY 번호 변경은 서버 요청 전에 차단",
);

const invalidAddedResult = shortened.status === "success"
  ? { ...shortened, items: [...shortened.items, { ...item(0), id: "new-item" }] }
  : shortened;
assertThrows(
  () => buildWorkspaceTripDateChangePlan({ snapshot: snapshot(), result: invalidAddedResult }),
  Error,
  "17. trip-dates를 통한 일정 추가 차단",
);

async function verifyGateways() {
  const planningClient = new FakeApiClient();
  planningClient.response = {
    timezone: "Asia/Seoul",
    lodging: { name: "부산 호텔", lat: 35.16, lng: 129.16, source: "manual" },
    returnPoint: null,
    transportMode: {
      value: "car",
      updatedBy: USER_ID,
      updatedAt: "2026-08-01T00:00:00.000Z",
      confirmedAt: "2026-08-01T00:00:00.000Z",
      version: 2,
    },
    returnDeadline: null,
    travelBufferMinutes: null,
    prepBufferMinutes: null,
  };
  const planningGateway = new HttpWorkspacePlanningApiGateway(planningClient);
  const planning = await planningGateway.update(ROOM_ID, { transportMode: "car", confirm: true });
  assert(planning.transportMode?.value === "car" && planning.transportMode.version === 2, "18. planning 응답 strict parser 재사용");
  assert(planningClient.requests[0]?.path === `/rooms/${ROOM_ID}/planning`
    && planningClient.requests[0]?.method === "PATCH"
    && planningClient.requests[0]?.auth === true,
  "19. 인증 planning PATCH 경로");

  const tripClient = new FakeApiClient();
  const tripGateway = new HttpWorkspaceTripDatesApiGateway(tripClient, "http://localhost:3000/api/v1");
  let confirmationBlocked = false;
  try {
    await tripGateway.update({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      snapshot: snapshot(),
      result: shortened,
      clientMutationId: "trip-date-test-1",
    });
  } catch (error) {
    confirmationBlocked = error instanceof WorkspaceTripDateDeletionConfirmationRequiredError
      && error.impacts[0]?.itemId === "item-3";
  }
  assert(confirmationBlocked && tripClient.requests.length === 0, "20. 삭제 영향 확인 전 네트워크 요청 차단");

  tripClient.response = {
    startDate: "2026-08-01T00:00:00.000Z",
    endDate: "2026-08-02T00:00:00.000Z",
    scheduleVersion: 8,
    days: [
      { day: 1, items: [{ id: "item-1", placeId: PLACE_IDS[0], placeName: "장소 1", startTime: "10:00", endTime: "11:00", tags: [], reason: "", priority: "optional", day: 1, locked: false, tickets: [], reservation: null }] },
      { day: 2, items: [{ id: "item-2", placeId: PLACE_IDS[1], placeName: "장소 2", startTime: "10:00", endTime: "11:00", tags: [], reason: "", priority: "optional", day: 2, locked: false, tickets: [], reservation: null }] },
    ],
    todoLinkImpacts: [{ action: "unlinked", matched: 2, modified: 2, scheduleItemId: "item-3" }],
  };
  const updated = await tripGateway.update({
    roomId: ROOM_ID,
    tripId: ROOM_ID,
    snapshot: snapshot(),
    result: shortened,
    clientMutationId: "trip-date-test-1",
    confirmedDeletionItemIds: ["item-3"],
  });
  const request = tripClient.requests[0];
  const body = request?.body as { expectedVersion?: number; clientMutationId?: string; itemActions?: { itemId: string; action: string }[] };
  assert(request?.path === `/rooms/${ROOM_ID}/trip-dates` && request.method === "PATCH" && request.auth === true, "21. 인증 trip-dates PATCH 경로");
  assert(body.expectedVersion === 7 && body.clientMutationId === "trip-date-test-1", "22. expectedVersion과 안정적인 clientMutationId 전송");
  assert(body.itemActions?.find((action) => action.itemId === "item-3")?.action === "delete", "23. 확인한 삭제 action 전송");
  assert(updated.startDate === dates[0]
    && updated.endDate === dates[1]
    && updated.schedule.scheduleVersion === 8
    && updated.schedule.itinerary.length === 2,
  "24. ISO 서버 날짜와 일정 응답을 새 스냅샷으로 안전하게 매핑");
  assert(updated.todoLinkImpacts[0]?.matched === 2 && updated.deletionImpacts[0]?.tickets.length === 1, "25. 실제 TODO 링크 해제와 사전 삭제 영향 보존");
  assert(updated.todoLinkImpactsComplete, "25a. 최초 원자 변경 응답의 TODO 링크 영향은 완전한 결과로 표시");
  assert(updated.schedule.planning?.transportMode?.value === "car", "25b. trip-dates 응답에 planning이 없어도 기존 서버 planning 보존");

  const retryClient = new FakeApiClient();
  retryClient.responses = [
    { scheduleVersion: 8, todoLinkImpacts: [] },
    {
      scheduleVersion: 8,
      days: [
        { day: 1, items: [{ id: "item-1", placeId: PLACE_IDS[0], placeName: "장소 1", startTime: "10:00", endTime: "11:00", tags: [], reason: "", priority: "optional", day: 1, locked: false, tickets: [] }] },
        { day: 2, items: [{ id: "item-2", placeId: PLACE_IDS[1], placeName: "장소 2", startTime: "10:00", endTime: "11:00", tags: [], reason: "", priority: "optional", day: 2, locked: false, tickets: [] }] },
      ],
    },
  ];
  const retried = await new HttpWorkspaceTripDatesApiGateway(retryClient, "http://localhost:3000/api/v1").update({
    roomId: ROOM_ID,
    tripId: ROOM_ID,
    snapshot: snapshot(),
    result: shortened,
    clientMutationId: "trip-date-retry-stable-id",
    confirmedDeletionItemIds: ["item-3"],
  });
  assert(retryClient.requests.length === 2
    && retryClient.requests[1]?.path === `/rooms/${ROOM_ID}/schedule`
    && retried.schedule.scheduleVersion === 8
    && !retried.todoLinkImpactsComplete,
  "25c. 응답 유실 후 같은 mutation ID 재전송 응답은 동일 버전 schedule 재조회로 복구");

  tripClient.response = { ...tripClient.response as object, endDate: "2026-08-03T00:00:00.000Z" };
  let mismatchedDateBlocked = false;
  try {
    await tripGateway.update({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      snapshot: snapshot(),
      result: shortened,
      clientMutationId: "trip-date-test-2",
      confirmedDeletionItemIds: ["item-3"],
    });
  } catch (error) {
    mismatchedDateBlocked = error instanceof WorkspaceTripDateResponseError;
  }
  assert(mismatchedDateBlocked, "26. 요청과 다른 서버 날짜 응답 차단");

  tripClient.error = new ApiError("conflict", { status: 409, payload: { currentVersion: 12 } });
  let conflictMapped = false;
  try {
    await tripGateway.update({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      snapshot: snapshot(),
      result: shortened,
      clientMutationId: "trip-date-test-3",
      confirmedDeletionItemIds: ["item-3"],
    });
  } catch (error) {
    conflictMapped = error instanceof WorkspaceScheduleVersionConflictError
      && error.expectedVersion === 7
      && error.currentVersion === 12;
  }
  assert(conflictMapped, "27. trip-dates 409를 일정 버전 충돌로 매핑");
}

verifyGateways()
  .then(() => console.log("Workspace planning/trip-dates API verification passed: 32 scenarios"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
