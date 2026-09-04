import type { EntityId, ItineraryItem, Place, TripCandidate, UserPreferenceResult } from "../../../domain";
import type {
  ConfirmedScheduleConstraint,
  DuriAnalysisInput,
  SharedPreferenceMemberEvidence,
} from "../../../duri/duri-analysis";
import { normalizeTrait } from "../../../duri/duri-analysis/shared";
import { normalizePreferenceResult, solveIntervalPreferenceConsensus } from "../../../duri/group-preferences";
import { buildItineraryFingerprint, generateSuggestionId } from "../../../duri/duri-suggestions";
import { SLOT_MINUTES } from "../../../data/workspaceSchedule";
import { getTripDates, minutesToTimeString, timeStringToMinutes } from "../../../utils/schedule";
import { DURI_SUGGESTION_VERSION } from "../constants";
import type { DuriAnalysisSession, DuriSuggestionEnvelope } from "../types";
import { isUsableConfirmedScheduleConstraint, itineraryItemCoversConfirmedTime } from "./confirmedScheduleConstraint";
import {
  parseRecommendedDurationMinutes,
  placeOperatingAvailabilityForDate,
  type PlaceOperatingAvailability,
} from "./placeConstraintAnalysis";
import { analyzeTripEndCondition, buildTripEndConditionTimelineEntry } from "../../workspace/logic/tripEndCondition";
import {
  findSharedCandidateSignalConflicts,
  getSharedCandidateSignal,
  getUsableSharedPreferenceEvidence,
} from "./sharedPreferenceEvidence";

const MAX_AUTO_FILL_CANDIDATES = 128;
const MAX_AUTO_FILL_MEMBERS = 64;
const MAX_AUTO_FILL_ITEMS = 64;
const MAX_PREFERENCE_TAGS_PER_MEMBER = 64;
const MAX_PREFERENCE_TAG_LENGTH = 80;
const EXACT_BUNDLE_EVALUATION_LIMIT = 20_000n;
const EXACT_BUNDLE_UTILITY_WORK_LIMIT = 500_000n;
const BEAM_WIDTH = 128;
const HEURISTIC_EXPANSION_BUDGET = 40_000;
const MIN_BEAM_WIDTH = 6;
const LOCAL_SEARCH_ROUND_LIMIT = 8;
const EXACT_DURATION_PACKING_STATE_LIMIT = 40_000;
const EXACT_ROUTE_SEQUENCE_ITEM_LIMIT = 11;
// 데이터가 전혀 없는 cold-start에서만 쓰는 편집 가능한 초안이다. 실제 영업
// 사실이나 체류시간으로 가장하지 않고 항상 preview-only/low-confidence로 남긴다.
const PROVISIONAL_DAY_START_MINUTES = 10 * 60;
const PROVISIONAL_DAY_END_MINUTES = 20 * 60;
const PROVISIONAL_VISIT_DURATION_MINUTES = SLOT_MINUTES * 6;

export type AutoFillPreferenceEvidenceSource = "preference-result" | "shared-room-evidence" | "travel-type-snapshot" | "candidate-selection";

export type AutoFillSupplementalPreferenceEvidence = {
  tags: readonly string[];
  source: "travel-type-snapshot";
};

export type PreferenceAutoFillRequest = {
  dailyStartTime?: string;
  dailyEndTime?: string;
  proposedVisitDurationMinutes?: number;
  maxNewItems?: number;
  /**
   * API member travelTypeSnapshot처럼 서버가 실제로 보존한 태그만 받는다.
   * 상세 설문 결과가 있는 참여자는 상세 결과가 우선하며 두 값을 합쳐 꾸미지 않는다.
   */
  supplementalPreferenceEvidenceByMemberId?: Readonly<Record<EntityId, AutoFillSupplementalPreferenceEvidence | undefined>>;
  /**
   * 현재 요청에서만 지역 검색으로 보탠 장소다. 저장된 DURI 추천 후보와
   * 혼동하지 않도록 화면 계층이 실제 발견 ID만 전달한다.
   */
  transientDiscoveryPlaceIds?: readonly EntityId[];
};

export type PreferenceAutoFillDefaults = {
  dailyStartTime?: string;
  dailyEndTime?: string;
  proposedVisitDurationMinutes?: number;
  maxNewItems?: number;
  preferredDailyScheduledMinutes?: number;
  /** 0도 관측된 하루 일정량에서 계산된 유효 결과다. undefined와 구분한다. */
  derivedMaxNewItems?: number;
  provisionalTemplateUsed?: boolean;
  provisionalTimeWindowUsed?: boolean;
  provisionalDurationUsed?: boolean;
  sources: string[];
};

export type PreferenceAutoFillCandidateEvidence = {
  memberId: EntityId;
  source: AutoFillPreferenceEvidenceSource;
  explicitlyAdded: boolean;
  matchedTags: string[];
  matchedActivitySignals: {
    activityId: "restaurant" | "cafe" | "shopping" | "attraction" | "local" | "experience" | "nature";
    score: number;
    direction: "preference" | "aversion" | "numeric";
    source: "explicit-category-level" | "itinerary-allocation" | "landmark-importance" | "local-interest" | "shared-landmark-axis" | "shared-local-axis";
  }[];
  sharedCandidateSignal?: {
    mustVisit: boolean | null;
    avoid: boolean | null;
    preferenceStrength: 1 | 2 | 3 | 4 | 5 | null;
    version: number;
  };
};

export type PreferenceAutoFillAssignment = {
  itemId: EntityId;
  placeId: EntityId;
  placeName: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  durationEvidence: PreferenceAutoFillDurationEvidence;
  preferredByUserIds: EntityId[];
  preferenceEvidence: PreferenceAutoFillCandidateEvidence[];
};

export type PreferenceAutoFillDurationEvidence = {
  placeId: EntityId;
  source:
    | "classification-level-3"
    | "classification-level-2"
    | "content-type"
    | "activity-taxonomy"
    | "exact-category"
    | "trip-visit-median"
    | "group-schedule-consensus"
    | "candidate-evidence-median"
    | "tour-recommended-minimum"
    | "editable-template"
    | "user-fallback";
  durationMinutes: number;
  lowerMinutes: number;
  /** 공식 하한만 있는 경우 상한을 꾸며내지 않으므로 undefined다. */
  upperMinutes?: number;
  /** 표본·측정폭이 부족해 양방향 참고 범위를 계산할 수 없는 중심 추정이다. */
  rangeUnknown?: boolean;
  /** 통계 범위가 아니라 한쪽 방향의 공식 최소시간만 확보한 추정인지 구분한다. */
  lowerBoundOnly: boolean;
  officialMinimumMinutes?: number;
  officialRecommendedDurationText?: string;
  officialEvidenceFetchedAt?: string;
  preOfficialDurationMinutes?: number;
  preOfficialUpperMinutes?: number;
  /** 공식 하한이 기존 경험적/입력 범위의 상한을 넘어 유한 상한을 보존할 수 없는 경우다. */
  officialFloorExceededReferenceRange?: boolean;
  sampleSize: number;
  effectiveSampleSize: number;
  /** 동일 여행에서 근거로 실제 사용한 기존 일정 ID. */
  supportingItemIds: EntityId[];
  /** 데이터 자체가 허용한 추천값 주변 최대 편차. 확률 신뢰구간으로 과장하지 않는다. */
  maximumObservedDeviationMinutes: number;
  shrinkageApplied: boolean;
  components: {
    source: PreferenceAutoFillDurationEvidence["source"];
    sampleSize: number;
    centerMinutes: number;
    dispersionMinutes: number;
    normalizedPrecisionWeight: number;
  }[];
};

export type PreferenceAutoFillCertificate = {
  selectionBasis: "preference-fairness" | "preference-with-neutral-supplement" | "neutral-structural" | "unavailable";
  countBasis: "explicit-limit" | "observed-daily-volume" | "maximal-feasible-schedule" | "unavailable";
  selectionExact: boolean;
  exactScope: "candidate-bundle-and-duration-packing" | "candidate-bundle-only" | "none";
  searchMethod: "exhaustive" | "bounded-beam-and-one-swap";
  heuristicBeamWidth?: number;
  localSearchConverged?: boolean;
  evaluatedBundleCount: number;
  candidateCount: number;
  selectedCount: number;
  slotCapacity: number;
  preferenceEvidenceMemberIds: EntityId[];
  modeledMemberIds: EntityId[];
  unrepresentedPreferenceMemberIds: EntityId[];
  missingPreferenceMemberIds: EntityId[];
  snapshotEvidenceMemberIds: EntityId[];
  candidateSelectionOnlyMemberIds: EntityId[];
  sharedEvidenceMemberIds: EntityId[];
  mandatorySharedPlaceIds: EntityId[];
  excludedAvoidPlaceIds: EntityId[];
  discoveryCandidatePlaceIds: EntityId[];
  localApplyEligible: boolean;
  localApplyBlockReasons: string[];
  /** 위반은 아니지만 적용 전에 사용자가 확인해야 하는 외부 사실. */
  localApplyReviewWarnings: string[];
  dayAllocations: {
    date: string;
    existingMinutes: number;
    addedCount: number;
    slotCapacity: number;
    preferredDailyScheduledMinutes?: number;
  }[];
  minimumNormalizedSatisfaction?: number;
  normalizedSatisfactionByMember: Record<EntityId, number>;
  fairnessNormalizationBasis: "feasible-schedule-exact" | "relaxed-candidate-bound" | "unavailable";
  fairness?: {
    minimumNormalizedSatisfaction: number;
    nashWelfare: number;
    maximumRegret: number;
    meanRegret: number;
    paretoEfficientWithinEvaluatedBundles: boolean;
    utilityModel: "ordinal-candidate-rank";
  };
  durationEstimates: PreferenceAutoFillDurationEvidence[];
  durationPackingExact: boolean;
  durationPackingExpandedStates: number;
  feasibleCountRange?: {
    minimum: number;
    maximumConfirmed: number;
    maximumCertified: boolean;
    selected: number;
    selectionPolicy: "maximal-feasible";
  };
  structuralSelection?: {
    recognizedCategoryCount: number;
    categoryConcentrationPairs: number;
    comparableCoordinateCoverage: boolean;
    mstDistanceMeters?: number;
  };
  geographicPlacement?: {
    method: "haversine-gap-path";
    comparableAssignmentCount: number;
    totalInsertionDistanceMeters: number;
    totalPathDistanceMeters: number;
    optimizedGapCount: number;
    exactSequence: boolean;
  };
  transitionBuffer: {
    minutes: number;
    basis: "observed-route-duration" | "editing-grid-default";
  };
  operatingFacts: {
    checkedAssignmentCount: number;
    windowRestrictedAssignmentCount: number;
    unknownAssignmentCount: number;
    excludedClosedPlaceDateCount: number;
  };
  provisionalRhythm?: {
    method: "even-slack-within-gap";
    adjustedGapCount: number;
  };
  candidatePrefilter?: {
    originalEligibleCount: number;
    consideredCount: number;
    omittedCount: number;
    method: "mandatory-then-category-round-robin";
  };
  degradedEvidence: ("documents" | "planning" | "shared-preferences")[];
  assumptions: string[];
};

export type PreferenceAutoFillPlan = {
  status: "preview-only" | "insufficient-data" | "invalid-request" | "no-space" | "no-candidates";
  mode: "empty-itinerary" | "partial-itinerary";
  message: string;
  assignments: PreferenceAutoFillAssignment[];
  certificate: PreferenceAutoFillCertificate;
  limitations: string[];
};

export function shouldAugmentPreferenceAutoFillWithDiscovery(
  plan: PreferenceAutoFillPlan,
  request: PreferenceAutoFillRequest,
) {
  if (plan.status === "no-candidates" || plan.status === "insufficient-data") return true;
  if (plan.status === "no-space") return request.maxNewItems === undefined;
  return plan.status === "preview-only"
    && plan.certificate.countBasis === "maximal-feasible-schedule"
    && plan.certificate.selectedCount === plan.certificate.candidateCount
    && plan.certificate.selectedCount < plan.certificate.slotCapacity;
}

type PreferenceEvidence = {
  memberId: EntityId;
  tags: string[];
  source: AutoFillPreferenceEvidenceSource;
  result?: UserPreferenceResult;
  sharedMember?: SharedPreferenceMemberEvidence;
};

type CandidateModel = {
  candidate: TripCandidate;
  place: Place;
  evidence: PreferenceAutoFillCandidateEvidence[];
  utilityByMember: number[];
  directSupportCount: number;
  matchedTagCount: number;
  explicitPreferenceCount: number;
  explicitAversionCount: number;
  numericPreferenceScore: number;
  sharedPreferenceStrengthScore: number;
  mandatory: boolean;
  structuralCategoryKey: string;
  structuralCoordinates?: StructuralCoordinates;
  operatingAvailabilityByDate: Readonly<Record<string, PlaceOperatingAvailability>>;
  durationEvidence: PreferenceAutoFillDurationEvidence;
};

type CandidateModelDiagnostics = {
  candidatePlaceIds: EntityId[];
  scheduledPlaceIds: EntityId[];
  fixedUnlinkedPlaceIds: EntityId[];
  missingPlaceIds: EntityId[];
  wrongRegionPlaceIds: EntityId[];
  conflictedPlaceIds: EntityId[];
  validUnscheduledPlaceIds: EntityId[];
};

type StructuralCoordinates = { latitude: number; longitude: number };
type PlacementSlot = { date: string; startMinute: number };
type PlacementGap = {
  date: string;
  startMinute: number;
  endMinute: number;
  requiresStartTransition: boolean;
  requiresEndTransition: boolean;
  previousCoordinates?: StructuralCoordinates;
  nextCoordinates?: StructuralCoordinates;
};
type PackedCandidatePlacement = { candidateIndex: number; date: string; startMinute: number; gapIndex: number };
type Fraction = { numerator: bigint; denominator: bigint };
type UtilityRange = { minimum: number; maximum: number };
type BundleStructuralContext = {
  candidates: readonly CandidateModel[];
  distanceMatrix?: readonly (readonly number[])[];
  /**
   * 후보 좌표를 단위 구면의 3차원 벡터로 바꾼 값이다. Beam의 미완성 묶음은
   * 아직 어떤 후보로 완성될지 모르므로 exact MST를 계산하지 않고, 이 벡터의
   * pairwise chord dispersion을 O(k)에 계산해 지리적으로 뭉칠 가능성만 비교한다.
   */
  unitSphereCoordinates?: readonly (readonly [number, number, number])[];
  mstDistanceByIndexKey: Map<string, number>;
};

type BundleEvaluation = {
  indexes: number[];
  totals: number[];
  fractions: Fraction[];
  sortedFractions: Fraction[];
  nashNumerator: bigint;
  nashDenominator: bigint;
  directSupportCount: number;
  matchedTagCount: number;
  explicitPreferenceCount: number;
  explicitAversionCount: number;
  numericPreferenceScore: number;
  sharedPreferenceStrengthScore: number;
  recognizedCategoryCount: number;
  categoryConcentrationPairs: number;
  sphericalDispersion?: number;
  mstDistanceMeters?: number;
  mstDistanceResolved: boolean;
  structuralContext: BundleStructuralContext;
  stableKey: string;
};

function emptyCertificate(): PreferenceAutoFillCertificate {
  return {
    selectionBasis: "unavailable",
    countBasis: "unavailable",
    selectionExact: false,
    exactScope: "none",
    searchMethod: "bounded-beam-and-one-swap",
    evaluatedBundleCount: 0,
    candidateCount: 0,
    selectedCount: 0,
    slotCapacity: 0,
    preferenceEvidenceMemberIds: [],
    modeledMemberIds: [],
    unrepresentedPreferenceMemberIds: [],
    missingPreferenceMemberIds: [],
    snapshotEvidenceMemberIds: [],
    candidateSelectionOnlyMemberIds: [],
    sharedEvidenceMemberIds: [],
    mandatorySharedPlaceIds: [],
    excludedAvoidPlaceIds: [],
    discoveryCandidatePlaceIds: [],
    localApplyEligible: false,
    localApplyBlockReasons: [],
    localApplyReviewWarnings: [],
    dayAllocations: [],
    normalizedSatisfactionByMember: {},
    fairnessNormalizationBasis: "unavailable",
    durationEstimates: [],
    durationPackingExact: false,
    durationPackingExpandedStates: 0,
    transitionBuffer: { minutes: SLOT_MINUTES, basis: "editing-grid-default" },
    operatingFacts: {
      checkedAssignmentCount: 0,
      windowRestrictedAssignmentCount: 0,
      unknownAssignmentCount: 0,
      excludedClosedPlaceDateCount: 0,
    },
    degradedEvidence: [],
    assumptions: [],
  };
}

function emptyPlan(
  input: Pick<DuriAnalysisInput, "itinerary">,
  status: Exclude<PreferenceAutoFillPlan["status"], "preview-only">,
  message: string,
  limitations: string[] = [],
): PreferenceAutoFillPlan {
  return {
    status,
    mode: input.itinerary.length ? "partial-itinerary" : "empty-itinerary",
    message,
    assignments: [],
    certificate: emptyCertificate(),
    limitations,
  };
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function leastCommonMultiple(left: number, right: number) {
  return left / greatestCommonDivisor(left, right) * right;
}

function uniqueNormalizedTags(tags: readonly string[]) {
  const byNormalized = new Map<string, string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length > MAX_PREFERENCE_TAG_LENGTH) continue;
    const normalized = normalizeTrait(trimmed);
    if (!normalized) continue;
    const previous = byNormalized.get(normalized);
    if (!previous || compareText(trimmed, previous) < 0) byNormalized.set(normalized, trimmed);
  }
  return [...byNormalized.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .slice(0, MAX_PREFERENCE_TAGS_PER_MEMBER)
    .map(([, value]) => value);
}

function validDetailedPreferenceResult(result: UserPreferenceResult | undefined, memberId: string) {
  if (!result || result.detailedSignalsInvalid) return undefined;
  return normalizePreferenceResult(result, memberId) ? result : undefined;
}

