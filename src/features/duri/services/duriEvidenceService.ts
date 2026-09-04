import type { Place } from "../../../domain";
import type { DuriAnalysisInput, DuriEvidenceCollection, PlaceConstraintEvidence } from "../../../duri/duri-analysis";
import { apiClient } from "../../../services/apiClient";
import { hasEvaluableOperatingFactForDate, parseRecommendedDurationMinutes } from "../logic/placeConstraintAnalysis";
import { buildScheduledRouteLegs, collectCarRouteEvidence, type DuriDirectionsRequester } from "../logic/routeEvidence";

type DirectionsResponse = {
  distanceMeters: number;
  durationSeconds: number;
  fare?: { taxi?: number; toll?: number };
  source: string;
};

export type CommonPlaceReference = {
  source?: unknown;
  externalId?: unknown;
};

export type TourDetailResponse = {
  intro?: Record<string, unknown> | null;
};

export type TourCongestionResponse = {
  contentId?: unknown;
  name?: unknown;
  days?: unknown;
  peak?: unknown;
  busyDays?: unknown;
};

type TourConstraintFacts = Omit<PlaceConstraintEvidence, "placeId" | "provider" | "fetchedAt">;

export type DuriEvidenceDependencies = {
  requestDirections: DuriDirectionsRequester;
  requestPlaceReference: (placeId: string, signal?: AbortSignal) => Promise<CommonPlaceReference>;
  requestTourDetail: (contentId: string, signal?: AbortSignal) => Promise<TourDetailResponse>;
  /** Optional so deterministic tests or offline callers can omit this provider. */
  requestTourCongestion?: (contentId: string, signal?: AbortSignal) => Promise<TourCongestionResponse>;
};

export type DuriEvidenceRequestOptions = {
  signal?: AbortSignal;
  /** Network-safety bound only; this value never participates in a constraint judgment. */
  requestTimeoutMs?: number;
};

const DEFAULT_EVIDENCE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_EVIDENCE_REQUEST_TIMEOUT_MS = 60_000;
const TOUR_REQUEST_CONCURRENCY = 4;

class DuriEvidenceRequestTimeoutError extends Error {
  constructor() {
    super("외부 근거 요청 제한시간을 초과했어요.");
    this.name = "DuriEvidenceRequestTimeoutError";
  }
}

function abortError() {
  const error = new Error("외부 근거 요청이 취소되었어요.");
  error.name = "AbortError";
  return error;
}

function normalizedRequestTimeout(value?: number) {
  return Number.isFinite(value) && (value as number) >= 1
    ? Math.min(Math.floor(value as number), MAX_EVIDENCE_REQUEST_TIMEOUT_MS)
    : DEFAULT_EVIDENCE_REQUEST_TIMEOUT_MS;
}

/**
 * A provider promise is not trusted to settle or to honor AbortSignal. Racing
 * it here guarantees that one hung provider cannot keep the analysis pending.
 */
function requestWithDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: DuriEvidenceRequestOptions,
): Promise<T> {
  const timeoutMs = normalizedRequestTimeout(options.requestTimeoutMs);
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onParentAbort);
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const onParentAbort = () => {
      controller.abort();
      finish(() => reject(abortError()));
    };

    if (options.signal?.aborted) {
      onParentAbort();
      return;
    }
    options.signal?.addEventListener("abort", onParentAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new DuriEvidenceRequestTimeoutError()));
    }, timeoutMs);

    Promise.resolve()
      .then(() => request(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
  });
}

async function mapWithBoundedConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>,
) {
  const results: Output[] = [];
  for (let offset = 0; offset < values.length; offset += concurrency) {
    results.push(...await Promise.all(values.slice(offset, offset + concurrency).map(mapper)));
  }
  return results;
}

