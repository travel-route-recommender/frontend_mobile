import type { ItineraryItem, Place } from "../../../domain";
import type {
  DuriAnalysisInput,
  DuriEvidenceCollection,
  RouteLegEstimate,
  RouteOrderEvaluation,
} from "../../../duri/duri-analysis";
import { getTripDates, sortItineraryItemsByDateAndTime, timeStringToMinutes } from "../../../utils/schedule";
import { isUsableConfirmedScheduleConstraint } from "./confirmedScheduleConstraint";
import { hasEvaluableOperatingFactForDate } from "./placeConstraintAnalysis";

export type DuriDirectionsResult = {
  distanceMeters: number;
  durationSeconds: number;
  tollFareWon?: number;
  taxiFareWon?: number;
  source: "kakao-mobility";
};

export type DuriDirectionsRequester = (input: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  signal?: AbortSignal;
}) => Promise<DuriDirectionsResult>;

export type ScheduledRouteLeg = {
  date: string;
  from: ItineraryItem;
  to: ItineraryItem;
  departureTime: string;
  availableSeconds: number;
};

type LocatedItem = {
  item: ItineraryItem;
  place: Place;
  coordinates: { lat: number; lng: number };
};

type Pair = { from: LocatedItem; to: LocatedItem };

const ROUTE_ORDER_LOCKING_DOCUMENT_KINDS = new Set([
  "accommodation",
  "admission",
  "train",
  "bus",
  "rental-car",
]);

// 네트워크 안정성을 위한 동시 요청 상한이며 분석 판정값에는 영향을 주지 않는다.
const ROUTE_REQUEST_CONCURRENCY = 4;

