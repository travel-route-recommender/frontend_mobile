#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FIXTURE_ITEM_PREFIX = "fixture-busan-v1-";
export const STRESS_FIXTURE_ITEM_PREFIX = "fixture-busan-stress-v3-";
export const DEFAULT_ROOM_TITLE = "[API DEMO] 부산 2박 3일";
export const STRESS_ROOM_TITLE_PREFIX = "[API STRESS] 부산 현실 조율";
const FIXTURE_RESERVATION_CODE_PREFIX = "FIXTURE-NOT-REAL-";

const BUSAN_BOUNDS = Object.freeze({
  minLat: 34.95,
  maxLat: 35.4,
  minLng: 128.75,
  maxLng: 129.35,
});

export const BUSAN_PLACE_SPECS = Object.freeze([
  {
    key: "gamcheon",
    query: "감천문화마을",
    externalId: "1997221",
    aliases: ["부산 감천문화마을", "감천문화마을"],
    day: 1,
    startTime: "10:00",
    endTime: "12:00",
    tags: ["문화", "마을", "사진"],
    reason: "서부산 첫 동선의 대표 문화마을",
    priority: "must",
    supporters: ["owner", "local"],
  },
  {
    key: "jagalchi",
    query: "자갈치시장",
    externalId: "132190",
    aliases: ["부산 자갈치시장", "자갈치시장"],
    day: 1,
    startTime: "12:45",
    endTime: "14:15",
    tags: ["시장", "해산물", "식사"],
    reason: "점심과 로컬 시장 경험을 함께 확보",
    priority: "must",
    supporters: ["owner", "local"],
  },
  {
    key: "gukje",
    query: "국제시장",
    externalId: "132191",
    aliases: ["국제시장"],
    day: 1,
    startTime: "14:30",
    endTime: "16:00",
    tags: ["시장", "로컬", "쇼핑"],
    reason: "자갈치시장과 가까운 도보권 후보",
    priority: "optional",
    supporters: ["owner", "local"],
  },
  {
    key: "haedong",
    query: "해동용궁사",
    externalId: "126848",
    aliases: ["해동용궁사", "해동 용궁사"],
    day: 2,
    startTime: "09:30",
    endTime: "11:15",
    tags: ["사찰", "바다", "문화"],
    reason: "동부산 일정의 가장 먼 지점을 오전에 방문",
    priority: "must",
    supporters: ["owner", "active"],
  },
  {
    key: "xsky",
    query: "부산엑스더스카이",
    externalId: "2668973",
    aliases: ["부산엑스더스카이", "부산 엑스 더 스카이"],
    day: 2,
    startTime: "12:30",
    endTime: "14:00",
    tags: ["전망대", "랜드마크", "입장권"],
    reason: "예약 가능성이 높은 유료 랜드마크",
    priority: "must",
    supporters: ["owner", "active"],
  },
  {
    key: "haeundae",
    query: "해운대해수욕장",
    externalId: "126081",
    aliases: ["해운대해수욕장", "해운대 해수욕장"],
    day: 2,
    startTime: "14:15",
    endTime: "16:00",
    tags: ["바다", "산책", "휴식"],
    reason: "전망대와 인접한 해변 휴식 구간",
    priority: "optional",
    supporters: ["owner", "active"],
  },
  {
    key: "gwangalli",
    query: "광안리해수욕장",
    externalId: "126078",
    aliases: ["광안리해수욕장", "광안리 해수욕장"],
    day: 2,
    startTime: "17:30",
    endTime: "20:00",
    tags: ["바다", "야경", "저녁"],
    reason: "광안대교 야경과 저녁 식사 시간 확보",
    priority: "must",
    supporters: ["owner", "active"],
  },
  {
    key: "taejongdae",
    query: "태종대",
    externalId: "126658",
    aliases: ["태종대"],
    day: 3,
    startTime: "09:30",
    endTime: "12:00",
    tags: ["자연", "해안", "산책"],
    reason: "마지막 날 영도 남단의 자연 동선",
    priority: "must",
    supporters: ["owner", "active"],
  },
  {
    key: "huinnyeoul",
    query: "흰여울문화마을",
    externalId: "2684712",
    aliases: ["흰여울문화마을", "흰여울 문화마을"],
    day: 3,
    startTime: "13:15",
    endTime: "15:15",
    tags: ["문화", "해안", "카페"],
    reason: "태종대에서 도심 복귀 중 방문 가능한 영도 동선",
    priority: "optional",
    supporters: ["owner", "local"],
  },
]);

// Read-only TourAPI search results captured from the verified contentIds above.
// These values are used only when a developer explicitly opts into the local
// fallback. They are not inserted into the Place collection and must not be
// represented as server-backed candidates.
export const CURATED_BUSAN_PLACES = Object.freeze([
  {
    externalId: "1997221",
    contentTypeId: 12,
    name: "부산 감천문화마을",
    address: "부산광역시 사하구 감내2로 203",
    lat: 35.0974606978369,
    lng: 129.010596996534,
  },
  {
    externalId: "132190",
    contentTypeId: 38,
    name: "부산 자갈치시장",
    address: "부산광역시 중구 자갈치해안로 52 (남포동4가)",
    lat: 35.0966511661,
    lng: 129.0306042201,
  },
  {
    externalId: "132191",
    contentTypeId: 38,
    name: "국제시장",
    address: "부산광역시 중구 신창로4가 일원",
    lat: 35.1016422372,
    lng: 129.0285792599,
  },
  {
    externalId: "126848",
    contentTypeId: 12,
    name: "해동용궁사",
    address: "부산광역시 기장군 기장읍 용궁길 86",
    lat: 35.1882428912,
    lng: 129.2235301928,
  },
  {
    externalId: "2668973",
    contentTypeId: 12,
    name: "부산엑스더스카이",
    address: "부산광역시 해운대구 달맞이길 30 엘시티 랜드마크타워 98~100F",
    lat: 35.1613422355215,
    lng: 129.16801389247,
  },
  {
    externalId: "126081",
    contentTypeId: 12,
    name: "해운대해수욕장",
    address: "부산광역시 해운대구 해운대해변로 264 (우동)",
    lat: 35.1590840227225,
    lng: 129.160278564827,
  },
  {
    externalId: "126078",
    contentTypeId: 12,
    name: "광안리해수욕장",
    address: "부산광역시 수영구 광안해변로 219 (광안동)",
    lat: 35.1531932737,
    lng: 129.1189760936,
  },
  {
    externalId: "126658",
    contentTypeId: 12,
    name: "태종대",
    address: "부산광역시 영도구 전망로 24 (동삼동)",
    lat: 35.05969491904282,
    lng: 129.07980569117214,
  },
  {
    externalId: "2684712",
    contentTypeId: 12,
    name: "흰여울문화마을",
    address: "부산광역시 영도구 영선동4가 605-3",
    lat: 35.0783,
    lng: 129.0453,
  },
]);

const PERSONAS = Object.freeze([
  {
    key: "owner",
    nickname: "민지",
    onboarding: {
      hasLicense: false,
      hasCar: false,
      mobilityConstraints: [],
      birthYear: 1997,
      tags: ["랜드마크", "맛집", "바다", "계획형"],
    },
    quiz: {
      scheduleFeatures: {
        scheduleSpanMinutes: 720,
        scheduledMinutes: 630,
        activityMinutes: 540,
        restMinutes: 60,
        freeTimeMinutes: 30,
        placeCount: 7,
        restBlockCount: 1,
        averageStayMinutes: 77,
      },
      placeFeatures: {
        selectedPlaceCount: 7,
        selectedLandmarkCount: 5,
        selectedLocalPlaceCount: 2,
        averageLandmarkScore: 85,
        averageLocalScore: 45,
        landmarkAllocatedMinutes: 390,
        localAllocatedMinutes: 150,
      },
      transportPreferences: { CAR: 15, PUBLIC_TRANSIT: 95, WALKING: 70, TAXI: 35 },
      accommodationPreference: { stayImportance: 45, facilityOverLocation: 25, comfortOverPrice: 45 },
      placeValidationPreference: "VALIDATED",
      challenging: 35,
      staminaLevel: "HIGH",
      spendingAllocation: {
        totalCoins: 100,
        allocation: { ACCOMMODATION: 15, FOOD: 30, TRANSPORT: 10, TOURISM: 25, ACTIVITY: 10, SHOPPING: 5, CAFE_REST: 5 },
      },
    },
  },
  {
    key: "local",
    nickname: "준호",
    onboarding: {
      hasLicense: true,
      hasCar: true,
      mobilityConstraints: ["LONG_WALK"],
      birthYear: 1993,
      tags: ["로컬", "카페", "휴식", "자유일정"],
    },
    quiz: {
      scheduleFeatures: {
        scheduleSpanMinutes: 600,
        scheduledMinutes: 330,
        activityMinutes: 240,
        restMinutes: 60,
        freeTimeMinutes: 210,
        placeCount: 3,
        restBlockCount: 2,
        averageStayMinutes: 80,
      },
      placeFeatures: {
        selectedPlaceCount: 5,
        selectedLandmarkCount: 1,
        selectedLocalPlaceCount: 4,
        averageLandmarkScore: 35,
        averageLocalScore: 90,
        landmarkAllocatedMinutes: 60,
        localAllocatedMinutes: 240,
      },
      transportPreferences: { CAR: 90, PUBLIC_TRANSIT: 35, WALKING: 20, TAXI: 70 },
      accommodationPreference: { stayImportance: 75, facilityOverLocation: 70, comfortOverPrice: 80 },
      placeValidationPreference: "LESS_VALIDATED",
      challenging: 75,
      staminaLevel: "LOW",
      spendingAllocation: {
        totalCoins: 100,
        allocation: { ACCOMMODATION: 25, FOOD: 25, TRANSPORT: 15, TOURISM: 5, ACTIVITY: 5, SHOPPING: 5, CAFE_REST: 20 },
      },
    },
  },
  {
    key: "active",
    nickname: "서연",
    onboarding: {
      hasLicense: true,
      hasCar: false,
      mobilityConstraints: [],
      birthYear: 2000,
      tags: ["액티비티", "산책", "사진", "야경"],
    },
    quiz: {
      scheduleFeatures: {
        scheduleSpanMinutes: 690,
        scheduledMinutes: 510,
        activityMinutes: 420,
        restMinutes: 60,
        freeTimeMinutes: 120,
        placeCount: 5,
        restBlockCount: 1,
        averageStayMinutes: 84,
      },
      placeFeatures: {
        selectedPlaceCount: 6,
        selectedLandmarkCount: 3,
        selectedLocalPlaceCount: 3,
        averageLandmarkScore: 65,
        averageLocalScore: 70,
        landmarkAllocatedMinutes: 210,
        localAllocatedMinutes: 210,
      },
      transportPreferences: { CAR: 25, PUBLIC_TRANSIT: 80, WALKING: 90, TAXI: 40 },
      accommodationPreference: { stayImportance: 40, facilityOverLocation: 35, comfortOverPrice: 40 },
      placeValidationPreference: "VALIDATED",
      challenging: 80,
      staminaLevel: "HIGH",
      spendingAllocation: {
        totalCoins: 100,
        allocation: { ACCOMMODATION: 10, FOOD: 15, TRANSPORT: 10, TOURISM: 15, ACTIVITY: 30, SHOPPING: 10, CAFE_REST: 10 },
      },
    },
  },
]);

