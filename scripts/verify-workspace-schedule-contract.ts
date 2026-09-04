import type { ItineraryItem, TripRoom } from "../src/domain";
import {
  ApiError,
  type ApiClient,
  type ApiRequest,
} from "../src/services/apiClient";
import {
  applyBackendMustPriorityProtection,
  applyWorkspaceScheduleLocalOverlays,
  buildScheduleTripDates,
  createWorkspaceScheduleItemMetadataFromPlace,
  findTicketRemovalImpacts,
  mapBackendScheduleToWorkspace,
  mapWorkspaceScheduleToBatch,
  parseBackendRoomSchedule,
  resolveScheduleTicketImageUrl,
  WorkspaceScheduleContractError,
  type WorkspaceScheduleItemMetadata,
} from "../src/features/workspace/services/workspaceScheduleContract";
import {
  HttpWorkspaceScheduleApiGateway,
  ScheduleReservationPlaceReplacementUnsupportedError,
  ScheduleTicketPlaceReplacementUnsupportedError,
  ScheduleTicketRemovalConfirmationRequiredError,
  WorkspaceScheduleIdentityError,
  WorkspaceScheduleProtectedItemError,
  WorkspaceScheduleScopeMismatchError,
  WorkspaceScheduleVersionConflictError,
} from "../src/features/workspace/services/workspaceScheduleApi";
import {
  prepareApiWorkspaceScheduleAddition,
  prepareApiWorkspaceScheduleRemoval,
  prepareApiWorkspaceScheduleUpdate,
} from "../src/features/workspace/logic/apiWorkspaceScheduleState";
import {
  API_WORKSPACE_OVERLAY_STORAGE_VERSION,
  buildApiWorkspaceOverlays,
  parseApiWorkspaceOverlays,
} from "../src/features/workspace/logic/apiWorkspaceOverlay";
import {
  buildStoredApiWorkspaceOverlays,
  clearApiWorkspaceOverlays,
  loadApiWorkspaceOverlays,
  loadApiWorkspaceOverlaysWithStatus,
  parseStoredApiWorkspaceOverlays,
  saveApiWorkspaceOverlays,
} from "../src/features/workspace/services/apiWorkspaceOverlayStorage";
import {
  describeApiWorkspaceScheduleReservationImpacts,
  findApiWorkspaceScheduleReservationImpacts,
  hasApiWorkspaceScheduleRelevantChanges,
  ticketRemovalItemIdsFromImpacts,
} from "../src/features/workspace/logic/apiWorkspaceScheduleImpact";

const ROOM_ID = "665abc123def456789012345";
const OTHER_ROOM_ID = "665abc123def456789012346";
const PLACE_ID = "665abc123def456789012347";
const OTHER_PLACE_ID = "665abc123def456789012348";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(action: () => unknown, constructor: new (...args: never[]) => Error, message: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof constructor, `${message}: 다른 오류가 발생했습니다.`);
    return;
  }
  throw new Error(`${message}: 오류가 발생하지 않았습니다.`);
}

const ticket = {
  id: "ticket-1",
  imageUrl: "/uploads/tickets/room/item.jpg",
  uploadedBy: "user-1",
  note: "입장 QR",
  originalName: "item.jpg",
  mimeType: "image/jpeg",
  createdAt: "2026-08-19T00:00:00.000Z",
};

const payload = {
  days: [
    {
      day: 1,
      items: [
        {
          id: "item-1",
          placeId: PLACE_ID,
          placeName: "해운대",
          startTime: "00:15",
          endTime: "01:45",
          tags: ["바다", "산책"],
          reason: "야간 산책",
          priority: "must",
          day: 1,
          lat: 35.1587,
          lng: 129.1604,
          tickets: [ticket],
        },
      ],
    },
    { day: 2, items: [] },
  ],
  scheduleVersion: 7,
};

const parsed = parseBackendRoomSchedule(payload);
assert(parsed.scheduleVersion === 7, "1. GET 응답의 scheduleVersion을 보존해야 한다");
assert(parsed.days[0]?.items[0]?.priority === "must", "2. priority를 파싱해야 한다");
assert(parsed.days[0]?.items[0]?.tickets[0]?.note === "입장 QR", "3. ticket 전체 메타데이터를 파싱해야 한다");
assert(parseBackendRoomSchedule({ days: [{ day: 1, items: [{ ...payload.days[0].items[0], tags: undefined, reason: undefined, priority: undefined, tickets: undefined }] }], scheduleVersion: 0 }).days[0]?.items[0]?.priority === "optional", "4. 서버 기본값과 같은 optional fallback");
assert(parseBackendRoomSchedule({ _doc: { days: payload.days }, scheduleVersion: 7 }).days.length === 2, "4a. 현재 Mongoose runtime의 _doc.days 호환 응답도 엄격 파싱");

assertThrows(
  () => parseBackendRoomSchedule({ days: [], scheduleVersion: undefined }),
  WorkspaceScheduleContractError,
  "5. 버전 없는 응답은 안전한 저장에 사용할 수 없어야 한다",
);
assertThrows(
  () => parseBackendRoomSchedule({ ...payload, days: [{ day: 1, items: [{ ...payload.days[0].items[0], day: 2 }] }] }),
  WorkspaceScheduleContractError,
  "6. 상위 DAY와 item.day 불일치 차단",
);
assertThrows(
  () => parseBackendRoomSchedule({ ...payload, days: [{ day: 1, items: [payload.days[0].items[0], payload.days[0].items[0]] }] }),
  WorkspaceScheduleContractError,
  "7. 중복 item ID 차단",
);
assertThrows(
  () => parseBackendRoomSchedule({ ...payload, days: [{ day: 1, items: [{ ...payload.days[0].items[0], endTime: "00:15" }] }] }),
  WorkspaceScheduleContractError,
  "8. 종료 시간이 시작과 같거나 이른 응답 차단",
);
const outOfRangeCoordinate = parseBackendRoomSchedule({ ...payload, days: [{ day: 1, items: [{ ...payload.days[0].items[0], lat: 91 }] }] });
assert(outOfRangeCoordinate.days[0]?.items[0]?.lat === 91, "8a. Swagger가 허용한 유한 좌표값은 응답 계약에서 임의 삭제하지 않음");
const partialCoordinate = parseBackendRoomSchedule({ ...payload, days: [{ day: 1, items: [{ ...payload.days[0].items[0], lng: undefined }] }] });
assert(partialCoordinate.days[0]?.items[0]?.lat === 35.1587 && partialCoordinate.days[0]?.items[0]?.lng === undefined,
  "8b. Swagger처럼 위도·경도를 독립 optional 값으로 보존");