function coordinatesFor(place: Place) {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return undefined;
  const lat = place.latitude as number;
  const lng = place.longitude as number;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function timeLabel(minutes: number) {
  const bounded = Math.max(0, Math.min(24 * 60, minutes));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}

function longestOpenWindow(
  windowStart: number,
  windowEnd: number,
  blockers: readonly { start: number; end: number }[],
) {
  const merged: { start: number; end: number }[] = [];
  blockers
    .map((blocker) => ({
      start: Math.max(windowStart, blocker.start),
      end: Math.min(windowEnd, blocker.end),
    }))
    .filter((blocker) => blocker.end > blocker.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach((blocker) => {
      const previous = merged.at(-1);
      if (previous && blocker.start <= previous.end) {
        previous.end = Math.max(previous.end, blocker.end);
      } else {
        merged.push({ ...blocker });
      }
    });

  let cursor = windowStart;
  let best = { start: windowStart, duration: 0 };
  for (const blocker of merged) {
    const duration = Math.max(0, blocker.start - cursor);
    if (duration > best.duration) best = { start: cursor, duration };
    cursor = Math.max(cursor, blocker.end);
  }
  const tailDuration = Math.max(0, windowEnd - cursor);
  if (tailDuration > best.duration) best = { start: cursor, duration: tailDuration };
  return best;
}

/**
 * 같은 날짜의 장소 일정만 시간순으로 연결한다. 중간의 식사·휴식 블록은 이동에
 * 사용할 수 없는 시간으로 보고, 연속해서 쓸 수 있는 가장 긴 공백을 반환한다.
 */
export function buildScheduledRouteLegs(input: Pick<DuriAnalysisInput, "trip" | "itinerary">): ScheduledRouteLeg[] {
  return getTripDates(input.trip.startDate, input.trip.endDate).flatMap((date) => {
    const allItems = sortItineraryItemsByDateAndTime(input.itinerary.filter((item) => item.date === date));
    const placeItems = allItems.filter((item) => Boolean(item.placeId));
    return placeItems.slice(1).flatMap((to, index) => {
      const from = placeItems[index];
      const fromEnd = timeStringToMinutes(from.startTime) + from.durationMinutes;
      const toStart = timeStringToMinutes(to.startTime);
      if (!Number.isFinite(fromEnd) || !Number.isFinite(toStart) || toStart < fromEnd) return [];
      const blockers = allItems.flatMap((item) => {
        if (item.id === from.id || item.id === to.id || item.itemType === "transport" || item.placeId) return [];
        const start = timeStringToMinutes(item.startTime);
        return Number.isFinite(start) ? [{ start, end: start + item.durationMinutes }] : [];
      });
      const openWindow = longestOpenWindow(fromEnd, toStart, blockers);
      return [{
        date,
        from,
        to,
        departureTime: timeLabel(openWindow.start),
        availableSeconds: openWindow.duration * 60,
      }];
    });
  });
}

function locatedItemsForDate(input: DuriAnalysisInput, date: string): LocatedItem[] {
  const placeItems = sortItineraryItemsByDateAndTime(input.itinerary.filter((item) => item.date === date && item.placeId));
  const located = placeItems
    .flatMap((item) => {
      const place = item.placeId ? input.placesById[item.placeId] : undefined;
      const coordinates = place ? coordinatesFor(place) : undefined;
      return place && coordinates ? [{ item, place, coordinates }] : [];
    });
  // 좌표가 없는 중간 장소를 건너뛴 가짜 인접 관계로 최적화하지 않는다.
  return located.length === placeItems.length ? located : [];
}

function pairKey(pair: Pair) {
  return `${pair.from.place.id}\u0000${pair.to.place.id}`;
}

function consecutivePairs(items: readonly LocatedItem[]): Pair[] {
  return items.slice(1).map((to, index) => ({ from: items[index], to }));
}

/**
 * 예약·티켓·운영시간처럼 순서 변경에 앞서 지켜야 할 사실이 연결된 일정은
 * 최적화 후보에서 제외한다. 현재 경로의 필수 이동 구간 검증에는 계속 포함된다.
 */
export function isRouteOptimizationFixedItem(
  input: Pick<DuriAnalysisInput, "trip" | "confirmedScheduleConstraints" | "documentReferences" | "placeConstraintEvidence">,
  item: ItineraryItem,
) {
  if (item.lockedForDuri || item.itemType === "reservation") return true;
  const fixedByConfirmedFact = (input.confirmedScheduleConstraints ?? [])
    .filter((constraint) => isUsableConfirmedScheduleConstraint(constraint, input.trip))
    .some((constraint) => constraint.itineraryItemId === item.id
      || (!constraint.itineraryItemId
        && constraint.placeId === item.placeId
      ));
  const fixedByLinkedDocument = (input.documentReferences ?? []).some((reference) =>
    ROUTE_ORDER_LOCKING_DOCUMENT_KINDS.has(reference.kind)
    && reference.itineraryItemIds.includes(item.id));
  const fixedByTimeSensitivePlaceFact = Boolean(item.placeId && (input.placeConstraintEvidence ?? []).some((evidence) =>
    evidence.placeId === item.placeId && hasEvaluableOperatingFactForDate(evidence, item.date)));
  return fixedByConfirmedFact || fixedByLinkedDocument || fixedByTimeSensitivePlaceFact;
}

function collectRouteOptimizationFixedItemIds(input: DuriAnalysisInput) {
  const fixedItemIds = new Set(input.itinerary
    .filter((item) => item.lockedForDuri || item.itemType === "reservation")
    .map((item) => item.id));
  const confirmedPlaceIds = new Set<string>();
  (input.confirmedScheduleConstraints ?? []).forEach((constraint) => {
    if (!isUsableConfirmedScheduleConstraint(constraint, input.trip)) return;
    if (constraint.itineraryItemId) {
      fixedItemIds.add(constraint.itineraryItemId);
      return;
    }
    if (!constraint.placeId) return;
    // itemId가 없는 확정 사실은 반복 방문 중 어느 항목을 가리키는지 모호하다.
    // 이미 날짜가 틀린 occurrence도 최적화가 더 건드리지 않도록 같은 장소를 모두 고정한다.
    confirmedPlaceIds.add(constraint.placeId);
  });
  (input.documentReferences ?? []).forEach((reference) => {
    if (!ROUTE_ORDER_LOCKING_DOCUMENT_KINDS.has(reference.kind)) return;
    reference.itineraryItemIds.forEach((itemId) => fixedItemIds.add(itemId));
  });
  const evidenceByPlaceId = new Map<string, NonNullable<DuriAnalysisInput["placeConstraintEvidence"]>>();
  (input.placeConstraintEvidence ?? []).forEach((evidence) => {
    const values = evidenceByPlaceId.get(evidence.placeId) ?? [];
    values.push(evidence);
    evidenceByPlaceId.set(evidence.placeId, values);
  });
  input.itinerary.forEach((item) => {
    if (!item.placeId) return;
    if ((evidenceByPlaceId.get(item.placeId) ?? []).some((evidence) => hasEvaluableOperatingFactForDate(evidence, item.date))
      || confirmedPlaceIds.has(item.placeId)) {
      fixedItemIds.add(item.id);
    }
  });
  return fixedItemIds;
}

type TimedScheduleItem = { item: ItineraryItem; start: number; end: number };
type TimedBlocker = { start: number; end: number };

function buildDayScheduleContext(itinerary: readonly ItineraryItem[], date: string) {
  const items: TimedScheduleItem[] = sortItineraryItemsByDateAndTime(itinerary.filter((item) => item.date === date))
    .map((item) => {
      const start = timeStringToMinutes(item.startTime);
      return { item, start, end: start + item.durationMinutes };
    })
    .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end));
  let latestEnd = Number.NEGATIVE_INFINITY;
  const hasOverlap = items.some((entry) => {
    const overlaps = entry.start < latestEnd;
    latestEnd = Math.max(latestEnd, entry.end);
    return overlaps;
  });
  return {
    items,
    hasOverlap,
    indexByItemId: new Map(items.map((entry, index) => [entry.item.id, index] as const)),
  };
}

