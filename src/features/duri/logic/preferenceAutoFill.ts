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
import { parseRecommendedDurationMinutes } from "./placeConstraintAnalysis";
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
};

export type PreferenceAutoFillDefaults = {
  dailyStartTime?: string;
  dailyEndTime?: string;
  proposedVisitDurationMinutes?: number;
  maxNewItems?: number;
  preferredDailyScheduledMinutes?: number;
  /** 0도 관측된 하루 일정량에서 계산된 유효 결과다. undefined와 구분한다. */
  derivedMaxNewItems?: number;
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
    | "group-schedule-consensus"
    | "tour-recommended-minimum"
    | "user-fallback";
  durationMinutes: number;
  lowerMinutes: number;
  /** 공식 하한만 있는 경우 상한을 꾸며내지 않으므로 undefined다. */
  upperMinutes?: number;
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
  localApplyEligible: boolean;
  localApplyBlockReasons: string[];
  dayAllocations: {
    date: string;
    existingMinutes: number;
    addedCount: number;
    slotCapacity: number;
    preferredDailyScheduledMinutes?: number;
  }[];
  minimumNormalizedSatisfaction?: number;
  normalizedSatisfactionByMember: Record<EntityId, number>;
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
  durationEvidence: PreferenceAutoFillDurationEvidence;
};

type PlacementSlot = { date: string; startMinute: number };
type PlacementGap = { date: string; startMinute: number; endMinute: number };
type PackedCandidatePlacement = { candidateIndex: number; date: string; startMinute: number };
type Fraction = { numerator: bigint; denominator: bigint };
type UtilityRange = { minimum: number; maximum: number };

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
  stableKey: string;
};