const TOUR_REST_DATE_KEYS = ["restdate", "restdateculture", "restdateleports", "restdatefood", "restdateshopping"] as const;
const TOUR_OPERATING_HOURS_KEYS = ["usetime", "usetimeculture", "usetimeleports", "opentime", "opentimefood", "opentimefestival", "playtime"] as const;
const TOUR_DURATION_KEYS = ["spendtime", "spendtimefestival", "taketime"] as const;
const TOUR_PARKING_KEYS = ["parking", "parkingculture", "parkingleports", "parkingfood", "parkingshopping", "parkinglodging"] as const;
const TOUR_USAGE_FEE_KEYS = ["usefee", "usefeeleports"] as const;
const TOUR_CONTENT_TYPE_IDS = new Set([12, 14, 15, 25, 28, 32, 38, 39]);

function cleanTourValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized && normalized !== "0" ? normalized : undefined;
}

function firstTourValue(intro: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  for (const key of keys) {
    const value = cleanTourValue(intro?.[key]);
    if (value) return value;
  }
  return undefined;
}

function tourDate(value: unknown) {
  const normalized = cleanTourValue(value);
  if (!normalized) return undefined;
  if (/^\d{8}$/.test(normalized)) return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function validDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

type NormalizedCongestionDay = { date: string; rate: number };

/**
 * Backend의 busy/peak 파생 필드는 의도적으로 사용하지 않는다. busy>=60은
 * 공공데이터의 공식 혼잡 등급이 아니라 Backend가 UI 배지를 위해 정한 값이다.
 */
export function normalizeTourCongestionDays(
  response: TourCongestionResponse,
  expectedContentId: string,
): NormalizedCongestionDay[] {
  if (typeof response.contentId !== "string" || response.contentId !== expectedContentId || !Array.isArray(response.days)) return [];
  const byDate = new Map<string, number | null>();
  response.days.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    const date = tourDate(record.date);
    const rate = typeof record.rate === "number" ? record.rate : Number.NaN;
    if (!date || !validDateOnly(date) || !Number.isFinite(rate) || rate < 0 || rate > 100) return;
    if (!byDate.has(date)) {
      byDate.set(date, rate);
      return;
    }
    if (byDate.get(date) !== rate) byDate.set(date, null);
  });
  return [...byDate.entries()]
    .flatMap(([date, rate]) => rate === null ? [] : [{ date, rate }])
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mapTourConstraintFacts(detail: TourDetailResponse): TourConstraintFacts {
  const intro = detail.intro ?? undefined;
  const restDateText = firstTourValue(intro, TOUR_REST_DATE_KEYS);
  const operatingHoursText = firstTourValue(intro, TOUR_OPERATING_HOURS_KEYS);
  const recommendedDurationText = firstTourValue(intro, TOUR_DURATION_KEYS);
  const eventStartDate = tourDate(intro?.eventstartdate);
  const eventEndDate = tourDate(intro?.eventenddate);
  const parkingText = firstTourValue(intro, TOUR_PARKING_KEYS);
  const parkingFeeText = firstTourValue(intro, ["parkingfee"]);
  const usageFeeText = firstTourValue(intro, TOUR_USAGE_FEE_KEYS);
  const checkInTimeText = firstTourValue(intro, ["checkintime"]);
  const checkOutTimeText = firstTourValue(intro, ["checkouttime"]);
  return {
    ...(restDateText ? { restDateText } : {}),
    ...(operatingHoursText ? { operatingHoursText } : {}),
    ...(recommendedDurationText ? { recommendedDurationText } : {}),
    ...(eventStartDate ? { eventStartDate } : {}),
    ...(eventEndDate ? { eventEndDate } : {}),
    ...(parkingText ? { parkingText } : {}),
    ...(parkingFeeText ? { parkingFeeText } : {}),
    ...(usageFeeText ? { usageFeeText } : {}),
    ...(checkInTimeText ? { checkInTimeText } : {}),
    ...(checkOutTimeText ? { checkOutTimeText } : {}),
  };
}

function hasUsableTourFacts(facts: TourConstraintFacts) {
  return Boolean(
    facts.restDateText
    || facts.operatingHoursText
    || facts.recommendedDurationText
    || facts.eventStartDate
    || facts.eventEndDate
    || facts.parkingText
    || facts.parkingFeeText
    || facts.usageFeeText
    || facts.checkInTimeText
    || facts.checkOutTimeText,
  );
}