assert(buildScheduleTripDates("2026-08-31", "2026-09-02").join(",") === "2026-08-31,2026-09-01,2026-09-02", "9. 월 경계 DAY 매핑");
assertThrows(() => buildScheduleTripDates("2026-02-30", "2026-03-01"), WorkspaceScheduleContractError, "9a. 달력에 없는 날짜 차단");
assert(resolveScheduleTicketImageUrl(ticket.imageUrl, "http://localhost:3000/api/v1") === "http://localhost:3000/uploads/tickets/room/item.jpg", "10. Backend 정적 ticket URL 해석");
assert(resolveScheduleTicketImageUrl("uploads/tickets/room/item.jpg", "http://localhost:3000/api/v1") === "http://localhost:3000/uploads/tickets/room/item.jpg", "10a. 선행 slash가 누락된 정적 ticket URL도 API 경로 아래로 잘못 붙이지 않음");
assert(resolveScheduleTicketImageUrl("javascript:alert(1)", "http://localhost:3000/api/v1") === undefined, "11. 비 HTTP ticket URL은 안전하게 무시");

const snapshot = mapBackendScheduleToWorkspace({
  payload,
  roomId: ROOM_ID,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-20",
  apiBaseUrl: "http://localhost:3000/api/v1",
  overlaysByItemId: {
    "item-1": { itemType: "place", preferredByUserIds: ["user-1"] },
  },
});
const localItem = snapshot.itinerary[0];
assert(localItem?.date === "2026-08-19" && localItem.durationMinutes === 90, "12. day/start/end를 date/duration으로 무손실 매핑");
assert(localItem?.lockedForDuri === true && localItem.preferredByUserIds[0] === "user-1", "13. must priority를 Duri lock으로 투영하고 다른 로컬 overlay 보존");
const priorityProtection = snapshot.priorityProtectionsByItemId["item-1"];
assert(priorityProtection?.source === "backend-priority-must" && priorityProtection.blockedChanges.join() === "delete,replace-place,change-date,change-time", "13a. 필수 일정 삭제·대체·날짜·시간변경 보호 provenance 제공");
assert(priorityProtection?.documentConfirmed === false && priorityProtection.reservationConfirmed === false && !("confirmedAt" in priorityProtection), "13b. must priority를 문서·예약 확정으로 둔갑시키지 않음");
const optionalProtection = applyBackendMustPriorityProtection({
  itinerary: snapshot.itinerary,
  metadataByItemId: { "item-1": { priority: "optional", locked: false } },
  userLockedItemIds: new Set(),
});
assert(optionalProtection.itinerary[0]?.lockedForDuri !== true && !optionalProtection.priorityProtectionsByItemId["item-1"], "13c. must가 해제되면 자동 lock을 가역적으로 제거");
const optionalWithUserLock = applyBackendMustPriorityProtection({
  itinerary: snapshot.itinerary,
  metadataByItemId: { "item-1": { priority: "optional", locked: false } },
  userLockedItemIds: new Set(["item-1"]),
});
assert(optionalWithUserLock.itinerary[0]?.lockedForDuri === true && !optionalWithUserLock.priorityProtectionsByItemId["item-1"], "13d. priority와 별개의 사용자 lock은 유지");
assert(snapshot.metadataByItemId["item-1"]?.placeName === "해운대", "14. UI 모델에 없는 서버 필드를 sidecar로 보존");
assert(snapshot.metadataByItemId["item-1"]?.tickets[0]?.resolvedImageUrl === "http://localhost:3000/uploads/tickets/room/item.jpg", "15. 표시 가능한 ticket URL 제공");

const apiTrip: TripRoom = {
  id: ROOM_ID,
  title: "API 부산 여행",
  regionId: "busan",
  startDate: "2026-08-19",
  endDate: "2026-08-20",
  status: "planning",
  transport: "public",
  members: [{ userId: "user-1", role: "owner" }],
};
const apiPlace = {
  id: OTHER_PLACE_ID,
  regionId: "busan",
  name: "광안리",
  category: "관광지",
  tags: ["바다"],
  distanceLabel: "",
  imageUrl: "",
  address: "부산",
  summary: "",
};
const apiCandidate = { tripId: ROOM_ID, placeId: OTHER_PLACE_ID, addedByUserIds: ["user-1"], recommendedByDuri: false };
const apiAdded = prepareApiWorkspaceScheduleAddition({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot,
  candidate: apiCandidate,
  place: apiPlace,
  value: { date: "2026-08-19", startTime: "02:00", durationMinutes: 60, note: "야경", lockedForDuri: true },
});
assert(apiAdded.ok && apiAdded.draft.itinerary.length === 2 && apiAdded.draft.metadataByItemId[apiAdded.itemId as string]?.placeName === "광안리", "15a. API 후보를 metadata와 함께 일정 draft로 추가");
assert(apiAdded.ok, "15aa. 중복 일정 검증을 위한 첫 후보 일정 추가");
const apiRepeated = prepareApiWorkspaceScheduleAddition({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot: {
    ...snapshot,
    itinerary: apiAdded.draft.itinerary,
    metadataByItemId: apiAdded.draft.metadataByItemId,
  },
  candidate: apiCandidate,
  place: apiPlace,
  value: { date: "2026-08-20", startTime: "03:00", durationMinutes: 45, note: "다시 방문", lockedForDuri: false },
});
assert(apiRepeated.ok
  && apiRepeated.draft.itinerary.filter((item) => item.placeId === OTHER_PLACE_ID).length === 2
  && apiRepeated.draft.itinerary.some((item) => item.id === apiAdded.itemId)
  && apiRepeated.itemId !== apiAdded.itemId,
"15ab. 같은 후보 장소를 다시 추가하면 첫 일정을 보존하고 별도 item ID로 생성");
const apiOverlap = prepareApiWorkspaceScheduleAddition({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot,
  candidate: apiCandidate,
  place: apiPlace,
  value: { date: "2026-08-19", startTime: "00:30", durationMinutes: 60, note: "", lockedForDuri: false },
});
assert(!apiOverlap.ok && apiOverlap.status === "overlap", "15b. API 일정 추가 전 시간 겹침 차단");
const apiEndOfDay = prepareApiWorkspaceScheduleAddition({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot,
  candidate: apiCandidate,
  place: apiPlace,
  value: { date: "2026-08-20", startTime: "23:30", durationMinutes: 30, note: "", lockedForDuri: false },
});
assert(!apiEndOfDay.ok && apiEndOfDay.status === "invalid-time", "15c. Backend가 표현하지 못하는 24:00 종료를 저장 전에 차단");
const apiMalformedPlace = prepareApiWorkspaceScheduleAddition({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot,
  candidate: { ...apiCandidate, placeId: "tour:invalid" },
  place: { ...apiPlace, id: "tour:invalid" },
  value: { date: "2026-08-20", startTime: "12:00", durationMinutes: 60, note: "", lockedForDuri: false },
});
assert(!apiMalformedPlace.ok && apiMalformedPlace.status === "invalid-place", "15ca. Backend DTO로 저장할 수 없는 장소 ID를 네트워크 전에 차단");
const apiUpdated = prepareApiWorkspaceScheduleUpdate({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot,
  itemId: "item-1",
  value: { date: "2026-08-19", startTime: "02:15", durationMinutes: 45, note: "", lockedForDuri: true },
});
assert(apiUpdated.ok
  && apiUpdated.draft.itinerary[0]?.startTime === "02:15"
  && apiUpdated.draft.metadataByItemId["item-1"]?.reason === ""
  && apiUpdated.draft.userLockedItemIds.includes("item-1"),
"15d. API 시간 수정·메모 삭제와 사용자 잠금 의도를 서버 sidecar와 별도로 함께 반영");
const mustWithUserLock = applyWorkspaceScheduleLocalOverlays(snapshot, { "item-1": { lockedForDuri: true } });
const apiUserUnlockedMust = prepareApiWorkspaceScheduleUpdate({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot: mustWithUserLock,
  itemId: "item-1",
  value: { date: "2026-08-19", startTime: "02:15", durationMinutes: 45, note: "", lockedForDuri: false },
});
assert(apiUserUnlockedMust.ok
  && apiUserUnlockedMust.draft.itinerary[0]?.lockedForDuri === true
  && !apiUserUnlockedMust.draft.userLockedItemIds.includes("item-1"),
"15daa. 사용자 잠금을 해제해도 Backend must의 유효 잠금은 약화시키지 않고 의도만 분리");
const optionalAfterMust = apiUserUnlockedMust.ok
  ? applyBackendMustPriorityProtection({
      itinerary: apiUserUnlockedMust.draft.itinerary,
      metadataByItemId: { "item-1": { priority: "optional", locked: false } },
      userLockedItemIds: new Set(apiUserUnlockedMust.draft.userLockedItemIds),
    })
  : undefined;
