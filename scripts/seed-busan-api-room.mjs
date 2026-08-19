#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FIXTURE_ITEM_PREFIX = "fixture-busan-v1-";
export const DEFAULT_ROOM_TITLE = "[API DEMO] 부산 2박 3일";

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

export function assertExistingScheduleIsReplaceable(days, allowReplace) {
  const itemIds = (Array.isArray(days) ? days : [])
    .flatMap((day) => Array.isArray(day?.items) ? day.items : [])
    .map((item) => String(item?.id ?? ""))
    .filter(Boolean);
  const foreignIds = itemIds.filter((id) => !id.startsWith(FIXTURE_ITEM_PREFIX));
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
  if (!response?.accessToken || !response?.user?.id) {
    throw new Error(`${email} 로그인 응답에 accessToken 또는 user.id가 없습니다.`);
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
      body: { responses: account.quiz },
    });
  }
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

function accountEmail(prefix, key) {
  return `${prefix}-${key}@example.com`;
}

function readConfig() {
  loadLocalEnvironment();
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
  const emailPrefix = explicitPrefix || "duri-busan-fixture";
  if (!/^[a-z0-9][a-z0-9._-]{2,40}$/i.test(emailPrefix)) {
    throw new Error("DURI_FIXTURE_EMAIL_PREFIX는 영문/숫자/점/밑줄/하이픈 3~41자로 설정하세요.");
  }
  const startDate = process.env.DURI_FIXTURE_START_DATE ?? defaults.startDate;
  const endDate = process.env.DURI_FIXTURE_END_DATE ?? defaults.endDate;
  validateThreeDayRange(startDate, endDate);
  return {
    baseUrl,
    password,
    startDate,
    endDate,
    roomTitle: process.env.DURI_FIXTURE_ROOM_TITLE?.trim() || DEFAULT_ROOM_TITLE,
    explicitRoomId: process.env.DURI_FIXTURE_ROOM_ID?.trim() || undefined,
    allowReplaceSchedule: process.env.DURI_FIXTURE_REPLACE_SCHEDULE === "1",
    allowCuratedPlaces,
    accounts: PERSONAS.map((persona) => ({ ...persona, email: accountEmail(emailPrefix, persona.key) })),
  };
}