export const STRESS_PERSONAS = Object.freeze([
  ...PERSONAS,
  {
    key: "comfort",
    nickname: "수진",
    onboarding: {
      hasLicense: false,
      hasCar: false,
      mobilityConstraints: ["STAIRS", "STEEP_SLOPE", "LONG_WALK"],
      birthYear: 1968,
      tags: ["휴식", "택시", "실내", "편안한숙소"],
    },
    quiz: {
      scheduleFeatures: {
        scheduleSpanMinutes: 540,
        scheduledMinutes: 285,
        activityMinutes: 180,
        restMinutes: 105,
        freeTimeMinutes: 255,
        placeCount: 3,
        restBlockCount: 3,
        averageStayMinutes: 60,
      },
      placeFeatures: {
        selectedPlaceCount: 4,
        selectedLandmarkCount: 2,
        selectedLocalPlaceCount: 2,
        averageLandmarkScore: 55,
        averageLocalScore: 65,
        landmarkAllocatedMinutes: 120,
        localAllocatedMinutes: 120,
      },
      transportPreferences: { CAR: 20, PUBLIC_TRANSIT: 30, WALKING: 5, TAXI: 95 },
      accommodationPreference: { stayImportance: 95, facilityOverLocation: 85, comfortOverPrice: 95 },
      placeValidationPreference: "VALIDATED",
      challenging: 15,
      staminaLevel: "LOW",
      spendingAllocation: {
        totalCoins: 100,
        allocation: { ACCOMMODATION: 35, FOOD: 20, TRANSPORT: 20, TOURISM: 10, ACTIVITY: 0, SHOPPING: 5, CAFE_REST: 10 },
      },
    },
  },
  {
    key: "budget",
    nickname: "현우",
    onboarding: {
      hasLicense: false,
      hasCar: false,
      mobilityConstraints: [],
      birthYear: 2002,
      tags: ["가성비", "도보", "시장", "즉흥"],
    },
    quiz: {
      scheduleFeatures: {
        scheduleSpanMinutes: 780,
        scheduledMinutes: 585,
        activityMinutes: 465,
        restMinutes: 45,
        freeTimeMinutes: 150,
        placeCount: 6,
        restBlockCount: 1,
        averageStayMinutes: 78,
      },
      placeFeatures: {
        selectedPlaceCount: 7,
        selectedLandmarkCount: 2,
        selectedLocalPlaceCount: 5,
        averageLandmarkScore: 45,
        averageLocalScore: 85,
        landmarkAllocatedMinutes: 120,
        localAllocatedMinutes: 345,
      },
      transportPreferences: { CAR: 5, PUBLIC_TRANSIT: 90, WALKING: 95, TAXI: 10 },
      accommodationPreference: { stayImportance: 25, facilityOverLocation: 20, comfortOverPrice: 10 },
      placeValidationPreference: "LESS_VALIDATED",
      challenging: 90,
      staminaLevel: "HIGH",
      spendingAllocation: {
        totalCoins: 100,
        allocation: { ACCOMMODATION: 10, FOOD: 30, TRANSPORT: 5, TOURISM: 5, ACTIVITY: 20, SHOPPING: 20, CAFE_REST: 10 },
      },
    },
  },
]);

const QUIZ_CATEGORY_IDS = Object.freeze([
  "restaurant",
  "cafe",
  "shopping",
  "attraction",
  "local",
  "experience",
  "nature",
  "rest",
]);
const QUIZ_BUDGET_IDS = Object.freeze(["stay", "food", "activity", "shopping", "mobility"]);

function clampQuizScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function scoreToScale(value, maximum) {
  return Math.max(1, Math.min(maximum, Math.round((clampQuizScore(value) / 100) * (maximum - 1)) + 1));
}

function scoreToSentiment(value) {
  const score = clampQuizScore(value);
  if (score >= 67) return "like";
  if (score <= 33) return "dislike";
  return "neutral";
}

function fixtureCategoryScores(account) {
  const tags = new Set(account.onboarding.tags);
  const quiz = account.quiz;
  const place = quiz.placeFeatures;
  const density = quiz.scheduleFeatures.scheduleSpanMinutes > 0
    ? clampQuizScore((quiz.scheduleFeatures.scheduledMinutes / quiz.scheduleFeatures.scheduleSpanMinutes) * 100)
    : 50;
  return {
    restaurant: tags.has("맛집") || tags.has("시장") ? 90 : tags.has("가성비") ? 75 : 50,
    cafe: tags.has("카페") ? 90 : tags.has("휴식") ? 70 : 45,
    shopping: tags.has("쇼핑") || tags.has("시장") ? 85 : tags.has("가성비") ? 70 : 40,
    attraction: clampQuizScore(place.averageLandmarkScore),
    local: clampQuizScore(place.averageLocalScore),
    experience: clampQuizScore(quiz.challenging),
    nature: tags.has("바다") || tags.has("산책") || tags.has("자연") ? 85 : 50,
    rest: tags.has("휴식") || tags.has("편안한숙소") ? 90 : clampQuizScore(100 - density),
  };
}

function fixtureBudgetRanking(allocation) {
  const scores = {
    stay: allocation.ACCOMMODATION ?? 0,
    food: (allocation.FOOD ?? 0) + (allocation.CAFE_REST ?? 0),
    activity: (allocation.TOURISM ?? 0) + (allocation.ACTIVITY ?? 0),
    shopping: allocation.SHOPPING ?? 0,
    mobility: allocation.TRANSPORT ?? 0,
  };
  return [...QUIZ_BUDGET_IDS].sort((left, right) => (
    scores[right] - scores[left] || QUIZ_BUDGET_IDS.indexOf(left) - QUIZ_BUDGET_IDS.indexOf(right)
  ));
}

/**
 * 실제 앱의 preferenceSubmissionService와 같은 QuizResponsesDto shape을 만든다.
 * 기존 fixture의 연속 점수는 raw 응답과 파생 점수를 일관된 범위로 투영하는 데만
 * 사용하며 Backend ValidationPipe를 우회하지 않는다.
 */
export function buildFixtureQuizResponses(account) {
  const quiz = account.quiz;
  const schedule = quiz.scheduleFeatures;
  const accommodation = quiz.accommodationPreference;
  const place = quiz.placeFeatures;
  const categoryScores = fixtureCategoryScores(account);
  const density = schedule.scheduleSpanMinutes > 0
    ? clampQuizScore((schedule.scheduledMinutes / schedule.scheduleSpanMinutes) * 100)
    : 50;
  const activeRestPreference = clampQuizScore(
    100 - ((schedule.restMinutes + schedule.freeTimeMinutes) / Math.max(1, schedule.scheduleSpanMinutes)) * 100,
  );
  const staminaScore = quiz.staminaLevel === "HIGH" ? 100 : quiz.staminaLevel === "LOW" ? 0 : 50;
  const scheduleScore = [density, activeRestPreference, staminaScore].sort((left, right) => left - right)[1];
  const challenge = clampQuizScore(quiz.challenging);
  const cautiousness = quiz.placeValidationPreference === "VALIDATED" ? 75 : 35;
  const challengeType = challenge >= 65
    ? "challenge_executor"
    : cautiousness >= 65
      ? "stable_planner"
      : "cautious_explorer";
  const landmarkImportance = clampQuizScore(place.averageLandmarkScore);
  const localInterest = clampQuizScore(place.averageLocalScore);
  const itineraryMessageAnswers = Object.fromEntries([
    ...QUIZ_CATEGORY_IDS.map((categoryId) => [categoryId, scoreToSentiment(categoryScores[categoryId])]),
    ["density", scoreToSentiment(density)],
  ]);

  return {
    surveyVersion: 9,
    algorithmVersion: 9,
    challengeStyle: {
      challengeStyleAnswers: {
        i18: scoreToScale(challenge, 5),
        i48: scoreToScale(100 - cautiousness, 5),
        i22: scoreToScale(challenge, 5),
        i52: scoreToScale(challenge, 5),
        i90: scoreToScale(100 - cautiousness, 5),
        i120: scoreToScale(challenge, 5),
      },
      itineraryMessageAnswers,
      type: challengeType,
      scores: {
        opennessToVariety: challenge,
        excitementSeeking: challenge,
        cautiousness,
        exploration: challenge,
      },
      scheduleStyle: {
        type: scheduleScore > 50 ? "packed" : "relaxed",
        score: scheduleScore,
        components: { density, activeRestPreference, stamina: staminaScore },
      },
      itineraryPreference: {
        categoryScores,
        densityScore: density,
      },
    },
    accommodation: {
      answers: {
        stayMeaning: scoreToScale(accommodation.stayImportance, 8),
        locationFacility: scoreToScale(accommodation.facilityOverLocation, 8),
        comfortPrice: scoreToScale(100 - accommodation.comfortOverPrice, 8),
      },
      scores: {
        stayImportance: clampQuizScore(accommodation.stayImportance),
        facilityOverLocation: clampQuizScore(accommodation.facilityOverLocation),
        comfortOverPrice: clampQuizScore(accommodation.comfortOverPrice),
      },
    },
    stamina: {
      answer: quiz.staminaLevel === "HIGH" ? "high" : quiz.staminaLevel === "LOW" ? "low" : "medium",
      level: quiz.staminaLevel,
      score: staminaScore,
    },
    budget: {
      ranking: fixtureBudgetRanking(quiz.spendingAllocation.allocation),
    },
    discovery: {
      answers: {
        landmarkImportance: scoreToScale(landmarkImportance, 4),
        localInterest: scoreToScale(localInterest, 4),
      },
      scores: { landmarkImportance, localInterest },
    },
  };
}

class FixtureHttpError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "FixtureHttpError";
    this.status = status;
    this.payload = payload;
  }
}

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  for (const filename of [".env.local", ".env"]) {
    const filepath = resolve(process.cwd(), filename);
    if (existsSync(filepath)) process.loadEnvFile(filepath);
  }
}

export function normalizePlaceName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function isBusanCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= BUSAN_BOUNDS.minLat && lat <= BUSAN_BOUNDS.maxLat
    && lng >= BUSAN_BOUNDS.minLng && lng <= BUSAN_BOUNDS.maxLng;
}

export function chooseTourPlace(spec, results) {
  const aliases = spec.aliases.map(normalizePlaceName).filter(Boolean);
  const candidates = (Array.isArray(results) ? results : [])
    .filter((place) => place?.source === "tour")
    .filter((place) => /^\d+$/.test(String(place.externalId ?? "")))
    .filter((place) => Number.isInteger(place.contentTypeId))
    .filter((place) => isBusanCoordinate(Number(place.lat), Number(place.lng)))
    .map((place) => {
      const normalizedName = normalizePlaceName(place.name);
      const exactName = aliases.includes(normalizedName);
      const partialName = aliases.some((alias) => normalizedName.includes(alias) || alias.includes(normalizedName));
      const preferredId = String(place.externalId) === spec.externalId;
      const busanAddress = String(place.address ?? "").includes("부산");
      const score = (preferredId ? 1_000 : 0) + (exactName ? 200 : partialName ? 80 : 0) + (busanAddress ? 20 : 0);
      return { place, score, preferredId, nameMatched: exactName || partialName };
    })
    .filter((entry) => entry.nameMatched)
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  if (!selected) {
    throw new Error(`TourAPI에서 부산 장소 '${spec.query}'를 안전하게 식별하지 못했습니다.`);
  }
  if (!selected.preferredId) {
    throw new Error(
      `TourAPI '${spec.query}'의 검증된 contentId(${spec.externalId})가 검색 결과에 없습니다. 자동으로 다른 장소를 선택하지 않았습니다.`,
    );
  }
  return selected.place;
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function getDefaultTripDates(now = new Date()) {
  let start = addUtcDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), 30);
  while (start.getUTCDay() !== 5) start = addUtcDays(start, 1);
  return { startDate: toIsoDate(start), endDate: toIsoDate(addUtcDays(start, 2)) };
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableSeedTag(seed) {
  return hashSeed(seed).toString(16).padStart(8, "0");
}