function directTourContentId(placeId: string) {
  const normalized = placeId.trim();
  return normalized.match(/^tour:(\d+)$/i)?.[1];
}

function isMongoObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value);
}

type TourContentResolution =
  | { status: "resolved"; contentId: string }
  | { status: "not-tour" }
  | { status: "lookup-failed" };

async function resolveTourContentId(
  place: Place,
  requestPlaceReference: DuriEvidenceDependencies["requestPlaceReference"],
  options: DuriEvidenceRequestOptions,
): Promise<TourContentResolution> {
  const direct = directTourContentId(place.id);
  if (direct) return { status: "resolved", contentId: direct };
  if (/^\d+$/.test(place.id) && place.contentTypeId && TOUR_CONTENT_TYPE_IDS.has(place.contentTypeId)) {
    return { status: "resolved", contentId: place.id };
  }
  // 최신 CommonPlace는 contentTypeId가 null이어도 source/externalId로 Tour 출처를 보존한다.
  // 숫자형 Kakao ID를 Tour contentId로 오인하지 않도록 Mongo ID만 역조회한다.
  if (!isMongoObjectId(place.id)) return { status: "not-tour" };
  try {
    const reference = await requestWithDeadline(
      (signal) => requestPlaceReference(place.id, signal),
      options,
    );
    const externalId = cleanTourValue(reference.externalId);
    return typeof reference.source === "string"
      && reference.source.toLowerCase() === "tour"
      && externalId
      && /^\d+$/.test(externalId)
      ? { status: "resolved", contentId: externalId }
      : { status: "not-tour" };
  } catch {
    return { status: "lookup-failed" };
  }
}

export const requestBackendDirections: DuriDirectionsRequester = async ({ origin, destination, signal }) => {
  const response = await apiClient.request<DirectionsResponse>({
    path: "/mobility/directions",
    method: "POST",
    body: { origin, destination, priority: "TIME", summaryOnly: true },
    signal,
  });
  if (response.source !== "kakao-mobility"
    || !Number.isFinite(response.durationSeconds)
    || response.durationSeconds < 0
    || !Number.isFinite(response.distanceMeters)
    || response.distanceMeters < 0) {
    throw new Error("자동차 길찾기 응답 형식이 올바르지 않아요.");
  }
  return {
    distanceMeters: response.distanceMeters,
    durationSeconds: response.durationSeconds,
    ...(Number.isFinite(response.fare?.toll) && (response.fare?.toll ?? 0) >= 0
      ? { tollFareWon: response.fare?.toll }
      : {}),
    ...(Number.isFinite(response.fare?.taxi) && (response.fare?.taxi ?? 0) >= 0
      ? { taxiFareWon: response.fare?.taxi }
      : {}),
    source: "kakao-mobility",
  };
};

const defaultDependencies: DuriEvidenceDependencies = {
  requestDirections: requestBackendDirections,
  requestPlaceReference: (placeId, signal) => apiClient.request<CommonPlaceReference>({
    path: `/places/${encodeURIComponent(placeId)}`,
    auth: false,
    signal,
  }),
  requestTourDetail: (contentId, signal) => apiClient.request<TourDetailResponse>({
    path: `/tour/places/${encodeURIComponent(contentId)}`,
    auth: false,
    signal,
  }),
  requestTourCongestion: (contentId, signal) => apiClient.request<TourCongestionResponse>({
    path: `/tour/places/${encodeURIComponent(contentId)}/congestion`,
    auth: false,
    signal,
  }),
};

function scheduledTourPlaces(input: DuriAnalysisInput) {
  const places = new Map<string, Place>();
  input.itinerary.forEach((item) => {
    const place = item.placeId ? input.placesById[item.placeId] : undefined;
    const legacyTourId = place && /^\d+$/.test(place.id) && place.contentTypeId && TOUR_CONTENT_TYPE_IDS.has(place.contentTypeId);
    if (place && (directTourContentId(place.id) || legacyTourId || isMongoObjectId(place.id))) places.set(place.id, place);
  });
  return [...places.values()];
}