assert(optionalAfterMust?.itinerary[0]?.lockedForDuri !== true,
  "15dab. 사용자 잠금 해제 의도는 Backend must가 optional로 바뀐 뒤에도 되살아나지 않음");
const apiProtectedDateChange = prepareApiWorkspaceScheduleUpdate({
  trip: apiTrip,
  currentUserId: "user-1",
  snapshot,
  itemId: "item-1",
  value: { date: "2026-08-20", startTime: "02:15", durationMinutes: 45, note: "", lockedForDuri: false },
});
assert(!apiProtectedDateChange.ok && apiProtectedDateChange.status === "protected-item", "15da. Backend must 일정의 날짜 변경을 draft 단계에서 차단");
const apiRemoved = prepareApiWorkspaceScheduleRemoval({ trip: apiTrip, currentUserId: "user-1", snapshot, itemId: "item-1" });
assert(!apiRemoved.ok && apiRemoved.status === "protected-item", "15e. Backend must 일정의 삭제를 draft 단계에서 차단");
const optionalSnapshot = {
  ...snapshot,
  ...optionalProtection,
  metadataByItemId: {
    ...snapshot.metadataByItemId,
    "item-1": { ...snapshot.metadataByItemId["item-1"], priority: "optional" as const },
  },
};
const apiOptionalRemoved = prepareApiWorkspaceScheduleRemoval({ trip: apiTrip, currentUserId: "user-1", snapshot: optionalSnapshot, itemId: "item-1" });
assert(apiOptionalRemoved.ok && apiOptionalRemoved.draft.itinerary.length === 0 && !apiOptionalRemoved.draft.metadataByItemId["item-1"], "15ea. optional 일정 삭제 draft에서 item metadata도 정리");
const apiEndConditionRejected = prepareApiWorkspaceScheduleUpdate({
  trip: { ...apiTrip, endDate: "2026-08-19", endCondition: { type: "train", location: { name: "부산역" }, deadline: "02:00", travelMinutes: 30, serviceBufferMinutes: 0 } },
  currentUserId: "user-1",
  snapshot,
  itemId: "item-1",
  value: { date: "2026-08-19", startTime: "00:15", durationMinutes: 90, note: "", lockedForDuri: true },
});
assert(!apiEndConditionRejected.ok && apiEndConditionRejected.status === "end-condition", "15f. 기기 복귀 조건을 침범하는 API 일정 변경 차단");
const apiNonMember = prepareApiWorkspaceScheduleRemoval({ trip: apiTrip, currentUserId: "user-2", snapshot, itemId: "item-1" });
assert(!apiNonMember.ok && apiNonMember.status === "not-member", "15g. 서버 방 비멤버의 일정 draft 변경 차단");
const readOnlyTrip = { ...apiTrip, status: "completed" as const };
const readOnlySnapshotBefore = JSON.stringify(snapshot);
const readOnlyResults = [
  prepareApiWorkspaceScheduleAddition({ trip: readOnlyTrip, currentUserId: "user-1", snapshot, candidate: apiCandidate, place: apiPlace, value: { date: "2026-08-20", startTime: "03:00", durationMinutes: 60, note: "", lockedForDuri: false } }),
  prepareApiWorkspaceScheduleAddition({ trip: readOnlyTrip, currentUserId: "user-1", snapshot, candidate: { ...apiCandidate, placeId: PLACE_ID }, place: { ...apiPlace, id: PLACE_ID }, value: { date: "2026-08-20", startTime: "04:00", durationMinutes: 60, note: "", lockedForDuri: false } }),
  prepareApiWorkspaceScheduleUpdate({ trip: readOnlyTrip, currentUserId: "user-1", snapshot, itemId: "item-1", value: { date: "2026-08-19", startTime: "03:00", durationMinutes: 90, note: "drag", lockedForDuri: true } }),
  prepareApiWorkspaceScheduleUpdate({ trip: readOnlyTrip, currentUserId: "user-1", snapshot, itemId: "item-1", value: { date: "2026-08-19", startTime: "00:15", durationMinutes: 60, note: "resize", lockedForDuri: true } }),
  prepareApiWorkspaceScheduleUpdate({ trip: readOnlyTrip, currentUserId: "user-1", snapshot, itemId: "item-1", value: { date: "2026-08-20", startTime: "05:00", durationMinutes: 45, note: "edit", lockedForDuri: false } }),
  prepareApiWorkspaceScheduleRemoval({ trip: readOnlyTrip, currentUserId: "user-1", snapshot, itemId: "item-1" }),
];
assert(readOnlyResults.every((result) => !result.ok && result.status === "trip-not-editable"), "15h. read-only Add·Duplicate Add·Drag·Resize·Edit Save·Delete draft를 모두 차단");
assert(JSON.stringify(snapshot) === readOnlySnapshotBefore, "15i. read-only mutation 시도 뒤 서버 일정 snapshot이 변하지 않음");
const builtOverlays = buildApiWorkspaceOverlays([{ ...snapshot.itinerary[0] as ItineraryItem, preferredByUserIds: [ROOM_ID], lockedForDuri: true }]);
const parsedOverlays = parseApiWorkspaceOverlays({
  version: API_WORKSPACE_OVERLAY_STORAGE_VERSION,
  items: {
    ...builtOverlays,
    invalid: { itemType: "unknown", preferredByUserIds: ["not-a-user"] },
  },
  savedAt: "2026-08-19T00:00:00.000Z",
});
assert(parsedOverlays["item-1"]?.lockedForDuri === true && parsedOverlays["item-1"]?.preferredByUserIds?.[0] === ROOM_ID, "15h. 계정별 API lock overlay를 엄격 파싱");
assert(!parsedOverlays.invalid && Object.keys(parseApiWorkspaceOverlays({ version: 999, items: builtOverlays })).length === 0, "15i. 잘못된 overlay item과 저장 버전 격리");
const plainOverlaySnapshot = {
  ...optionalSnapshot,
  itinerary: optionalSnapshot.itinerary.map((item) => {
    const { lockedForDuri: _lockedForDuri, note: _note, ...plainItem } = item;
    return { ...plainItem, itemType: "place" as const, preferredByUserIds: [] };
  }),
};
const longOverlayNote = "긴 서버 일정 사유".repeat(20);
const customOverlaySnapshot = {
  ...plainOverlaySnapshot,
  itinerary: plainOverlaySnapshot.itinerary.map((item) => ({
    ...item,
    itemType: "reservation" as const,
    preferredByUserIds: [ROOM_ID],
    lockedForDuri: true,
    note: longOverlayNote,
  })),
};
const canonicalStoredOverlays = buildStoredApiWorkspaceOverlays(customOverlaySnapshot);
const storedOverlayEnvelope = {
  version: API_WORKSPACE_OVERLAY_STORAGE_VERSION,
  scope: {
    roomId: plainOverlaySnapshot.scope.roomId,
    startDate: plainOverlaySnapshot.scope.startDate,
    endDate: plainOverlaySnapshot.scope.endDate,
  },
  scheduleVersion: customOverlaySnapshot.scheduleVersion,
  items: canonicalStoredOverlays,
  savedAt: "2026-08-19T00:00:00.000Z",
};
const storedOverlayRaw = JSON.stringify(storedOverlayEnvelope);
const loadedStoredOverlays = parseStoredApiWorkspaceOverlays(storedOverlayRaw, plainOverlaySnapshot);
assert(loadedStoredOverlays.status === "loaded"
  && loadedStoredOverlays.value["item-1"]?.lockedForDuri === true
  && loadedStoredOverlays.value["item-1"]?.itemType === "reservation",
"15j. scope와 항목 정체성이 같은 API overlay 저장값만 loaded로 구분");
assert(parseStoredApiWorkspaceOverlays(null, plainOverlaySnapshot).status === "missing", "15k. API overlay 저장 키가 없을 때만 missing으로 구분");
assert(parseStoredApiWorkspaceOverlays("{broken", plainOverlaySnapshot).status === "unavailable"
  && parseStoredApiWorkspaceOverlays(JSON.stringify({ ...storedOverlayEnvelope, version: 999 }), plainOverlaySnapshot).status === "unavailable"
  && parseStoredApiWorkspaceOverlays(JSON.stringify({ ...storedOverlayEnvelope, scope: { ...storedOverlayEnvelope.scope, endDate: "2026-08-21" } }), plainOverlaySnapshot).status === "unavailable"
  && parseStoredApiWorkspaceOverlays(JSON.stringify({ version: 1, items: builtOverlays, savedAt: "2026-08-19T00:00:00.000Z" }), plainOverlaySnapshot).status === "unavailable",
"15l. JSON·version·날짜 scope·구형 payload가 손상 또는 과거인 API overlay를 빈 설정으로 위장하지 않음");
const canonicalIdentity = canonicalStoredOverlays["item-1"]?.identity as string;
const corruptOverlayEntries = [
  { "item-1": { identity: canonicalIdentity, overlay: { itemType: "unknown" } } },
  { "item-1": { identity: canonicalIdentity, overlay: { preferredByUserIds: [ROOM_ID, "invalid-user"] } } },
  { "item-1": { identity: canonicalIdentity, overlay: { note: 123 } } },
  { "item-1": { identity: canonicalIdentity, overlay: { lockedForDuri: "true" } } },
  { "item-1": { identity: canonicalIdentity, overlay: { itemType: "meal", unexpected: true } } },
  { "item-1": { identity: "", overlay: { itemType: "meal" } } },
];
assert(corruptOverlayEntries.every((items) => parseStoredApiWorkspaceOverlays(JSON.stringify({
  ...storedOverlayEnvelope,
  items,
}), plainOverlaySnapshot).status === "unavailable"), "15m. overlay entry·identity 손상을 조용히 버리지 않고 전체 unavailable로 격리");
const canonicalStoredRoundTrip = parseStoredApiWorkspaceOverlays(storedOverlayRaw, {
  ...plainOverlaySnapshot,
  scheduleVersion: plainOverlaySnapshot.scheduleVersion + 5,
});
assert(
  canonicalStoredOverlays["item-1"]?.overlay.note?.length === 120
    && canonicalStoredRoundTrip.status === "unavailable"
    && Object.keys(canonicalStoredRoundTrip.value).length === 0,
  "15n. 동일 item identity여도 scheduleVersion이 다르면 실패한 과거 local write 가능성을 배제할 수 없어 fail-closed",
);
const changedIdentitySnapshots = [
  { ...plainOverlaySnapshot, itinerary: plainOverlaySnapshot.itinerary.map((item) => ({ ...item, placeId: OTHER_PLACE_ID })) },
  { ...plainOverlaySnapshot, itinerary: plainOverlaySnapshot.itinerary.map((item) => ({ ...item, date: "2026-08-20" })) },
  { ...plainOverlaySnapshot, itinerary: plainOverlaySnapshot.itinerary.map((item) => ({ ...item, startTime: "00:30" })) },
  { ...plainOverlaySnapshot, itinerary: plainOverlaySnapshot.itinerary.map((item) => ({ ...item, durationMinutes: 75 })) },
];
assert(changedIdentitySnapshots.every((current) => parseStoredApiWorkspaceOverlays(storedOverlayRaw, current).status === "unavailable"),
  "15o. 같은 서버 item ID라도 장소·날짜·시작·길이가 바뀌면 과거 overlay 전체를 unavailable로 격리");