export function createSeededRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match) throw new Error(`유효하지 않은 시각입니다: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(totalMinutes) {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) {
    throw new Error(`하루 범위를 벗어난 시각입니다: ${totalMinutes}`);
  }
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function roundUpToQuarter(minutes) {
  return Math.ceil(minutes / 15) * 15;
}

function sampleQuarter(random, minMinutes, maxMinutes) {
  const steps = Math.floor((maxMinutes - minMinutes) / 15);
  return minMinutes + Math.floor(random() * (steps + 1)) * 15;
}

function tripDateForDay(startDate, day) {
  return toIsoDate(addUtcDays(new Date(`${startDate}T00:00:00.000Z`), day - 1));
}

function haversineKm(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const deltaLat = radians(Number(to.lat) - Number(from.lat));
  const deltaLng = radians(Number(to.lng) - Number(from.lng));
  const lat1 = radians(Number(from.lat));
  const lat2 = radians(Number(to.lat));
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateFixtureTransferMinutes(from, to, random = () => 0) {
  const distanceKm = haversineKm(from, to);
  const effectiveSpeedKmh = distanceKm < 1.2 ? 4.2 : distanceKm < 5 ? 12 : 20;
  const accessMinutes = distanceKm < 1.2 ? 5 : 18;
  const variabilityMinutes = Math.floor(random() * 2) * 15;
  return Math.max(15, roundUpToQuarter((distanceKm / effectiveSpeedKmh) * 60 + accessMinutes + variabilityMinutes));
}

function validateThreeDayRange(startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("DURI_FIXTURE_START_DATE와 DURI_FIXTURE_END_DATE는 YYYY-MM-DD 형식이어야 합니다.");
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || toIsoDate(start) !== startDate || toIsoDate(end) !== endDate) {
    throw new Error("부산 시드의 날짜가 유효하지 않습니다.");
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 !== 2) {
    throw new Error("부산 시드는 2박 3일이므로 종료일은 시작일의 이틀 뒤여야 합니다.");
  }
}

export function isLocalApiBaseUrl(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function assertCuratedFallbackAllowed(enabled, localTarget) {
  if (enabled && !localTarget) {
    throw new Error(
      "curated 장소 fallback은 localhost 전용입니다. 원격 API에서는 DURI_FIXTURE_ALLOW_CURATED_PLACES를 사용할 수 없습니다.",
    );
  }
}

export function isFixtureScheduleItemId(value) {
  const id = String(value ?? "");
  return id.startsWith(FIXTURE_ITEM_PREFIX) || id.startsWith(STRESS_FIXTURE_ITEM_PREFIX);
}

export function assertExistingScheduleIsReplaceable(days, allowReplace) {
  const itemIds = (Array.isArray(days) ? days : [])
    .flatMap((day) => Array.isArray(day?.items) ? day.items : [])
    .map((item) => String(item?.id ?? ""))
    .filter(Boolean);
  const foreignIds = itemIds.filter((id) => !isFixtureScheduleItemId(id));
  if (foreignIds.length > 0 && !allowReplace) {
    throw new Error(
      `기존 실제 일정 ${foreignIds.length}개를 발견해 중단했습니다. 의도적으로 교체하려면 DURI_FIXTURE_REPLACE_SCHEDULE=1을 설정하세요.`,
    );
  }
  return { itemCount: itemIds.length, foreignItemCount: foreignIds.length };
}

export function readScheduleDays(payload) {
  if (Array.isArray(payload?.days)) return payload.days;
  // Current local Backend spreads a Mongoose subdocument and serializes the
  // actual schedule under `_doc.days`. Keep this compatibility at the fixture
  // boundary; the frontend DTO should continue to prefer top-level `days`.
  if (Array.isArray(payload?._doc?.days)) return payload._doc.days;
  if (Array.isArray(payload?.items)) {
    const byDay = new Map();
    for (const item of payload.items) {
      const day = Number.isInteger(item?.day) && item.day >= 1 ? item.day : 1;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    }
    return [...byDay.entries()]
      .sort(([left], [right]) => left - right)
      .map(([day, items]) => ({
        day,
        items: [...items].sort((left, right) => String(left?.startTime ?? "").localeCompare(String(right?.startTime ?? ""))),
      }));
  }
  return [];
}

export function buildScheduleDays(
  resolvedPlaces,
  { requirePlaceId = true, includeAddressInReason = false } = {},
) {
  const byExternalId = new Map(resolvedPlaces.map((place) => [String(place.externalId), place]));
  return [1, 2, 3].map((day) => ({
    day,
    items: BUSAN_PLACE_SPECS
      .filter((spec) => spec.day === day)
      .map((spec) => {
        const place = byExternalId.get(spec.externalId);
        if (!place || !isBusanCoordinate(Number(place.lat), Number(place.lng))) {
          throw new Error(`'${spec.query}'의 부산 좌표를 확인하지 못했습니다.`);
        }
        if (requirePlaceId && !place.placeId) {
          throw new Error(`후보 API 응답에서 '${spec.query}'의 서버 placeId를 확인하지 못했습니다.`);
        }
        return {
          id: `${FIXTURE_ITEM_PREFIX}${spec.key}`,
          ...(place.placeId ? { placeId: place.placeId } : {}),
          placeName: place.name,
          startTime: spec.startTime,
          endTime: spec.endTime,
          tags: spec.tags,
          reason: includeAddressInReason && place.address
            ? `${spec.reason} · 주소: ${place.address}`
            : spec.reason,
          priority: spec.priority,
          day,
          lat: Number(place.lat),
          lng: Number(place.lng),
        };
      }),
  }));
}

export function buildCuratedScheduleDays() {
  return buildScheduleDays(CURATED_BUSAN_PLACES, {
    requirePlaceId: false,
    includeAddressInReason: true,
  });
}

const STRESS_STAY_RANGES = Object.freeze({
  gamcheon: [105, 150],
  jagalchi: [75, 120],
  gukje: [75, 120],
  haedong: [105, 150],
  xsky: [90, 120],
  haeundae: [75, 120],
  gwangalli: [105, 150],
  taejongdae: [120, 165],
  huinnyeoul: [90, 135],
});

export const STRESS_SCHEDULED_PLACE_KEYS = Object.freeze([
  "gamcheon",
  "jagalchi",
  "xsky",
  "gwangalli",
  "taejongdae",
]);

const STRESS_SIGNAL_PROFILES = Object.freeze({
  owner: {
    must: ["xsky"],
    avoid: [],
    strong: ["gamcheon", "gwangalli"],
    low: ["huinnyeoul"],
    liked: ["jagalchi", "haedong", "haeundae"],
  },
  local: {
    must: ["jagalchi"],
    avoid: [],
    strong: ["gukje", "huinnyeoul"],
    low: ["haedong"],
    liked: ["gamcheon", "haeundae"],
  },
  active: {
    must: ["taejongdae"],
    avoid: [],
    strong: ["haedong", "gwangalli"],
    low: ["gukje"],
    liked: ["gamcheon", "haeundae", "gwangalli", "huinnyeoul"],
  },
  comfort: {
    must: ["haeundae"],
    avoid: ["huinnyeoul"],
    strong: ["xsky"],
    low: ["gamcheon", "taejongdae"],
    liked: ["jagalchi", "gwangalli"],
  },
  budget: {
    must: ["gukje"],
    avoid: [],
    strong: ["gamcheon", "jagalchi"],
    low: ["xsky"],
    liked: ["gamcheon", "haeundae", "huinnyeoul"],
  },
});

export function buildStressCandidateSignals(seed, personas = STRESS_PERSONAS, specs = BUSAN_PLACE_SPECS) {
  const random = createSeededRandom(`${seed}:candidate-signals`);
  return personas.flatMap((persona) => {
    const profile = STRESS_SIGNAL_PROFILES[persona.key];
    if (!profile) throw new Error(`스트레스 후보 신호 프로필이 없습니다: ${persona.key}`);
    return specs.map((spec) => {
      const mustVisit = profile.must.includes(spec.key);
      const avoid = profile.avoid.includes(spec.key);
      const preferenceStrength = mustVisit
        ? 5
        : avoid
          ? 1
          : profile.strong.includes(spec.key)
            ? 5
            : profile.low.includes(spec.key)
              ? 1
          : profile.liked.includes(spec.key)
            ? 4
            : 2 + Math.floor(random() * 2);
      return {
        personaKey: persona.key,
        placeKey: spec.key,
        externalId: spec.externalId,
        signal: { mustVisit, avoid, preferenceStrength },
      };
    });
  });
}

export function buildHardConflictCandidateSignals(seed, personas = STRESS_PERSONAS, specs = BUSAN_PLACE_SPECS) {
  const conflictPairs = new Set([
    "budget:xsky",
    "active:gukje",
    "comfort:taejongdae",
  ]);
  return buildStressCandidateSignals(seed, personas, specs).map((entry) => (
    conflictPairs.has(`${entry.personaKey}:${entry.placeKey}`)
      ? { ...entry, signal: { ...entry.signal, mustVisit: false, avoid: true, preferenceStrength: 1 } }
      : entry
  ));
}

export function buildStressScheduleDays(resolvedPlaces, { seed, startDate, requirePlaceId = true }) {
  const random = createSeededRandom(`${seed}:schedule`);
  const byExternalId = new Map(resolvedPlaces.map((place) => [String(place.externalId), place]));
  const specByKey = new Map(BUSAN_PLACE_SPECS.map((spec) => [spec.key, spec]));
  const dayOrders = [
    ["gamcheon", "jagalchi"],
    ["xsky", "gwangalli"],
    ["taejongdae"],
  ];
  const dayStartRanges = [[555, 585], [510, 540], [540, 570]];

  return dayOrders.map((keys, dayIndex) => {
    let cursor = sampleQuarter(random, ...dayStartRanges[dayIndex]);
    let previousPlace;
    const items = keys.map((key) => {
      const spec = specByKey.get(key);
      if (!spec) throw new Error(`부산 장소 명세가 없습니다: ${key}`);
      const place = byExternalId.get(spec.externalId);
      if (!place || !isBusanCoordinate(Number(place.lat), Number(place.lng))) {
        throw new Error(`'${spec.query}'의 부산 좌표를 확인하지 못했습니다.`);
      }
      if (requirePlaceId && !place.placeId) {
        throw new Error(`후보 API 응답에서 '${spec.query}'의 서버 placeId를 확인하지 못했습니다.`);
      }
      if (previousPlace) cursor += estimateFixtureTransferMinutes(previousPlace, place, random);
      // 광안리 야경 예약을 저녁에 고정해, 오전 확정 일정과 저녁 예약 사이의
      // 실제 빈 구간을 자동 초안이 채우는 API 데모가 되도록 한다.
      if (key === "gwangalli") cursor = Math.max(cursor, sampleQuarter(random, 17 * 60, 17 * 60 + 30));
      const [minimumStay, maximumStay] = STRESS_STAY_RANGES[key];
      const stayMinutes = sampleQuarter(random, minimumStay, maximumStay);
      const startTime = formatClock(cursor);
      const endTime = formatClock(cursor + stayMinutes);
      cursor += stayMinutes;
      previousPlace = place;
      return {
        id: `${STRESS_FIXTURE_ITEM_PREFIX}${key}`,
        ...(place.placeId ? { placeId: place.placeId } : {}),
        placeName: place.name,
        startTime,
        endTime,
        tags: spec.tags,
        reason: spec.reason,
        priority: spec.priority,
        day: dayIndex + 1,
        date: tripDateForDay(startDate, dayIndex + 1),
        lat: Number(place.lat),
        lng: Number(place.lng),
        locked: false,
      };
    });
    return { day: dayIndex + 1, items };
  });
}

export function buildStressScenario(resolvedPlaces, { seed, startDate, transportMode = "mixed" }) {
  if (!String(seed).trim()) throw new Error("스트레스 fixture seed가 비어 있습니다.");
  if (!["car", "transit", "walk", "mixed"].includes(transportMode)) {
    throw new Error("stress fixture transportMode는 car, transit, walk, mixed 중 하나여야 합니다.");
  }
  const seedTag = stableSeedTag(seed);
  const random = createSeededRandom(`${seed}:planning`);
  const scheduleDays = buildStressScheduleDays(resolvedPlaces, { seed, startDate });
  const itemByKey = new Map(
    scheduleDays.flatMap((day) => day.items).map((item) => [item.id.slice(STRESS_FIXTURE_ITEM_PREFIX.length), item]),
  );
  const travelBufferMinutes = sampleQuarter(random, 15, 30);
  const prepBufferMinutes = sampleQuarter(random, 15, 30);
  const returnPoint = {
    name: "부산역 KTX 복귀 지점",
    lat: 35.115225,
    lng: 129.041324,
    source: "manual",
  };
  const lastItem = scheduleDays.at(-1)?.items.at(-1);
  if (!lastItem) throw new Error("스트레스 fixture 마지막 일정이 없습니다.");
  const minimumReturnDeadline = parseClock(lastItem.endTime)
    + estimateFixtureTransferMinutes(lastItem, returnPoint)
    + travelBufferMinutes
    + prepBufferMinutes
    + 30;
  const returnDeadline = formatClock(roundUpToQuarter(Math.max(18 * 60 + 15, minimumReturnDeadline)));
  const xsky = itemByKey.get("xsky");
  const gwangalli = itemByKey.get("gwangalli");
  if (!xsky || !gwangalli) throw new Error("예약 대상 일정이 없습니다.");

  const scenario = {
    seed: String(seed),
    seedTag,
    scheduleDays,
    planning: {
      timezone: "Asia/Seoul",
      lodging: {
        name: "해운대역 인근 숙소",
        lat: 35.16305,
        lng: 129.15889,
        source: "manual",
      },
      returnPoint,
      transportMode,
      returnDeadline,
      travelBufferMinutes,
      prepBufferMinutes,
      confirm: true,
    },
    lockItemIds: [
      `${STRESS_FIXTURE_ITEM_PREFIX}gamcheon`,
      `${STRESS_FIXTURE_ITEM_PREFIX}xsky`,
      `${STRESS_FIXTURE_ITEM_PREFIX}gwangalli`,
    ],
    reservations: [
      {
        itemKey: "xsky",
        itemId: xsky.id,
        body: {
          status: "confirmed",
          date: xsky.date,
          startTime: xsky.startTime,
          endTime: xsky.endTime,
          timezone: "Asia/Seoul",
          placeId: xsky.placeId,
          externalId: BUSAN_PLACE_SPECS.find((spec) => spec.key === "xsky")?.externalId,
          confirmationCode: `${FIXTURE_RESERVATION_CODE_PREFIX}${seedTag}-XSKY`,
          note: "분석 검증용 확정 예약입니다. 실제 예약이나 입장권이 아닙니다.",
          documentTicketIds: [],
        },
      },
      {
        itemKey: "gwangalli",
        itemId: gwangalli.id,
        body: {
          status: "confirmed",
          date: gwangalli.date,
          timeWindowStart: formatClock(parseClock(gwangalli.startTime) - 15),
          timeWindowEnd: formatClock(parseClock(gwangalli.endTime) + 15),
          timezone: "Asia/Seoul",
          placeId: gwangalli.placeId,
          externalId: BUSAN_PLACE_SPECS.find((spec) => spec.key === "gwangalli")?.externalId,
          confirmationCode: `${FIXTURE_RESERVATION_CODE_PREFIX}${seedTag}-GWANGALLI`,
          note: "시간창 제약 검증용 확정 예약입니다. 실제 예약이 아닙니다.",
          documentTicketIds: [],
        },
      },
    ],
    candidateSignals: buildStressCandidateSignals(seed),
    todos: [
      {
        key: "reservation-prep",
        title: "전망대 예약 정보 오프라인 보관",
        description: "현장에서 네트워크가 불안정해도 확인할 수 있도록 예약번호와 방문 시각을 모두 확인합니다.",
        priority: "high",
        dueDate: tripDateForDay(startDate, 1),
        dueTime: "21:00",
        assigneeKey: "owner",
        itemKey: "xsky",
        reservationItemKey: "xsky",
        checklist: ["예약번호 확인", "동행자에게 방문 시각 공유", "현장 신분증 필요 여부 확인"],
      },
      {
        key: "food-consensus",
        title: "시장 식사 메뉴와 알레르기 확인",
        description: "자갈치시장 방문 전에 못 먹는 음식과 예산 범위를 합의합니다.",
        priority: "high",
        dueDate: tripDateForDay(startDate, 1),
        dueTime: "10:30",
        assigneeKey: "local",
        itemKey: "jagalchi",
        checklist: ["알레르기 확인", "1인 예산 합의", "대기 긴 경우 대안 정하기"],
        promoteToInProgress: true,
      },
      {
        key: "weather-alternative",
        title: "우천 시 해변 일정 대안 정하기",
        description: "해운대와 광안리의 야외 체류가 어려울 때 모두가 수용할 실내 대안을 정합니다.",
        priority: "medium",
        dueDate: tripDateForDay(startDate, 1),
        dueTime: "20:00",
        assigneeKey: "active",
        itemKey: "gwangalli",
        checklist: ["기상 예보 확인", "실내 후보 2곳 비교", "당일 취소 가능 여부 확인"],
      },
      {
        key: "return-readiness",
        title: "부산역 복귀 여유시간 최종 확인",
        description: "마지막 일정 종료 뒤 부산역까지 이동하고 승차 준비를 마칠 수 있는지 확인합니다.",
        priority: "urgent",
        dueDate: tripDateForDay(startDate, 3),
        dueTime: formatClock(Math.max(parseClock(lastItem.endTime), parseClock(returnDeadline) - 120)),
        assigneeKey: "budget",
        itemKey: "taejongdae",
        checklist: ["실제 이동 경로 확인", "교통 지연 여유시간 확인", "승차권과 플랫폼 확인"],
      },
    ],
    resolvedAutoTodo: {
      key: "planning-ready",
      title: "숙소와 복귀 조건 입력",
      description: "두리 분석 전에 숙소, 복귀 지점과 여유시간을 확정합니다.",
      priority: "high",
      dueDate: tripDateForDay(startDate, 1),
      dueTime: "08:00",
      assigneeKey: "owner",
    },
  };
  validateStressScenario(scenario);
  return scenario;
}

export function validateStressScenario(scenario) {
  if (scenario.candidateSignals.length !== STRESS_PERSONAS.length * BUSAN_PLACE_SPECS.length) {
    throw new Error("스트레스 fixture의 참여자별 후보 신호가 완전하지 않습니다.");
  }
  const allItems = scenario.scheduleDays.flatMap((day) => day.items);
  if (scenario.scheduleDays.length !== 3 || allItems.length !== STRESS_SCHEDULED_PLACE_KEYS.length) {
    throw new Error(`스트레스 fixture는 2박 3일, ${STRESS_SCHEDULED_PLACE_KEYS.length}개 배치 일정이어야 합니다.`);
  }
  const scheduledKeys = new Set(allItems.map((item) => item.id.slice(STRESS_FIXTURE_ITEM_PREFIX.length)));
  if (
    STRESS_SCHEDULED_PLACE_KEYS.some((key) => !scheduledKeys.has(key))
    || BUSAN_PLACE_SPECS.length - scheduledKeys.size < 4
  ) throw new Error("자동 채우기용 미배치 후보가 4개 이상 남아야 합니다.");
  if (new Set(allItems.map((item) => item.id)).size !== allItems.length) {
    throw new Error("스트레스 fixture 일정 id가 중복되었습니다.");
  }
  for (const day of scenario.scheduleDays) {
    const ordered = [...day.items].sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (ordered.some((item) => item.day !== day.day || item.date !== tripDateForDay(scenario.scheduleDays[0].items[0].date, day.day))) {
      throw new Error(`DAY ${day.day}의 day/date 정합성이 깨졌습니다.`);
    }
    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];
      const duration = parseClock(item.endTime) - parseClock(item.startTime);
      if (duration < 60 || duration > 180 || duration % 15 !== 0) {
        throw new Error(`${item.placeName}의 체류시간이 fixture 현실 범위를 벗어났습니다.`);
      }
      if (!isBusanCoordinate(Number(item.lat), Number(item.lng))) {
        throw new Error(`${item.placeName}의 부산 좌표가 유효하지 않습니다.`);
      }
      if (index > 0 && ordered[index - 1].endTime > item.startTime) {
        throw new Error(`DAY ${day.day} 일정이 겹칩니다.`);
      }
      if (index > 0 && parseClock(item.startTime) - parseClock(ordered[index - 1].endTime) < 15) {
        throw new Error(`DAY ${day.day} 장소 사이에 최소 이동 여유가 없습니다.`);
      }
    }
  }
  const itemById = new Map(allItems.map((item) => [item.id, item]));
  for (const reservation of scenario.reservations) {
    const item = itemById.get(reservation.itemId);
    if (!item || reservation.body.status !== "confirmed" || reservation.body.date !== item.date) {
      throw new Error("확정 예약이 해당 일정 날짜와 연결되지 않았습니다.");
    }
    if (reservation.body.startTime && (reservation.body.startTime !== item.startTime || reservation.body.endTime !== item.endTime)) {
      throw new Error("정시 예약과 일정 시간이 일치하지 않습니다.");
    }
    if (reservation.body.timeWindowStart && (
      parseClock(item.startTime) < parseClock(reservation.body.timeWindowStart)
      || parseClock(item.endTime) > parseClock(reservation.body.timeWindowEnd)
    )) {
      throw new Error("일정이 확정 예약 시간창을 벗어났습니다.");
    }
  }
  for (const itemId of scenario.lockItemIds) {
    if (!itemById.has(itemId)) throw new Error(`잠금 대상 일정이 없습니다: ${itemId}`);
  }
  const conflicts = BUSAN_PLACE_SPECS.filter((spec) => {
    const signals = scenario.candidateSignals.filter((entry) => entry.placeKey === spec.key);
    return signals.some((entry) => entry.signal.mustVisit) && signals.some((entry) => entry.signal.avoid);
  });
  if (conflicts.length > 0) {
    throw new Error(`기본 stress fixture에는 must/avoid 교차 Hard 충돌이 없어야 합니다: ${conflicts.map((spec) => spec.key).join(", ")}`);
  }
  const softConflictPlaces = BUSAN_PLACE_SPECS.filter((spec) => {
    const strengths = scenario.candidateSignals
      .filter((entry) => entry.placeKey === spec.key)
      .map((entry) => entry.signal.preferenceStrength);
    return Math.min(...strengths) === 1 && Math.max(...strengths) === 5;
  });
  if (softConflictPlaces.length < 3) {
    throw new Error("조율 검증용 preferenceStrength 1↔5 Soft 상충이 충분하지 않습니다.");
  }
  if (scenario.candidateSignals.some((entry) => (
    entry.signal.mustVisit && entry.signal.avoid
    || entry.signal.preferenceStrength < 1
    || entry.signal.preferenceStrength > 5
  ))) {
    throw new Error("후보 신호의 논리 또는 범위가 잘못되었습니다.");
  }
  const lastItem = scenario.scheduleDays.at(-1)?.items.at(-1);
  const requiredReturnMinutes = parseClock(lastItem.endTime)
    + estimateFixtureTransferMinutes(lastItem, scenario.planning.returnPoint)
    + scenario.planning.travelBufferMinutes
    + scenario.planning.prepBufferMinutes;
  if (requiredReturnMinutes > parseClock(scenario.planning.returnDeadline)) {
    throw new Error("마지막 일정에서 복귀 지점까지의 fixture 여유시간이 부족합니다.");
  }
  return true;
}

function parseErrorMessage(payload, status) {
  const raw = payload && typeof payload === "object" ? payload.message : undefined;
  if (Array.isArray(raw)) return raw.join(" ");
  if (typeof raw === "string") return raw;
  if (typeof payload === "string" && payload.trim()) return payload;
  return `API 요청에 실패했습니다. (${status})`;
}

function createHttpClient(baseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return {
    async request(path, { method = "GET", body, token, timeoutMs = 30_000 } = {}) {
      const headers = new Headers({ Accept: "application/json" });
      if (body !== undefined) headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      let response;
      try {
        response = await fetch(`${normalizedBaseUrl}/${path.replace(/^\/+/, "")}`, {
          method,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        throw new Error(`API 서버에 연결하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
      }
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        payload = text;
      }
      if (!response.ok) throw new FixtureHttpError(parseErrorMessage(payload, response.status), response.status, payload);
      return payload;
    },
  };
}