function emptyCertificate(): PreferenceAutoFillCertificate {
  return {
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
    localApplyEligible: false,
    localApplyBlockReasons: [],
    dayAllocations: [],
    normalizedSatisfactionByMember: {},
    durationEstimates: [],
    durationPackingExact: false,
    durationPackingExpandedStates: 0,
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
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    if (result.length >= MAX_PREFERENCE_TAGS_PER_MEMBER) break;
    const trimmed = tag.trim();
    if (trimmed.length > MAX_PREFERENCE_TAG_LENGTH) continue;
    const normalized = normalizeTrait(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
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

/**
 * 자동 기본값은 새 설문에서 사용자가 직접 그린 시간표의 관측값만 사용한다.
 * 기존 일정, 앱 상수, 미응답자의 중립값을 대체 근거로 쓰지 않는다.
 */
export function derivePreferenceAutoFillDefaults(input: DuriAnalysisInput): PreferenceAutoFillDefaults {
  const observations = detailedWindowObservations(input);
  const start = intervalConsensusValue(observations.flatMap((entry) => entry.start ? [{ userId: entry.userId, ...entry.start }] : []), 0, 24 * 60 - 1);
  const end = intervalConsensusValue(observations.flatMap((entry) => entry.end ? [{ userId: entry.userId, ...entry.end }] : []), 1, 24 * 60);
  const duration = intervalConsensusValue(observations.flatMap((entry) => entry.duration ? [{ userId: entry.userId, ...entry.duration }] : []), SLOT_MINUTES, 24 * 60);
  const daily = intervalConsensusValue(observations.flatMap((entry) => entry.daily ? [{ userId: entry.userId, ...entry.daily }] : []), 0, 24 * 60);
  const snappedDuration = duration === undefined ? undefined : snapNearest(duration);
  const tripDates = getTripDates(input.trip.startDate, input.trip.endDate);
  const unscheduledCandidateCount = input.candidates.filter((candidate) => !input.itinerary.some((item) => item.placeId === candidate.placeId)).length;
  const derivedMax = daily !== undefined && snappedDuration
    ? Math.min(
      unscheduledCandidateCount,
      tripDates.reduce((total, date) => total + Math.max(0, Math.floor((daily - occupiedMinutesOnDate(input.itinerary, date)) / snappedDuration)), 0),
    )
    : undefined;
  const sources: string[] = [];
  if (start !== undefined && end !== undefined) sources.push(`설문 시간표 첫·마지막 활동 ${observations.filter((entry) => entry.start && entry.end).length}명 구간 minimax`);
  if (duration !== undefined) sources.push(`설문 비휴식 활동 블록 ${observations.filter((entry) => entry.duration).length}명 구간 minimax`);
  if (daily !== undefined) sources.push(`설문 하루 일정량 ${observations.filter((entry) => entry.daily).length}명 구간 minimax`);
  return {
    ...(start === undefined ? {} : { dailyStartTime: minutesToTimeString(Math.max(0, Math.round(start / SLOT_MINUTES) * SLOT_MINUTES)) }),
    ...(end === undefined ? {} : { dailyEndTime: minutesToTimeString(Math.min(24 * 60, Math.round(end / SLOT_MINUTES) * SLOT_MINUTES)) }),
    ...(snappedDuration === undefined ? {} : { proposedVisitDurationMinutes: snappedDuration }),
    ...(derivedMax === undefined || derivedMax < 1 ? {} : { maxNewItems: Math.min(derivedMax, MAX_AUTO_FILL_ITEMS) }),
    ...(derivedMax === undefined ? {} : { derivedMaxNewItems: Math.min(derivedMax, MAX_AUTO_FILL_ITEMS) }),
    ...(daily === undefined ? {} : { preferredDailyScheduledMinutes: daily }),
    sources,
  };
}

function resolveRequest(input: DuriAnalysisInput, request: PreferenceAutoFillRequest) {
  const defaults = derivePreferenceAutoFillDefaults(input);
  const startTime = request.dailyStartTime?.trim() || defaults.dailyStartTime;
  const endTime = request.dailyEndTime?.trim() || defaults.dailyEndTime;
  const duration = request.proposedVisitDurationMinutes ?? defaults.proposedVisitDurationMinutes;
  const maxNewItems = request.maxNewItems ?? defaults.maxNewItems;
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
    return { valid: false as const, status: "invalid-request" as const, message: "하루 일정량 관측이 없어 장소 수를 자동으로 정할 수 없어요. 고급 설정에서 추가할 장소 수만 정해 주세요." };
  }
  if (!Number.isInteger(maxNewItems) || maxNewItems < 1 || maxNewItems > MAX_AUTO_FILL_ITEMS) {
    return { valid: false as const, message: `추가할 장소 수는 1~${MAX_AUTO_FILL_ITEMS}개 사이의 정수로 입력해 주세요.` };
  }
  return { valid: true as const, start, end, duration, maxNewItems, defaults };
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

function compareBundle(left: BundleEvaluation, right: BundleEvaluation) {
  const minimum = compareFraction(left.sortedFractions[0] ?? { numerator: 0n, denominator: 1n }, right.sortedFractions[0] ?? { numerator: 0n, denominator: 1n });
  if (minimum !== 0) return minimum;
  const nash = left.nashNumerator * right.nashDenominator - right.nashNumerator * left.nashDenominator;
  if (nash !== 0n) return nash < 0n ? -1 : 1;
  const leximin = compareFractionVectors(left.sortedFractions, right.sortedFractions);
  if (leximin !== 0) return leximin;
  if (left.sharedPreferenceStrengthScore !== right.sharedPreferenceStrengthScore) return left.sharedPreferenceStrengthScore - right.sharedPreferenceStrengthScore;
  if (left.directSupportCount !== right.directSupportCount) return left.directSupportCount - right.directSupportCount;
  if (left.matchedTagCount !== right.matchedTagCount) return left.matchedTagCount - right.matchedTagCount;
  if (left.explicitAversionCount !== right.explicitAversionCount) return right.explicitAversionCount - left.explicitAversionCount;
  if (left.explicitPreferenceCount !== right.explicitPreferenceCount) return left.explicitPreferenceCount - right.explicitPreferenceCount;
  if (left.numericPreferenceScore !== right.numericPreferenceScore) return left.numericPreferenceScore - right.numericPreferenceScore;
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
    stableKey: sortedIndexes.map((index) => candidates[index].place.id).join("\u0000"),
  };
}

function evaluateBundle(indexes: readonly number[], candidates: readonly CandidateModel[], utilityRanges: readonly UtilityRange[]): BundleEvaluation {
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
  let best: BundleEvaluation | undefined;
  const chosen: number[] = Array.from({ length: requiredIndexCount }, (_, index) => index);
  const visit = (nextIndex: number) => {
    if (chosen.length === selectedCount) {
      evaluated += 1;
      const checked = feasibility?.(chosen) ?? { feasible: true, exact: true };
      feasibilityExact &&= checked.exact;
      if (!checked.feasible) return;
      const evaluation = evaluateBundle(chosen, candidates, utilityRanges);
      if (!best || compareBundle(evaluation, best) > 0) best = evaluation;
      return;
    }
    const needed = selectedCount - chosen.length;
    for (let index = nextIndex; index <= candidates.length - needed; index += 1) {
      chosen.push(index);
      visit(index + 1);
      chosen.pop();
    }
  };
  visit(requiredIndexCount);
  return { best, evaluated, beamWidth: undefined, localSearchConverged: undefined, feasibilityExact };
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
  const adaptiveBeamWidth = Math.min(BEAM_WIDTH, Math.max(
    MIN_BEAM_WIDTH,
    Math.floor(HEURISTIC_EXPANSION_BUDGET / Math.max(1, candidates.length * selectedCount)),
  ));
  const requiredIndexes = Array.from({ length: requiredIndexCount }, (_, index) => index);
  let beam: BundleEvaluation[] = [evaluateBundle(requiredIndexes, candidates, utilityRanges)];
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
    beam = feasibleExpansions
      .sort((left, right) => -compareBundle(left, right))
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
  return {
    placeId,
    source: components[0].source,
    durationMinutes: snapNearest(rawDuration),
    lowerMinutes: snapDurationLower(Math.max(SLOT_MINUTES, rawDuration - combinedStandardError)),
    upperMinutes: snapDurationUpper(Math.min(24 * 60, rawDuration + combinedStandardError)),
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
    source: "user-fallback",
    durationMinutes: fallbackDurationMinutes,
    lowerMinutes: fallbackDurationMinutes,
    upperMinutes: fallbackDurationMinutes,
    lowerBoundOnly: false,
    sampleSize: 1,
    effectiveSampleSize: 1,
    supportingItemIds: [],
    maximumObservedDeviationMinutes: 0,
    shrinkageApplied: false,
    components: [{
      source: "user-fallback",
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
    const officialFloorExceededReferenceRange = baseEstimate.upperMinutes !== undefined
      && griddedOfficialMinimum > baseEstimate.upperMinutes;
    const durationMinutes = Math.max(baseEstimate.durationMinutes, griddedOfficialMinimum);
    return {
      ...baseEstimate,
      durationMinutes,
      lowerMinutes: Math.max(baseEstimate.lowerMinutes, griddedOfficialMinimum),
      upperMinutes: officialFloorExceededReferenceRange
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
  _maximumSelectedCount: number,
  fallbackDurationMinutes?: number,
) {
  const scheduledPlaceIds = new Set(input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const fixedUnlinkedPlaceIds = new Set((input.confirmedScheduleConstraints ?? []).flatMap((constraint) => (
    constraint.placeId && !constraint.itineraryItemId ? [constraint.placeId] : []
  )));
  const tripMemberIds = new Set(input.trip.members.map((member) => member.userId));
  // 손상된 persisted state나 중복 API 행이 같은 장소를 두 번 배치하지 않도록
  // placeId 단위로 합치되, 실제로 기록된 담기 사용자만 합집합으로 보존한다.
  const rawByPlaceId = new Map<EntityId, { candidate: TripCandidate; place: Place }>();
  input.candidates
    .filter((candidate) => candidate.tripId === input.trip.id
      && !scheduledPlaceIds.has(candidate.placeId)
      && !fixedUnlinkedPlaceIds.has(candidate.placeId))
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
  const preparedModelsWithOptionalDuration = eligibleRawModels.map((model) => ({
    ...model,
    durationEvidence: estimateCandidateDuration(input, model.place, fallbackDurationMinutes),
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
    return { models: [] as CandidateModel[], unsafeUtilityScale: true, excludedAvoidPlaceIds, missingDurationPlaceIds };
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
  const positiveModels = preparedModels.filter(({ memberEvidence, memberComponents }) => memberEvidence.some((entry, index) => (
      entry.explicitlyAdded
      || entry.sharedCandidateSignal?.mustVisit === true
      || memberComponents[index].sharedPreferenceStrengthScore > 0
      || entry.matchedTags.length > 0
      || memberComponents[index].explicitPreferenceCount > 0
      || memberComponents[index].numericPreferenceScore > 0
    )));
  // 서로 단위가 다른 ordinal·tag·시간배분 신호를 임의 가중합하지 않는다.
  // 멤버별 사전식 evidence 순위를 만들고, 자신보다 명확히 낮은 후보 수를
  // Borda형 정수 효용으로 사용한다. 후보 입력 순서와 점수 단위에 불변이다.
  const models = positiveModels.map(({ candidate, place, memberEvidence, memberComponents, durationEvidence }): CandidateModel => {
    const model = { candidate, place, memberEvidence, memberComponents, durationEvidence };
    const utilityByMember = memberEvidence.map((_, memberIndex) => positiveModels.reduce((count, other) => (
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
      durationEvidence,
    };
  }).map((candidate) => ({
    ...candidate,
    candidate: {
      ...candidate.candidate,
      addedByUserIds: [...new Set(candidate.candidate.addedByUserIds.filter((memberId) => tripMemberIds.has(memberId)))].sort(compareText),
    },
  }));
  return { models, unsafeUtilityScale: false, excludedAvoidPlaceIds, missingDurationPlaceIds };
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
      dayBlocked = true;
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

function buildPlacementSlots(
  input: DuriAnalysisInput,
  start: number,
  end: number,
  duration: number,
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
    const daySlots: PlacementSlot[] = [];
    gaps.forEach((gap) => {
      let slotStart = Math.ceil(gap.start / SLOT_MINUTES) * SLOT_MINUTES;
      while (slotStart + duration <= gap.end) {
        daySlots.push({ date, startMinute: slotStart });
        slotStart += duration;
      }
    });
    const existingMinutes = occupiedMinutesOnDate(input.itinerary, date);
    dayPools.push({
      date,
      existingMinutes,
      ...(preferredDailyScheduledMinutes === undefined ? {} : { preferredDailyScheduledMinutes }),
      gaps: gaps.map((gap) => ({
        date,
        startMinute: Math.ceil(gap.start / SLOT_MINUTES) * SLOT_MINUTES,
        endMinute: Math.floor(gap.end / SLOT_MINUTES) * SLOT_MINUTES,
      })).filter((gap) => gap.startMinute < gap.endMinute),
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

type DurationPackingResult = {
  feasible: boolean;
  exact: boolean;
  expandedStates: number;
  placements: PackedCandidatePlacement[];
};

type PlacementDayLoad = {
  existingMinutes: number;
  preferredDailyScheduledMinutes?: number;
};

/**
 * 서로 다른 체류시간을 빈 구간에 넣는 multiple-bin packing이다. 긴 장소부터
 * 배치하고 같은 잔여용량 상태는 memoize한다. 상태 한도 안에서 실패하면 정확한
 * infeasible 증명이고, 한도에 닿으면 false를 확정하지 않고 exact=false로 남긴다.
 */
function packCandidateDurations(
  candidates: readonly CandidateModel[],
  candidateIndexes: readonly number[],
  gaps: readonly PlacementGap[],
  dayLoadByDate: Readonly<Record<string, PlacementDayLoad>> = {},
): DurationPackingResult {
  const ordered = [...candidateIndexes].sort((left, right) => (
    candidates[right].durationEvidence.durationMinutes - candidates[left].durationEvidence.durationMinutes
    || compareText(candidates[left].place.id, candidates[right].place.id)
  ));
  const bins = gaps.map((gap) => ({
    ...gap,
    cursor: gap.startMinute,
    remaining: gap.endMinute - gap.startMinute,
  })).filter((gap) => gap.remaining > 0);
  const placements: PackedCandidatePlacement[] = [];
  const addedMinutesByDate: Record<string, number> = {};
  const failedStates = new Set<string>();
  let expandedStates = 0;
  let limitReached = false;
  const visit = (position: number): boolean => {
    if (position === ordered.length) return true;
    if (expandedStates >= EXACT_DURATION_PACKING_STATE_LIMIT) {
      limitReached = true;
      return false;
    }
    expandedStates += 1;
    const stateKey = `${position}|${bins.map((bin) => bin.remaining).sort((left, right) => right - left).join(",")}`;
    if (failedStates.has(stateKey)) return false;
    const candidateIndex = ordered[position];
    const duration = candidates[candidateIndex].durationEvidence.durationMinutes;
    const binIndexes = bins.map((_, index) => index)
      .filter((index) => bins[index].remaining >= duration)
      .sort((left, right) => {
        const loadScore = (binIndex: number) => {
          const bin = bins[binIndex];
          const day = dayLoadByDate[bin.date];
          const projected = (day?.existingMinutes ?? 0) + (addedMinutesByDate[bin.date] ?? 0) + duration;
          return day?.preferredDailyScheduledMinutes
            ? projected / day.preferredDailyScheduledMinutes
            : projected;
        };
        return loadScore(left) - loadScore(right)
        || (bins[left].remaining - duration) - (bins[right].remaining - duration)
        || compareText(bins[left].date, bins[right].date)
        || bins[left].cursor - bins[right].cursor;
      });
    const triedRemaining = new Set<number>();
    for (const binIndex of binIndexes) {
      const bin = bins[binIndex];
      if (triedRemaining.has(bin.remaining)) continue;
      triedRemaining.add(bin.remaining);
      const startMinute = bin.cursor;
      bin.cursor += duration;
      bin.remaining -= duration;
      addedMinutesByDate[bin.date] = (addedMinutesByDate[bin.date] ?? 0) + duration;
      placements.push({ candidateIndex, date: bin.date, startMinute });
      if (visit(position + 1)) return true;
      placements.pop();
      addedMinutesByDate[bin.date] -= duration;
      bin.cursor -= duration;
      bin.remaining += duration;
      if (limitReached) break;
    }
    if (!limitReached) failedStates.add(stateKey);
    return false;
  };
  const feasible = visit(0);
  return {
    feasible,
    exact: feasible || !limitReached,
    expandedStates,
    placements: feasible ? [...placements] : [],
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

export function planPreferenceAutoFill(input: DuriAnalysisInput, request: PreferenceAutoFillRequest = {}): PreferenceAutoFillPlan {
  const mode = input.itinerary.length ? "partial-itinerary" as const : "empty-itinerary" as const;
  const tripDates = getTripDates(input.trip.startDate, input.trip.endDate);
  if (!tripDates.length) return emptyPlan(input, "insufficient-data", "여행 날짜를 먼저 확정해 주세요.");
  if (input.documentCollectionStatus === "unavailable") {
    return emptyPlan(input, "insufficient-data", "문서·예약 잠금 상태를 확인하지 못해 자동 초안을 만들지 않았어요.", ["첨부 문서함을 다시 불러온 뒤 생성해야 합니다."]);
  }
  if (input.localPlanningFactsStatus === "unavailable") {
    return emptyPlan(input, "insufficient-data", "여행방 planning을 읽지 못해 숨은 복귀 조건이 없다고 단정할 수 없어요. 다시 불러온 뒤 생성해 주세요.");
  }
  if (input.sharedPreferenceEvidenceStatus && input.sharedPreferenceEvidenceStatus !== "loaded") {
    return emptyPlan(input, "insufficient-data", "공유 성향·후보 필수/제외 신호가 최신 상태인지 확인하지 못해 자동 초안을 만들지 않았어요.", ["여행방 성향 facts를 다시 불러온 뒤 생성해야 합니다."]);
  }
  if (input.sharedPreferenceEvidenceStatus === "loaded" && !getUsableSharedPreferenceEvidence(input)) {
    return emptyPlan(input, "insufficient-data", "공유 성향 facts revision이 현재 여행방과 일치하지 않아 자동 초안을 만들지 않았어요.");
  }
  const sharedSignalConflicts = findSharedCandidateSignalConflicts(input);
  if (sharedSignalConflicts.length) {
    return emptyPlan(
      input,
      "insufficient-data",
      `후보 ${sharedSignalConflicts.length}곳에 반드시 방문과 제외 의견이 함께 있어 자동 생성을 중단했어요. 분석 리포트에서 충돌한 참여자를 확인해 주세요.`,
      ["명시적 mustVisit/avoid 충돌은 평균 점수로 상쇄하지 않습니다."],
    );
  }
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
  if (!preference.evidence.length) {
    return emptyPlan(input, "insufficient-data", "실제 성향 응답·서버 성향 태그·후보 직접 담기 기록이 있는 참여자가 없어요. 미응답자를 중립값으로 채우지 않았습니다.");
  }
  const constraints = input.confirmedScheduleConstraints ?? [];
  if (constraints.some((constraint) => !isUsableConfirmedScheduleConstraint(constraint, input.trip))) {
    return emptyPlan(input, "insufficient-data", "확정 예약 중 날짜·시각 계약이 올바르지 않은 항목이 있어 자동 초안을 만들지 않았어요.");
  }
  if (hasMismatchedLinkedConstraint(input, constraints)) {
    return emptyPlan(input, "insufficient-data", "일정표의 날짜·시간·장소와 연결된 확정 예약 사실이 서로 달라 자동 초안을 만들지 않았어요. 먼저 확정 일정을 다시 맞춰 주세요.");
  }
  const candidateModelResult = buildCandidateModels(
    input,
    preference.evidence,
    resolved.maxNewItems,
    resolved.duration,
  );
  if (candidateModelResult.unsafeUtilityScale) {
    return emptyPlan(input, "insufficient-data", "성향 효용 척도가 안전한 정수 범위를 넘어 기기 계산을 중단했어요. 후보·태그 범위를 줄인 뒤 다시 시도해 주세요.");
  }
  let candidates = candidateModelResult.models;
  if (candidates.length > MAX_AUTO_FILL_CANDIDATES) {
    return emptyPlan(input, "insufficient-data", `성향 근거가 있는 미배치 후보가 ${MAX_AUTO_FILL_CANDIDATES}개를 넘어 기기 탐색을 시작하지 않았어요. 후보를 줄인 뒤 다시 시도해 주세요.`);
  }
  if (!candidates.length) return emptyPlan(
    input,
    candidateModelResult.missingDurationPlaceIds.length ? "insufficient-data" : "no-candidates",
    candidateModelResult.missingDurationPlaceIds.length
      ? "장소별 체류시간을 추정할 실제 일정·설문 관측값이 없어요. 필요한 경우 고급 설정에서 체류시간 fallback을 입력해 주세요."
      : "미배치 후보 중 직접 담기·정확한 선호 태그·명시적 선호·실제 수치 응답 근거가 있는 장소가 없어요.",
  );
  const referenceDuration = Math.min(...candidates.map((candidate) => candidate.durationEvidence.durationMinutes));
  const { slots, hasIncompleteConstraint, dayPools, slotCapacityByDate } = buildPlacementSlots(
    input,
    resolved.start,
    resolved.end,
    referenceDuration,
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
  const maximumSelectedCount = Math.min(resolved.maxNewItems, slots.length, candidates.length);
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
    const signature = indexes.map((index) => searchCandidates[index].durationEvidence.durationMinutes)
      .sort((left, right) => right - left)
      .join(",");
    const cached = durationFeasibilityCache.get(signature);
    if (cached) return cached;
    const packed = packCandidateDurations(searchCandidates, indexes, placementGaps, placementDayLoadByDate);
    durationPackingExpandedStates += packed.expandedStates;
    const result = { feasible: packed.feasible, exact: packed.exact, expandedStates: packed.expandedStates };
    durationFeasibilityCache.set(signature, result);
    return result;
  };
  let selectedCount = maximumSelectedCount;
  let modeledEvidenceIndexes: number[] = [];
  let utilityRanges: UtilityRange[] = [];
  let searched: ReturnType<typeof exactBundleSearch> | ReturnType<typeof heuristicBundleSearch> | undefined;
  let exactSearch = false;
  let searchCandidates: CandidateModel[] = [];
  for (; selectedCount >= Math.max(1, requiredCandidateCount); selectedCount -= 1) {
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
    modeledEvidenceIndexes = utilityRangesByEvidenceMember
      .flatMap((range, index) => range.maximum > range.minimum ? [index] : []);
    searchCandidates = candidates.map((candidate) => ({
      ...candidate,
      utilityByMember: modeledEvidenceIndexes.map((index) => candidate.utilityByMember[index]),
    }));
    utilityRanges = modeledEvidenceIndexes.map((index) => utilityRangesByEvidenceMember[index]);
    const optionalSelectedCount = selectedCount - requiredCandidateCount;
    const combinationCount = combinationCountCapped(searchCandidates.length - requiredCandidateCount, optionalSelectedCount, EXACT_BUNDLE_EVALUATION_LIMIT);
    const exactUtilityWork = combinationCount * BigInt(selectedCount * utilityRanges.length);
    exactSearch = combinationCount <= EXACT_BUNDLE_EVALUATION_LIMIT
      && exactUtilityWork <= EXACT_BUNDLE_UTILITY_WORK_LIMIT;
    const feasibility = buildFeasibility(searchCandidates);
    searched = exactSearch
      ? exactBundleSearch(searchCandidates, selectedCount, utilityRanges, requiredCandidateCount, feasibility)
      : heuristicBundleSearch(searchCandidates, selectedCount, utilityRanges, requiredCandidateCount, feasibility);
    if (searched.best) break;
  }
  if (!searched?.best || !searchCandidates.length) return emptyPlan(input, "no-space", "장소별 체류시간과 현재 빈 구간을 함께 계산했지만 배치 가능한 후보 묶음을 찾지 못했어요.");
  candidates = searchCandidates;
  const exact = exactSearch && searched.feasibilityExact;
  const modeledEvidence = modeledEvidenceIndexes.map((index) => preference.evidence[index]);
  const unrepresentedPreferenceMemberIds = preference.evidence.filter((_, index) => !modeledEvidenceIndexes.includes(index)).map((entry) => entry.memberId);
  const packedSelection = packCandidateDurations(candidates, searched.best.indexes, placementGaps, placementDayLoadByDate);
  durationPackingExpandedStates += packedSelection.expandedStates;
  if (!packedSelection.feasible) return emptyPlan(input, "no-space", "선택한 장소별 체류시간을 빈 구간에 안전하게 배치하지 못했어요.");
  const placementByCandidateIndex = new Map(packedSelection.placements.map((placement) => [placement.candidateIndex, placement] as const));
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
  const normalizedSatisfactionByMember = Object.fromEntries(modeledEvidence.map((member, index) => [
    member.memberId,
    Number(searched.best?.fractions[index].numerator ?? 0n) / Number(searched.best?.fractions[index].denominator ?? 1n),
  ]));
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
  const localApplyBlockReasons = [
    "새 후보의 실제 앞뒤 이동시간 상한을 확인하지 못했습니다.",
    "새 후보의 구조화된 운영·예약 시간창을 확인하지 못했습니다.",
    ...(input.scheduleOverlayStatus === "unavailable" ? ["기기 잠금 overlay를 읽지 못했습니다."] : []),
    ...(hasIncompleteConstraint ? ["종료 시각이 없는 확정 예약이 있습니다."] : []),
    ...(unresolvedTimeSensitiveDocuments.length ? ["일정에 연결되지 않은 시간 민감 문서가 있습니다."] : []),
    ...(input.trip.status === "completed" ? ["완료된 여행방입니다."] : []),
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
  const limitations = [
    "후보 장소의 구조화된 운영시간·휴무일·예약 시간창을 확인하지 못해 Hard Constraint 충족으로 단정하지 않습니다.",
    "새 후보와 앞뒤 일정 사이의 실제 이동시간·경로 상한이 없어 배치 순서와 도착 가능성을 최적화하지 않았습니다.",
    ...(officialDurationAssignmentCount
      ? [`${officialDurationAssignmentCount}개 장소는 TourAPI 안내 소요시간의 하한보다 짧아지지 않게 배치했습니다.${officialOnlyDurationAssignmentCount ? ` 이 중 ${officialOnlyDurationAssignmentCount}개는 상한을 알 수 없어 통계 범위로 표시하지 않았습니다.` : ""}`]
      : ["초안 체류시간은 같은 여행의 장소 분류 표본, 동행자 활동시간 합의, 사용자 예비 입력에서 추정했으며 공식 안내시간이 없는 장소에 임의의 업종별 고정값을 넣지 않았습니다."]),
    ...(hasIncompleteConstraint ? ["시작 시각만 확인된 예약은 지속시간을 추정하지 않고 해당 시각 이후의 자동 배치를 모두 제외했습니다."] : []),
    ...(input.localPlanningFactsStatus === "missing" ? ["여행방 planning이 미설정 상태라 입력되지 않은 복귀 조건을 만들어내지 않았습니다."] : []),
    ...(snapshotEvidenceMemberIds.length ? ["서버 여행 유형 태그는 상세 수치 설문보다 낮은 신뢰도의 정확 태그 일치 근거로만 사용했습니다."] : []),
    ...(candidateSelectionOnlyMemberIds.length ? ["성향 설문이 없는 참여자는 본인이 직접 담은 후보에 한해서만 효용을 모델링했습니다."] : []),
    ...(sharedEvidenceMemberIds.length ? ["서버 파생 축은 결측을 0으로 채우지 않았고, 장소 taxonomy와 의미가 직접 연결되는 대표 명소·로컬 축만 후보 효용에 사용했습니다."] : []),
    ...(candidateModelResult.excludedAvoidPlaceIds.length ? [`명시적으로 제외한 후보 ${candidateModelResult.excludedAvoidPlaceIds.length}곳은 자동 초안 후보군에서 제거했습니다.`] : []),
    ...(candidateModelResult.missingDurationPlaceIds.length ? [`체류시간 근거가 전혀 없는 후보 ${candidateModelResult.missingDurationPlaceIds.length}곳은 임의 상수로 채우지 않고 제외했습니다.`] : []),
    ...(fixedUnlinkedCandidatePlaceIds.length ? [`확정 사실에 일정 ID 없이 연결된 후보 ${fixedUnlinkedCandidatePlaceIds.length}개는 임의 시간에 배치하지 않고 제외했습니다.`] : []),
    ...(dailyPreferenceExceededDates.length ? [`사용자가 요청한 추가 개수를 보존해 ${dailyPreferenceExceededDates.join(", ")}은 설문 하루 일정량 Soft 목표를 넘습니다.`] : []),
    "Tour contentTypeId와 장소 category/tag의 명시적 taxonomy에 매핑되지 않는 상세 category 점수는 추정하지 않았습니다.",
    "장소별 체류시간을 긴 순서로 보고 빈 구간 잔여시간이 가장 적게 남는 곳부터 배치해 일정 파편화를 줄였습니다.",
    ...(!exactSearch ? [`완전 탐색 한도(조합 ${EXACT_BUNDLE_EVALUATION_LIMIT.toString()}개·효용 누적 ${EXACT_BUNDLE_UTILITY_WORK_LIMIT.toString()}회)를 넘어 adaptive beam ${searched.beamWidth}개와 bounded 1-swap을 사용했습니다. ${searched.localSearchConverged ? "검사한 1-swap 이웃에서는 개선안이 없습니다." : `${LOCAL_SEARCH_ROUND_LIMIT}회 한도에서 끝나 local optimum도 보장하지 않습니다.`} 전역 최적 보장은 없습니다.`] : []),
    ...(exactSearch && !exact ? [`체류시간 bin-packing이 ${EXACT_DURATION_PACKING_STATE_LIMIT.toLocaleString()}개 상태 한도에 닿아 일부 후보 묶음의 배치 가능성을 증명하지 못했습니다. 반환한 배치는 실제로 겹치지 않지만 전체 최적 선택 보장은 없습니다.`] : []),
  ];
  return {
    status: "preview-only",
    mode,
    message: `${assignments.length}개 후보를 기존 일정·잠금·확정 예약을 움직이지 않고 빈 시간에 배치한 검토용 초안이에요. 이동·운영시간은 Hard 충족으로 주장하지 않으며 사용자가 미리보기를 확인해야 합니다.`,
    assignments,
    certificate: {
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
      // 조건부 원자 저장은 연결됐지만, 새 후보의 경로·운영 시간창 Hard
      // 근거가 없으므로 local/API 모두 정상 일정이라고 표시하지 않는다.
      localApplyEligible: false,
      localApplyBlockReasons,
      dayAllocations,
      minimumNormalizedSatisfaction: searched.best.sortedFractions.length
        ? Number(searched.best.sortedFractions[0].numerator) / Number(searched.best.sortedFractions[0].denominator)
        : undefined,
      normalizedSatisfactionByMember,
      ...(fairness ? { fairness } : {}),
      durationEstimates: assignments.map((assignment) => ({
        ...assignment.durationEvidence,
        supportingItemIds: [...assignment.durationEvidence.supportingItemIds],
      })),
      durationPackingExact: packedSelection.exact && searched.feasibilityExact,
      durationPackingExpandedStates,
      assumptions: [
        "응답자 동일 가중치",
        "mustVisit은 필수 포함, avoid는 후보 제외, 후보 preferenceStrength → 여행방 후보 직접 담기 → exact 선호 태그 → 명시 category ordinal → 수치 응답 평균 순으로 사전식 우선",
        "명시 category는 like=+1, neutral=0, dislike=-1의 ordinal 개수이며, 배치·발견 0~100 수치는 후보·멤버별 가용 신호의 동일 가중 산술평균",
        "서로 단위가 다른 근거를 임의 가중합하지 않고 참여자별 사전식 후보 순위를 Borda형 정수 효용으로 변환",
        "멤버별 고정 k개 후보 순위효용을 bottom-k~top-k 범위로 정규화한 뒤 최저 만족도 → Nash 후생 → leximin 순으로 비교",
        "공정성 목적값이 같은 안은 명시 불호 총량이 적은 안을 먼저 선택",
        "미응답자와 후보 근거가 없는 응답자는 0점으로 넣지 않고 목적함수에서 제외",
        "scheduleDensity·challenging 파생 축은 장소별 의미 연결 데이터가 없어 후보 점수로 변환하지 않음",
        "체류시간은 lcls3 → lcls2 → contentType → 활동 taxonomy → 정확 category의 겹치지 않는 cohort와 설문 interval을 표본수·MAD·평균절대편차·측정폭 기반 precision으로 계층 수축",
        "TourAPI가 해석 가능한 안내 소요시간을 제공하면 15분 단위로 올림한 하한을 위 추정값의 floor로 적용하며, 하한만 있는 경우 상한이나 통계 신뢰범위를 만들지 않음",
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
    ? `후보 묶음 ${plan.certificate.evaluatedBundleCount}개와 장소별 체류시간 배치를 모두 비교(실제 이동 경로는 제외)`
    : `제한 탐색 ${plan.certificate.evaluatedBundleCount}개 평가 후 ${plan.certificate.localSearchConverged ? "검사한 1-swap 이웃에서 수렴" : "bounded 1-swap 종료(local optimum 미보장)"}`;
  // 새 후보의 실제 경로·운영 시간창을 배치안별로 재검증하는 계약이 생기기 전에는
  // local/mock에서도 저장 가능한 정상 일정이라고 주장하지 않는다.
  const canApply = false;
  const base = {
    tripId: session.tripId,
    sourceIssueIds: [],
    type: "add-preference-place" as const,
    priority: "medium" as const,
    title: `성향 기반 일정 초안 ${plan.assignments.length}개`,
    summary: plan.message,
    reason: `실제 성향 근거 ${responseCoverage} · ${exactText}. 기존 일정과 보호 항목은 변경하지 않았어요.`,
    affectedItemIds: plan.assignments.map((assignment) => assignment.itemId),
    affectedPlaceIds: plan.assignments.map((assignment) => assignment.placeId),
    changes,
    canApply,
    ...(!canApply ? {
      unavailableReason: plan.certificate.localApplyBlockReasons[0]
        ?? "새 후보의 실제 이동·운영시간 근거가 없어 검토용 미리보기만 제공합니다.",
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
