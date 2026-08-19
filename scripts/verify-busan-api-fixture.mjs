import assert from "node:assert/strict";
import {
  BUSAN_PLACE_SPECS,
  CURATED_BUSAN_PLACES,
  FIXTURE_ITEM_PREFIX,
  assertCuratedFallbackAllowed,
  assertExistingScheduleIsReplaceable,
  buildCuratedScheduleDays,
  buildScheduleDays,
  chooseTourPlace,
  getDefaultTripDates,
  isBusanCoordinate,
  isLocalApiBaseUrl,
  normalizePlaceName,
  readScheduleDays,
} from "./seed-busan-api-room.mjs";

assert.equal(normalizePlaceName(" 부산 엑스 더 스카이 (해운대) "), "부산엑스더스카이");
assert.equal(isBusanCoordinate(35.1796, 129.0756), true);
assert.equal(isBusanCoordinate(37.5665, 126.978), false);
assert.equal(isLocalApiBaseUrl("http://localhost:3000/api/v1"), true);
assert.equal(isLocalApiBaseUrl("http://127.0.0.1:3000/api/v1"), true);
assert.equal(isLocalApiBaseUrl("https://backend.example.com/api/v1"), false);
assert.deepEqual(readScheduleDays({ days: [{ day: 1, items: [] }] }), [{ day: 1, items: [] }]);
assert.deepEqual(
  readScheduleDays({ _doc: { days: [{ day: 2, items: [] }] } }),
  [{ day: 2, items: [] }],
  "local Backend의 Mongoose subdocument 응답도 읽어야 한다",
);
assert.deepEqual(readScheduleDays({}), []);
assert.doesNotThrow(() => assertCuratedFallbackAllowed(true, true));
assert.throws(
  () => assertCuratedFallbackAllowed(true, false),
  /localhost 전용/,
  "curated fallback은 원격 서버에서 사용할 수 없어야 한다",
);

const gamcheonSpec = BUSAN_PLACE_SPECS[0];
const selected = chooseTourPlace(gamcheonSpec, [
  {
    source: "tour",
    externalId: "4039289",
    contentTypeId: 14,
    name: "감천문화마을 어린왕자 전시관",
    address: "부산광역시 사하구",
    lat: 35.0962,
    lng: 129.0094,
  },
  {
    source: "tour",
    externalId: "1997221",
    contentTypeId: 12,
    name: "부산 감천문화마을",
    address: "부산광역시 사하구",
    lat: 35.0974,
    lng: 129.0105,
  },
]);
assert.equal(selected.externalId, "1997221", "검증된 Tour contentId를 우선해야 한다");
assert.throws(
  () => chooseTourPlace(gamcheonSpec, [{ ...selected, externalId: "999", lat: 37.5, lng: 127 }]),
  /안전하게 식별하지 못했습니다/,
);
assert.throws(
  () => chooseTourPlace(gamcheonSpec, [{ ...selected, externalId: "999" }]),
  /검증된 contentId/,
);

const dates = getDefaultTripDates(new Date("2026-08-19T00:00:00.000Z"));
assert.equal(dates.startDate, "2026-09-18");
assert.equal(dates.endDate, "2026-09-20");

assert.deepEqual(assertExistingScheduleIsReplaceable([], false), { itemCount: 0, foreignItemCount: 0 });
assert.deepEqual(
  assertExistingScheduleIsReplaceable([{ day: 1, items: [{ id: `${FIXTURE_ITEM_PREFIX}one` }] }], false),
  { itemCount: 1, foreignItemCount: 0 },
);
assert.throws(
  () => assertExistingScheduleIsReplaceable([{ day: 1, items: [{ id: "real-user-item" }] }], false),
  /기존 실제 일정 1개/,
);
assert.deepEqual(
  assertExistingScheduleIsReplaceable([{ day: 1, items: [{ id: "real-user-item" }] }], true),
  { itemCount: 1, foreignItemCount: 1 },
);

const resolvedPlaces = BUSAN_PLACE_SPECS.map((spec, index) => ({
  externalId: spec.externalId,
  placeId: `665abc123def45678901${String(index).padStart(4, "0")}`,
  name: spec.aliases[0],
  lat: 35.05 + index * 0.01,
  lng: 129.01 + index * 0.01,
}));
const days = buildScheduleDays(resolvedPlaces);
assert.deepEqual(days.map((day) => day.day), [1, 2, 3]);
assert.equal(days.flatMap((day) => day.items).length, BUSAN_PLACE_SPECS.length);
assert.equal(new Set(days.flatMap((day) => day.items.map((item) => item.id))).size, BUSAN_PLACE_SPECS.length);
for (const day of days) {
  const ordered = [...day.items].sort((a, b) => a.startTime.localeCompare(b.startTime));
  assert.deepEqual(day.items, ordered, `DAY ${day.day} 일정은 시간순이어야 한다`);
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(ordered[index - 1].endTime <= ordered[index].startTime, `DAY ${day.day} 일정은 겹치지 않아야 한다`);
  }
  for (const item of day.items) {
    assert.ok(item.id.startsWith(FIXTURE_ITEM_PREFIX));
    assert.match(item.placeId, /^[a-f0-9]{24}$/);
    assert.equal(isBusanCoordinate(item.lat, item.lng), true);
  }
}

assert.equal(CURATED_BUSAN_PLACES.length, BUSAN_PLACE_SPECS.length);
assert.equal(new Set(CURATED_BUSAN_PLACES.map((place) => place.externalId)).size, BUSAN_PLACE_SPECS.length);
for (const place of CURATED_BUSAN_PLACES) {
  assert.equal(isBusanCoordinate(place.lat, place.lng), true);
  assert.match(place.address, /^부산/);
  assert.equal("placeId" in place, false, "curated 장소는 fake Mongo placeId를 가지면 안 된다");
}

const curatedDays = buildCuratedScheduleDays();
const curatedItems = curatedDays.flatMap((day) => day.items);
assert.equal(curatedItems.length, BUSAN_PLACE_SPECS.length);
assert.equal(curatedItems.some((item) => "placeId" in item), false);
for (const item of curatedItems) {
  assert.match(item.reason, /주소: 부산/);
  assert.equal(isBusanCoordinate(item.lat, item.lng), true);
}

console.log(
  `Busan API fixture verification passed (${BUSAN_PLACE_SPECS.length} Tour places + ${curatedItems.length} curated manual items, ${days.length} days).`,
);