type SwapAvailabilityContext = {
  blockersByPlaceGap: readonly (readonly TimedBlocker[])[];
};

/**
 * 각 비장소 블록을 원래의 인접 장소 구간에 한 번만 배치한다. 최적화 대상 day는
 * overlap이 없는 경우만 허용되므로 한 blocker가 여러 구간을 가로지를 수 없다.
 */
function buildSwapAvailabilityContext(
  itinerary: readonly ItineraryItem[],
  date: string,
  placeItems: readonly LocatedItem[],
): SwapAvailabilityContext {
  const blockers = sortItineraryItemsByDateAndTime(itinerary.filter((item) =>
    item.date === date && item.itemType !== "transport" && !item.placeId))
    .flatMap((item) => {
      const start = timeStringToMinutes(item.startTime);
      return Number.isFinite(start) && item.durationMinutes > 0
        ? [{ start, end: start + item.durationMinutes }]
        : [];
    });
  const buckets: TimedBlocker[][] = placeItems.slice(1).map(() => []);
  let gapIndex = 0;
  for (const blocker of blockers) {
    while (
      gapIndex < buckets.length
      && blocker.start >= timeStringToMinutes(placeItems[gapIndex + 1].item.startTime)
    ) gapIndex += 1;
    if (gapIndex >= buckets.length) break;
    const gapStart = timeStringToMinutes(placeItems[gapIndex].item.startTime);
    const gapEnd = timeStringToMinutes(placeItems[gapIndex + 1].item.startTime);
    if (Number.isFinite(gapStart) && Number.isFinite(gapEnd) && blocker.end > gapStart && blocker.start < gapEnd) {
      buckets[gapIndex].push(blocker);
    }
  }
  return { blockersByPlaceGap: buckets };
}