function assertAuthResponse(response, email) {
  if (!response?.accessToken || !response?.refreshToken || !response?.user?.id) {
    throw new Error(`${email} 로그인 응답에 accessToken, refreshToken 또는 user.id가 없습니다.`);
  }
  return response;
}

async function signInOrCreate(client, account, password) {
  try {
    const response = await client.request("auth/login", {
      method: "POST",
      body: { email: account.email, password },
    });
    return { ...assertAuthResponse(response, account.email), created: false };
  } catch (error) {
    if (!(error instanceof FixtureHttpError) || error.status !== 401) throw error;
  }

  try {
    const response = await client.request("auth/signup", {
      method: "POST",
      body: { nickname: account.nickname, email: account.email, password },
    });
    return { ...assertAuthResponse(response, account.email), created: true };
  } catch (error) {
    if (error instanceof FixtureHttpError && error.status === 409) {
      throw new Error(`${account.email} 계정은 존재하지만 지정한 fixture 비밀번호로 로그인할 수 없습니다.`);
    }
    throw error;
  }
}

async function releaseFixtureSessions(client, authentications) {
  const sessions = [...new Map(authentications
    .filter((auth) => auth?.accessToken && auth?.refreshToken)
    .map((auth) => [auth.refreshToken, auth])).values()];
  const results = await Promise.allSettled(sessions.map((auth) => client.request("auth/logout", {
    method: "POST",
    token: auth.accessToken,
    body: { refreshToken: auth.refreshToken },
  })));
  const failures = results.filter((result) => result.status === "rejected").length;
  if (failures > 0) {
    console.warn(`fixture 검증용 로그인 ${failures}개를 정리하지 못했습니다. 다음 실행 전에 서버 상태를 확인하세요.`);
  }
}