const changedServerSnapshot = changedIdentitySnapshots[0];
const mismatchedOverlays = parseStoredApiWorkspaceOverlays(storedOverlayRaw, changedServerSnapshot);
const safeChangedSnapshot = applyWorkspaceScheduleLocalOverlays(changedServerSnapshot, mismatchedOverlays.value);
assert(mismatchedOverlays.status === "unavailable"
  && safeChangedSnapshot.itinerary[0]?.itemType === "place"
  && safeChangedSnapshot.itinerary[0]?.lockedForDuri !== true
  && safeChangedSnapshot.itinerary[0]?.preferredByUserIds.length === 0,
"15p. identity 불일치가 과거 예약 분류·Duri 잠금·선호를 다른 서버 일정에 되살리지 않음");
const appliedExactOverlay = applyWorkspaceScheduleLocalOverlays(plainOverlaySnapshot, loadedStoredOverlays.value);
assert(appliedExactOverlay.itinerary[0]?.itemType === "reservation"
  && appliedExactOverlay.itinerary[0]?.lockedForDuri === true
  && appliedExactOverlay.itinerary[0]?.preferredByUserIds[0] === ROOM_ID,
"15q. exact identity인 기기 overlay만 서버 snapshot에 적용");

const batch = mapWorkspaceScheduleToBatch({
  itinerary: snapshot.itinerary,
  metadataByItemId: snapshot.metadataByItemId,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-20",
  expectedVersion: snapshot.scheduleVersion,
});
assert(batch.expectedVersion === 7 && batch.days.length === 2, "16. expectedVersion과 빈 DAY를 포함한 batch 계약");
assert(batch.days[0]?.items[0]?.startTime === "00:15" && batch.days[0]?.items[0]?.endTime === "01:45", "17. UI duration을 Backend endTime으로 복원");
assert(batch.days[0]?.items[0]?.day === 1 && batch.days[0]?.items[0]?.placeName === "해운대", "18. day/placeName 보존");
assert(!("tickets" in (batch.days[0]?.items[0] ?? {})), "19. batch 요청에 tickets를 보내지 않아 ID 기반 서버 보존 사용");
assert(!("lockedForDuri" in (batch.days[0]?.items[0] ?? {})) && !("confirmedAt" in (batch.days[0]?.items[0] ?? {})), "19a. local priority protection을 Backend DTO 밖 필드로 전송하지 않음");
const arbitraryMinuteSnapshot = mapBackendScheduleToWorkspace({
  payload: { days: [{ day: 1, items: [{ ...payload.days[0].items[0], startTime: "09:10", endTime: "10:05", priority: "optional", tickets: [] }] }], scheduleVersion: 8 },
  roomId: ROOM_ID,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-19",
  apiBaseUrl: "http://localhost:3000/api/v1",
});
const arbitraryMinuteBatch = mapWorkspaceScheduleToBatch({
  itinerary: arbitraryMinuteSnapshot.itinerary,
  metadataByItemId: arbitraryMinuteSnapshot.metadataByItemId,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-19",
  expectedVersion: arbitraryMinuteSnapshot.scheduleVersion,
});
assert(arbitraryMinuteSnapshot.itinerary[0]?.durationMinutes === 55
  && arbitraryMinuteBatch.days[0]?.items[0]?.startTime === "09:10"
  && arbitraryMinuteBatch.days[0]?.items[0]?.endTime === "10:05", "19b. Backend의 임의 분 HH:mm 일정을 버리거나 반올림하지 않고 왕복");