function longestOpenWindowFromSorted(
  windowStart: number,
  windowEnd: number,
  blockers: readonly TimedBlocker[],
) {
  let cursor = windowStart;
  let best = { start: windowStart, duration: 0 };
  for (const blocker of blockers) {
    const start = Math.max(windowStart, blocker.start);
    const end = Math.min(windowEnd, blocker.end);
    if (end <= start) continue;
    const duration = Math.max(0, start - cursor);
    if (duration > best.duration) best = { start: cursor, duration };
    cursor = Math.max(cursor, end);
  }
  const tailDuration = Math.max(0, windowEnd - cursor);
  return tailDuration > best.duration ? { start: cursor, duration: tailDuration } : best;
}

function swapFitsDaySchedule(
  context: ReturnType<typeof buildDayScheduleContext>,
  left: ItineraryItem,
  right: ItineraryItem,
) {
  if (context.hasOverlap) return false;
  const leftIndex = context.indexByItemId.get(left.id);
  const rightIndex = context.indexByItemId.get(right.id);
  if (leftIndex === undefined || rightIndex !== leftIndex + 1) return false;
  const leftStart = context.items[leftIndex].start;
  const rightStart = context.items[rightIndex].start;
  const nextStart = context.items[rightIndex + 1]?.start ?? 24 * 60;
  return leftStart + right.durationMinutes <= rightStart
    && rightStart + left.durationMinutes <= nextStart;
}

export function isRouteOptimizationSwapTimeFeasible(
  input: Pick<DuriAnalysisInput, "itinerary">,
  date: string,
  left: ItineraryItem,
  right: ItineraryItem,
) {
  return swapFitsDaySchedule(buildDayScheduleContext(input.itinerary, date), left, right);
}

function buildRouteOptimizationEligibility(
  input: DuriAnalysisInput,
  date: string,
  items: readonly LocatedItem[],
  fixedItemIds: ReadonlySet<string>,
) {
  const daySchedule = buildDayScheduleContext(input.itinerary, date);

  return items.slice(1).map((right, index) => {
    const left = items[index];
    // 복귀 조건은 마지막 장소에서 복귀 지점까지의 종단 간선만 의존한다.
    // 마지막 장소를 바꾸지 않는 앞쪽 인접 교환은 계속 평가할 수 있다.
    const changesTerminalPlace = Boolean(
      input.trip.endCondition
      && date === input.trip.endDate
      && index + 1 === items.length - 1,
    );
    return !fixedItemIds.has(left.item.id)
      && !fixedItemIds.has(right.item.id)
      && !changesTerminalPlace
      && swapFitsDaySchedule(daySchedule, left.item, right.item);
  });
}

function pairDuration(cache: ReadonlyMap<string, DuriDirectionsResult>, pair: Pair) {
  return cache.get(pairKey(pair))?.durationSeconds;
}

function sumPairDuration(cache: ReadonlyMap<string, DuriDirectionsResult>, pairs: readonly Pair[]) {
  const durations = pairs.map((pair) => pairDuration(cache, pair));
  return durations.every((duration): duration is number => Number.isFinite(duration))
    ? durations.reduce((total, duration) => total + duration, 0)
    : undefined;
}

function collectOptimizationPairs(items: readonly LocatedItem[], canSwapAtIndex: (index: number) => boolean) {
  if (items.length < 2) return [];
  const eligibleIndexes = items.slice(1).map((_, index) => index).filter(canSwapAtIndex);
  if (!eligibleIndexes.length) return [];
  const pairs = [...consecutivePairs(items)];
  for (const index of eligibleIndexes) {
    const left = items[index];
    const right = items[index + 1];
    pairs.push({ from: right, to: left });
    if (index > 0) pairs.push({ from: items[index - 1], to: right });
    if (index + 2 < items.length) pairs.push({ from: left, to: items[index + 2] });
  }
  return pairs;
}