async function seedPersona(client, account, auth) {
  await client.request("users/me/profile", {
    method: "PATCH",
    token: auth.accessToken,
    body: { nickname: account.nickname },
  });
  await client.request("onboarding/survey", {
    method: "POST",
    token: auth.accessToken,
    body: account.onboarding,
  });
  const status = await client.request("quiz/status", { token: auth.accessToken });
  if (!status?.completed) {
    const session = await client.request("quiz/sessions", { method: "POST", token: auth.accessToken });
    if (!session?.id) throw new Error(`${account.nickname}의 성향 테스트 세션 id가 없습니다.`);
    await client.request(`quiz/sessions/${encodeURIComponent(session.id)}/complete`, {
      method: "POST",
      token: auth.accessToken,
      body: { responses: buildFixtureQuizResponses(account) },
    });
  }
  const [verifiedStatus, verifiedProfile] = await Promise.all([
    client.request("quiz/status", { token: auth.accessToken }),
    client.request("quiz/me", { token: auth.accessToken }),
  ]);
  if (!verifiedStatus?.completed || !verifiedProfile?.completed || !verifiedProfile?.travelType?.name) {
    throw new Error(`${account.nickname}의 서버 성향 완료 상태와 최신 결과가 일치하지 않습니다.`);
  }
  return verifiedProfile;
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

async function preflightTourPlaces(client) {
  return mapWithConcurrency(BUSAN_PLACE_SPECS, 3, async (spec) => {
    const query = new URLSearchParams({ keyword: spec.query, page: "1", size: "20" });
    const response = await client.request(`tour/places/search?${query.toString()}`, { timeoutMs: 45_000 });
    return chooseTourPlace(spec, response?.data);
  });
}

async function findFixtureRoom(client, ownerAuth, roomTitle, explicitRoomId) {
  if (explicitRoomId) {
    const room = await client.request(`rooms/${encodeURIComponent(explicitRoomId)}`, { token: ownerAuth.accessToken });
    if (room?.createdBy !== ownerAuth.user.id) {
      throw new Error("DURI_FIXTURE_ROOM_ID는 fixture owner가 소유한 여행방이어야 합니다.");
    }
    return room;
  }
  const rooms = await client.request("rooms/me", { token: ownerAuth.accessToken });
  const matches = (Array.isArray(rooms) ? rooms : []).filter((room) => room?.title === roomTitle);
  if (matches.length > 1) {
    throw new Error(`동일 제목의 여행방이 ${matches.length}개입니다. DURI_FIXTURE_ROOM_ID로 대상을 명시하세요.`);
  }
  if (matches.length === 0) return null;
  const room = await client.request(`rooms/${encodeURIComponent(matches[0].id)}`, { token: ownerAuth.accessToken });
  if (room?.createdBy !== ownerAuth.user.id) throw new Error("기존 fixture 여행방의 소유자가 현재 계정과 다릅니다.");
  return room;
}

function normalizedScheduleCore(days) {
  return (Array.isArray(days) ? days : [])
    .map((day) => ({
      day: Number(day?.day),
      items: (Array.isArray(day?.items) ? day.items : []).map((item) => ({
        id: String(item?.id ?? ""),
        placeId: item?.placeId == null ? null : String(item.placeId),
        placeName: String(item?.placeName ?? ""),
        startTime: String(item?.startTime ?? ""),
        endTime: String(item?.endTime ?? ""),
        tags: Array.isArray(item?.tags) ? item.tags.map(String) : [],
        reason: String(item?.reason ?? ""),
        priority: String(item?.priority ?? "optional"),
        day: Number(item?.day ?? day?.day),
        date: item?.date == null ? null : String(item.date),
        lat: item?.lat == null ? null : Number(item.lat),
        lng: item?.lng == null ? null : Number(item.lng),
      })),
    }))
    .sort((left, right) => left.day - right.day);
}

export function areScheduleCoresEqual(left, right) {
  return JSON.stringify(normalizedScheduleCore(left)) === JSON.stringify(normalizedScheduleCore(right));
}

export function assertStressScenarioMutationAllowed(currentDays, desiredDays, allowReplace) {
  assertExistingScheduleIsReplaceable(currentDays, allowReplace);
  if (areScheduleCoresEqual(currentDays, desiredDays)) return { changed: false, existingItemCount: currentDays.flatMap((day) => day.items ?? []).length };
  const existingItems = currentDays.flatMap((day) => day.items ?? []);
  if (existingItems.length > 0 && !allowReplace) {
    throw new Error(
      "기존 fixture 일정과 seed 결과가 다릅니다. 새 제목/이메일 prefix를 사용하거나 의도한 경우 DURI_FIXTURE_REPLACE_SCHEDULE=1을 설정하세요.",
    );
  }
  return { changed: true, existingItemCount: existingItems.length };
}

function versionedValue(payload) {
  return payload && typeof payload === "object" && "value" in payload ? payload.value : payload;
}

export function planningMatches(current, desired) {
  const anchorMatches = (left, right) => (
    String(left?.name ?? "") === String(right?.name ?? "")
    && Number(left?.lat) === Number(right?.lat)
    && Number(left?.lng) === Number(right?.lng)
    && String(left?.source ?? "") === String(right?.source ?? "")
  );
  const confirmed = ["transportMode", "returnDeadline", "travelBufferMinutes", "prepBufferMinutes"]
    .every((key) => current?.[key]?.confirmedAt);
  return current?.timezone === desired.timezone
    && anchorMatches(current?.lodging, desired.lodging)
    && anchorMatches(current?.returnPoint, desired.returnPoint)
    && versionedValue(current?.transportMode) === desired.transportMode
    && versionedValue(current?.returnDeadline) === desired.returnDeadline
    && Number(versionedValue(current?.travelBufferMinutes)) === desired.travelBufferMinutes
    && Number(versionedValue(current?.prepBufferMinutes)) === desired.prepBufferMinutes
    && confirmed;
}

function reservationMatches(current, desired) {
  if (!current) return false;
  const keys = [
    "status", "date", "startTime", "endTime", "timeWindowStart", "timeWindowEnd",
    "timezone", "placeId", "externalId", "confirmationCode", "note",
  ];
  return keys.every((key) => (current?.[key] ?? null) === (desired?.[key] ?? null))
    && JSON.stringify(current?.documentTicketIds ?? []) === JSON.stringify(desired?.documentTicketIds ?? []);
}

function readScheduleVersion(payload) {
  return Number.isInteger(payload?.scheduleVersion) ? payload.scheduleVersion : 0;
}

async function unlockFixtureSchedule(client, roomId, token, schedulePayload, mutationPrefix) {
  let scheduleVersion = readScheduleVersion(schedulePayload);
  for (const item of readScheduleDays(schedulePayload).flatMap((day) => day.items ?? []).filter((entry) => entry?.locked)) {
    const response = await client.request(
      `rooms/${encodeURIComponent(roomId)}/schedule/items/${encodeURIComponent(item.id)}/lock`,
      {
        method: "PATCH",
        token,
        body: {
          locked: false,
          expectedVersion: scheduleVersion,
          clientMutationId: `${mutationPrefix}:unlock:${item.id}`.slice(0, 100),
        },
      },
    );
    scheduleVersion = readScheduleVersion(response);
  }
  return client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token });
}