function unscheduledCandidateTourPlaces(input: DuriAnalysisInput) {
  const scheduledPlaceIds = new Set(input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const places = new Map<string, Place>();
  input.candidates.forEach((candidate) => {
    if (scheduledPlaceIds.has(candidate.placeId)) return;
    const place = input.placesById[candidate.placeId];
    const legacyTourId = place && /^\d+$/.test(place.id) && place.contentTypeId && TOUR_CONTENT_TYPE_IDS.has(place.contentTypeId);
    if (place && (directTourContentId(place.id) || legacyTourId || isMongoObjectId(place.id))) places.set(place.id, place);
  });
  return [...places.values()].sort((left, right) => left.id.localeCompare(right.id));
}

type CandidateTourFact = { placeId: string; facts: TourConstraintFacts };

async function collectUnscheduledCandidatePlaceFacts(
  input: DuriAnalysisInput,
  dependencies: DuriEvidenceDependencies,
  options: DuriEvidenceRequestOptions,
  completed: CandidateTourFact[],
) {
  const places = unscheduledCandidateTourPlaces(input);
  const settled = await mapWithBoundedConcurrency(places, TOUR_REQUEST_CONCURRENCY, async (place) => {
    const resolution = await resolveTourContentId(place, dependencies.requestPlaceReference, options);
    if (resolution.status !== "resolved") return undefined;
    try {
      const detail = await requestWithDeadline(
        (signal) => dependencies.requestTourDetail(resolution.contentId, signal),
        options,
      );
      const facts = mapTourConstraintFacts(detail);
      if (!hasUsableTourFacts(facts)) return undefined;
      const entry = { placeId: place.id, facts };
      completed.push(entry);
      return entry;
    } catch {
      return undefined;
    }
  });
  return settled.filter((entry): entry is CandidateTourFact => Boolean(entry));
}

/**
 * 자동 일정 생성 직전에 미배치 후보의 TourAPI 원문만 보조 근거로 수집한다.
 *
 * - 후보 조회 전체가 하나의 deadline 안에서 끝나며 공급자별 요청도 같은 AbortSignal을 받는다.
 * - 한 장소 또는 전체 조회가 실패하면 기존 입력으로 돌아가므로 리포트/일정 편집을 중단하지 않는다.
 * - 분석 실행의 coverage는 이미 배치된 일정만 설명해야 하므로 evidenceCollection은 건드리지 않는다.
 */
export async function enrichPreferenceAutoFillCandidateEvidence(
  input: DuriAnalysisInput,
  fetchedAt = new Date().toISOString(),
  dependencies: DuriEvidenceDependencies = defaultDependencies,
  options: DuriEvidenceRequestOptions = {},
): Promise<DuriAnalysisInput> {
  const collected: CandidateTourFact[] = [];
  try {
    await requestWithDeadline(
      (signal) => collectUnscheduledCandidatePlaceFacts(input, dependencies, { ...options, signal }, collected),
      options,
    );
  } catch {
    // 전체 deadline 전에 끝난 후보 근거는 보존하고, 끝나지 않은 후보만 건너뛴다.
  }
  if (!collected.length) return input;
  const mergedByPlaceId = new Map((input.placeConstraintEvidence ?? []).map((evidence) => [evidence.placeId, evidence]));
  collected.forEach(({ placeId, facts }) => mergedByPlaceId.set(placeId, {
    ...facts,
    placeId,
    provider: "tour-api",
    fetchedAt,
  }));
  return {
    ...input,
    placeConstraintEvidence: [...mergedByPlaceId.values()].sort((left, right) => left.placeId.localeCompare(right.placeId)),
  };
}

function scheduledPlaceCount(input: DuriAnalysisInput) {
  return new Set(input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : [])).size;
}