function swapAffectedPairs(items: readonly LocatedItem[], index: number) {
  const left = items[index];
  const right = items[index + 1];
  const previous = items[index - 1];
  const next = items[index + 2];
  return {
    before: [
      ...(previous ? [{ from: previous, to: left }] : []),
      { from: left, to: right },
      ...(next ? [{ from: right, to: next }] : []),
    ],
    after: [
      ...(previous ? [{ from: previous, to: right }] : []),
      { from: right, to: left },
      ...(next ? [{ from: left, to: next }] : []),
    ],
  } satisfies { before: Pair[]; after: Pair[] };
}

function alternativeLegsForSwap(
  items: readonly LocatedItem[],
  index: number,
  cache: ReadonlyMap<string, DuriDirectionsResult>,
  availability: SwapAvailabilityContext,
): RouteOrderEvaluation["alternativeLegs"] | undefined {
  const left = items[index].item;
  const right = items[index + 1].item;
  const leftStart = timeStringToMinutes(left.startTime);
  const rightStart = timeStringToMinutes(right.startTime);
  if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) return undefined;
  const affected = swapAffectedPairs(items, index).after;
  const firstGapIndex = index > 0 ? index - 1 : index;
  const startAfterSwap = (item: ItineraryItem) => item.id === left.id
    ? rightStart
    : item.id === right.id
      ? leftStart
      : timeStringToMinutes(item.startTime);
  const alternativeLegs = affected.flatMap<RouteOrderEvaluation["alternativeLegs"][number]>((pair, pairIndex) => {
    const durationSeconds = pairDuration(cache, pair);
    const fromStart = startAfterSwap(pair.from.item);
    const toStart = startAfterSwap(pair.to.item);
    const gapIndex = firstGapIndex + pairIndex;
    const blockers = availability.blockersByPlaceGap[gapIndex] ?? [];
    if (durationSeconds === undefined || !Number.isFinite(fromStart) || !Number.isFinite(toStart)) return [];
    const windowStart = fromStart + pair.from.item.durationMinutes;
    if (toStart < windowStart) return [];
    const openWindow = longestOpenWindowFromSorted(
      windowStart,
      toStart,
      blockers,
    );
    return [{
      fromItemId: pair.from.item.id,
      toItemId: pair.to.item.id,
      durationSeconds,
      availableSeconds: openWindow.duration * 60,
    }];
  });
  if (alternativeLegs.length !== affected.length
    || alternativeLegs.some((leg) => leg.durationSeconds > leg.availableSeconds)) return undefined;
  return alternativeLegs;
}

function bestAdjacentSwap(
  input: DuriAnalysisInput,
  date: string,
  items: readonly LocatedItem[],
  cache: ReadonlyMap<string, DuriDirectionsResult>,
  fetchedAt: string,
  canSwapAtIndex: (index: number) => boolean,
): RouteOrderEvaluation | undefined {
  if (items.length < 2) return undefined;
  const currentDurationSeconds = sumPairDuration(cache, consecutivePairs(items));
  if (currentDurationSeconds === undefined) return undefined;
  const itemIds = items.map((entry) => entry.item.id);
  const availability = buildSwapAvailabilityContext(input.itinerary, date, items);
  let best: RouteOrderEvaluation | undefined;
  for (let index = 0; index < items.length - 1; index += 1) {
    if (!canSwapAtIndex(index)) continue;
    const affected = swapAffectedPairs(items, index);
    const beforeDurationSeconds = sumPairDuration(cache, affected.before);
    const afterDurationSeconds = sumPairDuration(cache, affected.after);
    if (beforeDurationSeconds === undefined || afterDurationSeconds === undefined) continue;
    const alternativeLegs = alternativeLegsForSwap(items, index, cache, availability);
    if (!alternativeLegs) continue;
    const alternativeDurationSeconds = currentDurationSeconds - beforeDurationSeconds + afterDurationSeconds;
    if (alternativeDurationSeconds >= currentDurationSeconds) continue;
    const candidate: RouteOrderEvaluation = {
      date,
      itemIds,
      swappedItemIds: [items[index].item.id, items[index + 1].item.id],
      currentDurationSeconds,
      alternativeDurationSeconds,
      alternativeLegs,
      provider: "kakao-mobility",
      timingBasis: "current-traffic",
      fetchedAt,
    };
    if (!best || candidate.alternativeDurationSeconds < best.alternativeDurationSeconds) best = candidate;
  }
  return best;
}