async function applyStressCandidateSignals(client, roomId, authentications, resolvedPlaces, scenario) {
  const preferences = await client.request(`rooms/${encodeURIComponent(roomId)}/preferences`, {
    token: authentications[0].auth.accessToken,
  });
  const existing = new Map();
  for (const candidate of Array.isArray(preferences?.candidateSignals) ? preferences.candidateSignals : []) {
    for (const signal of Array.isArray(candidate?.signals) ? candidate.signals : []) {
      existing.set(`${candidate.placeId}:${signal.userId}`, signal);
    }
  }
  const authByKey = new Map(authentications.map((entry) => [entry.account.key, entry]));
  const placeByExternalId = new Map(resolvedPlaces.map((place) => [String(place.externalId), place]));
  let writeCount = 0;
  let retryCount = 0;
  const matches = (current, desired) => (
    current?.mustVisit === desired.mustVisit
    && current?.avoid === desired.avoid
    && current?.preferenceStrength === desired.preferenceStrength
  );
  for (const entry of scenario.candidateSignals) {
    const authEntry = authByKey.get(entry.personaKey);
    const place = placeByExternalId.get(entry.externalId);
    if (!authEntry?.auth?.user?.id || !place?.placeId) {
      throw new Error(`후보 신호 연결 정보를 찾지 못했습니다: ${entry.personaKey}/${entry.placeKey}`);
    }
    const current = existing.get(`${place.placeId}:${authEntry.auth.user.id}`);
    if (matches(current, entry.signal)) continue;
    let response = await client.request(
      `rooms/${encodeURIComponent(roomId)}/candidates/${encodeURIComponent(place.placeId)}/signals`,
      { method: "PUT", token: authEntry.auth.accessToken, body: entry.signal },
    );
    writeCount += 1;
    // Current Backend casts a newly pushed Mongoose subdocument before the
    // following field assignments reach the stored instance. Its response can
    // look correct while MongoDB keeps version=0/null values. A previously
    // absent signal therefore gets exactly one bounded confirmation write.
    if (!current || !matches(response?.signal, entry.signal)) {
      response = await client.request(
        `rooms/${encodeURIComponent(roomId)}/candidates/${encodeURIComponent(place.placeId)}/signals`,
        { method: "PUT", token: authEntry.auth.accessToken, body: entry.signal },
      );
      retryCount += 1;
    }
    if (!matches(response?.signal, entry.signal)) {
      throw new Error(`후보 신호를 두 번 저장했지만 확정되지 않았습니다: ${entry.personaKey}/${entry.placeKey}`);
    }
  }
  return { writeCount, retryCount };
}

async function ensureStressPlanning(client, roomId, ownerToken, planning) {
  const current = await client.request(`rooms/${encodeURIComponent(roomId)}/planning`, { token: ownerToken });
  if (planningMatches(current, planning)) return { planning: current, changed: false };
  const updated = await client.request(`rooms/${encodeURIComponent(roomId)}/planning`, {
    method: "PATCH",
    token: ownerToken,
    body: planning,
  });
  if (!planningMatches(updated, planning)) throw new Error("planning 저장 후 확정값이 기대와 일치하지 않습니다.");
  return { planning: updated, changed: true };
}

async function ensureStressReservationsAndLocks(client, roomId, ownerToken, scenario) {
  let schedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerToken });
  let scheduleVersion = readScheduleVersion(schedule);
  const reservationByItemKey = new Map();
  for (const desired of scenario.reservations) {
    const currentItem = readScheduleDays(schedule)
      .flatMap((day) => day.items ?? [])
      .find((item) => item?.id === desired.itemId);
    if (!currentItem) throw new Error(`예약 대상 일정이 서버에 없습니다: ${desired.itemId}`);
    if (reservationMatches(currentItem.reservation, desired.body)) {
      reservationByItemKey.set(desired.itemKey, currentItem.reservation);
      continue;
    }
    const response = await client.request(
      `rooms/${encodeURIComponent(roomId)}/schedule/items/${encodeURIComponent(desired.itemId)}/reservation`,
      {
        method: "PUT",
        token: ownerToken,
        body: {
          ...desired.body,
          expectedVersion: scheduleVersion,
          clientMutationId: `fixture:${scenario.seedTag}:reservation:${desired.itemKey}`,
        },
      },
    );
    scheduleVersion = readScheduleVersion(response);
    reservationByItemKey.set(desired.itemKey, response?.reservation);
    schedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerToken });
  }
  schedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerToken });
  scheduleVersion = readScheduleVersion(schedule);
  for (const itemId of scenario.lockItemIds) {
    const currentItem = readScheduleDays(schedule).flatMap((day) => day.items ?? []).find((item) => item?.id === itemId);
    if (!currentItem) throw new Error(`잠금 대상 일정이 서버에 없습니다: ${itemId}`);
    if (currentItem.locked) continue;
    const response = await client.request(
      `rooms/${encodeURIComponent(roomId)}/schedule/items/${encodeURIComponent(itemId)}/lock`,
      {
        method: "PATCH",
        token: ownerToken,
        body: {
          locked: true,
          expectedVersion: scheduleVersion,
          clientMutationId: `fixture:${scenario.seedTag}:lock:${itemId}`.slice(0, 100),
        },
      },
    );
    scheduleVersion = readScheduleVersion(response);
    schedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerToken });
  }
  return { schedule, reservationByItemKey };
}

async function ensureStressTodos(client, roomId, authentications, scenario, reservationByItemKey) {
  const ownerToken = authentications[0].auth.accessToken;
  const authByKey = new Map(authentications.map((entry) => [entry.account.key, entry.auth]));
  const itemIdByKey = new Map(
    scenario.scheduleDays.flatMap((day) => day.items).map((item) => [item.id.slice(STRESS_FIXTURE_ITEM_PREFIX.length), item.id]),
  );
  for (const template of scenario.todos) {
    const assignee = authByKey.get(template.assigneeKey);
    const itemId = itemIdByKey.get(template.itemKey);
    if (!assignee?.user?.id || !itemId) throw new Error(`TODO 연결 정보를 찾지 못했습니다: ${template.key}`);
    const links = [{ type: "scheduleItem", targetId: itemId }];
    if (template.reservationItemKey) {
      const reservation = reservationByItemKey.get(template.reservationItemKey);
      if (!reservation?.id) throw new Error(`TODO 예약 연결 id가 없습니다: ${template.key}`);
      links.push({ type: "reservation", targetId: reservation.id, scheduleItemId: itemId });
    }
    let todo = await client.request(`rooms/${encodeURIComponent(roomId)}/todos`, {
      method: "POST",
      token: ownerToken,
      body: {
        title: template.title,
        description: template.description,
        status: "open",
        priority: template.priority,
        dueDate: template.dueDate,
        dueTime: template.dueTime,
        timezone: "Asia/Seoul",
        assigneeId: assignee.user.id,
        checklist: template.checklist.map((title, index) => ({
          id: `fixture-${scenario.seedTag}-${template.key}-${index}`.slice(0, 100),
          title,
          done: false,
        })),
        links,
        source: {
          kind: "manual",
          dedupeKey: `fixture:${scenario.seedTag}:todo:${template.key}`,
          cause: "fixture_realistic_preparation",
          baseRevision: scenario.seedTag,
        },
        clientMutationId: `fixture:${scenario.seedTag}:todo-create:${template.key}`,
      },
    });
    if (template.promoteToInProgress && todo?.status !== "in_progress") {
      todo = await client.request(`rooms/${encodeURIComponent(roomId)}/todos/${encodeURIComponent(todo.id)}`, {
        method: "PATCH",
        token: ownerToken,
        body: {
          status: "in_progress",
          expectedRevision: todo.revision,
          clientMutationId: `fixture:${scenario.seedTag}:todo-progress:${template.key}`,
        },
      });
    }
    if (!Number.isInteger(todo?.revision) || todo.revision < 1) {
      throw new Error(`TODO revision을 확인하지 못했습니다: ${template.key}`);
    }
  }

  const auto = scenario.resolvedAutoTodo;
  const autoAssignee = authByKey.get(auto.assigneeKey);
  if (!autoAssignee?.user?.id) throw new Error(`자동 TODO 담당자를 찾지 못했습니다: ${auto.assigneeKey}`);
  const dedupeKey = `fixture:${scenario.seedTag}:auto:${auto.key}`;
  await client.request(`rooms/${encodeURIComponent(roomId)}/todos`, {
    method: "POST",
    token: ownerToken,
    body: {
      title: auto.title,
      description: auto.description,
      status: "open",
      priority: auto.priority,
      dueDate: auto.dueDate,
      dueTime: auto.dueTime,
      timezone: "Asia/Seoul",
      assigneeId: autoAssignee.user.id,
      source: { kind: "scheduleChange", dedupeKey, cause: "planning_missing", baseRevision: scenario.seedTag },
      clientMutationId: `fixture:${scenario.seedTag}:auto-create:${auto.key}`,
    },
  });
  await client.request(`rooms/${encodeURIComponent(roomId)}/todos/resolve-auto`, {
    method: "POST",
    token: ownerToken,
    body: { dedupeKey },
  });
  return client.request(`rooms/${encodeURIComponent(roomId)}/todos?archived=all&limit=100`, { token: ownerToken });
}

function accountEmail(prefix, key) {
  return `${prefix}-${key}@example.com`;
}