const oneMinuteSnapshot = mapBackendScheduleToWorkspace({
  payload: { days: [{ day: 1, items: [{ ...payload.days[0].items[0], startTime: "23:58", endTime: "23:59", priority: "optional", tickets: [] }] }], scheduleVersion: 9 },
  roomId: ROOM_ID,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-19",
  apiBaseUrl: "http://localhost:3000/api/v1",
});
const oneMinuteBatch = mapWorkspaceScheduleToBatch({
  itinerary: oneMinuteSnapshot.itinerary,
  metadataByItemId: oneMinuteSnapshot.metadataByItemId,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-19",
  expectedVersion: oneMinuteSnapshot.scheduleVersion,
});
assert(oneMinuteSnapshot.itinerary[0]?.durationMinutes === 1
  && oneMinuteBatch.days[0]?.items[0]?.startTime === "23:58"
  && oneMinuteBatch.days[0]?.items[0]?.endTime === "23:59", "19c. Backend가 표현 가능한 마지막 1분 일정을 정확히 왕복");

const finalMinuteItem: ItineraryItem = {
  ...localItem,
  id: "last-minute",
  startTime: "23:45",
  durationMinutes: 15,
};
const finalMinuteMetadata: WorkspaceScheduleItemMetadata = {
  ...snapshot.metadataByItemId["item-1"],
  itemId: "last-minute",
  tickets: [],
};
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [finalMinuteItem], metadataByItemId: { "last-minute": finalMinuteMetadata }, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-19", expectedVersion: 0 }),
  WorkspaceScheduleContractError,
  "20. 표현 불가능한 UI 24:00 종료를 Backend 23:59로 조용히 바꾸지 않음",
);
const sentinelSnapshot = mapBackendScheduleToWorkspace({
  payload: { days: [{ day: 1, items: [{ ...payload.days[0].items[0], startTime: "23:45", endTime: "23:59", tickets: [] }] }], scheduleVersion: 1 },
  roomId: ROOM_ID,
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-19",
  apiBaseUrl: "http://localhost:3000/api/v1",
});
assert(sentinelSnapshot.itinerary[0]?.durationMinutes === 14 && sentinelSnapshot.metadataByItemId["item-1"]?.wireEndTime === "23:59", "21. Backend 23:59를 근거 없는 24:00 sentinel이 아니라 정확한 23:59로 복원");
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [{ ...finalMinuteItem, startTime: "24:00" }], metadataByItemId: { "last-minute": finalMinuteMetadata }, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-19", expectedVersion: 0 }),
  WorkspaceScheduleContractError,
  "22. Backend가 허용하지 않는 24:00 시작은 차단",
);
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [{ ...finalMinuteItem, startTime: "23:59", durationMinutes: 1 }], metadataByItemId: { "last-minute": finalMinuteMetadata }, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-19", expectedVersion: 0 }),
  WorkspaceScheduleContractError,
  "22a. Backend가 표현할 수 없는 24:00 종료를 1분 일정에서도 명시적으로 차단",
);
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [{ ...localItem, date: "2026-08-21" }], metadataByItemId: snapshot.metadataByItemId, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20", expectedVersion: 7 }),
  WorkspaceScheduleContractError,
  "23. 여행 기간 밖 로컬 일정 저장 차단",
);
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: snapshot.itinerary, metadataByItemId: {}, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20", expectedVersion: 7 }),
  WorkspaceScheduleContractError,
  "24. sidecar 누락으로 서버 필드가 유실되는 저장 차단",
);
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [{ ...localItem, tripId: OTHER_ROOM_ID }], metadataByItemId: snapshot.metadataByItemId, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20", expectedVersion: 7 }),
  WorkspaceScheduleContractError,
  "24a. 다른 여행의 일정 항목을 batch에 섞는 저장 차단",
);
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [{ ...localItem, placeId: "local-place-1" }], metadataByItemId: snapshot.metadataByItemId, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20", expectedVersion: 7 }),
  WorkspaceScheduleContractError,
  "24b. Backend DTO에 넣을 수 없는 로컬 place ID 차단",
);
assertThrows(
  () => mapWorkspaceScheduleToBatch({ itinerary: [{ ...localItem, id: "" }], metadataByItemId: snapshot.metadataByItemId, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20", expectedVersion: 7 }),
  WorkspaceScheduleContractError,
  "24c. ticket 보존과 응답 identity가 불명확한 빈 item ID 차단",
);
const newItem: ItineraryItem = {
  ...localItem,
  id: "item-new",
  placeId: PLACE_ID,
  startTime: "02:00",
  durationMinutes: 60,
  note: "아침 산책",
};
const newItemMetadata = createWorkspaceScheduleItemMetadataFromPlace({
  itemId: newItem.id,
  place: {
    id: PLACE_ID,
    name: "해운대",
    tags: ["바다", "산책"],
    latitude: 35.1587,
    longitude: 129.1604,
  },
});
const newItemBatch = mapWorkspaceScheduleToBatch({
  itinerary: [newItem],
  metadataByItemId: { [newItem.id]: newItemMetadata },
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-20",
  expectedVersion: snapshot.scheduleVersion,
});
assert(newItemMetadata.priority === "optional" && newItemMetadata.tickets.length === 0, "24d. 새 후보 일정은 예약을 날조하지 않고 Backend 기본 optional metadata 생성");
assert(newItemBatch.days[0]?.items[0]?.reason === "아침 산책" && newItemBatch.days[0]?.items[0]?.lat === 35.1587, "24e. 새 후보 metadata와 UI note를 DTO 필드로 결합");
const overlappingItem = { ...newItem, id: "item-overlap", startTime: "02:30" };
const overlappingMetadata = { ...newItemMetadata, itemId: overlappingItem.id };
assertThrows(
  () => mapWorkspaceScheduleToBatch({
    itinerary: [newItem, overlappingItem],
    metadataByItemId: { [newItem.id]: newItemMetadata, [overlappingItem.id]: overlappingMetadata },
    tripId: ROOM_ID,
    startDate: "2026-08-19",
    endDate: "2026-08-20",
    expectedVersion: 7,
  }),
  WorkspaceScheduleContractError,
  "24ea. gateway 직전 전체 batch의 일정 겹침을 다시 차단",
);
const partialCoordinateBatch = mapWorkspaceScheduleToBatch({
  itinerary: [newItem],
  metadataByItemId: { [newItem.id]: { ...newItemMetadata, lat: 35.1, lng: undefined } },
  tripId: ROOM_ID,
  startDate: "2026-08-19",
  endDate: "2026-08-20",
  expectedVersion: 7,
});
assert(partialCoordinateBatch.days[0]?.items[0]?.lat === 35.1
  && partialCoordinateBatch.days[0]?.items[0]?.lng === undefined,
"24eb. Backend DTO가 허용하는 독립 optional 좌표를 batch 저장에서도 무손실 보존");
assertThrows(
  () => createWorkspaceScheduleItemMetadataFromPlace({ itemId: "local-item", place: { id: "local-place", name: "로컬 장소", tags: [] } }),
  WorkspaceScheduleContractError,
  "24f. 서버 후보로 확인되지 않은 local Place에서 wire metadata 생성 차단",
);

const impacts = findTicketRemovalImpacts(snapshot, []);
assert(impacts.length === 1 && impacts[0]?.tickets[0]?.id === "ticket-1" && impacts[0].action === "delete", "25. ticket 일정 삭제 영향 탐지");
assert(findTicketRemovalImpacts(snapshot, [{ ...localItem, placeId: "place-2" }], snapshot.metadataByItemId)[0]?.action === "replace", "26. 같은 ID로 장소를 교체해 ticket이 잘못 승계되는 경우 탐지");
assert(findTicketRemovalImpacts(snapshot, snapshot.itinerary, snapshot.metadataByItemId).length === 0, "27. 같은 item ID의 시간 이동은 ticket 삭제로 오인하지 않음");
const apiTimeImpacts = findApiWorkspaceScheduleReservationImpacts({
  snapshot,
  draft: {
    itinerary: snapshot.itinerary.map((item) => ({ ...item, startTime: "03:00" })),
    userLockedItemIds: [],
    metadataByItemId: snapshot.metadataByItemId,
  },
  localDocuments: [{ id: "local-doc", tripId: ROOM_ID, itineraryItemIds: ["item-1", "item-1"], kind: "admission", displayName: "입장권.pdf" }],
});
assert(apiTimeImpacts.length === 1
  && apiTimeImpacts[0]?.changes.join() === "time"
  && apiTimeImpacts[0]?.serverTickets.length === 1
  && apiTimeImpacts[0]?.localDocuments.length === 1,
"27a. API 시각 변경에서 서버 티켓과 중복 제거한 로컬 문서 연관성을 함께 탐지");
assert(describeApiWorkspaceScheduleReservationImpacts(apiTimeImpacts).includes("공유 티켓 1개")
  && ticketRemovalItemIdsFromImpacts(apiTimeImpacts).length === 0,
"27b. 비삭제 변경은 사용자에게 알리되 Backend 티켓 삭제 확인으로 오인하지 않음");
const apiDeleteImpacts = findApiWorkspaceScheduleReservationImpacts({
  snapshot,
  draft: { itinerary: [], userLockedItemIds: [], metadataByItemId: {} },
  localDocuments: [{ id: "other-trip-doc", tripId: OTHER_ROOM_ID, itineraryItemIds: ["item-1"], kind: "other", displayName: "다른 여행.pdf" }],
});
assert(apiDeleteImpacts[0]?.changes[0] === "delete"
  && apiDeleteImpacts[0]?.localDocuments.length === 0
  && ticketRemovalItemIdsFromImpacts(apiDeleteImpacts)[0] === "item-1",
"27c. 삭제 영향은 같은 여행의 문서만 포함하고 서버 티켓 확인 대상 ID를 반환");
const apiPlaceImpacts = findApiWorkspaceScheduleReservationImpacts({
  snapshot,
  draft: {
    itinerary: snapshot.itinerary,
    userLockedItemIds: [],
    metadataByItemId: {
      ...snapshot.metadataByItemId,
      "item-1": { ...snapshot.metadataByItemId["item-1"], placeName: "새 장소" },
    },
  },
  localDocuments: [],
});
assert(apiPlaceImpacts[0]?.changes.includes("place"), "27d. 같은 일정 ID의 서버 장소명 교체도 예약 영향으로 탐지");
assert(findApiWorkspaceScheduleReservationImpacts({
  snapshot,
  draft: { itinerary: snapshot.itinerary, userLockedItemIds: [], metadataByItemId: snapshot.metadataByItemId },
  localDocuments: [{ id: "local-doc", tripId: ROOM_ID, itineraryItemIds: ["item-1"], kind: "admission", displayName: "입장권.pdf" }],
}).length === 0, "27e. 연결 자료가 있어도 일정 사실이 그대로면 확인을 요구하지 않음");
assert(hasApiWorkspaceScheduleRelevantChanges({
  snapshot,
  draft: { itinerary: [], userLockedItemIds: [], metadataByItemId: {} },
}), "27f. 로컬 문서 hydration 실패 시에도 삭제 가능성을 보수적으로 알릴 수 있음");
const reservationImpactSnapshot = {
  ...snapshot,
  metadataByItemId: {
    ...snapshot.metadataByItemId,
    "item-1": {
      ...snapshot.metadataByItemId["item-1"],
      tickets: [],
      reservation: {
        id: "res-impact",
        status: "unconfirmed" as const,
        date: "2026-08-19",
        documentTicketIds: [],
        revision: 1,
      },
    },
  },
};
const reservationOnlyImpacts = findApiWorkspaceScheduleReservationImpacts({
  snapshot: reservationImpactSnapshot,
  draft: {
    itinerary: reservationImpactSnapshot.itinerary.map((item) => ({ ...item, startTime: "03:00" })),
    userLockedItemIds: [],
    metadataByItemId: reservationImpactSnapshot.metadataByItemId,
  },
  localDocuments: [],
});
assert(reservationOnlyImpacts[0]?.serverReservation?.id === "res-impact"
  && describeApiWorkspaceScheduleReservationImpacts(reservationOnlyImpacts).includes("예약 미확정"),
"27g. 티켓이 없어도 서버 예약이 연결된 일정 변경을 공유 TODO 영향으로 탐지");

class FakeApiClient implements ApiClient {
  requests: ApiRequest[] = [];
  response: unknown = payload;
  error?: Error;

  async request<Response>(request: ApiRequest): Promise<Response> {
    this.requests.push(request);
    if (this.error) throw this.error;
    return this.response as Response;
  }
}

async function verifyGateway() {
  const failingOverlayReader = { getItem: async () => { throw new Error("storage read failed"); } };
  const unavailableOverlays = await loadApiWorkspaceOverlaysWithStatus(ROOM_ID, ROOM_ID, plainOverlaySnapshot, failingOverlayReader);
  assert(unavailableOverlays.status === "unavailable", "27h. API overlay read 실패를 unavailable로 보존");
  assert(Object.keys(await loadApiWorkspaceOverlays(ROOM_ID, ROOM_ID, plainOverlaySnapshot, failingOverlayReader)).length === 0, "27h. 기존 API overlay loader는 read 실패에도 빈 객체 호환 반환 유지");
  const legacyOverlayReader = { getItem: async (key: string) => key.includes(":v1:") ? JSON.stringify({ version: 1, items: builtOverlays }) : null };
  assert((await loadApiWorkspaceOverlaysWithStatus(ROOM_ID, ROOM_ID, plainOverlaySnapshot, legacyOverlayReader)).status === "unavailable",
    "27ha. identity 없는 v1 overlay가 남아 있으면 missing이 아니라 unavailable로 구분");
  const removedOverlayKeys: string[] = [];
  await clearApiWorkspaceOverlays(ROOM_ID, OTHER_ROOM_ID, {
    removeItem: async (key) => { removedOverlayKeys.push(key); },
  });
  assert(removedOverlayKeys.length === 2
    && removedOverlayKeys.every((key) => key.endsWith(`:${ROOM_ID}:${OTHER_ROOM_ID}`))
    && removedOverlayKeys.some((key) => key.includes(":v1:"))
    && removedOverlayKeys.some((key) => key.includes(":v2:")),
  "27i. API overlay 복구는 확인한 계정·여행방의 v2/v1 scoped key만 제거");

  const overlayRaceSnapshot = {
    ...customOverlaySnapshot,
    scope: { ...customOverlaySnapshot.scope, roomId: OTHER_ROOM_ID },
  };
  let firstOverlayWriteStartedResolve!: () => void;
  let releaseFirstOverlayWrite!: () => void;
  const firstOverlayWriteStarted = new Promise<void>((resolve) => { firstOverlayWriteStartedResolve = resolve; });
  const firstOverlayWriteGate = new Promise<void>((resolve) => { releaseFirstOverlayWrite = resolve; });
  const overlayRaceValues = new Map<string, string>();
  let overlayWriteCount = 0;
  const overlayRaceWriter = {
    setItem: async (key: string, value: string) => {
      overlayWriteCount += 1;
      if (overlayWriteCount === 1) {
        firstOverlayWriteStartedResolve();
        await firstOverlayWriteGate;
      }
      overlayRaceValues.set(key, value);
    },
  };
  const firstOverlaySave = saveApiWorkspaceOverlays(ROOM_ID, OTHER_ROOM_ID, overlayRaceSnapshot, overlayRaceWriter);
  await firstOverlayWriteStarted;
  const secondOverlaySnapshot = {
    ...overlayRaceSnapshot,
    scheduleVersion: overlayRaceSnapshot.scheduleVersion + 1,
    itinerary: overlayRaceSnapshot.itinerary.map((item) => ({ ...item, itemType: "meal" as const })),
  };
  const secondOverlaySave = saveApiWorkspaceOverlays(ROOM_ID, OTHER_ROOM_ID, secondOverlaySnapshot, overlayRaceWriter);
  await Promise.resolve();
  assert(overlayWriteCount === 1, "27ia. 같은 overlay key의 후속 저장은 진행 중 저장 뒤에 직렬화");
  releaseFirstOverlayWrite();
  await Promise.all([firstOverlaySave, secondOverlaySave]);
  const finalOverlayEnvelope = JSON.parse([...overlayRaceValues.values()][0] as string) as {
    scheduleVersion?: number;
    items?: Record<string, { overlay?: { itemType?: string } }>;
  };
  assert(overlayRaceValues.size === 1
    && finalOverlayEnvelope.scheduleVersion === secondOverlaySnapshot.scheduleVersion
    && finalOverlayEnvelope.items?.["item-1"]?.overlay?.itemType === "meal",
  "27ib. 같은 overlay key의 동시 저장은 호출 순서상 마지막 snapshot이 최종값");

  let pendingOverlaySetStartedResolve!: () => void;
  let releasePendingOverlaySet!: () => void;
  const pendingOverlaySetStarted = new Promise<void>((resolve) => { pendingOverlaySetStartedResolve = resolve; });
  const pendingOverlaySetGate = new Promise<void>((resolve) => { releasePendingOverlaySet = resolve; });
  const overlaySaveClearValues = new Map<string, string>();
  const overlaySaveClearStorage = {
    setItem: async (key: string, value: string) => {
      pendingOverlaySetStartedResolve();
      await pendingOverlaySetGate;
      overlaySaveClearValues.set(key, value);
    },
    removeItem: async (key: string) => { overlaySaveClearValues.delete(key); },
  };
  const pendingOverlaySave = saveApiWorkspaceOverlays(OTHER_ROOM_ID, OTHER_ROOM_ID, overlayRaceSnapshot, overlaySaveClearStorage);
  await pendingOverlaySetStarted;
  const pendingOverlayClear = clearApiWorkspaceOverlays(OTHER_ROOM_ID, OTHER_ROOM_ID, overlaySaveClearStorage);
  releasePendingOverlaySet();
  await Promise.all([pendingOverlaySave, pendingOverlayClear]);
  assert(overlaySaveClearValues.size === 0,
    "27ic. overlay 초기화는 진행 중 저장 뒤에 직렬화되어 지운 값이 되살아나지 않음");

  const client = new FakeApiClient();
  const gateway = new HttpWorkspaceScheduleApiGateway(client, "http://localhost:3000/api/v1");
  const loaded = await gateway.load({ roomId: ROOM_ID, tripId: ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20" });
  assert(client.requests[0]?.path === `/rooms/${ROOM_ID}/schedule` && client.requests[0]?.auth === true, "28. 검증된 server room ID 및 인증 GET");
  assert(loaded.scheduleVersion === 7, "29. gateway load가 검증된 snapshot 반환");
  assert(loaded.scope.roomId === ROOM_ID && loaded.scope.tripId === ROOM_ID, "29a. 읽은 version의 room/trip scope 보존");
  const unprotectedLoaded = {
    ...loaded,
    itinerary: loaded.itinerary.map(({ lockedForDuri: _lockedForDuri, ...item }) => item),
    metadataByItemId: {
      ...loaded.metadataByItemId,
      "item-1": { ...loaded.metadataByItemId["item-1"], priority: "optional" as const },
    },
    priorityProtectionsByItemId: {},
  };

  let identityBlocked = false;
  try {
    await gateway.load({ roomId: ROOM_ID, tripId: OTHER_ROOM_ID, startDate: "2026-08-19", endDate: "2026-08-20" });
  } catch (error) {
    identityBlocked = error instanceof WorkspaceScheduleIdentityError
      && error.reason === "room-trip-id-mismatch";
  }
  assert(identityBlocked && client.requests.length === 1, "29b. 매핑 계약 없는 서로 다른 server room/local trip ID를 요청 전 차단");

  let invalidRoomBlocked = false;
  try {
    await gateway.load({ roomId: "trip-local", tripId: "trip-local", startDate: "2026-08-19", endDate: "2026-08-20" });
  } catch (error) {
    invalidRoomBlocked = error instanceof WorkspaceScheduleIdentityError
      && error.reason === "invalid-room-id";
  }
  assert(invalidRoomBlocked && client.requests.length === 1, "29c. mock/local ID로 Backend schedule을 요청하기 전 차단");

  let scopeBlocked = false;
  try {
    await gateway.save({
      roomId: OTHER_ROOM_ID,
      tripId: OTHER_ROOM_ID,
      startDate: "2026-08-19",
      endDate: "2026-08-20",
      snapshot: loaded,
      itinerary: loaded.itinerary,
      metadataByItemId: loaded.metadataByItemId,
    });
  } catch (error) {
    scopeBlocked = error instanceof WorkspaceScheduleScopeMismatchError
      && error.snapshotScope.roomId === ROOM_ID
      && error.requestedScope.roomId === OTHER_ROOM_ID;
  }
  assert(scopeBlocked && client.requests.length === 1, "29d. 다른 room에 snapshot version을 재사용하면 네트워크 전에 차단");

  let dateScopeBlocked = false;
  try {
    await gateway.save({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      startDate: "2026-08-20",
      endDate: "2026-08-21",
      snapshot: loaded,
      itinerary: loaded.itinerary,
      metadataByItemId: loaded.metadataByItemId,
    });
  } catch (error) {
    dateScopeBlocked = error instanceof WorkspaceScheduleScopeMismatchError
      && error.requestedScope.startDate === "2026-08-20";
  }
  assert(dateScopeBlocked && client.requests.length === 1, "29e. 날짜 범위가 바뀐 뒤 이전 snapshot version 재사용 차단");

  let protectedItemBlocked = false;
  try {
    await gateway.save({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      startDate: "2026-08-19",
      endDate: "2026-08-20",
      snapshot: loaded,
      itinerary: [],
      metadataByItemId: loaded.metadataByItemId,
      confirmedTicketRemovalItemIds: ["item-1"],
    });
  } catch (error) {
    protectedItemBlocked = error instanceof WorkspaceScheduleProtectedItemError
      && error.itemIds[0] === "item-1";
  }
  assert(protectedItemBlocked && client.requests.length === 1, "29f. prepare 함수를 우회해도 must 일정 삭제를 gateway에서 다시 차단");

  let ticketBlocked = false;
  try {
    await gateway.save({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      startDate: "2026-08-19",
      endDate: "2026-08-20",
      snapshot: unprotectedLoaded,
      itinerary: [],
      metadataByItemId: loaded.metadataByItemId,
    });
  } catch (error) {
    ticketBlocked = error instanceof ScheduleTicketRemovalConfirmationRequiredError && error.impacts[0]?.itemId === "item-1";
  }
  assert(ticketBlocked && client.requests.length === 1, "30. ticket 일정은 네트워크 요청 전에 명시적 확인 요구");

  let ticketReplacementBlocked = false;
  try {
    await gateway.save({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      startDate: "2026-08-19",
      endDate: "2026-08-20",
      snapshot: unprotectedLoaded,
      itinerary: loaded.itinerary.map((item) => ({ ...item, placeId: OTHER_PLACE_ID })),
      metadataByItemId: loaded.metadataByItemId,
      // Confirmation cannot make this safe: Backend keeps tickets by item ID.
      confirmedTicketRemovalItemIds: ["item-1"],
    });
  } catch (error) {
    ticketReplacementBlocked = error instanceof ScheduleTicketPlaceReplacementUnsupportedError
      && error.impacts[0]?.action === "replace";
  }
  assert(ticketReplacementBlocked && client.requests.length === 1, "30a. 확인 후에도 같은 item ID의 ticket-bearing 장소 교체는 네트워크 전에 차단");

  const reservationOnlySnapshot = {
    ...unprotectedLoaded,
    metadataByItemId: {
      ...unprotectedLoaded.metadataByItemId,
      "item-1": {
        ...unprotectedLoaded.metadataByItemId["item-1"],
        tickets: [],
        reservation: {
          id: "res-1",
          status: "unconfirmed" as const,
          date: "2026-08-19",
          documentTicketIds: [],
          revision: 1,
        },
      },
    },
  };
  let reservationReplacementBlocked = false;
  try {
    await gateway.save({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      startDate: "2026-08-19",
      endDate: "2026-08-20",
      snapshot: reservationOnlySnapshot,
      itinerary: reservationOnlySnapshot.itinerary.map((item) => ({ ...item, placeId: OTHER_PLACE_ID })),
      metadataByItemId: reservationOnlySnapshot.metadataByItemId,
    });
  } catch (error) {
    reservationReplacementBlocked = error instanceof ScheduleReservationPlaceReplacementUnsupportedError
      && error.itemIds[0] === "item-1";
  }
  assert(reservationReplacementBlocked && client.requests.length === 1, "30b. ticket이 없어도 예약이 있는 같은 item ID 장소 교체는 네트워크 전에 차단");

  client.response = { days: [{ day: 1, items: [] }, { day: 2, items: [] }], scheduleVersion: 8 };
  const emptySaved = await gateway.save({
    roomId: ROOM_ID,
    tripId: ROOM_ID,
    startDate: "2026-08-19",
    endDate: "2026-08-20",
    snapshot: unprotectedLoaded,
    itinerary: [],
    metadataByItemId: loaded.metadataByItemId,
    confirmedTicketRemovalItemIds: ["item-1"],
  });
  const saveRequest = client.requests[1];
  assert(saveRequest?.method === "PUT" && (saveRequest.body as { expectedVersion?: number }).expectedVersion === 7, "31. batch PUT에 읽은 버전을 expectedVersion으로 전송");
  assert(emptySaved.itinerary.length === 0 && emptySaved.scheduleVersion === 8, "32. 빈 일정 저장도 명시적 tripId로 정상 매핑");

  client.error = new ApiError("conflict", { status: 409, payload: { currentVersion: 12, expectedVersion: 7 } });
  let conflictMapped = false;
  try {
    await gateway.save({
      roomId: ROOM_ID,
      tripId: ROOM_ID,
      startDate: "2026-08-19",
      endDate: "2026-08-20",
      snapshot: { ...unprotectedLoaded, metadataByItemId: { ...unprotectedLoaded.metadataByItemId, "item-1": { ...unprotectedLoaded.metadataByItemId["item-1"], tickets: [] } } },
      itinerary: loaded.itinerary,
      metadataByItemId: loaded.metadataByItemId,
    });
  } catch (error) {
    conflictMapped = error instanceof WorkspaceScheduleVersionConflictError
      && error.expectedVersion === 7
      && error.currentVersion === 12;
  }
  assert(conflictMapped, "33. Backend 409를 재조회 가능한 버전 충돌 오류로 변환");
}

verifyGateway()
  .then(() => console.log("Workspace schedule contract verification passed: 73 scenarios"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