async function collectPlaceDetails(
  input: DuriAnalysisInput,
  dependencies: DuriEvidenceDependencies,
  options: DuriEvidenceRequestOptions,
) {
  const places = scheduledTourPlaces(input);
  const settled = await mapWithBoundedConcurrency(places, TOUR_REQUEST_CONCURRENCY, async (place) => {
    const resolution = await resolveTourContentId(place, dependencies.requestPlaceReference, options);
    if (resolution.status !== "resolved") return { placeId: place.id, status: resolution.status } as const;
    try {
      const detail = await requestWithDeadline(
        (signal) => dependencies.requestTourDetail(resolution.contentId, signal),
        options,
      );
      const facts = mapTourConstraintFacts(detail);
      return { placeId: place.id, contentId: resolution.contentId, status: "fetched" as const, facts };
    } catch {
      return { placeId: place.id, contentId: resolution.contentId, status: "detail-failed" as const };
    }
  });
  const details = new Map<string, TourConstraintFacts>();
  const tourContentIds = new Map<string, string>();
  settled.forEach((entry) => {
    if ("contentId" in entry && typeof entry.contentId === "string") tourContentIds.set(entry.placeId, entry.contentId);
    if (entry.status === "fetched" && hasUsableTourFacts(entry.facts)) details.set(entry.placeId, entry.facts);
  });
  const requestedPlaceCount = settled.filter((entry) => entry.status === "fetched" || entry.status === "detail-failed").length;
  const fetchedPlaceCount = settled.filter((entry) => entry.status === "fetched").length;
  const scheduledDatesByPlace = new Map<string, Set<string>>();
  input.itinerary.forEach((item) => {
    if (!item.placeId) return;
    const dates = scheduledDatesByPlace.get(item.placeId) ?? new Set<string>();
    dates.add(item.date);
    scheduledDatesByPlace.set(item.placeId, dates);
  });
  const operatingFactPlaceCount = [...details.entries()].filter(([placeId, facts]) => {
    const dates = scheduledDatesByPlace.get(placeId);
    return Boolean(dates?.size && [...dates].every((date) => hasEvaluableOperatingFactForDate(facts, date)));
  }).length;
  const durationFactPlaceCount = [...details.values()].filter((facts) =>
    Boolean(facts.recommendedDurationText && parseRecommendedDurationMinutes(facts.recommendedDurationText) !== undefined)).length;
  const lookupFailedCount = settled.filter((entry) => entry.status === "lookup-failed").length;
  const detailFailedCount = settled.filter((entry) => entry.status === "detail-failed").length;
  const unavailableReasons = [
    ...(requestedPlaceCount < scheduledPlaceCount(input) ? [`${scheduledPlaceCount(input) - requestedPlaceCount}개 장소는 TourAPI 출처를 확인할 수 없어 운영정보를 조회하지 않았어요.`] : []),
    ...(lookupFailedCount ? [`${lookupFailedCount}개 장소는 출처 조회에 실패했어요.`] : []),
    ...(detailFailedCount ? [`${detailFailedCount}개 장소는 TourAPI 상세 조회에 실패했어요.`] : []),
    ...(details.size < fetchedPlaceCount ? [`${fetchedPlaceCount - details.size}개 장소는 운영·휴무·소요시간 원문이 없었어요.`] : []),
  ];
  const collection: DuriEvidenceCollection["placeDetails"] = {
    scheduledPlaceCount: scheduledPlaceCount(input),
    requestedPlaceCount,
    fetchedPlaceCount,
    usablePlaceCount: details.size,
    operatingFactPlaceCount,
    durationFactPlaceCount,
    ...(requestedPlaceCount ? { provider: "tour-api" as const } : {}),
    ...(unavailableReasons.length ? { unavailableReason: unavailableReasons.join(" ") } : {}),
  };
  return { details, tourContentIds, collection };
}

function scheduledPlaceDates(input: DuriAnalysisInput) {
  const result = new Map<string, Set<string>>();
  input.itinerary.forEach((item) => {
    if (!item.placeId) return;
    const dates = result.get(item.placeId) ?? new Set<string>();
    dates.add(item.date);
    result.set(item.placeId, dates);
  });
  return result;
}