function buildPreferenceEvidence(input: DuriAnalysisInput, request: PreferenceAutoFillRequest) {
  const memberIds = [...new Set(input.trip.members.map((member) => member.userId).filter(Boolean))].sort(compareText);
  if (memberIds.length > MAX_AUTO_FILL_MEMBERS) return { memberIds, evidence: [] as PreferenceEvidence[], tooMany: true };
  const sharedEvidence = getUsableSharedPreferenceEvidence(input);
  const sharedMembersById = new Map((sharedEvidence?.members ?? []).map((member) => [member.userId, member] as const));
  const sharedSignalMemberIds = new Set((sharedEvidence?.candidateSignals ?? []).flatMap((candidate) => candidate.signals
    .filter((signal) => signal.mustVisit === true || signal.avoid === true || signal.preferenceStrength !== null)
    .map((signal) => signal.userId)));
  const scheduledPlaceIds = new Set(input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const directCandidateMemberIds = new Set(input.candidates
    .filter((candidate) => candidate.tripId === input.trip.id && !scheduledPlaceIds.has(candidate.placeId))
    .filter((candidate) => {
      const place = input.placesById[candidate.placeId];
      return place?.regionId === input.trip.regionId;
    })
    .flatMap((candidate) => candidate.addedByUserIds));
  const evidence = memberIds.flatMap((memberId): PreferenceEvidence[] => {
    const result = validDetailedPreferenceResult(input.preferenceResults[memberId], memberId);
    if (result) {
      return [{
        memberId,
        tags: uniqueNormalizedTags(result.preferredTags),
        source: "preference-result",
        result,
      }];
    }
    const sharedMember = sharedMembersById.get(memberId);
    const sharedTags = sharedMember
      ? uniqueNormalizedTags([...(sharedMember.travelType?.tags ?? []), ...sharedMember.interestTags])
      : [];
    if (sharedMember && (sharedTags.length || sharedMember.personalityAxes || sharedSignalMemberIds.has(memberId))) {
      return [{
        memberId,
        tags: sharedTags,
        source: "shared-room-evidence",
        sharedMember,
      }];
    }
    const supplemental = request.supplementalPreferenceEvidenceByMemberId?.[memberId];
    const tags = supplemental?.source === "travel-type-snapshot"
      ? uniqueNormalizedTags(supplemental.tags)
      : [];
    if (tags.length) return [{ memberId, tags, source: "travel-type-snapshot" }];
    // 성향 설문 미응답을 0점으로 넣지는 않지만, 본인이 여행방 후보에 직접 담은
    // 행동은 그 후보에 한정된 명시적 선호 근거로 보존한다.
    return directCandidateMemberIds.has(memberId)
      ? [{ memberId, tags: [], source: "candidate-selection" }]
      : [];
  });
  return { memberIds, evidence, tooMany: false };
}

function detailedWindowObservations(input: DuriAnalysisInput) {
  const seenMemberIds = new Set<EntityId>();
  return input.trip.members.flatMap((member) => {
    if (!member.userId || seenMemberIds.has(member.userId)) return [];
    seenMemberIds.add(member.userId);
    const result = validDetailedPreferenceResult(input.preferenceResults[member.userId], member.userId);
    const signals = result?.detailedSignals;
    if (!signals || signals.surveyVersion !== 9 || signals.algorithmVersion !== 9) return [];
    const start = signals.preferredDayStartMinutes;
    const startResolution = signals.preferredDayStartResolutionMinutes;
    const end = signals.preferredDayEndMinutes;
    const endResolution = signals.preferredDayEndResolutionMinutes;
    const duration = signals.preferredAverageActivityBlockMinutes;
    const durationResolution = signals.preferredAverageActivityBlockResolutionMinutes;
    const daily = signals.preferredDailyScheduledMinutes;
    const dailyResolution = signals.preferredDailyScheduledResolutionMinutes;
    const validResolution = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0;
    const validWindow = start !== undefined && end !== undefined
      && Number.isFinite(start) && Number.isFinite(end)
      && start >= 0 && start < 24 * 60 && end > start && end <= 24 * 60
      && validResolution(startResolution) && validResolution(endResolution);
    const validDuration = duration !== undefined && Number.isFinite(duration)
      && duration > 0 && duration <= 24 * 60 && validResolution(durationResolution);
    const validDaily = daily !== undefined && Number.isFinite(daily)
      && daily >= 0 && daily <= 24 * 60 && validResolution(dailyResolution);
    return [{
      userId: member.userId,
      ...(validWindow ? {
        start: { value: start, resolution: startResolution },
        end: { value: end, resolution: endResolution },
      } : {}),
      ...(validDuration ? { duration: { value: duration, resolution: durationResolution } } : {}),
      ...(validDaily ? { daily: { value: daily, resolution: dailyResolution } } : {}),
    }];
  });
}

function snapNearest(minutes: number) {
  return Math.max(SLOT_MINUTES, Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES);
}

function intervalConsensusValue(
  observations: { userId: string; value: number; resolution: number }[],
  minimum: number,
  maximum: number,
) {
  if (!observations.length) return undefined;
  try {
    return solveIntervalPreferenceConsensus(observations.map((entry) => ({ ...entry, minimum, maximum }))).recommendedValue;
  } catch {
    // persisted 상세 신호가 미래/손상 schema여도 분석 화면 render를 중단하지 않는다.
    return undefined;
  }
}

function occupiedMinutesOnDate(itinerary: readonly ItineraryItem[], date: string) {
  const intervals = itinerary.filter((item) => item.date === date).flatMap((item) => {
    const start = timeStringToMinutes(item.startTime);
    return Number.isFinite(start) && Number.isInteger(item.durationMinutes) && item.durationMinutes > 0
      ? [{ start, end: start + item.durationMinutes }]
      : [];
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  let total = 0;
  let current: { start: number; end: number } | undefined;
  intervals.forEach((interval) => {
    if (!current) current = { ...interval };
    else if (interval.start <= current.end) current.end = Math.max(current.end, interval.end);
    else {
      total += current.end - current.start;
      current = { ...interval };
    }
  });
  return total + (current ? current.end - current.start : 0);
}

function observedItineraryWindow(input: DuriAnalysisInput) {
  const tripDates = new Set(getTripDates(input.trip.startDate, input.trip.endDate));
  const byDate = new Map<string, { start: number; end: number }>();
  input.itinerary.forEach((item) => {
    const start = timeStringToMinutes(item.startTime);
    const end = start + item.durationMinutes;
    if (item.tripId !== input.trip.id
      || !tripDates.has(item.date)
      || !Number.isFinite(start)
      || !Number.isInteger(item.durationMinutes)
      || item.durationMinutes < 1
      || end > 24 * 60) return;
    const current = byDate.get(item.date);
    byDate.set(item.date, current
      ? { start: Math.min(current.start, start), end: Math.max(current.end, end) }
      : { start, end });
  });
  const observations = [...byDate.values()];
  if (!observations.length) return undefined;
  return {
    // 서로 다른 DAY의 극단값을 한 날의 활동 창처럼 합치지 않는다. 관측 날짜별
    // 시작·종료를 각각 robust median으로 모아 공통 편집 기본값만 만든다.
    start: median(observations.map((entry) => entry.start)),
    end: median(observations.map((entry) => entry.end)),
    observedDayCount: observations.length,
  };
}

/**
 * 설문 시간 관측을 우선하고, 부분 일정에서는 날짜별 실제 활동 범위의 중앙값을
 * 사용한다. 둘 다 없는 cold-start는 생성 자체를 막지 않고 편집 가능한 낮은
 * 신뢰도의 주간 여행 템플릿을 쓰되, 이를 관측 사실과 분리해 표시한다.
 */
export function derivePreferenceAutoFillDefaults(input: DuriAnalysisInput): PreferenceAutoFillDefaults {
  const observations = detailedWindowObservations(input);
  const start = intervalConsensusValue(observations.flatMap((entry) => entry.start ? [{ userId: entry.userId, ...entry.start }] : []), 0, 24 * 60 - 1);
  const end = intervalConsensusValue(observations.flatMap((entry) => entry.end ? [{ userId: entry.userId, ...entry.end }] : []), 1, 24 * 60);
  const duration = intervalConsensusValue(observations.flatMap((entry) => entry.duration ? [{ userId: entry.userId, ...entry.duration }] : []), SLOT_MINUTES, 24 * 60);
  const daily = intervalConsensusValue(observations.flatMap((entry) => entry.daily ? [{ userId: entry.userId, ...entry.daily }] : []), 0, 24 * 60);
  const itineraryWindow = observedItineraryWindow(input);
  const itineraryStart = itineraryWindow
    ? Math.floor(itineraryWindow.start / SLOT_MINUTES) * SLOT_MINUTES
    : undefined;
  const itineraryEnd = itineraryWindow
    ? Math.ceil(itineraryWindow.end / SLOT_MINUTES) * SLOT_MINUTES
    : undefined;
  // 부분 일정의 첫/마지막 시각은 이미 채워진 작은 구간일 뿐 하루 전체 활동
  // 가능 범위라는 뜻이 아니다. 설문이 없으면 공개된 10~20시 편집 템플릿을
  // 기준으로 삼고, 실제 일정이 그 바깥에 있을 때만 범위를 확장한다.
  const resolvedStart = start ?? Math.min(itineraryStart ?? PROVISIONAL_DAY_START_MINUTES, PROVISIONAL_DAY_START_MINUTES);
  const resolvedEnd = end ?? Math.max(itineraryEnd ?? PROVISIONAL_DAY_END_MINUTES, PROVISIONAL_DAY_END_MINUTES);
  const snappedDuration = duration === undefined
    ? PROVISIONAL_VISIT_DURATION_MINUTES
    : snapNearest(duration);
  const provisionalTimeWindowUsed = start === undefined || end === undefined;
  const provisionalTemplateUsed = provisionalTimeWindowUsed || duration === undefined;
  const tripDates = getTripDates(input.trip.startDate, input.trip.endDate);
  const unscheduledCandidateCount = input.candidates.filter((candidate) => !input.itinerary.some((item) => item.placeId === candidate.placeId)).length;
  const derivedMax = daily !== undefined && snappedDuration
    ? Math.min(
      unscheduledCandidateCount,
      tripDates.reduce((total, date) => total + Math.max(0, Math.floor((daily - occupiedMinutesOnDate(input.itinerary, date)) / snappedDuration)), 0),
    )
    : undefined;
  const sources: string[] = [];
  if (start !== undefined && end !== undefined) sources.push(`설문 시간표 첫·마지막 활동 ${observations.filter((entry) => entry.start && entry.end).length}명의 차이를 고르게 맞춘 값`);
  if (provisionalTimeWindowUsed && itineraryWindow) {
    sources.push(`편집 템플릿을 현재 일정 ${itineraryWindow.observedDayCount}일의 실제 첫·마지막 배치 범위까지 확장`);
  }
  if (duration !== undefined) sources.push(`설문 비휴식 활동 블록 ${observations.filter((entry) => entry.duration).length}명의 차이를 고르게 맞춘 값`);
  if (daily !== undefined) sources.push(`설문 하루 일정량 ${observations.filter((entry) => entry.daily).length}명의 차이를 고르게 맞춘 값`);
  if (provisionalTimeWindowUsed) {
    sources.push(`설문 시간대가 없는 날짜의 편집 가능한 낮은 신뢰도 활동 창 ${minutesToTimeString(PROVISIONAL_DAY_START_MINUTES)}~${minutesToTimeString(PROVISIONAL_DAY_END_MINUTES)}`);
  }
  if (duration === undefined) {
    sources.push(`장소별 근거가 모두 없을 때만 쓰는 편집 가능한 낮은 신뢰도 체류 블록 ${PROVISIONAL_VISIT_DURATION_MINUTES}분`);
  }
  return {
    dailyStartTime: minutesToTimeString(Math.max(0, Math.round(resolvedStart / SLOT_MINUTES) * SLOT_MINUTES)),
    dailyEndTime: minutesToTimeString(Math.min(24 * 60, Math.round(resolvedEnd / SLOT_MINUTES) * SLOT_MINUTES)),
    proposedVisitDurationMinutes: snappedDuration,
    ...(derivedMax === undefined || derivedMax < 1 ? {} : { maxNewItems: Math.min(derivedMax, MAX_AUTO_FILL_ITEMS) }),
    ...(derivedMax === undefined ? {} : { derivedMaxNewItems: Math.min(derivedMax, MAX_AUTO_FILL_ITEMS) }),
    ...(daily === undefined ? {} : { preferredDailyScheduledMinutes: daily }),
    ...(provisionalTemplateUsed ? { provisionalTemplateUsed: true } : {}),
    ...(provisionalTimeWindowUsed ? { provisionalTimeWindowUsed: true } : {}),
    ...(duration === undefined ? { provisionalDurationUsed: true } : {}),
    sources,
  };
}

function resolveRequest(input: DuriAnalysisInput, request: PreferenceAutoFillRequest) {
  const defaults = derivePreferenceAutoFillDefaults(input);
  const startTime = request.dailyStartTime?.trim() || defaults.dailyStartTime;
  const endTime = request.dailyEndTime?.trim() || defaults.dailyEndTime;
  const duration = request.proposedVisitDurationMinutes ?? defaults.proposedVisitDurationMinutes;
  const maxNewItems = request.maxNewItems ?? defaults.maxNewItems;
  const countBasis = request.maxNewItems !== undefined
    ? "explicit-limit" as const
    : defaults.derivedMaxNewItems !== undefined
      ? "observed-daily-volume" as const
      : "maximal-feasible-schedule" as const;
  const provisionalTimeWindowUsed = Boolean(
    defaults.provisionalTimeWindowUsed
    && (!request.dailyStartTime?.trim() || !request.dailyEndTime?.trim()),
  );
  const provisionalDurationUsed = Boolean(
    defaults.provisionalDurationUsed
    && request.proposedVisitDurationMinutes === undefined,
  );
  const start = startTime ? timeStringToMinutes(startTime) : Number.NaN;
  const end = endTime ? timeStringToMinutes(endTime) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 * 60 || start >= end) {
    return { valid: false as const, message: "하루 활동 시작·종료 시각이 필요해요. 새 설문 관측값이 없으면 사용자가 직접 입력해 주세요." };
  }
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    return { valid: false as const, message: "자동 배치 시작·종료 시각은 이동·편집 격자와 같은 15분 단위여야 해요." };
  }
  if (duration !== undefined && (!Number.isInteger(duration) || duration < SLOT_MINUTES || duration % SLOT_MINUTES !== 0 || duration > 24 * 60)) {
    return { valid: false as const, message: "후보 1곳의 초안 체류시간을 15분 단위로 입력해 주세요. 장소 운영정보로 확정된 체류시간이라는 뜻은 아니에요." };
  }
  if (maxNewItems === undefined) {
    if (defaults.derivedMaxNewItems === 0) {
      const hasUnscheduledCandidate = input.candidates.some((candidate) => (
        !input.itinerary.some((item) => item.placeId === candidate.placeId)
      ));
      return {
        valid: false as const,
        status: hasUnscheduledCandidate ? "no-space" as const : "no-candidates" as const,
        message: hasUnscheduledCandidate
          ? "설문에서 관측한 하루 일정량을 기존 일정이 이미 채우고 있어 자동으로 더 넣을 장소 수가 0이에요. 더 채우려면 고급 설정에서 추가 개수를 직접 늘려 주세요."
          : "아직 일정에 없는 후보 장소가 없어요.",
      };
    }
  }
  if (maxNewItems !== undefined && (!Number.isInteger(maxNewItems) || maxNewItems < 1 || maxNewItems > MAX_AUTO_FILL_ITEMS)) {
    return { valid: false as const, message: `추가할 장소 수는 1~${MAX_AUTO_FILL_ITEMS}개 사이의 정수로 입력해 주세요.` };
  }
  return {
    valid: true as const,
    start,
    end,
    duration,
    maxNewItems,
    countBasis,
    defaults,
    provisionalTimeWindowUsed,
    provisionalDurationUsed,
  };
}

function compareFraction(left: Fraction, right: Fraction) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function compareFractionVectors(left: readonly Fraction[], right: readonly Fraction[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const compared = compareFraction(left[index], right[index]);
    if (compared !== 0) return compared;
  }
  return left.length - right.length;
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitudeLeft = radians(left.latitude);
  const latitudeRight = radians(right.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeLeft) * Math.cos(latitudeRight) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * 실제 도로 경로가 아니라 후보 묶음의 지리적 흩어짐을 비교하는 보조 지표다.
 * 모든 eligible 후보에 좌표가 있을 때만 호출하여 좌표 누락을 0거리로 꾸미지 않는다.
 */
function createBundleStructuralContext(candidates: readonly CandidateModel[]): BundleStructuralContext {
  const coordinates = candidates.map((candidate) => candidate.structuralCoordinates);
  if (coordinates.some((coordinate) => !coordinate)) {
    return { candidates, mstDistanceByIndexKey: new Map() };
  }
  const located = coordinates as StructuralCoordinates[];
  const radians = (value: number) => value * Math.PI / 180;
  const unitSphereCoordinates = located.map(({ latitude, longitude }) => {
    const latitudeRadians = radians(latitude);
    const longitudeRadians = radians(longitude);
    const latitudeRadius = Math.cos(latitudeRadians);
    return [
      latitudeRadius * Math.cos(longitudeRadians),
      latitudeRadius * Math.sin(longitudeRadians),
      Math.sin(latitudeRadians),
    ] as const;
  });
  const distanceMatrix = located.map(() => Array<number>(located.length).fill(0));
  for (let left = 0; left < located.length; left += 1) {
    for (let right = left + 1; right < located.length; right += 1) {
      const distance = distanceMeters(located[left], located[right]);
      distanceMatrix[left][right] = distance;
      distanceMatrix[right][left] = distance;
    }
  }
  return { candidates, distanceMatrix, unitSphereCoordinates, mstDistanceByIndexKey: new Map() };
}

/**
 * 단위 구면 벡터 x_i에 대해
 *   sum_{i<j} ||x_i - x_j||^2 = k^2 - ||sum_i x_i||^2
 * 이므로 모든 쌍을 열거하지 않고 O(k)에 응집도를 계산할 수 있다. 실제 도로
 * 거리나 최종 MST를 대신하는 값은 아니며, 미완성 beam 상태의 tie-break에만 쓴다.
 */
function sphericalChordDispersion(context: BundleStructuralContext, indexes: readonly number[]) {
  const unitSphereCoordinates = context.unitSphereCoordinates;
  if (!unitSphereCoordinates || indexes.length < 2) return unitSphereCoordinates ? 0 : undefined;
  let x = 0;
  let y = 0;
  let z = 0;
  indexes.forEach((index) => {
    const coordinate = unitSphereCoordinates[index];
    x += coordinate[0];
    y += coordinate[1];
    z += coordinate[2];
  });
  const count = indexes.length;
  return Math.max(0, count * count - (x * x + y * y + z * z));
}

function minimumSpanningTreeDistanceMeters(context: BundleStructuralContext, indexes: readonly number[]) {
  if (indexes.length < 2) return 0;
  const distanceMatrix = context.distanceMatrix;
  if (!distanceMatrix) return undefined;
  const indexKey = indexes.join(",");
  const cached = context.mstDistanceByIndexKey.get(indexKey);
  if (cached !== undefined) return cached;
  const visited = new Set<number>([0]);
  const bestEdge = indexes.map((candidateIndex, index) => (
    index === 0 ? 0 : distanceMatrix[indexes[0]][candidateIndex]
  ));
  let total = 0;
  while (visited.size < indexes.length) {
    let next = -1;
    for (let index = 0; index < indexes.length; index += 1) {
      if (!visited.has(index) && (next < 0 || bestEdge[index] < bestEdge[next])) next = index;
    }
    if (next < 0 || !Number.isFinite(bestEdge[next])) return undefined;
    total += bestEdge[next];
    visited.add(next);
    for (let index = 0; index < indexes.length; index += 1) {
      if (visited.has(index)) continue;
      bestEdge[index] = Math.min(bestEdge[index], distanceMatrix[indexes[next]][indexes[index]]);
    }
  }
  context.mstDistanceByIndexKey.set(indexKey, total);
  return total;
}

function resolvedMstDistanceMeters(evaluation: BundleEvaluation) {
  if (!evaluation.mstDistanceResolved) {
    evaluation.mstDistanceMeters = minimumSpanningTreeDistanceMeters(
      evaluation.structuralContext,
      evaluation.indexes,
    );
    evaluation.mstDistanceResolved = true;
  }
  return evaluation.mstDistanceMeters;
}

function compareBundle(
  left: BundleEvaluation,
  right: BundleEvaluation,
  geographicTieBreak: "exact-mst" | "partial-dispersion" = "exact-mst",
) {
  const minimum = compareFraction(left.sortedFractions[0] ?? { numerator: 0n, denominator: 1n }, right.sortedFractions[0] ?? { numerator: 0n, denominator: 1n });
  if (minimum !== 0) return minimum;
  const nash = left.nashNumerator * right.nashDenominator - right.nashNumerator * left.nashDenominator;
  if (nash !== 0n) return nash < 0n ? -1 : 1;
  const leximin = compareFractionVectors(left.sortedFractions, right.sortedFractions);
  if (leximin !== 0) return leximin;
  // 공정성 목적이 같은 경우 한 사람의 명시적 dislike를 다른 사람의 직접 담기나
  // 태그 수로 상쇄하지 않는다. avoid는 앞 단계에서 이미 Hard 제외된다.
  if (left.explicitAversionCount !== right.explicitAversionCount) return right.explicitAversionCount - left.explicitAversionCount;
  if (left.sharedPreferenceStrengthScore !== right.sharedPreferenceStrengthScore) return left.sharedPreferenceStrengthScore - right.sharedPreferenceStrengthScore;
  if (left.directSupportCount !== right.directSupportCount) return left.directSupportCount - right.directSupportCount;
  if (left.matchedTagCount !== right.matchedTagCount) return left.matchedTagCount - right.matchedTagCount;
  if (left.explicitPreferenceCount !== right.explicitPreferenceCount) return left.explicitPreferenceCount - right.explicitPreferenceCount;
  if (left.numericPreferenceScore !== right.numericPreferenceScore) return left.numericPreferenceScore - right.numericPreferenceScore;
  if (left.recognizedCategoryCount !== right.recognizedCategoryCount) return left.recognizedCategoryCount - right.recognizedCategoryCount;
  if (left.categoryConcentrationPairs !== right.categoryConcentrationPairs) return right.categoryConcentrationPairs - left.categoryConcentrationPairs;
  if (geographicTieBreak === "partial-dispersion") {
    const leftDispersion = left.sphericalDispersion;
    const rightDispersion = right.sphericalDispersion;
    if (leftDispersion !== undefined && rightDispersion !== undefined && leftDispersion !== rightDispersion) {
      return rightDispersion - leftDispersion;
    }
    return -compareText(left.stableKey, right.stableKey);
  }
  const leftMstDistance = resolvedMstDistanceMeters(left);
  const rightMstDistance = resolvedMstDistanceMeters(right);
  if (leftMstDistance !== undefined && rightMstDistance !== undefined && leftMstDistance !== rightMstDistance) {
    return rightMstDistance - leftMstDistance;
  }
  return -compareText(left.stableKey, right.stableKey);
}

function combinationCountCapped(total: number, selected: number, cap: bigint) {
  const k = Math.min(selected, total - selected);
  let count = 1n;
  for (let index = 1; index <= k; index += 1) {
    count = count * BigInt(total - k + index) / BigInt(index);
    if (count > cap) return cap + 1n;
  }
  return count;
}

function evaluationFromTotals(
  indexes: readonly number[],
  totals: readonly number[],
  directSupportCount: number,
  matchedTagCount: number,
  explicitPreferenceCount: number,
  explicitAversionCount: number,
  numericPreferenceScore: number,
  sharedPreferenceStrengthScore: number,
  candidates: readonly CandidateModel[],
  utilityRanges: readonly UtilityRange[],
  structuralContext: BundleStructuralContext,
): BundleEvaluation {
  const fractions = totals.map((total, memberIndex) => ({
    numerator: BigInt(total - utilityRanges[memberIndex].minimum),
    denominator: BigInt(utilityRanges[memberIndex].maximum - utilityRanges[memberIndex].minimum),
  }));
  const sortedFractions = [...fractions].sort(compareFraction);
  let nashNumerator = 1n;
  let nashDenominator = 1n;
  fractions.forEach((fraction) => {
    nashNumerator *= fraction.numerator;
    nashDenominator *= fraction.denominator;
  });
  const sortedIndexes = [...indexes].sort((left, right) => left - right);
  const categoryCounts: Record<string, number> = {};
  sortedIndexes.forEach((index) => {
    const key = candidates[index].structuralCategoryKey;
    categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
  });
  return {
    indexes: sortedIndexes,
    totals: [...totals],
    fractions,
    sortedFractions,
    nashNumerator,
    nashDenominator,
    directSupportCount,
    matchedTagCount,
    explicitPreferenceCount,
    explicitAversionCount,
    numericPreferenceScore,
    sharedPreferenceStrengthScore,
    recognizedCategoryCount: Object.keys(categoryCounts).filter((key) => key !== "unknown").length,
    categoryConcentrationPairs: Object.values(categoryCounts)
      .reduce((sum, count) => sum + count * (count - 1) / 2, 0),
    sphericalDispersion: sphericalChordDispersion(structuralContext, sortedIndexes),
    mstDistanceResolved: false,
    structuralContext,
    stableKey: sortedIndexes.map((index) => candidates[index].place.id).join("\u0000"),
  };
}

function evaluateBundle(
  indexes: readonly number[],
  candidates: readonly CandidateModel[],
  utilityRanges: readonly UtilityRange[],
  structuralContext: BundleStructuralContext,
): BundleEvaluation {
  const totals = utilityRanges.map((_, memberIndex) => indexes.reduce((sum, candidateIndex) => sum + candidates[candidateIndex].utilityByMember[memberIndex], 0));
  return evaluationFromTotals(
    indexes,
    totals,
    indexes.reduce((sum, index) => sum + candidates[index].directSupportCount, 0),
    indexes.reduce((sum, index) => sum + candidates[index].matchedTagCount, 0),
    indexes.reduce((sum, index) => sum + candidates[index].explicitPreferenceCount, 0),
    indexes.reduce((sum, index) => sum + candidates[index].explicitAversionCount, 0),
    indexes.reduce((sum, index) => sum + candidates[index].numericPreferenceScore, 0),
    indexes.reduce((sum, index) => sum + candidates[index].sharedPreferenceStrengthScore, 0),
    candidates,
    utilityRanges,
    structuralContext,
  );
}

function extendEvaluation(current: BundleEvaluation, added: number, candidates: readonly CandidateModel[], utilityRanges: readonly UtilityRange[]) {
  const candidate = candidates[added];
  return evaluationFromTotals(
    [...current.indexes, added],
    current.totals.map((total, memberIndex) => total + candidate.utilityByMember[memberIndex]),
    current.directSupportCount + candidate.directSupportCount,
    current.matchedTagCount + candidate.matchedTagCount,
    current.explicitPreferenceCount + candidate.explicitPreferenceCount,
    current.explicitAversionCount + candidate.explicitAversionCount,
    current.numericPreferenceScore + candidate.numericPreferenceScore,
    current.sharedPreferenceStrengthScore + candidate.sharedPreferenceStrengthScore,
    candidates,
    utilityRanges,
    current.structuralContext,
  );
}

function replaceEvaluation(current: BundleEvaluation, removed: number, added: number, candidates: readonly CandidateModel[], utilityRanges: readonly UtilityRange[]) {
  const removedCandidate = candidates[removed];
  const addedCandidate = candidates[added];
  return evaluationFromTotals(
    current.indexes.filter((index) => index !== removed).concat(added),
    current.totals.map((total, memberIndex) => total - removedCandidate.utilityByMember[memberIndex] + addedCandidate.utilityByMember[memberIndex]),
    current.directSupportCount - removedCandidate.directSupportCount + addedCandidate.directSupportCount,
    current.matchedTagCount - removedCandidate.matchedTagCount + addedCandidate.matchedTagCount,
    current.explicitPreferenceCount - removedCandidate.explicitPreferenceCount + addedCandidate.explicitPreferenceCount,
    current.explicitAversionCount - removedCandidate.explicitAversionCount + addedCandidate.explicitAversionCount,
    current.numericPreferenceScore - removedCandidate.numericPreferenceScore + addedCandidate.numericPreferenceScore,
    current.sharedPreferenceStrengthScore - removedCandidate.sharedPreferenceStrengthScore + addedCandidate.sharedPreferenceStrengthScore,
    candidates,
    utilityRanges,
    current.structuralContext,
  );
}

type BundleFeasibilityCheck = (indexes: readonly number[]) => { feasible: boolean; exact: boolean };

function exactBundleSearch(
  candidates: readonly CandidateModel[],
  selectedCount: number,
  utilityRanges: readonly UtilityRange[],
  requiredIndexCount = 0,
  feasibility?: BundleFeasibilityCheck,
) {
  let evaluated = 0;
  let feasibilityExact = true;
  const feasibleKeys = new Set<string>();
  const feasibleMinimums = utilityRanges.map(() => Number.POSITIVE_INFINITY);
  const feasibleMaximums = utilityRanges.map(() => Number.NEGATIVE_INFINITY);
  const chosen: number[] = Array.from({ length: requiredIndexCount }, (_, index) => index);
  const visitFeasibility = (nextIndex: number) => {
    if (chosen.length === selectedCount) {
      evaluated += 1;
      const checked = feasibility?.(chosen) ?? { feasible: true, exact: true };
      feasibilityExact &&= checked.exact;
      if (!checked.feasible) return;
      feasibleKeys.add(chosen.join(","));
      utilityRanges.forEach((_, memberIndex) => {
        const total = chosen.reduce((sum, candidateIndex) => sum + candidates[candidateIndex].utilityByMember[memberIndex], 0);
        feasibleMinimums[memberIndex] = Math.min(feasibleMinimums[memberIndex], total);
        feasibleMaximums[memberIndex] = Math.max(feasibleMaximums[memberIndex], total);
      });
      return;
    }
    const needed = selectedCount - chosen.length;
    for (let index = nextIndex; index <= candidates.length - needed; index += 1) {
      chosen.push(index);
      visitFeasibility(index + 1);
      chosen.pop();
    }
  };
  visitFeasibility(requiredIndexCount);

  // Packing까지 정확히 판정한 작은 문제에서는 정규화의 L/H도 동일한
  // 실행 가능 집합 F에서 다시 구한다. 닫힌 장소나 시간상 불가능한 후보를
  // 개인 ideal에 넣으면 실제 최선안의 만족도가 낮아지고 max-min 선택도
  // 뒤집힐 수 있다. Packing 탐색이 한도에 닿은 경우에는 과장하지 않고
  // 기존의 느슨한 candidate bound를 탐색 내부 비교에만 사용한다.
  const modeledUtilityIndexes = feasibilityExact
    ? utilityRanges.flatMap((_, memberIndex) => (
      feasibleMaximums[memberIndex] > feasibleMinimums[memberIndex] ? [memberIndex] : []
    ))
    : utilityRanges.map((_, memberIndex) => memberIndex);
  const effectiveUtilityRanges = feasibilityExact
    ? modeledUtilityIndexes.map((memberIndex) => ({
      minimum: feasibleMinimums[memberIndex],
      maximum: feasibleMaximums[memberIndex],
    }))
    : [...utilityRanges];
  const evaluationCandidates = candidates.map((candidate) => ({
    ...candidate,
    utilityByMember: modeledUtilityIndexes.map((memberIndex) => candidate.utilityByMember[memberIndex]),
  }));
  const structuralContext = createBundleStructuralContext(evaluationCandidates);
  let best: BundleEvaluation | undefined;
  const visitEvaluation = (nextIndex: number) => {
    if (chosen.length === selectedCount) {
      if (!feasibleKeys.has(chosen.join(","))) return;
      const evaluation = evaluateBundle(chosen, evaluationCandidates, effectiveUtilityRanges, structuralContext);
      if (!best || compareBundle(evaluation, best) > 0) best = evaluation;
      return;
    }
    const needed = selectedCount - chosen.length;
    for (let index = nextIndex; index <= candidates.length - needed; index += 1) {
      chosen.push(index);
      visitEvaluation(index + 1);
      chosen.pop();
    }
  };
  visitEvaluation(requiredIndexCount);
  return {
    best,
    evaluated,
    beamWidth: undefined,
    localSearchConverged: undefined,
    feasibilityExact,
    modeledUtilityIndexes,
    effectiveUtilityRanges,
    evaluationCandidates,
  };
}

function optimisticCompletionEvaluation(
  bundle: BundleEvaluation,
  candidates: readonly CandidateModel[],
  selectedCount: number,
  utilityRanges: readonly UtilityRange[],
  topCompletionUtility: (memberIndex: number, nextCandidateIndex: number, needed: number) => number,
) {
  const needed = selectedCount - bundle.indexes.length;
  if (needed <= 0) return bundle;
  const nextIndex = (bundle.indexes[bundle.indexes.length - 1] ?? -1) + 1;
  const optimisticTotals = bundle.totals.map((total, memberIndex) => (
    total + topCompletionUtility(memberIndex, nextIndex, needed)
  ));
  return evaluationFromTotals(
    bundle.indexes,
    optimisticTotals,
    bundle.directSupportCount,
    bundle.matchedTagCount,
    bundle.explicitPreferenceCount,
    bundle.explicitAversionCount,
    bundle.numericPreferenceScore,
    bundle.sharedPreferenceStrengthScore,
    candidates,
    utilityRanges,
    bundle.structuralContext,
  );
}

function heuristicBundleSearch(
  candidates: readonly CandidateModel[],
  selectedCount: number,
  utilityRanges: readonly UtilityRange[],
  requiredIndexCount = 0,
  feasibility?: BundleFeasibilityCheck,
) {
  let evaluated = 0;
  let feasibilityExact = true;
  const structuralContext = createBundleStructuralContext(candidates);
  const adaptiveBeamWidth = Math.min(BEAM_WIDTH, Math.max(
    MIN_BEAM_WIDTH,
    Math.floor(HEURISTIC_EXPANSION_BUDGET / Math.max(1, candidates.length * selectedCount)),
  ));
  const suffixTopUtilitySums = utilityRanges.map((_, memberIndex) => {
    const byStart: number[][] = Array.from({ length: candidates.length + 1 }, () => [0]);
    let sortedUtilities: number[] = [];
    for (let start = candidates.length - 1; start >= 0; start -= 1) {
      const utility = candidates[start].utilityByMember[memberIndex];
      let insertAt = 0;
      while (insertAt < sortedUtilities.length && sortedUtilities[insertAt] >= utility) insertAt += 1;
      sortedUtilities = [...sortedUtilities.slice(0, insertAt), utility, ...sortedUtilities.slice(insertAt)];
      const prefix = [0];
      sortedUtilities.forEach((value) => prefix.push(prefix[prefix.length - 1] + value));
      byStart[start] = prefix;
    }
    return byStart;
  });
  const topCompletionUtility = (memberIndex: number, nextCandidateIndex: number, needed: number) => {
    const prefix = suffixTopUtilitySums[memberIndex]?.[nextCandidateIndex] ?? [0];
    return prefix[Math.min(needed, prefix.length - 1)] ?? 0;
  };
  const requiredIndexes = Array.from({ length: requiredIndexCount }, (_, index) => index);
  let beam: BundleEvaluation[] = [evaluateBundle(requiredIndexes, candidates, utilityRanges, structuralContext)];
  if (requiredIndexCount === selectedCount) {
    const checked = feasibility?.(requiredIndexes) ?? { feasible: true, exact: true };
    feasibilityExact &&= checked.exact;
    if (!checked.feasible) beam = [];
  }
  for (let depth = requiredIndexCount; depth < selectedCount; depth += 1) {
    const expansions: BundleEvaluation[] = [];
    const remainingAfterAdd = selectedCount - depth - 1;
    beam.forEach((bundle) => {
      const firstCandidateIndex = (bundle.indexes[bundle.indexes.length - 1] ?? -1) + 1;
      const lastCandidateIndex = candidates.length - remainingAfterAdd - 1;
      for (let index = firstCandidateIndex; index <= lastCandidateIndex; index += 1) {
        expansions.push(extendEvaluation(bundle, index, candidates, utilityRanges));
        evaluated += 1;
      }
    });
    const feasibleExpansions = depth + 1 === selectedCount && feasibility
      ? expansions.filter((bundle) => {
        const checked = feasibility(bundle.indexes);
        feasibilityExact &&= checked.exact;
        return checked.feasible;
      })
      : expansions;
    const complete = depth + 1 === selectedCount;
    const optimisticCache = new Map<string, BundleEvaluation>();
    const rankingEvaluation = (bundle: BundleEvaluation) => {
      if (complete) return bundle;
      const key = bundle.stableKey;
      const cached = optimisticCache.get(key);
      if (cached) return cached;
      const optimistic = optimisticCompletionEvaluation(bundle, candidates, selectedCount, utilityRanges, topCompletionUtility);
      optimisticCache.set(key, optimistic);
      return optimistic;
    };
    beam = feasibleExpansions
      .sort((left, right) => -compareBundle(
        rankingEvaluation(left),
        rankingEvaluation(right),
        // 미완성 묶음의 MST는 최종 묶음의 MST가 아니며 beam 확장마다 O(k^2)를
        // 반복한다. 이 단계에서는 O(k) 구면 응집도만 쓰고, 완성 묶음과 1-swap
        // 이웃은 기존의 exact MST로 최종 비교한다.
        complete ? "exact-mst" : "partial-dispersion",
      ))
      .slice(0, adaptiveBeamWidth);
    if (!beam.length) break;
  }
  if (!beam.length) return { best: undefined, evaluated, beamWidth: adaptiveBeamWidth, localSearchConverged: false, feasibilityExact };
  let best: BundleEvaluation = beam[0];
  let localSearchConverged = false;
  for (let round = 0; round < LOCAL_SEARCH_ROUND_LIMIT; round += 1) {
    const current = best;
    const selected = new Set(current.indexes);
    let improved: BundleEvaluation = current;
    current.indexes.forEach((removed) => {
      if (removed < requiredIndexCount) return;
      candidates.forEach((_, added) => {
        if (selected.has(added)) return;
        const evaluation = replaceEvaluation(current, removed, added, candidates, utilityRanges);
        evaluated += 1;
        const checked = feasibility?.(evaluation.indexes) ?? { feasible: true, exact: true };
        feasibilityExact &&= checked.exact;
        if (!checked.feasible) return;
        if (compareBundle(evaluation, improved) > 0) improved = evaluation;
      });
    });
    if (compareBundle(improved, current) <= 0) {
      localSearchConverged = true;
      break;
    }
    best = improved;
  }
  return { best, evaluated, beamWidth: adaptiveBeamWidth, localSearchConverged, feasibilityExact };
}

type AutoFillActivityId = PreferenceAutoFillCandidateEvidence["matchedActivitySignals"][number]["activityId"];

const activityIdsByTourContentType: Readonly<Record<number, readonly AutoFillActivityId[]>> = {
  12: ["attraction"],
  14: ["attraction"],
  15: ["experience"],
  28: ["experience"],
  38: ["shopping"],
  39: ["restaurant"],
};

const activityIdsByExactPlaceToken: Readonly<Record<string, readonly AutoFillActivityId[]>> = Object.fromEntries([
  [["식당", "음식점", "맛집", "한식"], ["restaurant"]],
  [["카페", "커피"], ["cafe"]],
  [["쇼핑"], ["shopping"]],
  [["시장"], ["shopping", "local"]],
  [["명소", "관광", "관광지", "문화시설", "박물관", "미술관"], ["attraction"]],
  [["로컬", "골목", "문화마을"], ["local"]],
  [["체험", "액티비티", "레포츠", "축제", "공연"], ["experience"]],
  [["자연", "바다", "해변", "산", "숲", "공원", "산책"], ["nature"]],
].flatMap(([tokens, ids]) => (tokens as string[]).map((token) => [normalizeTrait(token), ids]))) as Record<string, readonly AutoFillActivityId[]>;

function mappedActivities(place: Place) {
  const activities = new Set<AutoFillActivityId>();
  (place.contentTypeId === undefined ? [] : activityIdsByTourContentType[place.contentTypeId] ?? [])
    .forEach((activity) => activities.add(activity));
  [place.category, ...place.tags].map(normalizeTrait).forEach((token) => {
    (activityIdsByExactPlaceToken[token] ?? []).forEach((activity) => activities.add(activity));
  });
  return [...activities].sort(compareText);
}

function structuralCategoryKey(place: Place) {
  const level2 = normalizeTrait(place.classification?.lclsSystm2Name ?? place.classification?.lclsSystm2 ?? "");
  if (level2) return `l2:${level2}`;
  if (place.contentTypeId !== undefined && Number.isFinite(place.contentTypeId)) return `content:${place.contentTypeId}`;
  const activities = mappedActivities(place);
  if (activities.length) return `activity:${activities.join("+")}`;
  const category = normalizeTrait(place.category);
  return category ? `category:${category}` : "unknown";
}

function structuralCoordinates(place: Place) {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return undefined;
  const latitude = place.latitude as number;
  const longitude = place.longitude as number;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) return undefined;
  return { latitude, longitude };
}

type DurationObservation = {
  itemId: EntityId;
  place: Place;
  durationMinutes: number;
};

function normalizedPlaceClassification(place: Place, level: 2 | 3) {
  const value = level === 3 ? place.classification?.lclsSystm3 : place.classification?.lclsSystm2;
  return value?.trim() || undefined;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

function snapDurationLower(minutes: number) {
  return Math.max(SLOT_MINUTES, Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES);
}

function snapDurationUpper(minutes: number) {
  return Math.max(SLOT_MINUTES, Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES);
}

type DurationEstimateComponentInput = {
  source: PreferenceAutoFillDurationEvidence["source"];
  values: number[];
  measurementHalfWidths: number[];
  supportingItemIds: EntityId[];
  centerOverride?: number;
};

function meanAbsoluteDeviation(values: readonly number[], center: number) {
  return values.reduce((sum, value) => sum + Math.abs(value - center), 0) / values.length;
}

function rootMeanSquare(values: readonly number[]) {
  return values.length
    ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
    : 0;
}

function combineDurationEvidence(
  placeId: EntityId,
  components: readonly DurationEstimateComponentInput[],
): PreferenceAutoFillDurationEvidence {
  const allValues = components.flatMap((component) => component.values);
  const allMeasurementHalfWidths = components.flatMap((component) => component.measurementHalfWidths);
  const pooledCenter = median(allValues);
  const pooledDispersion = Math.max(
    median(allValues.map((value) => Math.abs(value - pooledCenter))),
    meanAbsoluteDeviation(allValues, pooledCenter),
    rootMeanSquare(allMeasurementHalfWidths),
  );
  const estimates = components.map((component) => {
    const centerMinutes = component.centerOverride ?? median(component.values);
    const localDispersion = Math.max(
      median(component.values.map((value) => Math.abs(value - centerMinutes))),
      meanAbsoluteDeviation(component.values, centerMinutes),
      rootMeanSquare(component.measurementHalfWidths),
    );
    // 단일 세부 표본의 분산 0을 무한 신뢰로 해석하지 않는다. 전체 계층에서
    // 실제로 관측한 분산·측정폭을 sampling scale로 빌려 쓰고 n으로만 줄인다.
    const dispersionMinutes = Math.max(localDispersion, pooledDispersion);
    const standardError = dispersionMinutes / Math.sqrt(component.values.length);
    return {
      component,
      centerMinutes,
      dispersionMinutes,
      precision: standardError > 0 ? 1 / (standardError * standardError) : 0,
    };
  });
  const allCentersEqual = estimates.every((entry) => entry.centerMinutes === estimates[0].centerMinutes);
  const rawWeights = estimates.map((entry) => (
    allCentersEqual || entry.precision === 0 ? entry.component.values.length : entry.precision
  ));
  const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
  const normalizedWeights = rawWeights.map((weight) => weight / totalWeight);
  const rawDuration = estimates.reduce((sum, entry, index) => (
    sum + entry.centerMinutes * normalizedWeights[index]
  ), 0);
  const combinedStandardError = estimates.every((entry) => entry.precision > 0)
    ? Math.sqrt(1 / estimates.reduce((sum, entry) => sum + entry.precision, 0))
    : 0;
  const effectiveSampleSizeDenominator = normalizedWeights.reduce((sum, weight, index) => (
    sum + weight * weight / estimates[index].component.values.length
  ), 0);
  const observedEndpoints = components.flatMap((component) => component.values.flatMap((value, index) => [
    value - (component.measurementHalfWidths[index] ?? 0),
    value + (component.measurementHalfWidths[index] ?? 0),
  ]));
  const rangeUnknown = allValues.length === 1 && pooledDispersion === 0;
  return {
    placeId,
    source: components[0].source,
    durationMinutes: snapNearest(rawDuration),
    lowerMinutes: snapDurationLower(Math.max(SLOT_MINUTES, rawDuration - combinedStandardError)),
    ...(rangeUnknown ? { rangeUnknown: true } : {
      upperMinutes: snapDurationUpper(Math.min(24 * 60, rawDuration + combinedStandardError)),
    }),
    lowerBoundOnly: false,
    sampleSize: allValues.length,
    effectiveSampleSize: effectiveSampleSizeDenominator > 0 ? 1 / effectiveSampleSizeDenominator : allValues.length,
    supportingItemIds: [...new Set(components.flatMap((component) => component.supportingItemIds))].sort(compareText),
    maximumObservedDeviationMinutes: Math.max(...observedEndpoints.map((value) => Math.abs(value - rawDuration))),
    shrinkageApplied: components.length > 1,
    components: estimates.map((entry, index) => ({
      source: entry.component.source,
      sampleSize: entry.component.values.length,
      centerMinutes: entry.centerMinutes,
      dispersionMinutes: entry.dispersionMinutes,
      normalizedPrecisionWeight: normalizedWeights[index],
    })),
  };
}

/**
 * 장소별 체류시간을 임의 category 상수로 만들지 않는다. 같은 여행에서 사용자가
 * 실제 편집한 장소 일정을 taxonomy 계층의 서로 겹치지 않는 cohort로 나누고,
 * 표본수·MAD·평균절대편차·설문 측정폭으로 계산한 precision으로 수축한다.
 * 확률분포나 category별 고정 체류시간 prior는 넣지 않는다.
 */
function estimateCandidateDuration(
  input: DuriAnalysisInput,
  place: Place,
  fallbackDurationMinutes?: number,
  fallbackSource: "user-fallback" | "editable-template" = "user-fallback",
): PreferenceAutoFillDurationEvidence | undefined {
  const observations = input.itinerary.flatMap((item): DurationObservation[] => {
    if (item.itemType !== "place" || !item.placeId || !Number.isInteger(item.durationMinutes) || item.durationMinutes < 1) return [];
    const observedPlace = input.placesById[item.placeId];
    return observedPlace ? [{ itemId: item.id, place: observedPlace, durationMinutes: item.durationMinutes }] : [];
  });
  const level3 = normalizedPlaceClassification(place, 3);
  const level2 = normalizedPlaceClassification(place, 2);
  const activities = mappedActivities(place);
  const normalizedCategory = normalizeTrait(place.category);
  const cohorts: { source: PreferenceAutoFillDurationEvidence["source"]; matches: DurationObservation[] }[] = [
    {
      source: "classification-level-3",
      matches: level3 ? observations.filter((entry) => normalizedPlaceClassification(entry.place, 3) === level3) : [],
    },
    {
      source: "classification-level-2",
      matches: level2 ? observations.filter((entry) => normalizedPlaceClassification(entry.place, 2) === level2) : [],
    },
    {
      source: "content-type",
      matches: place.contentTypeId === undefined ? [] : observations.filter((entry) => entry.place.contentTypeId === place.contentTypeId),
    },
    {
      source: "activity-taxonomy",
      matches: activities.length ? observations.filter((entry) => mappedActivities(entry.place).some((activity) => activities.includes(activity))) : [],
    },
    {
      source: "exact-category",
      matches: normalizedCategory ? observations.filter((entry) => normalizeTrait(entry.place.category) === normalizedCategory) : [],
    },
  ];
  const components: DurationEstimateComponentInput[] = [];
  const usedScheduleItemIds = new Set<EntityId>();
  cohorts.forEach((cohort) => {
    const disjointMatches = cohort.matches.filter((entry) => !usedScheduleItemIds.has(entry.itemId));
    if (!disjointMatches.length) return;
    disjointMatches.forEach((entry) => usedScheduleItemIds.add(entry.itemId));
    components.push({
      source: cohort.source,
      values: disjointMatches.map((entry) => entry.durationMinutes),
      measurementHalfWidths: disjointMatches.map(() => 0),
      supportingItemIds: disjointMatches.map((entry) => entry.itemId),
    });
  });
  if (!components.length && observations.length) {
    // taxonomy가 비어 있는 API 장소만 같은 여행의 전체 방문시간으로 fallback한다.
    // 더 구체적인 cohort가 하나라도 있으면 섞어 장소별 적응값을 흐리지 않는다.
    components.push({
      source: "trip-visit-median",
      values: observations.map((entry) => entry.durationMinutes),
      measurementHalfWidths: observations.map(() => 0),
      supportingItemIds: observations.map((entry) => entry.itemId),
    });
  }
  const durationObservations = detailedWindowObservations(input)
    .flatMap((entry) => entry.duration ? [{ userId: entry.userId, ...entry.duration }] : []);
  if (durationObservations.length) {
    const consensus = solveIntervalPreferenceConsensus(durationObservations.map((entry) => ({
      ...entry,
      minimum: SLOT_MINUTES,
      maximum: 24 * 60,
    })));
    components.push({
      source: "group-schedule-consensus",
      values: durationObservations.map((entry) => entry.value),
      measurementHalfWidths: durationObservations.map((entry) => entry.resolution / 2),
      supportingItemIds: [],
      centerOverride: consensus.recommendedValue,
    });
  }
  const empiricalEstimate = components.length ? combineDurationEvidence(place.id, components) : undefined;
  const fallbackEstimate: PreferenceAutoFillDurationEvidence | undefined = fallbackDurationMinutes === undefined ? undefined : {
    placeId: place.id,
    source: fallbackSource,
    durationMinutes: fallbackDurationMinutes,
    lowerMinutes: fallbackDurationMinutes,
    rangeUnknown: true,
    lowerBoundOnly: false,
    sampleSize: 1,
    effectiveSampleSize: 1,
    supportingItemIds: [],
    maximumObservedDeviationMinutes: 0,
    shrinkageApplied: false,
    components: [{
      source: fallbackSource,
      sampleSize: 1,
      centerMinutes: fallbackDurationMinutes,
      dispersionMinutes: 0,
      normalizedPrecisionWeight: 1,
    }],
  };
  const baseEstimate = empiricalEstimate ?? fallbackEstimate;
  const officialEvidence = [...(input.placeConstraintEvidence ?? [])].reverse().find((evidence) => (
    evidence.placeId === place.id
    && evidence.provider === "tour-api"
    && typeof evidence.recommendedDurationText === "string"
  ));
  const officialMinimumMinutes = officialEvidence?.recommendedDurationText
    ? parseRecommendedDurationMinutes(officialEvidence.recommendedDurationText)
    : undefined;
  if (officialMinimumMinutes === undefined || officialMinimumMinutes > 24 * 60) return baseEstimate;
  const griddedOfficialMinimum = snapDurationUpper(officialMinimumMinutes);
  if (baseEstimate) {
    const officialFloorExceededReferenceRange = !baseEstimate.rangeUnknown && baseEstimate.upperMinutes !== undefined
      && griddedOfficialMinimum > baseEstimate.upperMinutes;
    const durationMinutes = Math.max(baseEstimate.durationMinutes, griddedOfficialMinimum);
    return {
      ...baseEstimate,
      durationMinutes,
      lowerMinutes: Math.max(baseEstimate.lowerMinutes, griddedOfficialMinimum),
      upperMinutes: baseEstimate.rangeUnknown || officialFloorExceededReferenceRange
        ? undefined
        : Math.max(baseEstimate.upperMinutes ?? griddedOfficialMinimum, griddedOfficialMinimum),
      officialMinimumMinutes,
      officialRecommendedDurationText: officialEvidence?.recommendedDurationText,
      officialEvidenceFetchedAt: officialEvidence?.fetchedAt,
      preOfficialDurationMinutes: baseEstimate.durationMinutes,
      preOfficialUpperMinutes: baseEstimate.upperMinutes,
      ...(officialFloorExceededReferenceRange ? { officialFloorExceededReferenceRange: true } : {}),
      maximumObservedDeviationMinutes: Math.max(
        baseEstimate.maximumObservedDeviationMinutes,
        Math.abs(durationMinutes - baseEstimate.durationMinutes),
      ),
    };
  }
  return {
    placeId: place.id,
    source: "tour-recommended-minimum",
    durationMinutes: griddedOfficialMinimum,
    lowerMinutes: griddedOfficialMinimum,
    lowerBoundOnly: true,
    officialMinimumMinutes,
    officialRecommendedDurationText: officialEvidence?.recommendedDurationText,
    officialEvidenceFetchedAt: officialEvidence?.fetchedAt,
    sampleSize: 0,
    effectiveSampleSize: 0,
    supportingItemIds: [],
    maximumObservedDeviationMinutes: 0,
    shrinkageApplied: false,
    components: [],
  };
}

function candidateMedianDurationEvidence(
  placeId: EntityId,
  evidence: readonly PreferenceAutoFillDurationEvidence[],
): PreferenceAutoFillDurationEvidence | undefined {
  if (!evidence.length) return undefined;
  const values = evidence.map((entry) => entry.durationMinutes);
  const center = median(values);
  const absoluteDeviations = values.map((value) => Math.abs(value - center));
  const dispersion = median(absoluteDeviations);
  return {
    placeId,
    source: "candidate-evidence-median",
    durationMinutes: snapNearest(center),
    lowerMinutes: snapDurationLower(Math.max(SLOT_MINUTES, center - dispersion)),
    upperMinutes: snapDurationUpper(Math.min(24 * 60, center + dispersion)),
    lowerBoundOnly: false,
    sampleSize: values.length,
    effectiveSampleSize: values.length,
    supportingItemIds: [...new Set(evidence.flatMap((entry) => entry.supportingItemIds))].sort(compareText),
    maximumObservedDeviationMinutes: Math.max(...values.map((value) => Math.abs(value - center))),
    shrinkageApplied: values.length > 1,
    components: [{
      source: "candidate-evidence-median",
      sampleSize: values.length,
      centerMinutes: center,
      dispersionMinutes: dispersion,
      normalizedPrecisionWeight: 1,
    }],
  };
}

function newestPlaceConstraintEvidence(input: DuriAnalysisInput, placeId: EntityId) {
  return (input.placeConstraintEvidence ?? [])
    .filter((entry) => entry.placeId === placeId && entry.provider === "tour-api")
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];
}

function operatingAvailabilityByDate(input: DuriAnalysisInput, placeId: EntityId) {
  const evidence = newestPlaceConstraintEvidence(input, placeId);
  return Object.fromEntries(getTripDates(input.trip.startDate, input.trip.endDate).map((date) => [
    date,
    evidence ? placeOperatingAvailabilityForDate(evidence, date) : { status: "unknown" as const },
  ]));
}

function activitySignalsForMember(member: PreferenceEvidence, place: Place): PreferenceAutoFillCandidateEvidence["matchedActivitySignals"] {
  const signals = member.result?.detailedSignals;
  const activities = mappedActivities(place);
  const detailedSignals = !signals || signals.surveyVersion !== 9 || ![7, 8, 9].includes(signals.algorithmVersion)
    ? []
    : activities.flatMap((activity): PreferenceAutoFillCandidateEvidence["matchedActivitySignals"] => {
    const explicitLevel = signals.categoryPreferenceLevels?.[activity];
    const categoryScore = signals.categoryScores[activity];
    const category = explicitLevel === "like"
      ? [{ activityId: activity, score: 1, direction: "preference" as const, source: "explicit-category-level" as const }]
      : explicitLevel === "dislike"
        ? [{ activityId: activity, score: 1, direction: "aversion" as const, source: "explicit-category-level" as const }]
        : explicitLevel === "neutral"
          ? []
          // 이전 v7/v8 및 명시 단계가 없는 v9 점수는 시간표 배치의 상대량일 수 있다.
          // 50을 중립으로 추정하거나 0을 불호로 꾸미지 않고 양의 배치 근거만 쓴다.
          : Number.isFinite(categoryScore)
            ? [{ activityId: activity, score: Math.max(0, Math.min(100, Math.round(categoryScore))), direction: "numeric" as const, source: "itinerary-allocation" as const }]
            : [];
    const discovery = activity === "attraction"
      ? [{ activityId: activity, score: Math.max(0, Math.min(100, Math.round(signals.landmarkImportance))), direction: "numeric" as const, source: "landmark-importance" as const }]
      : activity === "local"
        ? [{ activityId: activity, score: Math.max(0, Math.min(100, Math.round(signals.localInterest))), direction: "numeric" as const, source: "local-interest" as const }]
        : [];
    return [...category, ...discovery].filter((signal) => Number.isFinite(signal.score));
  });
  const sharedAxes = member.sharedMember?.personalityAxes;
  const sharedSignals = !sharedAxes ? [] : activities.flatMap((activity): PreferenceAutoFillCandidateEvidence["matchedActivitySignals"] => {
    // 서버 파생 축의 의미와 명시된 0~100 척도를 그대로 사용한다. 일정 밀도와
    // challenging은 장소 taxonomy만으로 연결할 수 없어 후보 효용에 넣지 않는다.
    if (activity === "attraction") return [{
      activityId: activity,
      score: sharedAxes.landmarkNecessity.value,
      direction: "numeric" as const,
      source: "shared-landmark-axis" as const,
    }];
    if (activity === "local") return [{
      activityId: activity,
      score: sharedAxes.localInterest.value,
      direction: "numeric" as const,
      source: "shared-local-axis" as const,
    }];
    return [];
  });
  return [...detailedSignals, ...sharedSignals];
}

function buildCandidateModels(
  input: DuriAnalysisInput,
  evidence: readonly PreferenceEvidence[],
  fallbackDurationMinutes?: number,
  fallbackSource: "user-fallback" | "editable-template" = "user-fallback",
  conflictedPlaceIds: ReadonlySet<EntityId> = new Set(),
) {
  const scheduledPlaceIds = new Set(input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const fixedUnlinkedPlaceIds = new Set((input.confirmedScheduleConstraints ?? []).flatMap((constraint) => (
    constraint.placeId && !constraint.itineraryItemId ? [constraint.placeId] : []
  )));
  const tripMemberIds = new Set(input.trip.members.map((member) => member.userId));
  const tripCandidates = input.candidates.filter((candidate) => candidate.tripId === input.trip.id);
  const candidatePlaceIds = [...new Set(tripCandidates.map((candidate) => candidate.placeId))].sort(compareText);
  const diagnostics: CandidateModelDiagnostics = {
    candidatePlaceIds,
    scheduledPlaceIds: candidatePlaceIds.filter((placeId) => scheduledPlaceIds.has(placeId)),
    fixedUnlinkedPlaceIds: candidatePlaceIds.filter((placeId) => !scheduledPlaceIds.has(placeId) && fixedUnlinkedPlaceIds.has(placeId)),
    missingPlaceIds: candidatePlaceIds.filter((placeId) => !input.placesById[placeId]),
    wrongRegionPlaceIds: candidatePlaceIds.filter((placeId) => {
      const place = input.placesById[placeId];
      return Boolean(place && place.regionId !== input.trip.regionId);
    }),
    conflictedPlaceIds: candidatePlaceIds.filter((placeId) => conflictedPlaceIds.has(placeId)),
    validUnscheduledPlaceIds: [],
  };
  // 손상된 persisted state나 중복 API 행이 같은 장소를 두 번 배치하지 않도록
  // placeId 단위로 합치되, 실제로 기록된 담기 사용자만 합집합으로 보존한다.
  const rawByPlaceId = new Map<EntityId, { candidate: TripCandidate; place: Place }>();
  tripCandidates
    .filter((candidate) => !scheduledPlaceIds.has(candidate.placeId)
      && !fixedUnlinkedPlaceIds.has(candidate.placeId)
      && !conflictedPlaceIds.has(candidate.placeId))
    .forEach((candidate) => {
      const place = input.placesById[candidate.placeId];
      if (!place || place.regionId !== input.trip.regionId) return;
      const previous = rawByPlaceId.get(place.id);
      rawByPlaceId.set(place.id, {
        place,
        candidate: previous ? {
          ...previous.candidate,
          addedByUserIds: [...new Set([...previous.candidate.addedByUserIds, ...candidate.addedByUserIds])],
          recommendedByDuri: previous.candidate.recommendedByDuri || candidate.recommendedByDuri,
        } : candidate,
      });
    });
  const raw = [...rawByPlaceId.values()]
    .sort((left, right) => compareText(left.place.id, right.place.id));
  diagnostics.validUnscheduledPlaceIds = raw.map((entry) => entry.place.id);
  const rawModels = raw.map(({ candidate, place }) => {
    const placeTokens = new Set([place.category, ...place.tags].map(normalizeTrait).filter(Boolean));
    const memberEvidence = evidence.map((member): PreferenceAutoFillCandidateEvidence => {
      const signal = getSharedCandidateSignal(input, place.id, member.memberId);
      return {
        memberId: member.memberId,
        source: member.source,
        explicitlyAdded: candidate.addedByUserIds.includes(member.memberId),
        matchedTags: member.tags.filter((tag) => placeTokens.has(normalizeTrait(tag))),
        matchedActivitySignals: activitySignalsForMember(member, place),
        ...(signal ? { sharedCandidateSignal: {
          mustVisit: signal.mustVisit,
          avoid: signal.avoid,
          preferenceStrength: signal.preferenceStrength,
          version: signal.version,
        } } : {}),
      };
    });
    return { candidate, place, memberEvidence };
  });
  const excludedAvoidPlaceIds = rawModels.filter((model) => model.memberEvidence.some((entry) => entry.sharedCandidateSignal?.avoid === true))
    .map((model) => model.place.id);
  const eligibleRawModels = rawModels.filter((model) => !excludedAvoidPlaceIds.includes(model.place.id));
  const numericSignalCounts = eligibleRawModels.flatMap((model) => model.memberEvidence.map((entry) => (
    entry.matchedActivitySignals.filter((signal) => signal.direction === "numeric").length
  ))).filter((count) => count > 0);
  // 후보마다 사용할 수 있는 수치 신호 수가 달라도 산술평균을 반올림하지 않도록
  // 관측된 분모의 최소공배수 척도로 정확히 정수화한다(현재 taxonomy 최대 9개).
  const numericMeanDenominator = numericSignalCounts.reduce(leastCommonMultiple, 1);
  const modelsWithEmpiricalDuration = eligibleRawModels.map((model) => ({
    ...model,
    durationEvidence: estimateCandidateDuration(input, model.place),
    memberComponents: model.memberEvidence.map((entry) => {
      const explicitPreferenceCount = entry.matchedActivitySignals.filter((signal) => signal.direction === "preference").length;
      const explicitAversionCount = entry.matchedActivitySignals.filter((signal) => signal.direction === "aversion").length;
      const numericSignals = entry.matchedActivitySignals.filter((signal) => signal.direction === "numeric");
      const numericPreferenceScore = numericSignals.length
        ? numericSignals.reduce((sum, signal) => sum + signal.score, 0) * (numericMeanDenominator / numericSignals.length)
        : 0;
      const sharedPreferenceStrengthScore = entry.sharedCandidateSignal?.preferenceStrength ?? 0;
      return { explicitPreferenceCount, explicitAversionCount, numericPreferenceScore, sharedPreferenceStrengthScore };
    }),
  }));
  const candidateDurationReferenceByCategory = new Map<string, PreferenceAutoFillDurationEvidence[]>();
  modelsWithEmpiricalDuration.forEach((model) => {
    if (!model.durationEvidence) return;
    const key = structuralCategoryKey(model.place);
    if (key === "unknown") return;
    candidateDurationReferenceByCategory.set(key, [
      ...(candidateDurationReferenceByCategory.get(key) ?? []),
      model.durationEvidence,
    ]);
  });
  const preparedModelsWithOptionalDuration = modelsWithEmpiricalDuration.map((model) => ({
    ...model,
    durationEvidence: model.durationEvidence
      // 관련 없는 한 장소의 극단 체류시간을 전체 후보에 복사하지 않는다.
      // 명시적 structural taxonomy가 같고 독립 후보 근거가 2개 이상일 때만
      // 후보 보드 내부 중앙값을 보조 추정으로 사용한다.
      ?? candidateMedianDurationEvidence(
        model.place.id,
        (candidateDurationReferenceByCategory.get(structuralCategoryKey(model.place)) ?? []).length >= 2
          ? candidateDurationReferenceByCategory.get(structuralCategoryKey(model.place)) ?? []
          : [],
      )
      ?? estimateCandidateDuration(input, model.place, fallbackDurationMinutes, fallbackSource),
  }));
  const missingDurationPlaceIds = preparedModelsWithOptionalDuration
    .filter((model) => !model.durationEvidence)
    .map((model) => model.place.id)
    .sort(compareText);
  const preparedModels = preparedModelsWithOptionalDuration.filter((model): model is typeof model & {
    durationEvidence: PreferenceAutoFillDurationEvidence;
  } => Boolean(model.durationEvidence));
  const maxNumericPreferenceScore = Math.max(0, ...preparedModels.flatMap((model) => model.memberComponents.map((component) => component.numericPreferenceScore)));
  const maxSharedPreferenceStrengthScore = Math.max(0, ...preparedModels.flatMap((model) => model.memberComponents.map((component) => component.sharedPreferenceStrengthScore)));
  if (![maxNumericPreferenceScore, maxSharedPreferenceStrengthScore].every(Number.isSafeInteger)) {
    return {
      models: [] as CandidateModel[],
      unsafeUtilityScale: true,
      selectionBasis: "unavailable" as const,
      excludedAvoidPlaceIds,
      excludedAversionOnlyPlaceIds: [] as EntityId[],
      missingDurationPlaceIds,
      comparableCoordinateCoverage: false,
      diagnostics,
    };
  }
  const evidenceVector = (model: typeof preparedModels[number], memberIndex: number) => {
    const entry = model.memberEvidence[memberIndex];
    const component = model.memberComponents[memberIndex];
    return [
      component.sharedPreferenceStrengthScore,
      entry.explicitlyAdded ? 1 : 0,
      entry.matchedTags.length,
      component.explicitPreferenceCount - component.explicitAversionCount,
      component.numericPreferenceScore,
    ] as const;
  };
  const compareEvidenceVector = (left: readonly number[], right: readonly number[]) => {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
  };
  const hasPositiveEvidence = ({ memberEvidence, memberComponents }: typeof preparedModels[number]) => memberEvidence.some((entry, index) => (
      entry.explicitlyAdded
      || entry.sharedCandidateSignal?.mustVisit === true
      || memberComponents[index].sharedPreferenceStrengthScore > 0
      || entry.matchedTags.length > 0
      || memberComponents[index].explicitPreferenceCount > 0
      || memberComponents[index].numericPreferenceScore > 0
    ));
  // 명시적인 avoid만 Hard 제외다. 설문의 dislike는 Soft 순위 하락으로 남겨
  // 후보가 부족한 방에서 사실상의 거부권으로 승격시키지 않는다.
  const excludedAversionOnlyPlaceIds: EntityId[] = [];
  const selectionPool = preparedModels;
  const positiveModelCount = selectionPool.filter(hasPositiveEvidence).length;
  const selectionBasis = positiveModelCount === 0
    ? "neutral-structural" as const
    : positiveModelCount < selectionPool.length
      ? "preference-with-neutral-supplement" as const
      : "preference-fairness" as const;
  const comparableCoordinateCoverage = selectionPool.length > 0
    && selectionPool.every((model) => Boolean(structuralCoordinates(model.place)));
  // 서로 단위가 다른 ordinal·tag·시간배분 신호를 임의 가중합하지 않는다.
  // 멤버별 사전식 evidence 순위를 만들고, 자신보다 명확히 낮은 후보 수를
  // Borda형 정수 효용으로 사용한다. 후보 입력 순서와 점수 단위에 불변이다.
  const models = selectionPool.map(({ candidate, place, memberEvidence, memberComponents, durationEvidence }): CandidateModel => {
    const model = { candidate, place, memberEvidence, memberComponents, durationEvidence };
    const coordinates = structuralCoordinates(place);
    const utilityByMember = memberEvidence.map((_, memberIndex) => selectionPool.reduce((count, other) => (
      count + (compareEvidenceVector(evidenceVector(model, memberIndex), evidenceVector(other, memberIndex)) > 0 ? 1 : 0)
    ), 0));
    return {
      candidate,
      place,
      evidence: memberEvidence.filter((entry) => entry.explicitlyAdded || entry.sharedCandidateSignal || entry.matchedTags.length || entry.matchedActivitySignals.some((signal) => signal.direction !== "numeric" || signal.score > 0)),
      utilityByMember,
      directSupportCount: memberEvidence.filter((entry) => entry.explicitlyAdded).length,
      matchedTagCount: memberEvidence.reduce((sum, entry) => sum + entry.matchedTags.length, 0),
      explicitPreferenceCount: memberComponents.reduce((sum, component) => sum + component.explicitPreferenceCount, 0),
      explicitAversionCount: memberComponents.reduce((sum, component) => sum + component.explicitAversionCount, 0),
      numericPreferenceScore: memberComponents.reduce((sum, component) => sum + component.numericPreferenceScore, 0),
      sharedPreferenceStrengthScore: memberComponents.reduce((sum, component) => sum + component.sharedPreferenceStrengthScore, 0),
      mandatory: memberEvidence.some((entry) => entry.sharedCandidateSignal?.mustVisit === true),
      structuralCategoryKey: structuralCategoryKey(place),
      ...(coordinates ? { structuralCoordinates: coordinates } : {}),
      operatingAvailabilityByDate: operatingAvailabilityByDate(input, place.id),
      durationEvidence,
    };
  }).map((candidate) => ({
    ...candidate,
    candidate: {
      ...candidate.candidate,
      addedByUserIds: [...new Set(candidate.candidate.addedByUserIds.filter((memberId) => tripMemberIds.has(memberId)))].sort(compareText),
    },
  }));
  return {
    models,
    unsafeUtilityScale: false,
    selectionBasis,
    excludedAvoidPlaceIds,
    excludedAversionOnlyPlaceIds,
    missingDurationPlaceIds,
    comparableCoordinateCoverage,
    diagnostics,
  };
}

function candidateBlockExplanation(
  input: DuriAnalysisInput,
  result: ReturnType<typeof buildCandidateModels>,
) {
  const diagnostics = result.diagnostics;
  const placeNames = (placeIds: readonly EntityId[]) => placeIds
    .map((placeId) => input.placesById[placeId]?.name ?? placeId)
    .slice(0, 4)
    .join(", ");
  const limitations: string[] = [];
  if (diagnostics.scheduledPlaceIds.length) limitations.push(`후보 중 이미 배치됨 ${diagnostics.scheduledPlaceIds.length}곳`);
  if (diagnostics.fixedUnlinkedPlaceIds.length) limitations.push(`시간이 확정됐지만 일정과 연결되지 않음 ${diagnostics.fixedUnlinkedPlaceIds.length}곳`);
  if (diagnostics.conflictedPlaceIds.length) limitations.push(`반드시 방문과 제외 의견이 충돌해 보류 ${diagnostics.conflictedPlaceIds.length}곳: ${placeNames(diagnostics.conflictedPlaceIds)}`);
  if (result.excludedAvoidPlaceIds.length) limitations.push(`동행자의 명시적 제외 의견으로 제외 ${result.excludedAvoidPlaceIds.length}곳: ${placeNames(result.excludedAvoidPlaceIds)}`);
  if (result.excludedAversionOnlyPlaceIds.length) limitations.push(`긍정 근거 없이 불호만 확인되어 제외 ${result.excludedAversionOnlyPlaceIds.length}곳: ${placeNames(result.excludedAversionOnlyPlaceIds)}`);
  if (diagnostics.missingPlaceIds.length || diagnostics.wrongRegionPlaceIds.length) {
    limitations.push(`장소 정보가 없거나 여행 지역과 맞지 않음 ${diagnostics.missingPlaceIds.length + diagnostics.wrongRegionPlaceIds.length}곳`);
  }
  if (result.missingDurationPlaceIds.length) limitations.push(`체류시간 근거가 없음 ${result.missingDurationPlaceIds.length}곳: ${placeNames(result.missingDurationPlaceIds)}`);

  if (!diagnostics.candidatePlaceIds.length) {
    return {
      status: "no-candidates" as const,
      message: "아직 여행방에 후보 장소가 없어요. 가고 싶은 장소를 후보에 담으면 성향과 동선을 비교해 초안을 만들 수 있어요.",
      limitations,
    };
  }
  if (!diagnostics.validUnscheduledPlaceIds.length) {
    if (diagnostics.conflictedPlaceIds.length) {
      return {
        status: "insufficient-data" as const,
        message: "남은 후보의 반드시 방문·제외 의견이 충돌해 해당 장소만 보류했어요. 의견을 정리하거나 다른 후보를 담아 주세요.",
        limitations,
      };
    }
    if (diagnostics.scheduledPlaceIds.length === diagnostics.candidatePlaceIds.length) {
      return {
        status: "no-candidates" as const,
        message: `후보 ${diagnostics.candidatePlaceIds.length}곳이 모두 이미 일정에 들어가 있어 새로 배치할 장소가 없어요.`,
        limitations,
      };
    }
    if (diagnostics.fixedUnlinkedPlaceIds.length) {
      return {
        status: "insufficient-data" as const,
        message: "남은 후보가 확정 예약과 연결돼 있지만 일정 항목이 없어요. 예약을 일정에 연결한 뒤 다시 초안을 만들어 주세요.",
        limitations,
      };
    }
    return {
      status: "insufficient-data" as const,
      message: "남은 후보의 장소 정보를 현재 여행방과 연결하지 못했어요. 후보를 새로고침한 뒤 다시 시도해 주세요.",
      limitations,
    };
  }
  if (result.missingDurationPlaceIds.length) {
    return {
      status: "insufficient-data" as const,
      message: `미배치 후보 ${diagnostics.validUnscheduledPlaceIds.length}곳의 체류시간을 정할 관측 근거가 부족해요. 필요하면 ‘직접 제한 정하기’에서 예비 체류시간만 입력해 주세요.`,
      limitations,
    };
  }
  if (result.excludedAvoidPlaceIds.length || result.excludedAversionOnlyPlaceIds.length) {
    return {
      status: "no-candidates" as const,
      message: `남은 후보 ${diagnostics.validUnscheduledPlaceIds.length}곳이 모두 동행자의 제외·불호 조건에 걸렸어요. 의견을 바꾸기 전에는 두리가 임의로 넣지 않아요.`,
      limitations,
    };
  }
  return {
    status: "no-candidates" as const,
    message: "현재 조건으로 안전하게 배치할 수 있는 후보가 없어요. 아래 제외 사유를 확인해 주세요.",
    limitations,
  };
}

function existingItineraryProblem(input: DuriAnalysisInput) {
  const tripDates = new Set(getTripDates(input.trip.startDate, input.trip.endDate));
  const itemIds = new Set<EntityId>();
  const byDate = new Map<string, { start: number; end: number }[]>();
  for (const item of input.itinerary) {
    if (!item.id.trim() || itemIds.has(item.id)) return "일정 ID가 비어 있거나 중복되어 있어요.";
    itemIds.add(item.id);
    if (item.tripId !== input.trip.id) return "다른 여행방 일정이 섞여 있어요.";
    if (!tripDates.has(item.date)) return "여행 날짜 범위 밖의 일정이 있어요.";
    if (item.placeId && !input.placesById[item.placeId]) return "장소 정보를 찾을 수 없는 일정이 있어요.";
    const start = timeStringToMinutes(item.startTime);
    if (!Number.isFinite(start) || !Number.isInteger(item.durationMinutes) || item.durationMinutes < 1 || start + item.durationMinutes > 24 * 60) return "표현할 수 없는 일정 시간이 있어요.";
    const range = { start, end: start + item.durationMinutes };
    const ranges = byDate.get(item.date) ?? [];
    if (ranges.some((other) => range.start < other.end && other.start < range.end)) return "서로 겹치는 기존 일정이 있어요.";
    byDate.set(item.date, [...ranges, range]);
  }
  return undefined;
}

function blockerRangesForDate(
  input: DuriAnalysisInput,
  date: string,
  constraints: readonly ConfirmedScheduleConstraint[],
) {
  const existingItemsById = new Map(input.itinerary.map((item) => [item.id, item] as const));
  const blockers = input.itinerary.filter((item) => item.date === date).map((item) => {
    const start = timeStringToMinutes(item.startTime);
    return { start, end: start + item.durationMinutes };
  });
  let dayBlocked = false;
  let incompleteTimeConstraint = false;
  constraints.filter((constraint) => constraint.date === date).forEach((constraint) => {
    const start = constraint.startTime ? timeStringToMinutes(constraint.startTime) : undefined;
    const end = constraint.endTime ? timeStringToMinutes(constraint.endTime) : undefined;
    const linkedItem = constraint.itineraryItemId
      ? existingItemsById.get(constraint.itineraryItemId)
      : undefined;
    // 연결된 일정이 확정된 완전 구간을 이미 덮으면 기존 일정 blocker로 충분하다.
    // 종료 시각이 없는 사실은 기존 일정의 임의 duration으로 보완하지 않는다.
    if (linkedItem && start === undefined) return;
    if (linkedItem && start !== undefined && end !== undefined) return;
    if (start === undefined) {
      // 날짜만 확정된 사실은 all-day 예약이라는 뜻이 아니다. 연결 장소는 후보
      // 풀에서 이미 고정 대상으로 제외하되, 다른 장소까지 하루 전체 차단하지 않는다.
      incompleteTimeConstraint = true;
    } else if (end === undefined) {
      // 종료 시각을 추정하지 않는다. 확인된 시작 시각 이후는 모두 Hard unknown으로
      // 남기고 그 날짜에서는 예약 전 슬롯만 제안한다.
      blockers.push({ start, end: 24 * 60 });
      incompleteTimeConstraint = true;
    } else blockers.push({ start, end });
  });
  return { blockers, dayBlocked, incompleteTimeConstraint };
}

function hasMismatchedLinkedConstraint(
  input: DuriAnalysisInput,
  constraints: readonly ConfirmedScheduleConstraint[],
) {
  const itemsById = new Map(input.itinerary.map((item) => [item.id, item] as const));
  return constraints.some((constraint) => {
    if (!constraint.itineraryItemId) return false;
    const item = itemsById.get(constraint.itineraryItemId);
    if (!item) return true;
    if (constraint.placeId && item.placeId !== constraint.placeId) return true;
    return !itineraryItemCoversConfirmedTime(item, constraint);
  });
}

function gapBoundaryCoordinates(
  input: DuriAnalysisInput,
  date: string,
  startMinute: number,
  endMinute: number,
) {
  const locatedItems = input.itinerary.flatMap((item) => {
    if (item.date !== date || !item.placeId) return [];
    const place = input.placesById[item.placeId];
    if (!place) return [];
    const coordinates = structuralCoordinates(place);
    const start = timeStringToMinutes(item.startTime);
    if (!coordinates || !Number.isFinite(start)) return [];
    return [{ start, end: start + item.durationMinutes, coordinates }];
  });
  const previous = locatedItems
    .filter((item) => item.end <= startMinute)
    .sort((left, right) => right.end - left.end)[0];
  const next = locatedItems
    .filter((item) => item.start >= endMinute)
    .sort((left, right) => left.start - right.start)[0];
  return {
    ...(previous ? { previousCoordinates: previous.coordinates } : {}),
    ...(next ? { nextCoordinates: next.coordinates } : {}),
  };
}

function gapTransitionBoundaries(
  input: DuriAnalysisInput,
  constraints: readonly ConfirmedScheduleConstraint[],
  date: string,
  startMinute: number,
  endMinute: number,
) {
  const timedItems = input.itinerary.filter((item) => item.date === date && item.itemType !== "rest").map((item) => {
    const start = timeStringToMinutes(item.startTime);
    return { start, end: start + item.durationMinutes };
  });
  const timedConstraints = constraints.filter((constraint) => constraint.date === date).map((constraint) => ({
    start: constraint.startTime ? timeStringToMinutes(constraint.startTime) : undefined,
    end: constraint.endTime ? timeStringToMinutes(constraint.endTime) : undefined,
  }));
  return {
    requiresStartTransition: timedItems.some((item) => item.end === startMinute)
      || timedConstraints.some((constraint) => constraint.end === startMinute),
    requiresEndTransition: timedItems.some((item) => item.start === endMinute)
      || timedConstraints.some((constraint) => constraint.start === endMinute),
  };
}

function buildPlacementSlots(
  input: DuriAnalysisInput,
  start: number,
  end: number,
  duration: number,
  transitionBufferMinutes: number,
  constraints: readonly ConfirmedScheduleConstraint[],
  preferredDailyScheduledMinutes?: number,
) {
  const dates = getTripDates(input.trip.startDate, input.trip.endDate);
  const dayPools: {
    date: string;
    existingMinutes: number;
    preferredDailyScheduledMinutes?: number;
    gaps: PlacementGap[];
    slots: PlacementSlot[];
  }[] = [];
  let hasIncompleteConstraint = false;
  const endCondition = input.trip.endCondition;
  const endCutoff = endCondition && input.trip.endDate
    ? timeStringToMinutes(endCondition.deadline) - endCondition.travelMinutes - endCondition.serviceBufferMinutes
    : undefined;
  dates.forEach((date) => {
    const limit = date === input.trip.endDate && endCutoff !== undefined ? Math.min(end, endCutoff) : end;
    const { blockers, dayBlocked, incompleteTimeConstraint } = blockerRangesForDate(input, date, constraints);
    hasIncompleteConstraint ||= incompleteTimeConstraint;
    if (dayBlocked || limit - start < duration) return;
    const merged = blockers
      .map((range) => ({ start: Math.max(start, range.start), end: Math.min(limit, range.end) }))
      .filter((range) => range.start < range.end)
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .reduce<{ start: number; end: number }[]>((result, range) => {
        const tail = result[result.length - 1];
        if (!tail || range.start > tail.end) result.push({ ...range });
        else tail.end = Math.max(tail.end, range.end);
        return result;
      }, []);
    let cursor = start;
    const gaps: { start: number; end: number }[] = [];
    merged.forEach((blocker) => {
      if (cursor < blocker.start) gaps.push({ start: cursor, end: blocker.start });
      cursor = Math.max(cursor, blocker.end);
    });
    if (cursor < limit) gaps.push({ start: cursor, end: limit });
    const placementGaps = gaps.map((gap): PlacementGap => ({
      date,
      startMinute: Math.ceil(gap.start / SLOT_MINUTES) * SLOT_MINUTES,
      endMinute: Math.floor(gap.end / SLOT_MINUTES) * SLOT_MINUTES,
      ...gapTransitionBoundaries(input, constraints, date, gap.start, gap.end),
      ...gapBoundaryCoordinates(input, date, gap.start, gap.end),
    })).filter((gap) => gap.startMinute < gap.endMinute);
    const daySlots: PlacementSlot[] = [];
    placementGaps.forEach((gap) => {
      let slotStart = gap.startMinute + (gap.requiresStartTransition ? transitionBufferMinutes : 0);
      const slotEnd = gap.endMinute - (gap.requiresEndTransition ? transitionBufferMinutes : 0);
      while (slotStart + duration <= slotEnd) {
        daySlots.push({ date, startMinute: slotStart });
        slotStart += duration + transitionBufferMinutes;
      }
    });
    const existingMinutes = occupiedMinutesOnDate(input.itinerary, date);
    dayPools.push({
      date,
      existingMinutes,
      ...(preferredDailyScheduledMinutes === undefined ? {} : { preferredDailyScheduledMinutes }),
      gaps: placementGaps,
      // 하루 선호 일정량은 Soft 목표다. 물리적으로 빈 슬롯을 지우지 않고
      // 날짜 분산 우선순위와 기본 추가 개수에만 사용한다.
      slots: daySlots,
    });
  });
  const slotCapacityByDate = Object.fromEntries(dayPools.map((pool) => [pool.date, pool.slots.length]));
  const queues = dayPools.map((pool) => ({ ...pool, slots: [...pool.slots], assigned: 0 }));
  const slots: PlacementSlot[] = [];
  while (queues.some((pool) => pool.slots.length)) {
    const next = queues.filter((pool) => pool.slots.length).sort((left, right) => {
      const leftLoad = left.existingMinutes + left.assigned * duration;
      const rightLoad = right.existingMinutes + right.assigned * duration;
      const leftNormalized = left.preferredDailyScheduledMinutes
        ? leftLoad / left.preferredDailyScheduledMinutes
        : leftLoad;
      const rightNormalized = right.preferredDailyScheduledMinutes
        ? rightLoad / right.preferredDailyScheduledMinutes
        : rightLoad;
      return leftNormalized - rightNormalized || compareText(left.date, right.date);
    })[0];
    const slot = next.slots.shift();
    if (!slot) break;
    next.assigned += 1;
    slots.push(slot);
  }
  return {
    slots,
    hasIncompleteConstraint,
    dayPools,
    slotCapacityByDate,
  };
}

function observedTransitionBuffer(input: DuriAnalysisInput) {
  const routeDurations = (input.routeLegEstimates ?? []).flatMap((estimate) => (
    estimate.mode === input.trip.transport
      && Number.isFinite(estimate.durationSeconds)
      && estimate.durationSeconds > 0
      ? [estimate.durationSeconds / 60]
      : []
  ));
  if (!routeDurations.length) {
    return { minutes: SLOT_MINUTES, basis: "editing-grid-default" as const };
  }
  return {
    minutes: Math.max(SLOT_MINUTES, snapDurationUpper(median(routeDurations))),
    basis: "observed-route-duration" as const,
  };
}

type DurationPackingResult = {
  feasible: boolean;
  exact: boolean;
  expandedStates: number;
  placements: PackedCandidatePlacement[];
  comparableInsertionCount: number;
  totalInsertionDistanceMeters: number;
  totalPathDistanceMeters: number;
  optimizedGapCount: number;
  sequenceOptimizationExact: boolean;
};

type PlacementDayLoad = {
  existingMinutes: number;
  preferredDailyScheduledMinutes?: number;
};

function insertionDistanceForBin(
  candidates: readonly CandidateModel[],
  candidateIndex: number,
  bin: PlacementGap & { lastCandidateIndex?: number },
) {
  const current = candidates[candidateIndex].structuralCoordinates;
  if (!current) return undefined;
  const previous = bin.lastCandidateIndex === undefined
    ? bin.previousCoordinates
    : candidates[bin.lastCandidateIndex].structuralCoordinates;
  const next = bin.nextCoordinates;
  if (previous && next) {
    return Math.max(0, distanceMeters(previous, current) + distanceMeters(current, next) - distanceMeters(previous, next));
  }
  if (previous) return distanceMeters(previous, current);
  if (next) return distanceMeters(current, next);
  return undefined;
}

const ROUTE_DISTANCE_EPSILON_METERS = 1e-6;

function candidateSequenceKey(candidates: readonly CandidateModel[], indexes: readonly number[]) {
  return indexes.map((index) => candidates[index].place.id).join("\u001f");
}

function candidatePathDistanceMeters(
  candidates: readonly CandidateModel[],
  indexes: readonly number[],
  gap: PlacementGap,
) {
  const coordinates = indexes.map((index) => candidates[index].structuralCoordinates);
  if (coordinates.some((coordinate) => !coordinate)) return undefined;
  const located = coordinates as StructuralCoordinates[];
  let total = 0;
  if (gap.previousCoordinates && located[0]) total += distanceMeters(gap.previousCoordinates, located[0]);
  for (let index = 1; index < located.length; index += 1) {
    total += distanceMeters(located[index - 1], located[index]);
  }
  if (gap.nextCoordinates && located.length) total += distanceMeters(located[located.length - 1], gap.nextCoordinates);
  return total;
}

function candidateStartWithinOperatingFacts(
  candidate: CandidateModel,
  date: string,
  earliestStart: number,
  latestEnd: number,
  preferredStart = earliestStart,
) {
  const availability = candidate.operatingAvailabilityByDate[date] ?? { status: "unknown" as const };
  if (availability.status === "closed") return undefined;
  const duration = candidate.durationEvidence.durationMinutes;
  const nearestGridStart = (minimum: number, maximum: number) => {
    if (minimum > maximum) return undefined;
    const snapped = Math.round(preferredStart / SLOT_MINUTES) * SLOT_MINUTES;
    return Math.max(minimum, Math.min(maximum, snapped));
  };
  if (availability.status === "unknown") {
    return nearestGridStart(earliestStart, latestEnd - duration);
  }
  const choices = availability.windows.flatMap((window) => {
    const minimum = Math.ceil(Math.max(earliestStart, window.startMinutes) / SLOT_MINUTES) * SLOT_MINUTES;
    const maximum = Math.floor((Math.min(latestEnd, window.endMinutes) - duration) / SLOT_MINUTES) * SLOT_MINUTES;
    const start = nearestGridStart(minimum, maximum);
    return start === undefined ? [] : [start];
  });
  return choices.sort((left, right) => (
    Math.abs(left - preferredStart) - Math.abs(right - preferredStart)
    || left - right
  ))[0];
}

function candidateLatestStartWithinOperatingFacts(
  candidate: CandidateModel,
  date: string,
  earliestStart: number,
  latestEnd: number,
) {
  const availability = candidate.operatingAvailabilityByDate[date] ?? { status: "unknown" as const };
  if (availability.status === "closed") return undefined;
  const duration = candidate.durationEvidence.durationMinutes;
  if (availability.status === "unknown") {
    const latest = Math.floor((latestEnd - duration) / SLOT_MINUTES) * SLOT_MINUTES;
    return latest >= earliestStart ? latest : undefined;
  }
  const starts = availability.windows.flatMap((window) => {
    const minimum = Math.ceil(Math.max(earliestStart, window.startMinutes) / SLOT_MINUTES) * SLOT_MINUTES;
    const maximum = Math.floor((Math.min(latestEnd, window.endMinutes) - duration) / SLOT_MINUTES) * SLOT_MINUTES;
    return minimum <= maximum ? [maximum] : [];
  });
  return starts.length ? Math.max(...starts) : undefined;
}

function scheduleCandidateSequence(
  candidates: readonly CandidateModel[],
  indexes: readonly number[],
  gap: PlacementGap,
  transitionBufferMinutes: number,
  spreadSlack = false,
) {
  const placements: PackedCandidatePlacement[] = [];
  const earliestBoundary = gap.startMinute + (gap.requiresStartTransition ? transitionBufferMinutes : 0);
  let cursor = earliestBoundary;
  const latestEnd = gap.endMinute - (gap.requiresEndTransition ? transitionBufferMinutes : 0);
  const latestStarts: number[] = [];
  if (spreadSlack) {
    let nextStart = latestEnd;
    for (let position = indexes.length - 1; position >= 0; position -= 1) {
      const candidateIndex = indexes[position];
      const candidateLatestEnd = nextStart - (position < indexes.length - 1 ? transitionBufferMinutes : 0);
      const latestStart = candidateLatestStartWithinOperatingFacts(
        candidates[candidateIndex],
        gap.date,
        earliestBoundary,
        candidateLatestEnd,
      );
      if (latestStart === undefined) return undefined;
      latestStarts[position] = latestStart;
      nextStart = latestStart;
    }
  }
  for (const [position, candidateIndex] of indexes.entries()) {
    const earliest = cursor + (position ? transitionBufferMinutes : 0);
    const duration = candidates[candidateIndex].durationEvidence.durationMinutes;
    const targetCenter = earliestBoundary + (position + 1) * (latestEnd - earliestBoundary) / (indexes.length + 1);
    const preferredStart = spreadSlack ? targetCenter - duration / 2 : earliest;
    const candidateLatestEnd = spreadSlack ? latestStarts[position] + duration : latestEnd;
    const startMinute = candidateStartWithinOperatingFacts(
      candidates[candidateIndex],
      gap.date,
      earliest,
      candidateLatestEnd,
      preferredStart,
    );
    if (startMinute === undefined) return undefined;
    placements.push({ candidateIndex, date: gap.date, startMinute, gapIndex: -1 });
    cursor = startMinute + duration;
  }
  return placements;
}

function spreadProvisionalPlacementSlack(
  candidates: readonly CandidateModel[],
  placements: readonly PackedCandidatePlacement[],
  gaps: readonly PlacementGap[],
  transitionBufferMinutes: number,
) {
  const byGap = new Map<number, PackedCandidatePlacement[]>();
  placements.forEach((placement) => {
    byGap.set(placement.gapIndex, [...(byGap.get(placement.gapIndex) ?? []), placement]);
  });
  let adjustedGapCount = 0;
  const spread = [...byGap.entries()].flatMap(([gapIndex, group]) => {
    const original = [...group].sort((left, right) => (
      left.startMinute - right.startMinute
      || compareText(candidates[left.candidateIndex].place.id, candidates[right.candidateIndex].place.id)
    ));
    const gap = gaps[gapIndex];
    if (!gap) return original;
    const scheduled = scheduleCandidateSequence(
      candidates,
      original.map((placement) => placement.candidateIndex),
      gap,
      transitionBufferMinutes,
      true,
    );
    if (!scheduled) return original;
    if (scheduled.some((placement, index) => placement.startMinute !== original[index]?.startMinute)) {
      adjustedGapCount += 1;
    }
    return scheduled.map((placement) => ({ ...placement, gapIndex }));
  }).sort((left, right) => compareText(left.date, right.date) || left.startMinute - right.startMinute);
  return { placements: spread, adjustedGapCount };
}

function routeIsBetter(
  candidates: readonly CandidateModel[],
  leftIndexes: readonly number[],
  leftDistance: number,
  rightIndexes: readonly number[] | undefined,
  rightDistance: number,
) {
  if (!rightIndexes) return true;
  if (leftDistance < rightDistance - ROUTE_DISTANCE_EPSILON_METERS) return true;
  if (Math.abs(leftDistance - rightDistance) > ROUTE_DISTANCE_EPSILON_METERS) return false;
  return compareText(candidateSequenceKey(candidates, leftIndexes), candidateSequenceKey(candidates, rightIndexes)) < 0;
}

/**
 * 한 빈 구간 안의 장소 수가 작으면 Held-Karp 동적 계획법으로 양 끝 고정점을
 * 포함한 최단 열린 경로를 정확히 찾는다. 거리 동률은 장소 ID 순으로 고정해
 * 후보 입력 순서가 결과를 바꾸지 않게 한다.
 */
function exactGapRoute(
  candidates: readonly CandidateModel[],
  candidateIndexes: readonly number[],
  gap: PlacementGap,
) {
  const count = candidateIndexes.length;
  if (count < 2) {
    return {
      indexes: [...candidateIndexes],
      distanceMeters: candidatePathDistanceMeters(candidates, candidateIndexes, gap) ?? 0,
    };
  }
  const stateCount = 1 << count;
  const costs = new Float64Array(stateCount * count);
  costs.fill(Number.POSITIVE_INFINITY);
  const keys = new Array<string | undefined>(stateCount * count);
  const previous = new Int16Array(stateCount * count);
  previous.fill(-2);
  const coordinates = candidateIndexes.map((index) => candidates[index].structuralCoordinates as StructuralCoordinates);
  for (let localIndex = 0; localIndex < count; localIndex += 1) {
    const stateIndex = (1 << localIndex) * count + localIndex;
    costs[stateIndex] = gap.previousCoordinates
      ? distanceMeters(gap.previousCoordinates, coordinates[localIndex])
      : 0;
    keys[stateIndex] = candidates[candidateIndexes[localIndex]].place.id;
    previous[stateIndex] = -1;
  }
  for (let mask = 1; mask < stateCount; mask += 1) {
    for (let last = 0; last < count; last += 1) {
      if (!(mask & (1 << last))) continue;
      const stateIndex = mask * count + last;
      const stateCost = costs[stateIndex];
      const stateKey = keys[stateIndex];
      if (!Number.isFinite(stateCost) || !stateKey) continue;
      for (let next = 0; next < count; next += 1) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const nextStateIndex = nextMask * count + next;
        const nextCost = stateCost + distanceMeters(coordinates[last], coordinates[next]);
        const nextKey = `${stateKey}\u001f${candidates[candidateIndexes[next]].place.id}`;
        if (nextCost < costs[nextStateIndex] - ROUTE_DISTANCE_EPSILON_METERS
          || (Math.abs(nextCost - costs[nextStateIndex]) <= ROUTE_DISTANCE_EPSILON_METERS
            && compareText(nextKey, keys[nextStateIndex] ?? "\uffff") < 0)) {
          costs[nextStateIndex] = nextCost;
          keys[nextStateIndex] = nextKey;
          previous[nextStateIndex] = last;
        }
      }
    }
  }
  const fullMask = stateCount - 1;
  let bestLast = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestKey: string | undefined;
  for (let last = 0; last < count; last += 1) {
    const stateIndex = fullMask * count + last;
    const distance = costs[stateIndex] + (gap.nextCoordinates
      ? distanceMeters(coordinates[last], gap.nextCoordinates)
      : 0);
    const key = keys[stateIndex];
    if (!key) continue;
    if (distance < bestDistance - ROUTE_DISTANCE_EPSILON_METERS
      || (Math.abs(distance - bestDistance) <= ROUTE_DISTANCE_EPSILON_METERS
        && compareText(key, bestKey ?? "\uffff") < 0)) {
      bestLast = last;
      bestDistance = distance;
      bestKey = key;
    }
  }
  const reversed: number[] = [];
  let mask = fullMask;
  let last = bestLast;
  while (last >= 0) {
    reversed.push(candidateIndexes[last]);
    const stateIndex = mask * count + last;
    const predecessor = previous[stateIndex];
    mask ^= 1 << last;
    last = predecessor;
  }
  return { indexes: reversed.reverse(), distanceMeters: bestDistance };
}

/**
 * 큰 구간은 모든 순열을 만들지 않고 cheapest insertion 뒤 2-opt를 적용한다.
 * 전역 최적 증명은 하지 않으며 계산 한도와 결정성을 우선한다.
 */
function heuristicGapRoute(
  candidates: readonly CandidateModel[],
  candidateIndexes: readonly number[],
  gap: PlacementGap,
) {
  const remaining = [...candidateIndexes].sort((left, right) => compareText(candidates[left].place.id, candidates[right].place.id));
  let route: number[] = [];
  while (remaining.length) {
    let bestRoute: number[] | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestRemainingIndex = -1;
    remaining.forEach((candidateIndex, remainingIndex) => {
      for (let position = 0; position <= route.length; position += 1) {
        const proposal = [...route.slice(0, position), candidateIndex, ...route.slice(position)];
        const distance = candidatePathDistanceMeters(candidates, proposal, gap);
        if (distance !== undefined && routeIsBetter(candidates, proposal, distance, bestRoute, bestDistance)) {
          bestRoute = proposal;
          bestDistance = distance;
          bestRemainingIndex = remainingIndex;
        }
      }
    });
    if (!bestRoute || bestRemainingIndex < 0) break;
    route = bestRoute;
    remaining.splice(bestRemainingIndex, 1);
  }
  let routeDistance = candidatePathDistanceMeters(candidates, route, gap) ?? 0;
  for (let round = 0; round < LOCAL_SEARCH_ROUND_LIMIT; round += 1) {
    let bestRoute = route;
    let bestDistance = routeDistance;
    for (let left = 0; left < route.length - 1; left += 1) {
      for (let right = left + 1; right < route.length; right += 1) {
        const proposal = [...route.slice(0, left), ...route.slice(left, right + 1).reverse(), ...route.slice(right + 1)];
        const distance = candidatePathDistanceMeters(candidates, proposal, gap);
        if (distance !== undefined && routeIsBetter(candidates, proposal, distance, bestRoute, bestDistance)) {
          bestRoute = proposal;
          bestDistance = distance;
        }
      }
    }
    if (candidateSequenceKey(candidates, bestRoute) === candidateSequenceKey(candidates, route)) break;
    route = bestRoute;
    routeDistance = bestDistance;
  }
  return { indexes: route, distanceMeters: routeDistance };
}

function optimizePackedPlacements(
  candidates: readonly CandidateModel[],
  placements: readonly PackedCandidatePlacement[],
  gaps: readonly PlacementGap[],
  transitionBufferMinutes: number,
) {
  const byGap = new Map<number, PackedCandidatePlacement[]>();
  placements.forEach((placement) => {
    byGap.set(placement.gapIndex, [...(byGap.get(placement.gapIndex) ?? []), placement]);
  });
  const optimized: PackedCandidatePlacement[] = [];
  let comparableInsertionCount = 0;
  let totalInsertionDistanceMeters = 0;
  let totalPathDistanceMeters = 0;
  let optimizedGapCount = 0;
  let sequenceOptimizationExact = true;
  [...byGap.entries()].sort(([left], [right]) => left - right).forEach(([gapIndex, group]) => {
    const countersBefore = {
      comparableInsertionCount,
      totalInsertionDistanceMeters,
      totalPathDistanceMeters,
      sequenceOptimizationExact,
    };
    const gap = gaps[gapIndex];
    const original = [...group].sort((left, right) => left.startMinute - right.startMinute || compareText(candidates[left.candidateIndex].place.id, candidates[right.candidateIndex].place.id));
    const candidateIndexes = original.map((placement) => placement.candidateIndex);
    const orderedIndexes = [...candidateIndexes];
    let optimizedThisGap = false;
    if (gap) {
      // 좌표가 없는 장소를 0거리로 취급하지 않는다. 대신 원래 자리에서 고정하고,
      // 그 사이의 연속된 좌표 보유 구간만 독립적으로 최적화한다.
      let runStart = 0;
      while (runStart < candidateIndexes.length) {
        if (!candidates[candidateIndexes[runStart]].structuralCoordinates) {
          runStart += 1;
          continue;
        }
        let runEnd = runStart + 1;
        while (runEnd < candidateIndexes.length && candidates[candidateIndexes[runEnd]].structuralCoordinates) runEnd += 1;
        const runIndexes = candidateIndexes.slice(runStart, runEnd);
        const runGap: PlacementGap = {
          ...gap,
          ...(runStart === 0 && gap.previousCoordinates ? { previousCoordinates: gap.previousCoordinates } : { previousCoordinates: undefined }),
          ...(runEnd === candidateIndexes.length && gap.nextCoordinates ? { nextCoordinates: gap.nextCoordinates } : { nextCoordinates: undefined }),
        };
        const hasComparableEdge = runIndexes.length > 1 || Boolean(runGap.previousCoordinates || runGap.nextCoordinates);
        if (hasComparableEdge) {
          const route = runIndexes.length <= EXACT_ROUTE_SEQUENCE_ITEM_LIMIT
            ? { ...exactGapRoute(candidates, runIndexes, runGap), exact: true }
            : { ...heuristicGapRoute(candidates, runIndexes, runGap), exact: false };
          orderedIndexes.splice(runStart, runIndexes.length, ...route.indexes);
          comparableInsertionCount += runIndexes.length;
          totalPathDistanceMeters += route.distanceMeters;
          const directBoundaryDistance = runGap.previousCoordinates && runGap.nextCoordinates
            ? distanceMeters(runGap.previousCoordinates, runGap.nextCoordinates)
            : 0;
          totalInsertionDistanceMeters += Math.max(0, route.distanceMeters - directBoundaryDistance);
          sequenceOptimizationExact &&= route.exact;
          optimizedThisGap = true;
        }
        runStart = runEnd;
      }
    }
    const scheduledOptimized = gap
      ? scheduleCandidateSequence(candidates, orderedIndexes, gap, transitionBufferMinutes)
      : undefined;
    if (scheduledOptimized) {
      optimized.push(...scheduledOptimized.map((placement) => ({ ...placement, gapIndex })));
    } else {
      // 거리상 더 짧아도 운영시간을 어기면 원래 exact packing 순서를 유지한다.
      optimized.push(...original);
      optimizedThisGap = false;
      comparableInsertionCount = countersBefore.comparableInsertionCount;
      totalInsertionDistanceMeters = countersBefore.totalInsertionDistanceMeters;
      totalPathDistanceMeters = countersBefore.totalPathDistanceMeters;
      sequenceOptimizationExact = countersBefore.sequenceOptimizationExact;
    }
    if (optimizedThisGap) {
      optimizedGapCount += 1;
    }
  });
  return {
    placements: optimized.sort((left, right) => compareText(left.date, right.date) || left.startMinute - right.startMinute),
    comparableInsertionCount,
    totalInsertionDistanceMeters,
    totalPathDistanceMeters,
    optimizedGapCount,
    sequenceOptimizationExact,
  };
}

/**
 * 서로 다른 체류시간과 장소별 운영시간을 빈 구간에 넣는 multiple-bin
 * scheduling이다. 후보 순서를 고정하면 오전 마감 장소보다 긴 오후 장소가 먼저
 * 선택되어 실행 가능한 일정을 놓칠 수 있으므로, 남은 후보와 bin을 함께
 * backtracking한다. 상태 한도 안에서 실패하면 정확한 infeasible 증명이고,
 * 한도에 닿으면 false를 확정하지 않고 exact=false로 남긴다.
 */
function packCandidateDurations(
  candidates: readonly CandidateModel[],
  candidateIndexes: readonly number[],
  gaps: readonly PlacementGap[],
  dayLoadByDate: Readonly<Record<string, PlacementDayLoad>> = {},
  transitionBufferMinutes = SLOT_MINUTES,
  optimizeSequence = true,
): DurationPackingResult {
  const stableCandidateIndexes = [...candidateIndexes].sort((left, right) => compareText(
    candidates[left].place.id,
    candidates[right].place.id,
  ));
  const candidateOrderMatters = stableCandidateIndexes.some((candidateIndex) => (
    Object.values(candidates[candidateIndex].operatingAvailabilityByDate)
      .some((availability) => availability.status === "windowed")
  ));
  const initialRemaining = candidateOrderMatters ? stableCandidateIndexes : [...stableCandidateIndexes].sort((left, right) => (
    candidates[right].durationEvidence.durationMinutes - candidates[left].durationEvidence.durationMinutes
    || compareText(candidates[left].place.id, candidates[right].place.id)
  ));
  const bins = gaps.map((gap, gapIndex) => ({
    ...gap,
    gapIndex,
    cursor: gap.startMinute + (gap.requiresStartTransition ? transitionBufferMinutes : 0),
    remaining: gap.endMinute
      - (gap.requiresEndTransition ? transitionBufferMinutes : 0)
      - (gap.startMinute + (gap.requiresStartTransition ? transitionBufferMinutes : 0)),
    lastCandidateIndex: undefined as number | undefined,
  })).filter((gap) => gap.remaining > 0);
  const placements: PackedCandidatePlacement[] = [];
  const addedMinutesByDate: Record<string, number> = {};
  const failedStates = new Set<string>();
  let expandedStates = 0;
  let limitReached = false;
  const visit = (remaining: readonly number[]): boolean => {
    if (!remaining.length) return true;
    if (expandedStates >= EXACT_DURATION_PACKING_STATE_LIMIT) {
      limitReached = true;
      return false;
    }
    expandedStates += 1;
    const stateKey = `${remaining.join(",")}|${bins.map((bin) => `${bin.cursor}:${bin.lastCandidateIndex === undefined ? 0 : 1}`).join(",")}`;
    if (failedStates.has(stateKey)) return false;
    const choices = (candidateOrderMatters ? remaining : remaining.slice(0, 1)).map((candidateIndex) => {
      const duration = candidates[candidateIndex].durationEvidence.durationMinutes;
      const starts = new Map<number, number>();
      bins.forEach((bin, binIndex) => {
        const earliest = bin.cursor + (bin.lastCandidateIndex === undefined ? 0 : transitionBufferMinutes);
        const latestEnd = bin.endMinute - (bin.requiresEndTransition ? transitionBufferMinutes : 0);
        const startMinute = candidateStartWithinOperatingFacts(candidates[candidateIndex], bin.date, earliest, latestEnd);
        if (startMinute !== undefined) starts.set(binIndex, startMinute);
      });
      const minimumSlack = [...starts.entries()].reduce((minimum, [binIndex, startMinute]) => (
        Math.min(minimum, bins[binIndex].endMinute - startMinute - duration)
      ), Number.POSITIVE_INFINITY);
      return { candidateIndex, duration, starts, minimumSlack };
    }).sort((left, right) => (
      // 가장 선택지가 적고 마감 여유가 작은 장소부터 시도하면 오전 한정 장소를
      // 먼저 보면서도, 실패 시 아래 반복에서 다른 후보 순서를 모두 탐색한다.
      left.starts.size - right.starts.size
      || left.minimumSlack - right.minimumSlack
      || right.duration - left.duration
      || compareText(candidates[left.candidateIndex].place.id, candidates[right.candidateIndex].place.id)
    ));
    // 운영 시간창이 하나도 없으면 item 순서는 용량·날짜 배정 가능성에 영향을
    // 주지 않으므로 가장 제약적인 한 후보만 고정해 표준 bin-packing으로 줄인다.
    // 시간창이 있으면 오전/오후 순서가 feasibility를 바꾸므로 모든 후보 순서를
    // 상태 한도 안에서 탐색한다.
    for (const choice of choices) {
      const { candidateIndex, duration, starts } = choice;
      if (!starts.size) continue;
      const binIndexes = [...starts.keys()].sort((left, right) => {
        const loadScore = (binIndex: number) => {
          const bin = bins[binIndex];
          const day = dayLoadByDate[bin.date];
          const projected = (day?.existingMinutes ?? 0) + (addedMinutesByDate[bin.date] ?? 0) + duration;
          return day?.preferredDailyScheduledMinutes
            ? projected / day.preferredDailyScheduledMinutes
            : projected;
        };
        const loadComparison = loadScore(left) - loadScore(right);
        if (loadComparison !== 0) return loadComparison;
        if (optimizeSequence) {
          const leftDistance = insertionDistanceForBin(candidates, candidateIndex, bins[left]);
          const rightDistance = insertionDistanceForBin(candidates, candidateIndex, bins[right]);
          if (leftDistance !== undefined && rightDistance !== undefined && leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }
        }
        return (bins[left].endMinute - (starts.get(left) ?? bins[left].cursor) - duration)
          - (bins[right].endMinute - (starts.get(right) ?? bins[right].cursor) - duration)
        || compareText(bins[left].date, bins[right].date)
        || bins[left].cursor - bins[right].cursor;
      });
      for (const binIndex of binIndexes) {
        const bin = bins[binIndex];
        const startMinute = starts.get(binIndex);
        if (startMinute === undefined) continue;
        const previousCursor = bin.cursor;
        const previousRemaining = bin.remaining;
        const previousLastCandidateIndex = bin.lastCandidateIndex;
        bin.cursor = startMinute + duration;
        bin.remaining = bin.endMinute
          - (bin.requiresEndTransition ? transitionBufferMinutes : 0)
          - bin.cursor;
        bin.lastCandidateIndex = candidateIndex;
        addedMinutesByDate[bin.date] = (addedMinutesByDate[bin.date] ?? 0) + duration;
        placements.push({ candidateIndex, date: bin.date, startMinute, gapIndex: bin.gapIndex });
        const nextRemaining = remaining.filter((index) => index !== candidateIndex);
        if (visit(nextRemaining)) return true;
        placements.pop();
        addedMinutesByDate[bin.date] -= duration;
        bin.lastCandidateIndex = previousLastCandidateIndex;
        bin.cursor = previousCursor;
        bin.remaining = previousRemaining;
        if (limitReached) break;
      }
      if (limitReached) break;
    }
    if (!limitReached) failedStates.add(stateKey);
    return false;
  };
  const feasible = visit(initialRemaining);
  const optimized = feasible && optimizeSequence
    ? optimizePackedPlacements(candidates, placements, gaps, transitionBufferMinutes)
    : {
      placements: feasible ? [...placements] : [],
      comparableInsertionCount: 0,
      totalInsertionDistanceMeters: 0,
      totalPathDistanceMeters: 0,
      optimizedGapCount: 0,
      sequenceOptimizationExact: true,
    };
  return {
    feasible,
    exact: feasible || !limitReached,
    expandedStates,
    ...optimized,
  };
}

function makeItemId(input: DuriAnalysisInput, placeId: string, date: string, startTime: string, used: Set<string>) {
  const normalized = `duri-autofill-${date}-${startTime.replace(":", "")}-${placeId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  let id = normalized;
  let suffix = 2;
  while (used.has(id)) {
    id = `${normalized}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function prefilterAutoFillCandidates(candidates: readonly CandidateModel[]) {
  if (candidates.length <= MAX_AUTO_FILL_CANDIDATES) {
    return { candidates: [...candidates], originalEligibleCount: candidates.length, omittedCount: 0 };
  }
  const compareCandidateEvidence = (left: CandidateModel, right: CandidateModel) => (
    Number(right.mandatory) - Number(left.mandatory)
    || left.explicitAversionCount - right.explicitAversionCount
    || right.sharedPreferenceStrengthScore - left.sharedPreferenceStrengthScore
    || right.directSupportCount - left.directSupportCount
    || right.matchedTagCount - left.matchedTagCount
    || right.explicitPreferenceCount - left.explicitPreferenceCount
    || right.numericPreferenceScore - left.numericPreferenceScore
    || compareText(left.place.id, right.place.id)
  );
  const mandatory = candidates.filter((candidate) => candidate.mandatory).sort(compareCandidateEvidence);
  if (mandatory.length > MAX_AUTO_FILL_CANDIDATES) {
    return { candidates: mandatory, originalEligibleCount: candidates.length, omittedCount: candidates.length - mandatory.length, mandatoryOverflow: true as const };
  }
  const grouped = new Map<string, CandidateModel[]>();
  candidates.filter((candidate) => !candidate.mandatory).forEach((candidate) => {
    grouped.set(candidate.structuralCategoryKey, [...(grouped.get(candidate.structuralCategoryKey) ?? []), candidate]);
  });
  const queues = [...grouped.entries()].map(([key, values]) => ({ key, values: values.sort(compareCandidateEvidence) }))
    .sort((left, right) => compareCandidateEvidence(left.values[0], right.values[0]) || compareText(left.key, right.key));
  const selected = [...mandatory];
  while (selected.length < MAX_AUTO_FILL_CANDIDATES && queues.some((queue) => queue.values.length)) {
    for (const queue of queues) {
      const next = queue.values.shift();
      if (next) selected.push(next);
      if (selected.length >= MAX_AUTO_FILL_CANDIDATES) break;
    }
  }
  return {
    candidates: selected,
    originalEligibleCount: candidates.length,
    omittedCount: candidates.length - selected.length,
  };
}

function durationCountUpperBound(
  candidates: readonly CandidateModel[],
  gaps: readonly PlacementGap[],
  transitionBufferMinutes: number,
) {
  const placeableDurations = candidates.flatMap((candidate) => {
    const canUseAnyGap = gaps.some((gap) => candidateStartWithinOperatingFacts(
      candidate,
      gap.date,
      gap.startMinute + (gap.requiresStartTransition ? transitionBufferMinutes : 0),
      gap.endMinute - (gap.requiresEndTransition ? transitionBufferMinutes : 0),
    ) !== undefined);
    return canUseAnyGap ? [candidate.durationEvidence.durationMinutes + transitionBufferMinutes] : [];
  }).sort((left, right) => left - right);
  // 각 사용 gap의 첫 장소에는 전환 여유가 필요 없으므로 모든 gap 수만큼의
  // buffer credit을 준 느슨한 상한이다. 실제 feasibility를 거짓으로 낮추지 않으면서
  // 긴 후보가 많은 입력에서 불가능한 count를 수십 번 탐색하는 일을 막는다.
  const usableGapCapacities = gaps.map((gap) => Math.max(0,
    gap.endMinute - gap.startMinute
      - (gap.requiresStartTransition ? transitionBufferMinutes : 0)
      - (gap.requiresEndTransition ? transitionBufferMinutes : 0),
  )).filter((gapCapacity) => gapCapacity > 0);
  const capacity = usableGapCapacities.reduce((sum, gapCapacity) => sum + gapCapacity, 0)
    + transitionBufferMinutes * usableGapCapacities.length;
  let used = 0;
  let count = 0;
  for (const duration of placeableDurations) {
    if (used + duration > capacity) break;
    used += duration;
    count += 1;
  }
  return count;
}

export function planPreferenceAutoFill(input: DuriAnalysisInput, request: PreferenceAutoFillRequest = {}): PreferenceAutoFillPlan {
  const mode = input.itinerary.length ? "partial-itinerary" as const : "empty-itinerary" as const;
  const tripDates = getTripDates(input.trip.startDate, input.trip.endDate);
  if (!tripDates.length) return emptyPlan(input, "insufficient-data", "여행 날짜를 먼저 확정해 주세요.");
  // 아래 원본을 못 읽어도 facts를 '없음'으로 확정하지 않고 해당 신호를 계산에서
  // 제외한다. 정보 부재 자체를 Hard Constraint 위반으로 간주하지는 않는다.
  // 실제 적용은 최신 schedule/facts version과 잠금·예약 보호를 다시 검증한다.
  const degradedEvidence: PreferenceAutoFillCertificate["degradedEvidence"] = [
    ...(input.documentCollectionStatus === "unavailable" ? ["documents" as const] : []),
    ...(input.localPlanningFactsStatus === "unavailable" ? ["planning" as const] : []),
    ...(input.sharedPreferenceEvidenceStatus && (
      input.sharedPreferenceEvidenceStatus !== "loaded" || !getUsableSharedPreferenceEvidence(input)
    ) ? ["shared-preferences" as const] : []),
  ];
  const currentMemberIds = new Set(input.trip.members.map((member) => member.userId));
  const mobilityRequirementMembers = (getUsableSharedPreferenceEvidence(input)?.members ?? [])
    .filter((member) => currentMemberIds.has(member.userId)
      && member.mobilityConstraints.status === "present"
      && member.mobilityConstraints.values.length > 0);
  const sharedSignalConflicts = findSharedCandidateSignalConflicts(input);
  const conflictedPlaceIds = new Set(sharedSignalConflicts.map((conflict) => conflict.placeId));
  const itineraryProblem = existingItineraryProblem(input);
  if (itineraryProblem) {
    return emptyPlan(input, "insufficient-data", `${itineraryProblem} 먼저 기존 일정을 정리해 주세요. 자동 채우기는 기존 일정을 움직이지 않아요.`);
  }
  if (input.trip.endCondition) {
    const timelineEntry = buildTripEndConditionTimelineEntry(input.trip);
    const endAssessment = analyzeTripEndCondition(input.trip, input.itinerary);
    if (!timelineEntry || endAssessment.status === "invalid" || endAssessment.status === "infeasible" || endAssessment.status === "cross-midnight") {
      return emptyPlan(input, "insufficient-data", "현재 복귀 조건과 기존 마지막 날 일정부터 확인해 주세요. 자동 채우기가 종료 조건을 추정해 고치지 않습니다.");
    }
  }
  const resolved = resolveRequest(input, request);
  if (!resolved.valid) return emptyPlan(input, resolved.status ?? "invalid-request", resolved.message);
  const preference = buildPreferenceEvidence(input, request);
  if (preference.tooMany) return emptyPlan(input, "insufficient-data", `참여자 ${MAX_AUTO_FILL_MEMBERS}명 한도를 넘어 기기에서 공정 선택을 실행하지 않았어요.`);
  const constraints = input.confirmedScheduleConstraints ?? [];
  if (constraints.some((constraint) => !isUsableConfirmedScheduleConstraint(constraint, input.trip))) {
    return emptyPlan(input, "insufficient-data", "확정 예약 중 날짜나 시각을 확인할 수 없는 항목이 있어 자동 초안을 만들지 않았어요.");
  }
  if (hasMismatchedLinkedConstraint(input, constraints)) {
    return emptyPlan(input, "insufficient-data", "일정표의 날짜·시간·장소와 연결된 확정 예약 사실이 서로 달라 자동 초안을 만들지 않았어요. 먼저 확정 일정을 다시 맞춰 주세요.");
  }
  const candidateModelResult = buildCandidateModels(
    input,
    preference.evidence,
    resolved.duration,
    request.proposedVisitDurationMinutes !== undefined || !resolved.provisionalDurationUsed
      ? "user-fallback"
      : "editable-template",
    conflictedPlaceIds,
  );
  if (candidateModelResult.unsafeUtilityScale) {
    return emptyPlan(input, "insufficient-data", "성향 효용 척도가 안전한 정수 범위를 넘어 기기 계산을 중단했어요. 후보·태그 범위를 줄인 뒤 다시 시도해 주세요.");
  }
  const prefiltered = prefilterAutoFillCandidates(candidateModelResult.models);
  if (prefiltered.mandatoryOverflow) {
    return emptyPlan(input, "insufficient-data", `반드시 방문 후보가 기기 비교 한도 ${MAX_AUTO_FILL_CANDIDATES}곳을 넘어 모두 보존할 수 없어요. 필수 표시를 먼저 정리해 주세요.`);
  }
  let candidates = prefiltered.candidates;
  if (!candidates.length) {
    const explanation = candidateBlockExplanation(input, candidateModelResult);
    return emptyPlan(input, explanation.status, explanation.message, explanation.limitations);
  }
  const referenceDuration = Math.min(...candidates.map((candidate) => candidate.durationEvidence.durationMinutes));
  const transitionBuffer = observedTransitionBuffer(input);
  const { slots, hasIncompleteConstraint, dayPools, slotCapacityByDate } = buildPlacementSlots(
    input,
    resolved.start,
    resolved.end,
    referenceDuration,
    transitionBuffer.minutes,
    constraints,
    resolved.defaults.preferredDailyScheduledMinutes,
  );
  if (!slots.length) return emptyPlan(input, "no-space", "입력한 활동 시간과 고정 일정·예약·복귀 조건 사이에 후보를 넣을 빈 시간이 없어요.");
  const placementGaps = dayPools.flatMap((pool) => pool.gaps);
  const placementDayLoadByDate = Object.fromEntries(dayPools.map((pool) => [pool.date, {
    existingMinutes: pool.existingMinutes,
    ...(pool.preferredDailyScheduledMinutes === undefined ? {} : {
      preferredDailyScheduledMinutes: pool.preferredDailyScheduledMinutes,
    }),
  }]));
  const physicalCountCeiling = Math.min(
    slots.length,
    candidates.length,
    durationCountUpperBound(candidates, placementGaps, transitionBuffer.minutes),
  );
  if (physicalCountCeiling === 0) {
    const tripDateSet = new Set(tripDates);
    const closedCandidates = candidates.filter((candidate) => {
      const entries = Object.entries(candidate.operatingAvailabilityByDate)
        .filter(([date]) => tripDateSet.has(date));
      return entries.length > 0 && entries.every(([, availability]) => availability.status === "closed");
    });
    const named = closedCandidates.slice(0, 3).map((candidate) => candidate.place.name);
    return emptyPlan(
      input,
      "no-space",
      closedCandidates.length === candidates.length
        ? `여행 날짜에 휴무·행사기간 밖으로 확인된 후보만 남아 있어요${named.length ? ` (${named.join(", ")}${closedCandidates.length > named.length ? " 외" : ""})` : ""}. 날짜나 후보를 바꾸면 다시 초안을 만들 수 있어요.`
        : "후보별 운영시간·체류시간, 앞뒤 일정의 이동 여유를 함께 확인했지만 현재 빈 시간에 들어가는 장소가 없어요. 활동 시간이나 후보를 조정해 주세요.",
    );
  }
  const maximumSelectedCount = Math.min(resolved.maxNewItems ?? MAX_AUTO_FILL_ITEMS, physicalCountCeiling);
  const mandatoryCandidates = candidates.filter((candidate) => candidate.mandatory);
  const missingMandatoryDurationPlaceIds = candidateModelResult.missingDurationPlaceIds.filter((placeId) => (
    preference.evidence.some((member) => getSharedCandidateSignal(input, placeId, member.memberId)?.mustVisit === true)
  ));
  if (missingMandatoryDurationPlaceIds.length) {
    return emptyPlan(input, "insufficient-data", `반드시 방문할 후보 ${missingMandatoryDurationPlaceIds.length}곳의 체류시간 근거가 없어 임의 시간으로 배치하지 않았어요.`);
  }
  if (mandatoryCandidates.length > maximumSelectedCount) {
    return emptyPlan(
      input,
      slots.length < mandatoryCandidates.length ? "no-space" : "invalid-request",
      `반드시 방문으로 합의된 후보 ${mandatoryCandidates.length}곳을 모두 넣을 수 없어요. 빈 시간과 추가 장소 수를 늘리거나 필수 표시를 조정해 주세요.`,
    );
  }
  candidates = [
    ...mandatoryCandidates.sort((left, right) => compareText(left.place.id, right.place.id)),
    ...candidates.filter((candidate) => !candidate.mandatory).sort((left, right) => compareText(left.place.id, right.place.id)),
  ];
  const requiredCandidateCount = mandatoryCandidates.length;
  const durationFeasibilityCache = new Map<string, { feasible: boolean; exact: boolean; expandedStates: number }>();
  let durationPackingExpandedStates = 0;
  const buildFeasibility = (searchCandidates: readonly CandidateModel[]): BundleFeasibilityCheck => (indexes) => {
    // 운영 가능 날짜가 후보마다 다르므로 duration만 같은 묶음을 동일 상태로
    // 캐시하면 휴무 후보의 실패가 영업 후보에 전파된다. 후보 ID를 포함한다.
    const signature = indexes.map((index) => `${searchCandidates[index].place.id}:${searchCandidates[index].durationEvidence.durationMinutes}`)
      .sort(compareText)
      .join(",");
    const cached = durationFeasibilityCache.get(signature);
    if (cached) return cached;
    const packed = packCandidateDurations(
      searchCandidates,
      indexes,
      placementGaps,
      placementDayLoadByDate,
      transitionBuffer.minutes,
      false,
    );
    durationPackingExpandedStates += packed.expandedStates;
    const result = { feasible: packed.feasible, exact: packed.exact, expandedStates: packed.expandedStates };
    durationFeasibilityCache.set(signature, result);
    return result;
  };
  const runSelectionSearch = (selectedCount: number) => {
    const utilityRangesByEvidenceMember = preference.evidence.map((_, memberIndex): UtilityRange => {
      const requiredUtility = candidates.slice(0, requiredCandidateCount)
        .reduce((sum, candidate) => sum + candidate.utilityByMember[memberIndex], 0);
      const optionalSelectedCount = selectedCount - requiredCandidateCount;
      const optionalUtilities = candidates.slice(requiredCandidateCount)
        .map((candidate) => candidate.utilityByMember[memberIndex])
        .sort((left, right) => left - right);
      return {
        minimum: requiredUtility + optionalUtilities.slice(0, optionalSelectedCount).reduce((sum, utility) => sum + utility, 0),
        maximum: requiredUtility + (optionalSelectedCount
          ? optionalUtilities.slice(-optionalSelectedCount).reduce((sum, utility) => sum + utility, 0)
          : 0),
      };
    });
    const relaxedModeledEvidenceIndexes = utilityRangesByEvidenceMember
      .flatMap((range, index) => range.maximum > range.minimum ? [index] : []);
    const relaxedSearchCandidates = candidates.map((candidate) => ({
      ...candidate,
      utilityByMember: relaxedModeledEvidenceIndexes.map((index) => candidate.utilityByMember[index]),
    }));
    const relaxedUtilityRanges = relaxedModeledEvidenceIndexes.map((index) => utilityRangesByEvidenceMember[index]);
    const optionalSelectedCount = selectedCount - requiredCandidateCount;
    const combinationCount = combinationCountCapped(relaxedSearchCandidates.length - requiredCandidateCount, optionalSelectedCount, EXACT_BUNDLE_EVALUATION_LIMIT);
    const exactUtilityWork = combinationCount * BigInt(selectedCount * relaxedUtilityRanges.length);
    const exactSearch = combinationCount <= EXACT_BUNDLE_EVALUATION_LIMIT
      && exactUtilityWork <= EXACT_BUNDLE_UTILITY_WORK_LIMIT;
    const feasibility = buildFeasibility(relaxedSearchCandidates);
    if (exactSearch) {
      const searched = exactBundleSearch(
        relaxedSearchCandidates,
        selectedCount,
        relaxedUtilityRanges,
        requiredCandidateCount,
        feasibility,
      );
      const modeledEvidenceIndexes = searched.modeledUtilityIndexes
        .map((index) => relaxedModeledEvidenceIndexes[index]);
      return {
        selectedCount,
        modeledEvidenceIndexes,
        utilityRanges: searched.effectiveUtilityRanges,
        searchCandidates: searched.evaluationCandidates,
        exactSearch: true as const,
        fairnessNormalizationBasis: modeledEvidenceIndexes.length
          ? searched.feasibilityExact
            ? "feasible-schedule-exact" as const
            : "relaxed-candidate-bound" as const
          : "unavailable" as const,
        searched,
      };
    }
    const searched = heuristicBundleSearch(
      relaxedSearchCandidates,
      selectedCount,
      relaxedUtilityRanges,
      requiredCandidateCount,
      feasibility,
    );
    return {
      selectedCount,
      modeledEvidenceIndexes: relaxedModeledEvidenceIndexes,
      utilityRanges: relaxedUtilityRanges,
      searchCandidates: relaxedSearchCandidates,
      exactSearch: false as const,
      fairnessNormalizationBasis: relaxedModeledEvidenceIndexes.length
        ? "relaxed-candidate-bound" as const
        : "unavailable" as const,
      searched,
    };
  };
  const minimumSelectedCount = Math.max(1, requiredCandidateCount);
  // 장소 수 관측이 없을 때 후보 하나를 고르는 추천으로 축소하지 않는다. 사용자가
  // 후보 보드에 남긴 장소 중 Hard blocker와 실제 체류시간 bin-packing을 통과하는
  // 가장 큰 묶음을 찾고, 그 묶음 안에서 참여자 형평성과 동선을 최적화한다.
  let maximumCertified = maximumSelectedCount === physicalCountCeiling;
  let maximumFeasibleRun: ReturnType<typeof runSelectionSearch> | undefined;
  for (let count = maximumSelectedCount; count >= minimumSelectedCount; count -= 1) {
    const run = runSelectionSearch(count);
    if (run.searched.best) {
      maximumFeasibleRun = run;
      break;
    }
    maximumCertified &&= run.exactSearch && run.searched.feasibilityExact;
  }
  if (!maximumFeasibleRun?.searched.best || !maximumFeasibleRun.searchCandidates.length) {
    return emptyPlan(input, "no-space", "장소별 체류시간과 현재 빈 구간을 함께 계산했지만 배치 가능한 후보 묶음을 찾지 못했어요.");
  }
  const feasibleCountRange = resolved.countBasis === "maximal-feasible-schedule"
    ? {
      minimum: minimumSelectedCount,
      maximumConfirmed: maximumFeasibleRun.selectedCount,
      maximumCertified,
      selected: maximumFeasibleRun.selectedCount,
      selectionPolicy: "maximal-feasible" as const,
    }
    : undefined;
  const finalRun = maximumFeasibleRun;
  const {
    selectedCount,
    modeledEvidenceIndexes,
    searchCandidates,
    exactSearch,
    fairnessNormalizationBasis,
    searched,
  } = finalRun;
  if (!searched.best) return emptyPlan(input, "no-space", "확인한 배치 가능 범위 안에서 초안 장소 수를 정했지만 안전한 후보 묶음을 만들지 못했어요.");
  candidates = searchCandidates;
  const exact = exactSearch && searched.feasibilityExact;
  const modeledEvidence = modeledEvidenceIndexes.map((index) => preference.evidence[index]);
  const unrepresentedPreferenceMemberIds = preference.evidence.filter((_, index) => !modeledEvidenceIndexes.includes(index)).map((entry) => entry.memberId);
  const packedSelection = packCandidateDurations(
    candidates,
    searched.best.indexes,
    placementGaps,
    placementDayLoadByDate,
    transitionBuffer.minutes,
  );
  durationPackingExpandedStates += packedSelection.expandedStates;
  if (!packedSelection.feasible) return emptyPlan(input, "no-space", "선택한 장소별 체류시간을 빈 구간에 안전하게 배치하지 못했어요.");
  const provisionalRhythm = resolved.provisionalTimeWindowUsed
    ? spreadProvisionalPlacementSlack(
      candidates,
      packedSelection.placements,
      placementGaps,
      transitionBuffer.minutes,
    )
    : undefined;
  const finalPlacements = provisionalRhythm?.placements ?? packedSelection.placements;
  const placementByCandidateIndex = new Map(finalPlacements.map((placement) => [placement.candidateIndex, placement] as const));
  const selected = searched.best.indexes.map((candidateIndex) => ({
    candidateIndex,
    candidate: candidates[candidateIndex],
    placement: placementByCandidateIndex.get(candidateIndex) as PackedCandidatePlacement,
  })).sort((left, right) => (
    compareText(left.placement.date, right.placement.date)
    || left.placement.startMinute - right.placement.startMinute
    || compareText(left.candidate.place.id, right.candidate.place.id)
  ));
  const usedIds = new Set(input.itinerary.map((item) => item.id));
  const assignments = selected.map(({ candidate, placement }): PreferenceAutoFillAssignment => {
      const startTime = minutesToTimeString(placement.startMinute);
      return {
        itemId: makeItemId(input, candidate.place.id, placement.date, startTime, usedIds),
        placeId: candidate.place.id,
        placeName: candidate.place.name,
        date: placement.date,
        startTime,
        durationMinutes: candidate.durationEvidence.durationMinutes,
        durationEvidence: { ...candidate.durationEvidence, supportingItemIds: [...candidate.durationEvidence.supportingItemIds] },
        preferredByUserIds: [...new Set([
          ...candidate.candidate.addedByUserIds,
          ...candidate.evidence.flatMap((entry) => (
            entry.sharedCandidateSignal?.mustVisit === true
              || (entry.sharedCandidateSignal?.preferenceStrength !== undefined && entry.sharedCandidateSignal.preferenceStrength !== null)
              ? [entry.memberId]
              : []
          )),
        ])].sort(compareText),
        preferenceEvidence: candidate.evidence.map((entry) => ({
          ...entry,
          matchedTags: [...entry.matchedTags],
          matchedActivitySignals: entry.matchedActivitySignals.map((signal) => ({ ...signal })),
          ...(entry.sharedCandidateSignal ? { sharedCandidateSignal: { ...entry.sharedCandidateSignal } } : {}),
        })),
      };
    });
  const transientDiscoveryPlaceIds = new Set(request.transientDiscoveryPlaceIds ?? []);
  const discoveryCandidatePlaceIds = selected
    .filter(({ candidate }) => transientDiscoveryPlaceIds.has(candidate.place.id))
    .map(({ candidate }) => candidate.place.id)
    .sort(compareText);
  // 사용자에게 노출하는 퍼센트는 동일한 Hard Constraint에서 가능한 모든
  // 묶음의 개인별 min/max를 확인한 경우에만 만든다. 큰 휴리스틱 문제의
  // relaxed bound는 탐색 순서에만 쓰고 실제 만족도처럼 표시하지 않는다.
  const normalizedSatisfactionByMember = fairnessNormalizationBasis === "feasible-schedule-exact"
    ? Object.fromEntries(modeledEvidence.map((member, index) => [
      member.memberId,
      Number(searched.best?.fractions[index].numerator ?? 0n) / Number(searched.best?.fractions[index].denominator ?? 1n),
    ]))
    : {};
  const normalizedSatisfactionValues = Object.values(normalizedSatisfactionByMember);
  const normalizedRegrets = normalizedSatisfactionValues.map((score) => 1 - score);
  const fairness = normalizedSatisfactionValues.length ? {
    minimumNormalizedSatisfaction: Math.min(...normalizedSatisfactionValues),
    nashWelfare: normalizedSatisfactionValues.some((score) => score <= 0)
      ? 0
      : Math.exp(normalizedSatisfactionValues.reduce((sum, score) => sum + Math.log(score), 0) / normalizedSatisfactionValues.length),
    maximumRegret: Math.max(...normalizedRegrets),
    meanRegret: normalizedRegrets.reduce((sum, regret) => sum + regret, 0) / normalizedRegrets.length,
    paretoEfficientWithinEvaluatedBundles: exact,
    utilityModel: "ordinal-candidate-rank" as const,
  } : undefined;
  const missingPreferenceMemberIds = preference.memberIds.filter((memberId) => !preference.evidence.some((entry) => entry.memberId === memberId));
  const snapshotEvidenceMemberIds = preference.evidence.filter((entry) => entry.source === "travel-type-snapshot").map((entry) => entry.memberId);
  const candidateSelectionOnlyMemberIds = preference.evidence.filter((entry) => entry.source === "candidate-selection").map((entry) => entry.memberId);
  const sharedEvidenceMemberIds = preference.evidence.filter((entry) => entry.source === "shared-room-evidence").map((entry) => entry.memberId);
  const fixedUnlinkedCandidatePlaceIds = [...new Set(constraints.flatMap((constraint) => (
    constraint.placeId && !constraint.itineraryItemId && input.candidates.some((candidate) => candidate.placeId === constraint.placeId)
      ? [constraint.placeId]
      : []
  )))];
  const unresolvedTimeSensitiveDocuments = (input.documentReferences ?? []).filter((reference) => (
    reference.kind !== "other"
    && reference.itineraryItemIds.length === 0
  ));
  const selectedOperatingAvailability = selected.map(({ candidate, placement }) => (
    candidate.operatingAvailabilityByDate[placement.date] ?? { status: "unknown" as const }
  ));
  const operatingFacts: PreferenceAutoFillCertificate["operatingFacts"] = {
    checkedAssignmentCount: selectedOperatingAvailability.filter((availability) => availability.status !== "unknown").length,
    windowRestrictedAssignmentCount: selectedOperatingAvailability.filter((availability) => availability.status === "windowed").length,
    unknownAssignmentCount: selectedOperatingAvailability.filter((availability) => availability.status === "unknown").length,
    excludedClosedPlaceDateCount: candidates.reduce((sum, candidate) => sum + Object.values(candidate.operatingAvailabilityByDate)
      .filter((availability) => availability.status === "closed").length, 0),
  };
  const localApplyBlockReasons = [
    ...(discoveryCandidatePlaceIds.length ? ["일부 장소는 아직 여행방 후보로 확정되지 않은 지역 발견 후보입니다."] : []),
    ...(input.trip.status === "completed" ? ["완료된 여행방입니다."] : []),
  ];
  const localApplyReviewWarnings = [
    ...(mobilityRequirementMembers.length
      ? ["동행자 " + mobilityRequirementMembers.length + "명의 계단·경사·장거리 도보 접근 조건은 장소별 경로 정보가 없어 자동 확인하지 못했어요. 적용 전에 방문지 접근 방법을 확인해 주세요."]
      : []),
    transitionBuffer.basis === "observed-route-duration"
      ? "새 장소와 앞뒤 일정 사이의 실제 경로는 아직 확인되지 않았어요. 이번 여행에서 확인된 이동시간을 여유 기준으로 사용했으니 적용 후 길찾기를 확인해 주세요."
      : "새 장소와 앞뒤 일정 사이의 실제 이동시간은 아직 확인되지 않았어요. 일정 사이에 기본 편집 여유만 두었으니 적용 후 길찾기를 확인해 주세요.",
    ...(operatingFacts.unknownAssignmentCount
      ? [`${operatingFacts.unknownAssignmentCount}개 장소는 방문일의 운영시간과 휴무일을 확인하지 못했어요. 적용하기 전에 각 장소의 최신 안내를 확인해 주세요.`]
      : []),
    ...(degradedEvidence.includes("documents")
      ? ["첨부 문서 목록을 최신 상태로 확인하지 못했어요. 적용 시 서버가 일정에 연결된 예약·티켓 보호 조건을 다시 확인하지만, 연결하지 않은 문서가 있다면 직접 확인해 주세요."]
      : []),
    ...(degradedEvidence.includes("planning")
      ? ["여행방의 이동수단·복귀 정보를 최신 상태로 확인하지 못했어요. 적용 전에 여행 설정을 확인해 주세요."]
      : []),
    ...(degradedEvidence.includes("shared-preferences")
      ? ["공유 성향과 필수·제외 의견을 최신 상태로 확인하지 못해 해당 신호는 이번 선정에서 제외했어요."]
      : []),
    ...(input.scheduleOverlayStatus === "unavailable"
      ? ["이 기기에 저장된 사용자 잠금 표시를 확인하지 못했어요. 기존 일정은 움직이지 않으며, 적용 시 서버 잠금과 예약을 다시 확인해요."]
      : []),
    ...(hasIncompleteConstraint
      ? ["종료 시각이 없는 확정 예약이 있어 연결 장소와 확인된 시작 시각 이후를 피해서 배치했어요. 예약의 전체 시간은 직접 확인해 주세요."]
      : []),
    ...(unresolvedTimeSensitiveDocuments.length
      ? [`일정에 연결되지 않은 예약·티켓 문서 ${unresolvedTimeSensitiveDocuments.length}개는 시간 충돌 여부를 계산하지 못했어요. 적용 전에 문서 시간을 확인해 주세요.`]
      : []),
  ];
  const selectedCountByDate = assignments.reduce<Record<string, number>>((counts, assignment) => ({
    ...counts,
    [assignment.date]: (counts[assignment.date] ?? 0) + 1,
  }), {});
  const selectedMinutesByDate = assignments.reduce<Record<string, number>>((minutes, assignment) => ({
    ...minutes,
    [assignment.date]: (minutes[assignment.date] ?? 0) + assignment.durationMinutes,
  }), {});
  const dayAllocations = dayPools.map((pool) => ({
    date: pool.date,
    existingMinutes: pool.existingMinutes,
    addedCount: selectedCountByDate[pool.date] ?? 0,
    slotCapacity: slotCapacityByDate[pool.date] ?? 0,
    ...(pool.preferredDailyScheduledMinutes === undefined ? {} : {
      preferredDailyScheduledMinutes: pool.preferredDailyScheduledMinutes,
    }),
  }));
  const dailyPreferenceExceededDates = dayAllocations.filter((allocation) => (
    allocation.preferredDailyScheduledMinutes !== undefined
    && allocation.existingMinutes + (selectedMinutesByDate[allocation.date] ?? 0) > allocation.preferredDailyScheduledMinutes
  )).map((allocation) => allocation.date);
  const officialDurationAssignmentCount = assignments.filter((assignment) => assignment.durationEvidence.officialMinimumMinutes !== undefined).length;
  const officialOnlyDurationAssignmentCount = assignments.filter((assignment) => assignment.durationEvidence.lowerBoundOnly).length;
  const neutralSelection = candidateModelResult.selectionBasis === "neutral-structural";
  const selectedMstDistanceMeters = resolvedMstDistanceMeters(searched.best);
  const geographicPlacement = packedSelection.comparableInsertionCount > 0 ? {
    method: "haversine-gap-path" as const,
    comparableAssignmentCount: packedSelection.comparableInsertionCount,
    totalInsertionDistanceMeters: packedSelection.totalInsertionDistanceMeters,
    totalPathDistanceMeters: packedSelection.totalPathDistanceMeters,
    optimizedGapCount: packedSelection.optimizedGapCount,
    exactSequence: packedSelection.sequenceOptimizationExact,
  } : undefined;
  const limitations = [
    ...(operatingFacts.checkedAssignmentCount
      ? [`제안 ${operatingFacts.checkedAssignmentCount}곳은 한국관광공사에서 확인한 운영시간·휴무·행사기간을 배치 가능한 시간에 반영했습니다.${operatingFacts.unknownAssignmentCount ? ` 나머지 ${operatingFacts.unknownAssignmentCount}곳은 운영 정보를 확인하지 못했습니다.` : ""}`]
      : ["후보 장소의 구조화된 운영시간·휴무일을 확인하지 못해 모든 운영 조건 충족으로 단정하지 않습니다."]),
    `${transitionBuffer.minutes}분 전환 여유를 장소 사이에 확보했습니다. ${transitionBuffer.basis === "observed-route-duration" ? "같은 여행에서 조회된 실제 경로시간 중앙값을 15분 단위로 올려 사용했습니다." : "실제 이동시간 관측이 없어 15분 편집 격자 한 칸을 기본 여유로 사용했으며 실제 이동시간을 뜻하지 않습니다."}`,
    geographicPlacement
      ? `좌표가 연결된 같은 빈 시간의 방문 순서는 직선거리상 덜 돌아가도록 다시 정렬했습니다.${geographicPlacement.exactSequence ? " 이 구간에서 가능한 순서를 모두 비교했습니다." : " 장소가 많은 구간은 가까운 위치부터 넣고 한 번 더 순서를 바꾸어 보았으므로, 가능한 모든 순서 중 가장 짧다고 단정할 수는 없습니다."} 실제 도로·대중교통 이동시간은 아닙니다.`
      : "새 후보와 앞뒤 일정 사이의 좌표·실제 이동시간 근거가 없어 배치 순서와 도착 가능성을 최적화하지 않았습니다.",
    ...(officialDurationAssignmentCount
      ? [`${officialDurationAssignmentCount}개 장소는 한국관광공사가 안내한 최소 소요시간보다 짧아지지 않게 배치했습니다.${officialOnlyDurationAssignmentCount ? ` 이 중 ${officialOnlyDurationAssignmentCount}개는 최대 소요시간을 알 수 없어 범위로 표시하지 않았습니다.` : ""}`]
      : ["초안 체류시간은 같은 여행의 장소 분류 표본, 동행자 활동시간 합의, 사용자 예비 입력에서 추정했으며 공식 안내시간이 없는 장소에 임의의 업종별 고정값을 넣지 않았습니다."]),
    ...(hasIncompleteConstraint ? ["시각 구간이 완전하지 않은 확정 사실은 연결 장소를 자동 후보에서 제외했습니다. 시작 시각만 확인된 경우에는 그 시각 이후 배치도 제외했습니다."] : []),
    ...(input.localPlanningFactsStatus === "missing" ? ["여행 기본 정보가 아직 없어 입력되지 않은 복귀 조건을 임의로 만들지 않았습니다."] : []),
    ...(snapshotEvidenceMemberIds.length ? ["여행방에 저장된 여행 유형은 상세 설문보다 참고 비중을 낮추고, 장소 관심사와 정확히 맞을 때만 반영했습니다."] : []),
    ...(candidateSelectionOnlyMemberIds.length ? ["성향 설문이 없는 참여자는 본인이 직접 담은 후보만 장소 선택 근거로 반영했습니다."] : []),
    ...(sharedEvidenceMemberIds.length ? ["여행방 성향 정보에서 응답하지 않은 값을 0점으로 채우지 않았고, 장소와 의미가 직접 연결되는 대표 명소·현지 분위기 선호만 반영했습니다."] : []),
    ...(candidateModelResult.excludedAvoidPlaceIds.length ? [`명시적으로 제외한 후보 ${candidateModelResult.excludedAvoidPlaceIds.length}곳은 자동 초안 후보군에서 제거했습니다.`] : []),
    ...(sharedSignalConflicts.length ? [`반드시 방문과 제외 의견이 충돌한 후보 ${sharedSignalConflicts.length}곳만 보류하고, 충돌 없는 후보로 초안을 계속 만들었습니다.`] : []),
    ...(candidateModelResult.missingDurationPlaceIds.length ? [`체류시간 근거가 전혀 없는 후보 ${candidateModelResult.missingDurationPlaceIds.length}곳은 임의 상수로 채우지 않고 제외했습니다.`] : []),
    ...(resolved.provisionalTimeWindowUsed || resolved.provisionalDurationUsed ? [
      `관측 자료가 없는 ${[
        ...(resolved.provisionalTimeWindowUsed ? ["활동 시간창(10:00~20:00)"] : []),
        ...(resolved.provisionalDurationUsed ? ["체류 블록(90분)"] : []),
      ].join("·")}은 편집 가능한 낮은 신뢰도 템플릿으로 채웠습니다. 사용자가 제한을 입력하면 즉시 대체됩니다.`,
    ] : []),
    ...(provisionalRhythm?.adjustedGapCount ? [`기본 활동 시간창의 남는 시간은 ${provisionalRhythm.adjustedGapCount}개 빈 구간 안에서 고르게 나눠 장소를 시작 시각부터 빽빽하게 붙이지 않았습니다. 운영시간·잠금·예약·복귀 조건은 그대로 유지했습니다.`] : []),
    ...(prefiltered.omittedCount ? [`기기 탐색을 멈추지 않도록 ${prefiltered.originalEligibleCount}개 후보에서 필수 후보를 모두 보존하고 장소 분류별 순환 선택으로 ${MAX_AUTO_FILL_CANDIDATES}개를 비교했습니다. ${prefiltered.omittedCount}개는 이번 초안 비교에서 제외했습니다.`] : []),
    ...(discoveryCandidatePlaceIds.length ? [`기존 여행방 후보만으로 초안을 만들 수 없어 지역 장소 목록에서 ${discoveryCandidatePlaceIds.length}곳을 발견 후보로 골랐습니다. 후보 보드나 일정에는 자동 저장하지 않았으며 사용자가 확인해야 합니다.`] : []),
    ...(mobilityRequirementMembers.length ? [`동행자 ${mobilityRequirementMembers.length}명의 이동 접근 조건은 보존했지만, 장소·경로별 계단·경사 정보와 개인별 최대 도보 허용치가 없어 후보 점수나 자동 제외에 사용하지 않았습니다.`] : []),
    ...(degradedEvidence.includes("documents") ? ["첨부 문서 목록을 읽지 못해 일정에 연결되지 않은 예약·티켓은 이번 배치에 반영하지 못했습니다."] : []),
    ...(degradedEvidence.includes("planning") ? ["여행 기본 정보를 읽지 못해 확인되지 않은 복귀 조건·이동수단은 이번 배치에 반영하지 못했습니다."] : []),
    ...(degradedEvidence.includes("shared-preferences") ? ["여행방 성향 정보가 없거나 오래되어 해당 내용은 장소 점수와 필수·제외 판단에서 빼고 초안을 만들었습니다."] : []),
    ...(fixedUnlinkedCandidatePlaceIds.length ? [`확정 사실에 일정 ID 없이 연결된 후보 ${fixedUnlinkedCandidatePlaceIds.length}개는 임의 시간에 배치하지 않고 제외했습니다.`] : []),
    ...(dailyPreferenceExceededDates.length ? [`사용자가 요청한 추가 개수를 우선해 ${dailyPreferenceExceededDates.join(", ")}은 설문에서 원하는 하루 일정량보다 많습니다.`] : []),
    ...(neutralSelection ? ["후보와 연결되는 직접 선호 근거가 없어 개인 만족도를 계산하지 않았습니다. 장소 분류 중복과 좌표가 완전한 경우의 직선거리 분산만 보조 기준으로 사용했습니다."] : []),
    ...(feasibleCountRange ? [`하루 일정량 관측이 없어 운영시간·체류시간·전환 여유와 실제 빈 구간을 통과하는 가장 큰 묶음 ${feasibleCountRange.selected}곳을 구성했습니다.${feasibleCountRange.maximumCertified ? " 현재 비교 후보와 빈 시간 안에서 더 많은 장소를 넣을 수 없음을 확인했습니다." : " 기기 탐색 한도 때문에 추가 후보가 더 들어갈 가능성은 남아 있습니다."}`] : []),
    "공식 관광 유형이나 장소 분류·관심사와 명확히 연결되지 않는 세부 선호 점수는 추정하지 않았습니다.",
    "장소별 운영시간·체류시간·이동 여유를 함께 맞춘 뒤, 운영시간을 지킬 수 있을 때만 같은 구간의 좌표를 이용해 방문 순서를 정리했습니다. 날짜별 일정량 균형을 장소 사이 거리보다 먼저 비교합니다.",
    ...(!exactSearch ? [`완전 탐색 한도(조합 ${EXACT_BUNDLE_EVALUATION_LIMIT.toString()}개·효용 누적 ${EXACT_BUNDLE_UTILITY_WORK_LIMIT.toString()}회)를 넘어 adaptive beam ${searched.beamWidth}개와 bounded 1-swap을 사용했습니다. ${searched.localSearchConverged ? "검사한 1-swap 이웃에서는 개선안이 없습니다." : `${LOCAL_SEARCH_ROUND_LIMIT}회 한도에서 끝나 local optimum도 보장하지 않습니다.`} 전역 최적 보장은 없습니다.`] : []),
    ...(exactSearch && !exact ? [`체류시간 bin-packing이 ${EXACT_DURATION_PACKING_STATE_LIMIT.toLocaleString()}개 상태 한도에 닿아 일부 후보 묶음의 배치 가능성을 증명하지 못했습니다. 반환한 배치는 실제로 겹치지 않지만 전체 최적 선택 보장은 없습니다.`] : []),
    ...(fairnessNormalizationBasis === "relaxed-candidate-bound" && modeledEvidence.length ? ["참여자 조율 순서는 후보별 순위의 느슨한 상·하한으로 비교했지만, 실제 배치 가능한 개인별 최선·최악을 모두 증명하지 못해 만족도 퍼센트는 표시하지 않았습니다."] : []),
  ];
  return {
    status: "preview-only",
    mode,
    message: `${assignments.length}개 장소를 기존 일정·잠금·확정 예약을 움직이지 않고 DAY별 빈 시간에 배치한 여행 일정 초안이에요.${neutralSelection ? " 직접 선호 근거가 없어 장소 종류의 중복을 줄이는 중립 초안으로 구성했어요." : ""} 실제 이동·운영시간은 아직 모두 확인되지 않았으므로 적용 전에 미리보기를 확인해 주세요.`,
    assignments,
    certificate: {
      selectionBasis: candidateModelResult.selectionBasis,
      countBasis: resolved.countBasis,
      selectionExact: exact,
      exactScope: exact ? "candidate-bundle-and-duration-packing" : "none",
      searchMethod: exactSearch ? "exhaustive" : "bounded-beam-and-one-swap",
      ...(!exactSearch ? {
        heuristicBeamWidth: searched.beamWidth,
        localSearchConverged: searched.localSearchConverged,
      } : {}),
      evaluatedBundleCount: searched.evaluated,
      candidateCount: candidates.length,
      selectedCount,
      slotCapacity: slots.length,
      preferenceEvidenceMemberIds: preference.evidence.map((entry) => entry.memberId),
      modeledMemberIds: modeledEvidence.map((entry) => entry.memberId),
      unrepresentedPreferenceMemberIds,
      missingPreferenceMemberIds,
      snapshotEvidenceMemberIds,
      candidateSelectionOnlyMemberIds,
      sharedEvidenceMemberIds,
      mandatorySharedPlaceIds: mandatoryCandidates.map((candidate) => candidate.place.id).sort(compareText),
      excludedAvoidPlaceIds: [...candidateModelResult.excludedAvoidPlaceIds].sort(compareText),
      discoveryCandidatePlaceIds,
      // 기존 일정의 Hard Constraint 위반은 이 지점 전에 생성 자체를 중단한다.
      // 여기서는 미저장 발견 후보·완료 상태만 막고, 외부 정보의 부재는 확인 경고로 분리한다.
      // 최신 버전과 잠금·예약 보호는 실제 적용 직전에 다시 원자적으로 검증한다.
      localApplyEligible: localApplyBlockReasons.length === 0,
      localApplyBlockReasons,
      localApplyReviewWarnings,
      dayAllocations,
      minimumNormalizedSatisfaction: fairnessNormalizationBasis === "feasible-schedule-exact" && searched.best.sortedFractions.length
        ? Number(searched.best.sortedFractions[0].numerator) / Number(searched.best.sortedFractions[0].denominator)
        : undefined,
      normalizedSatisfactionByMember,
      fairnessNormalizationBasis,
      ...(fairness ? { fairness } : {}),
      durationEstimates: assignments.map((assignment) => ({
        ...assignment.durationEvidence,
        supportingItemIds: [...assignment.durationEvidence.supportingItemIds],
      })),
      durationPackingExact: packedSelection.exact && searched.feasibilityExact,
      durationPackingExpandedStates,
      ...(feasibleCountRange ? { feasibleCountRange } : {}),
      transitionBuffer,
      operatingFacts,
      ...(provisionalRhythm?.adjustedGapCount ? { provisionalRhythm: {
        method: "even-slack-within-gap" as const,
        adjustedGapCount: provisionalRhythm.adjustedGapCount,
      } } : {}),
      ...(prefiltered.omittedCount ? { candidatePrefilter: {
        originalEligibleCount: prefiltered.originalEligibleCount,
        consideredCount: candidates.length,
        omittedCount: prefiltered.omittedCount,
        method: "mandatory-then-category-round-robin" as const,
      } } : {}),
      degradedEvidence,
      structuralSelection: {
        recognizedCategoryCount: searched.best.recognizedCategoryCount,
        categoryConcentrationPairs: searched.best.categoryConcentrationPairs,
        comparableCoordinateCoverage: candidateModelResult.comparableCoordinateCoverage,
        ...(selectedMstDistanceMeters === undefined ? {} : { mstDistanceMeters: selectedMstDistanceMeters }),
      },
      ...(geographicPlacement ? { geographicPlacement } : {}),
      assumptions: [
        ...(modeledEvidence.length ? [
          "응답자 동일 가중치",
          "mustVisit은 필수 포함, avoid는 후보 제외, 후보 preferenceStrength → 여행방 후보 직접 담기 → exact 선호 태그 → 명시 category ordinal → 수치 응답 평균 순으로 사전식 우선",
          "명시 category는 like=+1, neutral=0, dislike=-1의 ordinal 개수이며, 배치·발견 0~100 수치는 후보·멤버별 가용 신호의 동일 가중 산술평균",
          "서로 단위가 다른 근거를 임의 가중합하지 않고 참여자별 사전식 후보 순위를 Borda형 정수 효용으로 변환",
          ...(fairnessNormalizationBasis === "feasible-schedule-exact"
            ? ["같은 Hard Constraint와 고정 k에서 실제 배치 가능한 모든 묶음의 개인별 최저~최고 순위효용으로 정규화한 뒤 최저 만족도 → Nash 후생 → leximin 순으로 비교"]
            : ["큰 탐색에서는 고정 k개 후보의 bottom-k~top-k 완화 범위를 탐색 순서에만 사용하고, 실제 배치 가능한 개인 최선이 인증되지 않은 만족도 수치는 노출하지 않음"]),
          "공정성 목적값이 같은 안은 명시 불호 총량이 적은 안을 먼저 선택",
        ] : [
          "후보와 연결되는 선호 근거가 없으므로 가상의 중립 점수나 만족도를 만들지 않음",
          "같은 개수의 중립 후보 묶음은 확인 가능한 장소 분류 수 최대화 → 같은 분류 중복 쌍 최소화 → 모든 후보 좌표가 있을 때 MST 직선거리 최소화 순으로 비교",
        ]),
        ...(feasibleCountRange ? ["원하는 장소 수 관측이 없으면 mustVisit을 포함하고 Hard blocker·후보별 체류시간·실제 빈 구간을 만족하는 최대 크기 묶음을 먼저 선택"] : []),
        "미응답자와 후보 근거가 없는 응답자는 0점으로 넣지 않고 목적함수에서 제외",
        "scheduleDensity·challenging 파생 축은 장소별 의미 연결 데이터가 없어 후보 점수로 변환하지 않음",
        "체류시간은 lcls3 → lcls2 → contentType → 활동 taxonomy → 정확 category → 동일 여행 전체 방문의 겹치지 않는 cohort와 설문 interval을 표본수·MAD·평균절대편차·측정폭 기반 precision으로 계층 수축",
        "TourAPI가 해석 가능한 안내 소요시간을 제공하면 15분 단위로 올림한 하한을 위 추정값의 floor로 적용하며, 하한만 있는 경우 상한이나 통계 신뢰범위를 만들지 않음",
        ...(geographicPlacement ? ["실제 경로 API가 없는 초안은 같은 빈 구간의 양 끝 기존 장소를 고정한 Haversine 열린 경로를 최소화하며, 11곳 이하는 Held-Karp 동적 계획법으로 정확 계산하고 그보다 큰 구간은 cheapest insertion과 bounded 2-opt 사용"] : []),
      ],
    },
    limitations,
  };
}

export function buildPreferenceAutoFillSuggestionEnvelope(
  session: DuriAnalysisSession,
  plan: PreferenceAutoFillPlan,
  createdAt: string,
): DuriSuggestionEnvelope | undefined {
  if (plan.status !== "preview-only" || !plan.assignments.length) return undefined;
  const changes = plan.assignments.map((assignment) => ({
    itemId: assignment.itemId,
    placeId: assignment.placeId,
    action: "add" as const,
    after: {
      date: assignment.date,
      startTime: assignment.startTime,
      durationMinutes: assignment.durationMinutes,
      placeId: assignment.placeId,
      itemType: "place" as const,
      preferredByUserIds: [...assignment.preferredByUserIds],
    },
  }));
  const itineraryFingerprint = buildItineraryFingerprint(session.snapshot.itinerary);
  const responseCoverage = `${plan.certificate.preferenceEvidenceMemberIds.length}/${session.snapshot.trip.members.length}명`;
  const exactText = plan.certificate.selectionExact
    ? `가능한 후보 조합 ${plan.certificate.evaluatedBundleCount}개와 체류시간 배치를 빠짐없이 비교했어요(실제 도로 이동시간은 별도 확인 필요)`
    : `후보 조합 ${plan.certificate.evaluatedBundleCount}개를 비교하고 ${plan.certificate.localSearchConverged ? "주변의 다른 선택보다 나은지 다시 확인했어요" : "정해진 계산 범위 안에서 가장 나은 안을 골랐어요"}`;
  const canApply = plan.certificate.localApplyEligible;
  const neutralSelection = plan.certificate.selectionBasis === "neutral-structural";
  const base = {
    tripId: session.tripId,
    sourceIssueIds: [],
    type: "add-preference-place" as const,
    priority: "medium" as const,
    title: `${neutralSelection ? "중립 후보" : "성향 기반"} 일정 초안 ${plan.assignments.length}개`,
    summary: plan.message,
    reason: neutralSelection
      ? `직접 확인된 선호가 부족해 장소 종류가 겹치지 않도록 하고, 실제 빈 시간과 체류시간 근거를 맞춰 구성했어요. ${exactText}. 기존 일정과 보호 항목은 변경하지 않았어요.`
      : `확인 가능한 일행 성향 ${responseCoverage}을 반영했어요. ${exactText}. 기존 일정과 보호 항목은 변경하지 않았어요.`,
    affectedItemIds: plan.assignments.map((assignment) => assignment.itemId),
    affectedPlaceIds: plan.assignments.map((assignment) => assignment.placeId),
    changes,
    canApply,
    ...(canApply && plan.certificate.localApplyReviewWarnings.length
      ? { reviewWarnings: [...plan.certificate.localApplyReviewWarnings] }
      : {}),
    ...(!canApply ? {
      unavailableReason: plan.certificate.localApplyBlockReasons[0]
        ?? "현재 여행방의 보호 조건 때문에 이 초안을 적용할 수 없습니다.",
    } : {}),
    itineraryFingerprint,
  };
  return {
    suggestion: { ...base, id: generateSuggestionId(base) },
    baseFingerprint: session.inputFingerprint,
    algorithmVersion: DURI_SUGGESTION_VERSION,
    createdAt,
    beforeItinerary: session.snapshot.itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] })),
  };
}
