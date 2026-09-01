import type { EntityId } from "../../domain";

export type IntervalPreferenceObservation = {
  userId: EntityId;
  value: number;
  resolution: number;
  minimum?: number;
  maximum?: number;
};

export type IntervalPreferenceConsensus = {
  observations: (IntervalPreferenceObservation & { lower: number; upper: number })[];
  commonInterval?: { lower: number; upper: number };
  recommendedValue?: number;
  maximumIntervalRegret: number;
  meanIntervalRegret: number;
  mostAffectedMemberIds: EntityId[];
  measurableConflict: boolean;
  exact: true;
};

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function distanceToInterval(value: number, lower: number, upper: number) {
  if (value < lower) return lower - value;
  if (value > upper) return value - upper;
  return 0;
}

/**
 * 각 응답을 측정 해상도의 절반만큼 넓힌 구간으로 보고, 모든 구간까지의
 * 최대 거리를 최소화하는 1차원 Chebyshev center를 닫힌형식으로 계산한다.
 */
export function solveIntervalPreferenceConsensus(
  source: readonly IntervalPreferenceObservation[],
): IntervalPreferenceConsensus {
  const seen = new Set<EntityId>();
  const observations = source.map((entry) => {
    const userId = entry.userId.trim();
    if (!userId || seen.has(userId)) throw new Error("구간 선호의 참여자 ID는 비어 있거나 중복될 수 없습니다.");
    seen.add(userId);
    if (!Number.isFinite(entry.value)) throw new Error(`${userId}의 선호값은 유한해야 합니다.`);
    if (!Number.isFinite(entry.resolution) || entry.resolution <= 0) throw new Error(`${userId}의 측정 해상도는 0보다 커야 합니다.`);
    const minimum = entry.minimum ?? Number.NEGATIVE_INFINITY;
    const maximum = entry.maximum ?? Number.POSITIVE_INFINITY;
    if (entry.minimum !== undefined && !Number.isFinite(entry.minimum)) throw new Error(`${userId}의 최솟값은 유한해야 합니다.`);
    if (entry.maximum !== undefined && !Number.isFinite(entry.maximum)) throw new Error(`${userId}의 최댓값은 유한해야 합니다.`);
    if (minimum > maximum || entry.value < minimum || entry.value > maximum) throw new Error(`${userId}의 선호값 범위가 올바르지 않습니다.`);
    const radius = entry.resolution / 2;
    const rawLower = entry.value - radius;
    const rawUpper = entry.value + radius;
    if (!Number.isFinite(rawLower) || !Number.isFinite(rawUpper)) throw new Error(`${userId}의 값과 해상도 범위가 너무 큽니다.`);
    return {
      ...entry,
      userId,
      lower: Math.max(minimum, rawLower),
      upper: Math.min(maximum, rawUpper),
    };
  }).sort((left, right) => compareText(left.userId, right.userId));
  if (!observations.length) {
    return {
      observations: [],
      maximumIntervalRegret: 0,
      meanIntervalRegret: 0,
      mostAffectedMemberIds: [],
      measurableConflict: false,
      exact: true,
    };
  }
  const commonLower = Math.max(...observations.map((entry) => entry.lower));
  const commonUpper = Math.min(...observations.map((entry) => entry.upper));
  const measurableConflict = commonLower > commonUpper;
  // commonLower + commonUpper가 큰 같은 부호 값에서 overflow하지 않도록 절반씩 더한다.
  const recommendedValue = commonLower / 2 + commonUpper / 2;
  const regrets = observations.map((entry) => ({
    userId: entry.userId,
    regret: distanceToInterval(recommendedValue, entry.lower, entry.upper),
  }));
  const maximumIntervalRegret = Math.max(...regrets.map((entry) => entry.regret));
  return {
    observations,
    ...(measurableConflict ? {} : { commonInterval: { lower: commonLower, upper: commonUpper } }),
    recommendedValue,
    maximumIntervalRegret,
    meanIntervalRegret: regrets.reduce((sum, entry) => sum + entry.regret, 0) / regrets.length,
    mostAffectedMemberIds: maximumIntervalRegret === 0 ? [] : regrets
      .filter((entry) => entry.regret === maximumIntervalRegret)
      .map((entry) => entry.userId),
    measurableConflict,
    exact: true,
  };
}