async function collectCongestionEvidence(
  input: DuriAnalysisInput,
  tourContentIds: ReadonlyMap<string, string>,
  dependencies: DuriEvidenceDependencies,
  fetchedAt: string,
  options: DuriEvidenceRequestOptions,
) {
  const scheduledDates = scheduledPlaceDates(input);
  const scheduledPlaceDateCount = [...scheduledDates.values()].reduce((sum, dates) => sum + dates.size, 0);
  const requests = [...tourContentIds.entries()];
  const requestTourCongestion = dependencies.requestTourCongestion;
  if (!requestTourCongestion) {
    return {
      evidence: [],
      collection: {
        scheduledPlaceDateCount,
        requestedPlaceCount: 0,
        fetchedPlaceCount: 0,
        usablePlaceCount: 0,
        matchedPlaceDateCount: 0,
        unavailableReason: requests.length
          ? "날짜별 혼잡 정보가 충분하지 않아 이번 점검에서는 혼잡 예측을 제외했어요."
          : "날짜별 혼잡 정보를 확인할 수 있는 일정 장소가 없어 이번 점검에서는 혼잡 예측을 제외했어요.",
      } satisfies NonNullable<DuriEvidenceCollection["congestion"]>,
    };
  }

  const settled = await mapWithBoundedConcurrency(requests, TOUR_REQUEST_CONCURRENCY, async ([placeId, contentId]) => {
    try {
      const response = await requestWithDeadline(
        (signal) => requestTourCongestion(contentId, signal),
        options,
      );
      return { placeId, contentId, status: "fetched" as const, days: normalizeTourCongestionDays(response, contentId) };
    } catch {
      return { placeId, contentId, status: "failed" as const, days: [] as NormalizedCongestionDay[] };
    }
  });
  const evidence = settled.flatMap((entry) => {
    if (entry.status !== "fetched" || !entry.days.length) return [];
    const dates = scheduledDates.get(entry.placeId);
    if (!dates?.size) return [];
    return entry.days.flatMap((day) => {
      if (!dates.has(day.date)) return [];
      const forecastRank = 1 + entry.days.filter((candidate) => candidate.rate > day.rate).length;
      return [{
        placeId: entry.placeId,
        tourContentId: entry.contentId,
        date: day.date,
        rate: day.rate,
        forecastRank,
        comparedDayCount: entry.days.length,
        isForecastPeak: forecastRank === 1,
        provider: "tourism-data-lab" as const,
        fetchedAt,
      }];
    });
  });
  const fetchedPlaceCount = settled.filter((entry) => entry.status === "fetched").length;
  const usablePlaceCount = settled.filter((entry) => entry.status === "fetched" && entry.days.length > 0).length;
  const failedPlaceCount = settled.filter((entry) => entry.status === "failed").length;
  const emptyPlaceCount = fetchedPlaceCount - usablePlaceCount;
  const unmatchedPlaceDateCount = scheduledPlaceDateCount - evidence.length;
  const unavailableReasons = [
    ...(tourContentIds.size < scheduledDates.size ? [`${scheduledDates.size - tourContentIds.size}개 장소는 TourAPI 출처를 확인할 수 없어 혼잡 예측을 조회하지 않았어요.`] : []),
    ...(failedPlaceCount ? [`${failedPlaceCount}개 장소는 혼잡 예측 조회에 실패했어요.`] : []),
    ...(emptyPlaceCount ? [`${emptyPlaceCount}개 장소는 유효한 0~100 집중률 예측일이 없었어요.`] : []),
    ...(unmatchedPlaceDateCount ? [`${unmatchedPlaceDateCount}개 장소·방문일은 향후 예측 응답과 날짜가 일치하지 않았어요.`] : []),
  ];
  return {
    evidence,
    collection: {
      scheduledPlaceDateCount,
      requestedPlaceCount: requests.length,
      fetchedPlaceCount,
      usablePlaceCount,
      matchedPlaceDateCount: evidence.length,
      ...(requests.length ? { provider: "tourism-data-lab" as const } : {}),
      ...(unavailableReasons.length ? { unavailableReason: unavailableReasons.join(" ") } : {}),
    } satisfies NonNullable<DuriEvidenceCollection["congestion"]>,
  };
}

