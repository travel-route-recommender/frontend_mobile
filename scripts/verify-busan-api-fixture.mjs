import assert from "node:assert/strict";
import {
  BUSAN_PLACE_SPECS,
  CURATED_BUSAN_PLACES,
  FIXTURE_ITEM_PREFIX,
  STRESS_FIXTURE_ITEM_PREFIX,
  STRESS_PERSONAS,
  STRESS_SCHEDULED_PLACE_KEYS,
  areScheduleCoresEqual,
  assertCuratedFallbackAllowed,
  assertExistingScheduleIsReplaceable,
  assertStressScenarioMutationAllowed,
  buildCuratedScheduleDays,
  buildScheduleDays,
  buildHardConflictCandidateSignals,
  buildStressCandidateSignals,
  buildStressScenario,
  chooseTourPlace,
  createSeededRandom,
  getDefaultTripDates,
  isBusanCoordinate,
  isFixtureScheduleItemId,
  isLocalApiBaseUrl,
  normalizePlaceName,
  readScheduleDays,
  stableSeedTag,
  validateStressScenario,
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
assert.deepEqual(
  readScheduleDays({
    items: [
      { id: "late", day: 2, startTime: "14:00" },
      { id: "early", day: 2, startTime: "09:00" },
      { id: "day-one", day: 1, startTime: "10:00" },
    ],
  }),
  [
    { day: 1, items: [{ id: "day-one", day: 1, startTime: "10:00" }] },
    {
      day: 2,
      items: [
        { id: "early", day: 2, startTime: "09:00" },
        { id: "late", day: 2, startTime: "14:00" },
      ],
    },
  ],
  "GET schedule의 flat items 응답도 day별로 복원해야 한다",
);
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
assert.equal(isFixtureScheduleItemId(`${STRESS_FIXTURE_ITEM_PREFIX}one`), true);
assert.equal(isFixtureScheduleItemId("real-user-item"), false);
assert.deepEqual(
  assertExistingScheduleIsReplaceable([{ day: 1, items: [{ id: `${STRESS_FIXTURE_ITEM_PREFIX}one` }] }], false),
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

const randomA = createSeededRandom("repeatable-seed");
const randomB = createSeededRandom("repeatable-seed");
assert.deepEqual(
  Array.from({ length: 10 }, () => randomA()),
  Array.from({ length: 10 }, () => randomB()),
  "같은 seed의 난수열은 완전히 재현되어야 한다",
);
assert.equal(stableSeedTag("repeatable-seed"), stableSeedTag("repeatable-seed"));
assert.notEqual(stableSeedTag("repeatable-seed"), stableSeedTag("different-seed"));

const stressScenario = buildStressScenario(resolvedPlaces, {
  seed: "group-conflict-001",
  startDate: "2026-09-18",
});
const repeatedStressScenario = buildStressScenario(resolvedPlaces, {
  seed: "group-conflict-001",
  startDate: "2026-09-18",
});
const alternateStressScenario = buildStressScenario(resolvedPlaces, {
  seed: "group-conflict-002",
  startDate: "2026-09-18",
});
const carStressScenario = buildStressScenario(resolvedPlaces, {
  seed: "group-conflict-001",
  startDate: "2026-09-18",
  transportMode: "car",
});
assert.deepEqual(stressScenario, repeatedStressScenario, "같은 seed의 stress 방은 byte-level로 재현되어야 한다");
assert.notDeepEqual(
  stressScenario.scheduleDays,
  alternateStressScenario.scheduleDays,
  "다른 seed는 시간·체류·근거리 순서 중 적어도 하나를 바꿔야 한다",
);
assert.equal(validateStressScenario(stressScenario), true);
assert.equal(stressScenario.planning.transportMode, "mixed");
assert.equal(carStressScenario.planning.transportMode, "car", "자동차 실제 경로 검증용 stress 방을 선택할 수 있어야 한다");
assert.equal(STRESS_PERSONAS.length, 5);
assert.equal(stressScenario.scheduleDays.length, 3);
assert.equal(stressScenario.scheduleDays.flatMap((day) => day.items).length, STRESS_SCHEDULED_PLACE_KEYS.length);
const scheduledStressKeys = new Set(
  stressScenario.scheduleDays
    .flatMap((day) => day.items)
    .map((item) => item.id.slice(STRESS_FIXTURE_ITEM_PREFIX.length)),
);
const unplacedStressKeys = BUSAN_PLACE_SPECS
  .map((spec) => spec.key)
  .filter((key) => !scheduledStressKeys.has(key));
assert.deepEqual(unplacedStressKeys.sort(), ["gukje", "haedong", "haeundae", "huinnyeoul"]);
assert.ok(unplacedStressKeys.length >= 4, "자동 채우기가 성향을 비교할 후보를 4개 이상 남겨야 한다");
assert.equal(stressScenario.reservations.length, 2);
assert.equal(stressScenario.lockItemIds.length, 3);
assert.equal(stressScenario.todos.length, 4);
assert.equal(
  stressScenario.candidateSignals.length,
  STRESS_PERSONAS.length * BUSAN_PLACE_SPECS.length,
  "모든 참여자가 모든 후보에 1–5 강도와 must/avoid를 명시해야 한다",
);
assert.deepEqual(
  buildStressCandidateSignals("group-conflict-001"),
  stressScenario.candidateSignals,
  "후보 신호도 schedule과 같은 seed로 재현되어야 한다",
);
const conflictingPlaces = BUSAN_PLACE_SPECS.filter((spec) => {
  const signals = stressScenario.candidateSignals.filter((entry) => entry.placeKey === spec.key);
  return signals.some((entry) => entry.signal.mustVisit) && signals.some((entry) => entry.signal.avoid);
});
assert.deepEqual(conflictingPlaces, [], "기본 stress는 must/avoid 교차 Hard 충돌로 자동 채우기를 중단시키면 안 된다");
const softConflictPlaces = BUSAN_PLACE_SPECS.filter((spec) => {
  const strengths = stressScenario.candidateSignals
    .filter((entry) => entry.placeKey === spec.key)
    .map((entry) => entry.signal.preferenceStrength);
  return Math.min(...strengths) === 1 && Math.max(...strengths) === 5;
});
assert.ok(softConflictPlaces.length >= 3, "preferenceStrength 1↔5의 Soft 상충은 충분히 남아야 한다");
const hardConflictSignals = buildHardConflictCandidateSignals("group-conflict-001");
const hardConflictPlaces = BUSAN_PLACE_SPECS.filter((spec) => {
  const signals = hardConflictSignals.filter((entry) => entry.placeKey === spec.key);
  return signals.some((entry) => entry.signal.mustVisit) && signals.some((entry) => entry.signal.avoid);
});
assert.ok(hardConflictPlaces.length >= 3, "Hard 충돌 중단 로직용 순수 fixture는 별도로 보존해야 한다");
for (const day of stressScenario.scheduleDays) {
  assert.equal(day.items[0].date, `2026-09-${String(17 + day.day).padStart(2, "0")}`);
  for (const item of day.items) {
    assert.ok(item.id.startsWith(STRESS_FIXTURE_ITEM_PREFIX));
    assert.equal(item.locked, false, "초기 batch 후 versioned lock API로 잠가야 한다");
  }
}
assert.equal(areScheduleCoresEqual(stressScenario.scheduleDays, repeatedStressScenario.scheduleDays), true);
assert.equal(areScheduleCoresEqual(stressScenario.scheduleDays, alternateStressScenario.scheduleDays), false);
assert.deepEqual(
  assertStressScenarioMutationAllowed([], stressScenario.scheduleDays, false),
  { changed: true, existingItemCount: 0 },
);
assert.deepEqual(
  assertStressScenarioMutationAllowed(stressScenario.scheduleDays, repeatedStressScenario.scheduleDays, false),
  { changed: false, existingItemCount: STRESS_SCHEDULED_PLACE_KEYS.length },
);
assert.throws(
  () => assertStressScenarioMutationAllowed(stressScenario.scheduleDays, alternateStressScenario.scheduleDays, false),
  /기존 fixture 일정과 seed 결과가 다릅니다/,
  "기존 stress 방을 다른 seed로 조용히 덮어쓰면 안 된다",
);
assert.deepEqual(
  assertStressScenarioMutationAllowed(stressScenario.scheduleDays, alternateStressScenario.scheduleDays, true),
  { changed: true, existingItemCount: STRESS_SCHEDULED_PLACE_KEYS.length },
);
assert.throws(
  () => assertStressScenarioMutationAllowed(
    [{ day: 1, items: [{ id: "real-user-item" }] }],
    stressScenario.scheduleDays,
    false,
  ),
  /기존 실제 일정 1개/,
  "실사용자 일정 id가 하나라도 있으면 stress 시드를 중단해야 한다",
);

console.log(
  `Busan API fixture verification passed (${BUSAN_PLACE_SPECS.length} Tour places + ${curatedItems.length} curated manual items, ${STRESS_PERSONAS.length} stress personas, ${stressScenario.candidateSignals.length} preference signals).`,
);