function readConfig() {
  loadLocalEnvironment();
  const cliStress = process.argv.includes("--stress");
  const mode = cliStress ? "stress" : (process.env.DURI_FIXTURE_MODE?.trim().toLowerCase() || "baseline");
  if (!['baseline', 'stress'].includes(mode)) {
    throw new Error("DURI_FIXTURE_MODE는 baseline 또는 stress여야 합니다.");
  }
  const seed = process.env.DURI_FIXTURE_SEED?.trim() || "busan-draft-v3";
  if (seed.length > 80) throw new Error("DURI_FIXTURE_SEED는 80자 이하여야 합니다.");
  const seedTag = stableSeedTag(seed);
  const defaults = getDefaultTripDates();
  const baseUrl = (process.env.DURI_FIXTURE_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1").replace(/\/+$/, "");
  const localTarget = isLocalApiBaseUrl(baseUrl);
  const allowCuratedPlaces = process.env.DURI_FIXTURE_ALLOW_CURATED_PLACES === "1";
  assertCuratedFallbackAllowed(allowCuratedPlaces, localTarget);
  const allowRemote = process.env.DURI_FIXTURE_ALLOW_REMOTE === "BUSAN_API_FIXTURE";
  if (!localTarget && !allowRemote) {
    throw new Error("원격 서버 시드는 기본 차단됩니다. 의도한 경우 DURI_FIXTURE_ALLOW_REMOTE=BUSAN_API_FIXTURE를 명시하세요.");
  }
  const password = process.env.DURI_FIXTURE_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("DURI_FIXTURE_PASSWORD에 12자 이상의 fixture 전용 비밀번호를 설정하세요.");
  }
  const explicitPrefix = process.env.DURI_FIXTURE_EMAIL_PREFIX?.trim();
  if (!localTarget && !explicitPrefix) {
    throw new Error("원격 서버에는 충돌 방지를 위해 DURI_FIXTURE_EMAIL_PREFIX를 반드시 지정해야 합니다.");
  }
  const emailPrefix = explicitPrefix || (mode === "stress" ? `duri-busan-stress-${seedTag}` : "duri-busan-fixture");
  if (!/^[a-z0-9][a-z0-9._-]{2,40}$/i.test(emailPrefix)) {
    throw new Error("DURI_FIXTURE_EMAIL_PREFIX는 영문/숫자/점/밑줄/하이픈 3~41자로 설정하세요.");
  }
  const startDate = process.env.DURI_FIXTURE_START_DATE ?? defaults.startDate;
  const endDate = process.env.DURI_FIXTURE_END_DATE ?? defaults.endDate;
  const transportMode = process.env.DURI_FIXTURE_TRANSPORT_MODE?.trim().toLowerCase() || "mixed";
  if (!["car", "transit", "walk", "mixed"].includes(transportMode)) {
    throw new Error("DURI_FIXTURE_TRANSPORT_MODE는 car, transit, walk, mixed 중 하나여야 합니다.");
  }
  validateThreeDayRange(startDate, endDate);
  return {
    mode,
    seed,
    seedTag,
    baseUrl,
    password,
    startDate,
    endDate,
    transportMode,
    roomTitle: process.env.DURI_FIXTURE_ROOM_TITLE?.trim()
      || (mode === "stress" ? `${STRESS_ROOM_TITLE_PREFIX} · ${seedTag}` : DEFAULT_ROOM_TITLE),
    explicitRoomId: process.env.DURI_FIXTURE_ROOM_ID?.trim() || undefined,
    allowReplaceSchedule: process.env.DURI_FIXTURE_REPLACE_SCHEDULE === "1",
    allowCuratedPlaces,
    accounts: (mode === "stress" ? STRESS_PERSONAS : PERSONAS)
      .map((persona) => ({ ...persona, email: accountEmail(emailPrefix, persona.key) })),
  };
}