/**
 * 사용자 일정 snapshot을 바꾸지 않고, 분석 버튼을 누른 시점의 외부 근거만 덧붙인다.
 * 한 공급자가 실패해도 나머지 결정적 규칙은 계속 실행한다.
 */
export async function enrichDuriAnalysisInput(
  input: DuriAnalysisInput,
  fetchedAt = new Date().toISOString(),
  dependencies: DuriEvidenceDependencies = defaultDependencies,
  options: DuriEvidenceRequestOptions = {},
): Promise<DuriAnalysisInput> {
  // 운영시간·휴무·행사 사실으로 고정된 항목을 route optimizer가 먼저 알아야 한다.
  const placeDetails = await collectPlaceDetails(input, dependencies, options).catch(() => ({
      details: new Map<string, TourConstraintFacts>(),
      tourContentIds: new Map<string, string>(),
      collection: {
        scheduledPlaceCount: scheduledPlaceCount(input),
        requestedPlaceCount: 0,
        fetchedPlaceCount: 0,
        usablePlaceCount: 0,
        operatingFactPlaceCount: 0,
        durationFactPlaceCount: 0,
        unavailableReason: "TourAPI 장소 상세정보를 불러오지 못해 운영시간·소요시간을 판단하지 않았어요.",
      } satisfies DuriEvidenceCollection["placeDetails"],
    }));
  const placeConstraintEvidence = [...placeDetails.details.entries()].map(([placeId, evidence]) => ({
    ...evidence,
    placeId,
    provider: "tour-api" as const,
    fetchedAt,
  }));
  const congestion = await collectCongestionEvidence(
    input,
    placeDetails.tourContentIds,
    dependencies,
    fetchedAt,
    options,
  ).catch(() => ({
    evidence: [],
    collection: {
      scheduledPlaceDateCount: [...scheduledPlaceDates(input).values()].reduce((sum, dates) => sum + dates.size, 0),
      requestedPlaceCount: placeDetails.tourContentIds.size,
      fetchedPlaceCount: 0,
      usablePlaceCount: 0,
      matchedPlaceDateCount: 0,
      ...(placeDetails.tourContentIds.size ? { provider: "tourism-data-lab" as const } : {}),
      unavailableReason: "관광지 집중률 예측을 불러오지 못해 혼잡 여부를 판단하지 않았어요.",
    } satisfies NonNullable<DuriEvidenceCollection["congestion"]>,
  }));
  const routeInput = { ...input, placeConstraintEvidence };
  const boundedDirections: DuriDirectionsRequester = ({ origin, destination }) => requestWithDeadline(
    (signal) => dependencies.requestDirections({ origin, destination, signal }),
    options,
  );
  const route = await collectCarRouteEvidence(routeInput, boundedDirections, fetchedAt).catch(() => ({
    routeLegEstimates: [],
    routeOrderEvaluations: [],
    routeCollection: {
      requiredLegCount: buildScheduledRouteLegs(input).length,
      analyzedLegCount: 0,
      mode: input.trip.transport,
      unavailableReason: "자동차 길찾기 Backend에 연결할 수 없어 실제 이동시간을 판단하지 않았어요.",
    } satisfies DuriEvidenceCollection["route"],
  }));

  return {
    ...input,
    routeLegEstimates: route.routeLegEstimates,
    routeOrderEvaluations: route.routeOrderEvaluations,
    placeConstraintEvidence,
    placeCongestionEvidence: congestion.evidence,
    evidenceCollection: {
      route: route.routeCollection,
      placeDetails: placeDetails.collection,
      congestion: congestion.collection,
    },
  };
}