function validDirections(result: DuriDirectionsResult) {
  return result.source === "kakao-mobility"
    && Number.isFinite(result.durationSeconds)
    && result.durationSeconds >= 0
    && Number.isFinite(result.distanceMeters)
    && result.distanceMeters >= 0;
}

function pairForLeg(input: DuriAnalysisInput, leg: ScheduledRouteLeg): Pair | undefined {
  const fromPlace = leg.from.placeId ? input.placesById[leg.from.placeId] : undefined;
  const toPlace = leg.to.placeId ? input.placesById[leg.to.placeId] : undefined;
  const fromCoordinates = fromPlace ? coordinatesFor(fromPlace) : undefined;
  const toCoordinates = toPlace ? coordinatesFor(toPlace) : undefined;
  return fromPlace && toPlace && fromCoordinates && toCoordinates
    ? {
        from: { item: leg.from, place: fromPlace, coordinates: fromCoordinates },
        to: { item: leg.to, place: toPlace, coordinates: toCoordinates },
      }
    : undefined;
}

async function collectPairsIntoCache({
  pairs,
  cache,
  attempted,
  requestDirections,
}: {
  pairs: readonly Pair[];
  cache: Map<string, DuriDirectionsResult>;
  attempted: Set<string>;
  requestDirections: DuriDirectionsRequester;
}) {
  const unique = new Map<string, Pair>();
  pairs.forEach((pair) => {
    const key = pairKey(pair);
    if (!attempted.has(key)) unique.set(key, pair);
  });
  const entries = [...unique.entries()];
  let failedCount = 0;
  for (let offset = 0; offset < entries.length; offset += ROUTE_REQUEST_CONCURRENCY) {
    const chunk = entries.slice(offset, offset + ROUTE_REQUEST_CONCURRENCY);
    const settled = await Promise.all(chunk.map(async ([key, pair]) => {
      attempted.add(key);
      if (pair.from.coordinates.lat === pair.to.coordinates.lat && pair.from.coordinates.lng === pair.to.coordinates.lng) {
        return [key, { distanceMeters: 0, durationSeconds: 0, source: "kakao-mobility" as const }] as const;
      }
      const result = await requestDirections({
        origin: pair.from.coordinates,
        destination: pair.to.coordinates,
      });
      if (!validDirections(result)) throw new Error("Invalid directions response");
      return [key, result] as const;
    }).map((promise) => promise.then((value) => ({ status: "fulfilled" as const, value }), () => ({ status: "rejected" as const }))));
    settled.forEach((entry) => {
      if (entry.status === "fulfilled") cache.set(entry.value[0], entry.value[1]);
      else failedCount += 1;
    });
  }
  return failedCount;
}