function printHelp() {
  console.log(`부산 API 여행방 시드\n\n필수:\n  DURI_FIXTURE_PASSWORD             12자 이상 fixture 전용 비밀번호\n\n선택:\n  DURI_FIXTURE_MODE                 baseline | stress (또는 --stress)\n  DURI_FIXTURE_SEED                 stress 결과 재현 seed (기본 busan-draft-v3)\n  DURI_FIXTURE_API_BASE_URL         기본 EXPO_PUBLIC_API_BASE_URL 또는 localhost\n  DURI_FIXTURE_EMAIL_PREFIX         fixture 계정 prefix (원격에서는 필수)\n  DURI_FIXTURE_START_DATE           YYYY-MM-DD\n  DURI_FIXTURE_END_DATE             시작일 + 2일\n  DURI_FIXTURE_TRANSPORT_MODE       car | transit | walk | mixed (stress 기본 mixed)\n  DURI_FIXTURE_ROOM_ID              기존 방을 정확히 지정\n  DURI_FIXTURE_REPLACE_SCHEDULE     다른 seed의 fixture 일정을 교체할 때만 1\n  DURI_FIXTURE_ALLOW_REMOTE         원격에서 BUSAN_API_FIXTURE를 명시\n  DURI_FIXTURE_ALLOW_CURATED_PLACES localhost baseline에서 TourAPI 실패 시 수동 일정 fallback 허용\n\n기존 deterministic baseline:\n  $env:DURI_FIXTURE_PASSWORD='12자-이상-전용-비밀번호'\n  npm.cmd run seed:busan-api-room\n\n재현 가능한 현실 조율 stress:\n  $env:DURI_FIXTURE_PASSWORD='12자-이상-전용-비밀번호'\n  $env:DURI_FIXTURE_SEED='team-conflict-001'\n  npm.cmd run seed:busan-api-room:stress\n\n같은 seed는 같은 계정·방·일정을 재사용하고, 다른 seed는 별도 계정 prefix와 방 제목을 만듭니다.\n`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const config = readConfig();
  const client = createHttpClient(config.baseUrl);
  const stress = config.mode === "stress";
  const totalSteps = stress ? 10 : 7;
  const step = (number, message) => console.log(`${number}/${totalSteps} ${message}`);
  const sessionsToRelease = [];

  try {

  step(1, "TourAPI 부산 장소를 검증합니다...");
  let tourPlaces;
  let placeMode = "tour-api";
  try {
    tourPlaces = await preflightTourPlaces(client);
  } catch (error) {
    if (!config.allowCuratedPlaces) throw error;
    if (stress) {
      throw new Error(
        `stress 모드는 서버 placeId·후보 신호가 필요해 curated fallback을 사용할 수 없습니다. 원인: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    placeMode = "curated-local-schedule";
    tourPlaces = CURATED_BUSAN_PLACES;
    console.warn(
      "TourAPI를 사용할 수 없어 명시적으로 허용된 localhost curated fallback을 사용합니다. " +
      "장소/후보 컬렉션은 만들지 않고 이름·주소·좌표가 포함된 수동 일정만 저장합니다.",
    );
  }

  step(2, "fixture owner 인증과 기존 방 보호 검사를 수행합니다...");
  const ownerAccount = config.accounts[0];
  const ownerAuth = await signInOrCreate(client, ownerAccount, config.password);
  sessionsToRelease.push(ownerAuth);
  let room = await findFixtureRoom(client, ownerAuth, config.roomTitle, config.explicitRoomId);
  if (room) {
    const existingSchedule = await client.request(`rooms/${encodeURIComponent(room.id)}/schedule`, { token: ownerAuth.accessToken });
    const existingDays = readScheduleDays(existingSchedule);
    const existing = assertExistingScheduleIsReplaceable(existingDays, config.allowReplaceSchedule);
    const currentStartDate = String(room.startDate ?? "").slice(0, 10);
    const currentEndDate = String(room.endDate ?? "").slice(0, 10);
    if (
      stress
      && existing.itemCount > 0
      && (currentStartDate !== config.startDate || currentEndDate !== config.endDate)
    ) {
      throw new Error(
        "기존 stress 방의 여행 날짜가 다릅니다. 날짜-일정 원자성을 지키기 위해 기존 방을 바꾸지 않으므로 새 seed/방을 사용하세요.",
      );
    }
  }

  step(3, `실제 사용자 ${config.accounts.length}명과 서로 충돌하는 여행 성향을 준비합니다...`);
  const authentications = [];
  for (const account of config.accounts) {
    const auth = account.key === "owner" ? ownerAuth : await signInOrCreate(client, account, config.password);
    if (account.key !== "owner") sessionsToRelease.push(auth);
    const quizProfile = await seedPersona(client, account, auth);
    authentications.push({ account, auth, quizProfile });
  }

  if (!room) {
    room = await client.request("rooms", {
      method: "POST",
      token: ownerAuth.accessToken,
      body: { title: config.roomTitle },
    });
  }
  if (!room?.id) throw new Error("여행방 생성/조회 응답에 room id가 없습니다.");
  const roomId = room.id;

  step(4, "여행방 날짜·부산 목적지·일정 스타일을 저장합니다...");
  await client.request(`rooms/${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    token: ownerAuth.accessToken,
    body: { title: config.roomTitle, startDate: config.startDate, endDate: config.endDate, status: "ongoing" },
  });
  await client.request(`rooms/${encodeURIComponent(roomId)}/destination`, {
    method: "PATCH",
    token: ownerAuth.accessToken,
    body: { name: "부산", regionCode: "BUSAN", lat: 35.1796, lng: 129.0756 },
  });
  await client.request(`rooms/${encodeURIComponent(roomId)}/schedule-style`, {
    method: "PATCH",
    token: ownerAuth.accessToken,
    body: { style: "jType" },
  });

  step(5, "실제 초대 코드로 동행자 계정을 참여시킵니다...");
  const invite = await client.request(`rooms/${encodeURIComponent(roomId)}/invite-link`, { token: ownerAuth.accessToken });
  if (!invite?.inviteCode) throw new Error("초대 링크 응답에 inviteCode가 없습니다.");
  for (const { auth } of authentications.filter(({ account }) => account.key !== "owner")) {
    await client.request(`invites/${encodeURIComponent(invite.inviteCode)}/accept`, {
      method: "POST",
      token: auth.accessToken,
    });
  }

  let candidates = [];
  let scheduleDays;
  let resolvedPlaces = [];
  let scenario;
  if (placeMode === "tour-api") {
    step(6, "TourAPI 장소를 멤버별 후보로 추가하고 서버 placeId를 확정합니다...");
    for (const { account, auth } of authentications) {
      for (const spec of BUSAN_PLACE_SPECS.filter((place) => place.supporters.includes(account.key))) {
        const tourPlace = tourPlaces.find((place) => String(place.externalId) === spec.externalId);
        await client.request(`rooms/${encodeURIComponent(roomId)}/candidates`, {
          method: "POST",
          token: auth.accessToken,
          body: {
            tourContentId: spec.externalId,
            contentTypeId: tourPlace.contentTypeId,
            note: `${account.nickname} 선택 · DAY ${spec.day}`,
          },
          timeoutMs: 45_000,
        });
      }
    }
    candidates = await client.request(`rooms/${encodeURIComponent(roomId)}/candidates`, { token: ownerAuth.accessToken });
    resolvedPlaces = BUSAN_PLACE_SPECS.map((spec) => {
      const candidate = (Array.isArray(candidates) ? candidates : []).find(
        (entry) => String(entry?.place?.externalId ?? "") === spec.externalId && entry?.placeId,
      );
      if (!candidate?.place) throw new Error(`후보 목록에서 '${spec.query}'를 확인하지 못했습니다.`);
      return { ...candidate.place, placeId: candidate.placeId };
    });
    if (stress) {
      scenario = buildStressScenario(resolvedPlaces, {
        seed: config.seed,
        startDate: config.startDate,
        transportMode: config.transportMode,
      });
      scheduleDays = scenario.scheduleDays;
    } else {
      scheduleDays = buildScheduleDays(resolvedPlaces);
    }
  } else {
    step(6, "curated 부산 장소를 서버 placeId 없는 수동 일정으로 준비합니다...");
    scheduleDays = buildCuratedScheduleDays();
  }

  let currentSchedule;
  let stressScheduleMutation;
  if (stress) {
    currentSchedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerAuth.accessToken });
    stressScheduleMutation = assertStressScenarioMutationAllowed(
      readScheduleDays(currentSchedule),
      scheduleDays,
      config.allowReplaceSchedule,
    );
  }

  if (stress) {
    step(7, "참여자별 must/avoid/선호 강도를 후보 API에 저장합니다...");
    const signalWrites = await applyStressCandidateSignals(
      client,
      roomId,
      authentications,
      resolvedPlaces,
      scenario,
    );
    console.log(
      `  후보 신호 ${scenario.candidateSignals.length}개 확인 / 실제 변경 ${signalWrites.writeCount}개`
      + (signalWrites.retryCount > 0 ? ` / Backend 신규 subdocument 보정 재시도 ${signalWrites.retryCount}회` : ""),
    );
  }

  step(stress ? 8 : 7, "scheduleVersion을 사용해 실제 일정 API에 저장하고 재조회합니다...");
  currentSchedule ??= await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerAuth.accessToken });
  let savedSchedule;
  if (stress) {
    const mutation = stressScheduleMutation;
    if (mutation.changed) {
      if (readScheduleDays(currentSchedule).some((day) => (day.items ?? []).some((item) => item?.locked))) {
        currentSchedule = await unlockFixtureSchedule(
          client,
          roomId,
          ownerAuth.accessToken,
          currentSchedule,
          `fixture:${config.seedTag}`,
        );
      }
      savedSchedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, {
        method: "PUT",
        token: ownerAuth.accessToken,
        body: {
          days: scheduleDays,
          expectedVersion: readScheduleVersion(currentSchedule),
          clientMutationId: `fixture:${config.seedTag}:schedule-v2`,
        },
      });
    } else {
      savedSchedule = currentSchedule;
      console.log("  같은 seed의 일정이 이미 있어 scheduleVersion 쓰기를 생략했습니다.");
    }
  } else {
    assertExistingScheduleIsReplaceable(readScheduleDays(currentSchedule), config.allowReplaceSchedule);
    savedSchedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, {
      method: "PUT",
      token: ownerAuth.accessToken,
      body: {
        days: scheduleDays,
        expectedVersion: readScheduleVersion(currentSchedule),
      },
    });
  }

  let stressTodoPayload;
  let stressPlanning;
  if (stress) {
    step(9, "확정 planning·예약·사용자 잠금을 조건부 버전으로 연결합니다...");
    stressPlanning = await ensureStressPlanning(client, roomId, ownerAuth.accessToken, scenario.planning);
    const reservationAndLocks = await ensureStressReservationsAndLocks(
      client,
      roomId,
      ownerAuth.accessToken,
      scenario,
    );
    step(10, "공유 TODO와 resolve-auto 흐름을 revision 안전하게 준비합니다...");
    stressTodoPayload = await ensureStressTodos(
      client,
      roomId,
      authentications,
      scenario,
      reservationAndLocks.reservationByItemKey,
    );
  }

  const [verifiedRoom, verifiedWorkspace, compatibility, finalSchedule, finalPreferences, finalPlanning, finalQuizProfiles] = await Promise.all([
    client.request(`rooms/${encodeURIComponent(roomId)}`, { token: ownerAuth.accessToken }),
    client.request(`rooms/${encodeURIComponent(roomId)}/workspace`, { token: ownerAuth.accessToken }),
    client.request(`rooms/${encodeURIComponent(roomId)}/compatibility`, { token: ownerAuth.accessToken }),
    client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerAuth.accessToken }),
    stress ? client.request(`rooms/${encodeURIComponent(roomId)}/preferences`, { token: ownerAuth.accessToken }) : null,
    stress ? client.request(`rooms/${encodeURIComponent(roomId)}/planning`, { token: ownerAuth.accessToken }) : null,
    Promise.all(authentications.map(async ({ account, auth }) => {
      const [status, profile] = await Promise.all([
        client.request("quiz/status", { token: auth.accessToken }),
        client.request("quiz/me", { token: auth.accessToken }),
      ]);
      return { account, status, profile };
    })),
  ]);
  const savedScheduleDays = readScheduleDays(finalSchedule ?? savedSchedule);
  const scheduleItemCount = savedScheduleDays.reduce((sum, day) => sum + (day?.items?.length ?? 0), 0);
  const expectedScheduleItemCount = scheduleDays.flatMap((day) => day.items ?? []).length;
  if (verifiedRoom?.members?.length !== config.accounts.length || scheduleItemCount !== expectedScheduleItemCount) {
    throw new Error("시드 후 검증에서 멤버 수 또는 일정 수가 일치하지 않습니다.");
  }
  if (verifiedRoom.members.some((member) => !member?.travelTypeSnapshot)) {
    throw new Error(
      "멤버의 travelTypeSnapshot이 비어 있습니다. 기존 방의 스냅샷은 API로 갱신할 수 없으므로 새 DURI_FIXTURE_ROOM_TITLE로 다시 시드하세요.",
    );
  }
  const invalidQuizProfiles = finalQuizProfiles.filter(({ status, profile }) => (
    !status?.completed || !profile?.completed || !profile?.travelType?.name || !profile?.axes
  ));
  if (invalidQuizProfiles.length > 0) {
    throw new Error(`시드 후 서버 성향 결과가 불완전한 계정: ${invalidQuizProfiles.map(({ account }) => account.email).join(", ")}`);
  }
  if (placeMode === "tour-api" && (verifiedWorkspace?.candidates?.length ?? 0) < BUSAN_PLACE_SPECS.length) {
    throw new Error("시드 후 Workspace 후보 수가 기대보다 적습니다.");
  }
  if (placeMode === "curated-local-schedule") {
    const savedItems = savedScheduleDays.flatMap((day) => day?.items ?? []);
    if (savedItems.some((item) => item?.placeId)) {
      throw new Error("curated fallback 일정에 존재하지 않는 서버 placeId가 포함되었습니다.");
    }
    if (savedItems.some((item) => !isBusanCoordinate(Number(item?.lat), Number(item?.lng)))) {
      throw new Error("curated fallback 일정의 부산 좌표를 재조회하지 못했습니다.");
    }
  }
  if (compatibility?.memberCount !== config.accounts.length || !Number.isFinite(compatibility?.compatibilityScore)) {
    throw new Error("실제 멤버 성향 기반 궁합 응답을 확인하지 못했습니다.");
  }
  if (stress) {
    if (!areScheduleCoresEqual(savedScheduleDays, scenario.scheduleDays)) {
      throw new Error("stress 일정 재조회 결과가 seed 시나리오와 일치하지 않습니다.");
    }
    const finalItems = savedScheduleDays.flatMap((day) => day.items ?? []);
    const lockedCount = scenario.lockItemIds.filter((id) => finalItems.find((item) => item.id === id)?.locked).length;
    const confirmedReservationCount = scenario.reservations.filter((desired) => {
      const item = finalItems.find((entry) => entry.id === desired.itemId);
      return reservationMatches(item?.reservation, desired.body) && item?.reservation?.status === "confirmed";
    }).length;
    if (lockedCount !== scenario.lockItemIds.length || confirmedReservationCount !== scenario.reservations.length) {
      throw new Error("stress 일정의 잠금 또는 확정 예약이 완전하게 저장되지 않았습니다.");
    }
    if (!planningMatches(finalPlanning, scenario.planning)) {
      throw new Error("stress planning 확정값을 재조회하지 못했습니다.");
    }
    const finalSignalMap = new Map();
    for (const candidate of Array.isArray(finalPreferences?.candidateSignals) ? finalPreferences.candidateSignals : []) {
      for (const signal of Array.isArray(candidate?.signals) ? candidate.signals : []) {
        finalSignalMap.set(`${candidate.placeId}:${signal.userId}`, signal);
      }
    }
    const authByKey = new Map(authentications.map((entry) => [entry.account.key, entry.auth]));
    const placeByExternalId = new Map(resolvedPlaces.map((place) => [String(place.externalId), place]));
    const mismatchedSignals = scenario.candidateSignals.filter((entry) => {
      const userId = authByKey.get(entry.personaKey)?.user?.id;
      const placeId = placeByExternalId.get(entry.externalId)?.placeId;
      const actual = finalSignalMap.get(`${placeId}:${userId}`);
      return actual?.mustVisit !== entry.signal.mustVisit
        || actual?.avoid !== entry.signal.avoid
        || actual?.preferenceStrength !== entry.signal.preferenceStrength;
    });
    if (mismatchedSignals.length > 0) {
      throw new Error(`후보 신호 ${mismatchedSignals.length}개가 seed 결과와 다릅니다.`);
    }
    const signalCount = scenario.candidateSignals.length;
    const fixtureTodos = (Array.isArray(stressTodoPayload?.data) ? stressTodoPayload.data : [])
      .filter((todo) => String(todo?.source?.dedupeKey ?? "").startsWith(`fixture:${scenario.seedTag}:`));
    if (fixtureTodos.length < scenario.todos.length + 1) {
      throw new Error("공유 TODO 또는 resolve-auto 검증 항목이 누락되었습니다.");
    }
    const resolved = fixtureTodos.find((todo) => todo?.source?.dedupeKey === `fixture:${scenario.seedTag}:auto:${scenario.resolvedAutoTodo.key}`);
    if (resolved?.status !== "done") throw new Error("resolve-auto TODO가 done으로 전환되지 않았습니다.");
    console.log(`planning: ${stressPlanning.changed ? "저장" : "기존 확정값 재사용"}`);
    console.log(`잠금 ${lockedCount}개 / 확정 예약 ${confirmedReservationCount}개 / 후보 신호 ${signalCount}개 / fixture TODO ${fixtureTodos.length}개`);
    console.log("티켓·문서: 실제 업로드 파일이 없으므로 가짜 파일/URL을 만들지 않았습니다.");
  }

  console.log("\n부산 API 여행방 시드가 완료되었습니다.");
  console.log(`roomId: ${roomId}`);
  console.log(`모드: ${config.mode}${stress ? ` / seed: ${config.seed} (${config.seedTag})` : ""}`);
  console.log(`기간: ${config.startDate} ~ ${config.endDate}`);
  console.log(`멤버: ${verifiedRoom.members.length}명 / 일정: ${scheduleItemCount}개`);
  console.log(`장소 모드: ${placeMode}`);
  console.log(`후보 투표 행: ${verifiedWorkspace.candidates.length}개`);
  if (placeMode === "curated-local-schedule") {
    console.log("제한: 이 방의 9개 장소는 실제 API 일정이지만 Mongo placeId/후보 투표와 연결되지 않은 수동 일정입니다.");
    console.log("제한: 주소는 schedule DTO에 전용 필드가 없어 각 일정의 reason 텍스트에 보존했습니다.");
  }
  console.log(`궁합 점수: ${compatibility?.compatibilityScore ?? "응답 없음"}`);
  console.log(`성향 결과: ${finalQuizProfiles.map(({ account, profile }) => `${account.nickname}=${profile.travelType.name}`).join(" / ")}`);
  console.log(`fixture 계정: ${config.accounts.map((account) => account.email).join(", ")}`);
  console.log("accessToken과 비밀번호는 출력하지 않았습니다.");
  } finally {
    // Backend는 계정당 최근 Refresh Token 수를 제한한다. 시드 반복 실행이
    // 앱에서 로그인한 fixture 계정의 세션을 밀어내지 않도록 즉시 정리한다.
    await releaseFixtureSessions(client, sessionsToRelease);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`\n부산 API 시드 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