function printHelp() {
  console.log(`부산 API 여행방 시드\n\n필수:\n  DURI_FIXTURE_PASSWORD             12자 이상 fixture 전용 비밀번호\n\n선택:\n  DURI_FIXTURE_API_BASE_URL         기본 EXPO_PUBLIC_API_BASE_URL 또는 localhost\n  DURI_FIXTURE_EMAIL_PREFIX         fixture 계정 prefix (원격에서는 필수)\n  DURI_FIXTURE_START_DATE           YYYY-MM-DD\n  DURI_FIXTURE_END_DATE             시작일 + 2일\n  DURI_FIXTURE_ROOM_ID              기존 방을 정확히 지정\n  DURI_FIXTURE_REPLACE_SCHEDULE     기존 비-fixture 일정 교체 시에만 1\n  DURI_FIXTURE_ALLOW_REMOTE         원격에서 BUSAN_API_FIXTURE를 명시\n  DURI_FIXTURE_ALLOW_CURATED_PLACES localhost TourAPI 실패 시 수동 일정 fallback을 허용하려면 1\n\nPowerShell 예시:\n  $env:DURI_FIXTURE_PASSWORD='12자-이상-전용-비밀번호'\n  npm.cmd run seed:busan-api-room\n\nlocalhost TourAPI가 불가능할 때만:\n  $env:DURI_FIXTURE_ALLOW_CURATED_PLACES='1'\n  npm.cmd run seed:busan-api-room\n`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const config = readConfig();
  const client = createHttpClient(config.baseUrl);

  console.log("1/7 TourAPI 부산 장소를 검증합니다...");
  let tourPlaces;
  let placeMode = "tour-api";
  try {
    tourPlaces = await preflightTourPlaces(client);
  } catch (error) {
    if (!config.allowCuratedPlaces) throw error;
    placeMode = "curated-local-schedule";
    tourPlaces = CURATED_BUSAN_PLACES;
    console.warn(
      "TourAPI를 사용할 수 없어 명시적으로 허용된 localhost curated fallback을 사용합니다. " +
      "장소/후보 컬렉션은 만들지 않고 이름·주소·좌표가 포함된 수동 일정만 저장합니다.",
    );
  }

  console.log("2/7 fixture owner 인증과 기존 방 보호 검사를 수행합니다...");
  const ownerAccount = config.accounts[0];
  const ownerAuth = await signInOrCreate(client, ownerAccount, config.password);
  let room = await findFixtureRoom(client, ownerAuth, config.roomTitle, config.explicitRoomId);
  if (room) {
    const existingSchedule = await client.request(`rooms/${encodeURIComponent(room.id)}/schedule`, { token: ownerAuth.accessToken });
    assertExistingScheduleIsReplaceable(readScheduleDays(existingSchedule), config.allowReplaceSchedule);
  }

  console.log("3/7 실제 사용자 3명과 서로 다른 여행 성향을 준비합니다...");
  const authentications = [];
  for (const account of config.accounts) {
    const auth = account.key === "owner" ? ownerAuth : await signInOrCreate(client, account, config.password);
    await seedPersona(client, account, auth);
    authentications.push({ account, auth });
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

  console.log("4/7 여행방 날짜·부산 목적지·일정 스타일을 저장합니다...");
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

  console.log("5/7 실제 초대 코드로 동행자 계정을 참여시킵니다...");
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
  if (placeMode === "tour-api") {
    console.log("6/7 TourAPI 장소를 멤버별 후보로 추가하고 서버 placeId를 확정합니다...");
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
    const resolvedPlaces = BUSAN_PLACE_SPECS.map((spec) => {
      const candidate = (Array.isArray(candidates) ? candidates : []).find(
        (entry) => String(entry?.place?.externalId ?? "") === spec.externalId && entry?.placeId,
      );
      if (!candidate?.place) throw new Error(`후보 목록에서 '${spec.query}'를 확인하지 못했습니다.`);
      return { ...candidate.place, placeId: candidate.placeId };
    });
    scheduleDays = buildScheduleDays(resolvedPlaces);
  } else {
    console.log("6/7 curated 부산 장소를 서버 placeId 없는 수동 일정으로 준비합니다...");
    scheduleDays = buildCuratedScheduleDays();
  }

  console.log("7/7 scheduleVersion을 사용해 실제 일정 API에 저장하고 재조회합니다...");
  const currentSchedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, { token: ownerAuth.accessToken });
  assertExistingScheduleIsReplaceable(readScheduleDays(currentSchedule), config.allowReplaceSchedule);
  const savedSchedule = await client.request(`rooms/${encodeURIComponent(roomId)}/schedule`, {
    method: "PUT",
    token: ownerAuth.accessToken,
    body: {
      days: scheduleDays,
      expectedVersion: Number.isInteger(currentSchedule?.scheduleVersion) ? currentSchedule.scheduleVersion : 0,
    },
  });

  const [verifiedRoom, verifiedWorkspace, compatibility] = await Promise.all([
    client.request(`rooms/${encodeURIComponent(roomId)}`, { token: ownerAuth.accessToken }),
    client.request(`rooms/${encodeURIComponent(roomId)}/workspace`, { token: ownerAuth.accessToken }),
    client.request(`rooms/${encodeURIComponent(roomId)}/compatibility`, { token: ownerAuth.accessToken }),
  ]);
  const savedScheduleDays = readScheduleDays(savedSchedule);
  const scheduleItemCount = savedScheduleDays.reduce((sum, day) => sum + (day?.items?.length ?? 0), 0);
  if (verifiedRoom?.members?.length !== 3 || scheduleItemCount !== BUSAN_PLACE_SPECS.length) {
    throw new Error("시드 후 검증에서 멤버 수 또는 일정 수가 일치하지 않습니다.");
  }
  if (verifiedRoom.members.some((member) => !member?.travelTypeSnapshot)) {
    throw new Error(
      "멤버의 travelTypeSnapshot이 비어 있습니다. 기존 방의 스냅샷은 API로 갱신할 수 없으므로 새 DURI_FIXTURE_ROOM_TITLE로 다시 시드하세요.",
    );
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
  if (compatibility?.memberCount !== 3 || !Number.isFinite(compatibility?.compatibilityScore)) {
    throw new Error("실제 멤버 성향 기반 궁합 응답을 확인하지 못했습니다.");
  }

  console.log("\n부산 API 여행방 시드가 완료되었습니다.");
  console.log(`roomId: ${roomId}`);
  console.log(`기간: ${config.startDate} ~ ${config.endDate}`);
  console.log(`멤버: ${verifiedRoom.members.length}명 / 일정: ${scheduleItemCount}개`);
  console.log(`장소 모드: ${placeMode}`);
  console.log(`후보 투표 행: ${verifiedWorkspace.candidates.length}개`);
  if (placeMode === "curated-local-schedule") {
    console.log("제한: 이 방의 9개 장소는 실제 API 일정이지만 Mongo placeId/후보 투표와 연결되지 않은 수동 일정입니다.");
    console.log("제한: 주소는 schedule DTO에 전용 필드가 없어 각 일정의 reason 텍스트에 보존했습니다.");
  }
  console.log(`궁합 점수: ${compatibility?.compatibilityScore ?? "응답 없음"}`);
  console.log(`fixture 계정: ${config.accounts.map((account) => account.email).join(", ")}`);
  console.log("accessToken과 비밀번호는 출력하지 않았습니다.");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`\n부산 API 시드 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