export async function collectCarRouteEvidence(
  input: DuriAnalysisInput,
  requestDirections: DuriDirectionsRequester,
  fetchedAt: string,
): Promise<{
  routeLegEstimates: RouteLegEstimate[];
  routeOrderEvaluations: RouteOrderEvaluation[];
  routeCollection: DuriEvidenceCollection["route"];
}> {
  const scheduledLegs = buildScheduledRouteLegs(input);
  if (input.trip.transport !== "car") {
    return {
      routeLegEstimates: [],
      routeOrderEvaluations: [],
      routeCollection: {
        requiredLegCount: scheduledLegs.length,
        analyzedLegCount: 0,
        mode: input.trip.transport,
        unavailableReason: "현재 Backend에는 대중교통 경로 프록시가 없어 실제 소요시간을 조회하지 않았어요.",
      },
    };
  }

  const locatedByDate = new Map(getTripDates(input.trip.startDate, input.trip.endDate)
    .map((date) => [date, locatedItemsForDate(input, date)] as const));
  const fixedItemIds = collectRouteOptimizationFixedItemIds(input);
  const optimizationEligibility = new Map([...locatedByDate.entries()].map(([date, items]) => [
    date,
    buildRouteOptimizationEligibility(input, date, items, fixedItemIds),
  ] as const));
  const cache = new Map<string, DuriDirectionsResult>();
  const attempted = new Set<string>();
  // 필수 구간을 먼저 수집해 최적화용 부가 호출 실패가 Hard 검사를 밀어내지 않게 한다.
  const requiredPairs = scheduledLegs.flatMap((leg) => {
    const pair = pairForLeg(input, leg);
    return pair ? [pair] : [];
  });
  let failedCount = await collectPairsIntoCache({ pairs: requiredPairs, cache, attempted, requestDirections });
  const canSwapAtIndex = (date: string, index: number) => optimizationEligibility.get(date)?.[index] === true;
  const hasCompleteRequiredRouteForDate = (date: string) => scheduledLegs
    .filter((leg) => leg.date === date)
    .every((leg) => {
      const pair = pairForLeg(input, leg);
      return Boolean(pair && cache.has(pairKey(pair)));
    });
  // 현재 순서의 필수 간선 하나라도 실패하면 그 날짜의 총 이동시간 자체를 계산할 수 없다.
  // 이때 결과에 쓸 수 없는 최적화용 추가 요청을 보내지 않는다.
  const optimizationPairs = [...locatedByDate.entries()].flatMap(([date, items]) =>
    hasCompleteRequiredRouteForDate(date)
      ? collectOptimizationPairs(items, (index) => canSwapAtIndex(date, index))
      : []);
  failedCount += await collectPairsIntoCache({ pairs: optimizationPairs, cache, attempted, requestDirections });

  const routeLegEstimates = scheduledLegs.flatMap((leg) => {
    const pair = pairForLeg(input, leg);
    if (!pair) return [];
    const result = cache.get(pairKey(pair));
    if (!result) return [];
    return [{
      fromItemId: leg.from.id,
      toItemId: leg.to.id,
      date: leg.date,
      departureTime: leg.departureTime,
      mode: "car" as const,
      durationSeconds: result.durationSeconds,
      distanceMeters: result.distanceMeters,
      ...(Number.isFinite(result.tollFareWon) ? { tollFareWon: result.tollFareWon } : {}),
      ...(Number.isFinite(result.taxiFareWon) ? { taxiFareWon: result.taxiFareWon } : {}),
      provider: "kakao-mobility" as const,
      timingBasis: "current-traffic" as const,
      fetchedAt,
    }];
  });

  const routeOrderEvaluations = [...locatedByDate.entries()].flatMap(([date, items]) => {
    const evaluation = bestAdjacentSwap(
      input,
      date,
      items,
      cache,
      fetchedAt,
      (index) => canSwapAtIndex(date, index),
    );
    return evaluation ? [evaluation] : [];
  });
  return {
    routeLegEstimates,
    routeOrderEvaluations,
    routeCollection: {
      requiredLegCount: scheduledLegs.length,
      analyzedLegCount: routeLegEstimates.length,
      mode: "car",
      provider: "kakao-mobility",
      timingBasis: "current-traffic",
      ...(failedCount || routeLegEstimates.length < scheduledLegs.length
        ? { unavailableReason: "좌표 누락 또는 길찾기 실패 구간은 판단에서 제외했어요." }
        : {}),
    },
  };
}
