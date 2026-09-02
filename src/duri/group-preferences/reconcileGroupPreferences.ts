import type { EntityId, PreferenceScore } from "../../domain";
import { solveFairGroupDecision } from "./fairGroupDecision";

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rankingSignature(values: readonly string[]) {
  return JSON.stringify(values);
}

export type GroupPreferenceCompromise = {
  recommendedScore?: PreferenceScore;
  /** 최저 효용·Nash·leximin 벡터까지 같은 정확한 공동 최적 후보. */
  equallyFairScores: PreferenceScore[];
  maximumRegret: number;
  meanRegret: number;
  mostAffectedMemberIds: EntityId[];
  minimumSatisfaction: number;
  nashWelfare: number;
  giniCoefficient: number;
  paretoEfficient: boolean;
  exact: true;
};

/**
 * 각 0/1/2 대안에 대해 거리 기반 효용 u=1-|응답-대안|/2를 만들고,
 * Pareto 효율 → 최저 효용 → Nash 후생 → leximin 보강 순으로 정확히 비교한다.
 */
export function calculateFairPreferenceCompromise(
  responses: readonly { userId: EntityId; score: PreferenceScore }[],
): GroupPreferenceCompromise {
  if (!responses.length) {
    return {
      equallyFairScores: [],
      maximumRegret: 0,
      meanRegret: 0,
      mostAffectedMemberIds: [],
      minimumSatisfaction: 0,
      nashWelfare: 0,
      giniCoefficient: 0,
      paretoEfficient: false,
      exact: true,
    };
  }
  const memberIds = responses.map((response) => response.userId);
  const decision = solveFairGroupDecision(memberIds, ([0, 1, 2] as const).map((score) => ({
    id: String(score),
    utilitiesByMember: Object.fromEntries(responses.map((response) => [
      response.userId,
      1 - Math.abs(response.score - score) / 2,
    ])),
  })));
  const recommendedScore = decision.selectedAlternativeId === undefined
    ? undefined
    : Number(decision.selectedAlternativeId) as PreferenceScore;
  const best = decision.evaluations.find((evaluation) => evaluation.alternativeId === decision.selectedAlternativeId);
  const equallyFairScores = decision.equallyOptimalAlternativeIds.map((id) => Number(id) as PreferenceScore);
  return {
    recommendedScore,
    equallyFairScores,
    maximumRegret: best?.maximumRegret ?? 0,
    meanRegret: best?.meanRegret ?? 0,
    mostAffectedMemberIds: best ? responses
      .filter((entry) => (best.utilitiesByMember[entry.userId] ?? 0) === best.minimumUtility)
      .map((entry) => entry.userId)
      .sort(compareText) : [],
    minimumSatisfaction: best?.minimumUtility ?? 0,
    nashWelfare: best?.nashWelfare ?? 0,
    giniCoefficient: best?.giniCoefficient ?? 0,
    paretoEfficient: Boolean(decision.selectedAlternativeId
      && decision.paretoFrontierAlternativeIds.includes(decision.selectedAlternativeId)),
    exact: true,
  };
}

/** @deprecated 이름 호환용. 실제 목적은 Pareto → max-min → Nash 순서다. */
export const calculateMinimaxPreferenceCompromise = calculateFairPreferenceCompromise;

export type MobilityConsensus = {
  commonModes: string[];
  mostSupportedModes: string[];
  supportByMode: Record<string, EntityId[]>;
};

/** 직접 고른 이동수단의 교집합과 최다 지지 대안을 계산한다. */
export function deriveMobilityConsensus(
  responses: readonly { userId: EntityId; modes: readonly string[] }[],
): MobilityConsensus {
  const normalized = responses.map((response) => ({
    userId: response.userId,
    modes: [...new Set(response.modes.map((mode) => mode.trim()).filter(Boolean))].sort(compareText),
  })).filter((response) => response.modes.length > 0);
  const support = new Map<string, EntityId[]>();
  normalized.forEach((response) => response.modes.forEach((mode) => {
    support.set(mode, [...(support.get(mode) ?? []), response.userId]);
  }));
  const supportEntries: [string, EntityId[]][] = [...support.entries()]
    .map(([mode, memberIds]): [string, EntityId[]] => [mode, [...new Set(memberIds)].sort(compareText)])
    .sort(([left], [right]) => compareText(left, right));
  const supportByMode: Record<string, EntityId[]> = Object.fromEntries(supportEntries);
  if (!normalized.length) return { commonModes: [], mostSupportedModes: [], supportByMode };
  const commonModes = Object.entries(supportByMode)
    .filter(([, memberIds]) => memberIds.length === normalized.length)
    .map(([mode]) => mode);
  const maximumSupport = Math.max(0, ...Object.values(supportByMode).map((memberIds) => memberIds.length));
  const mostSupportedModes = Object.entries(supportByMode)
    .filter(([, memberIds]) => memberIds.length === maximumSupport)
    .map(([mode]) => mode);
  return { commonModes, mostSupportedModes, supportByMode };
}

/** 공통 항목의 상대 순서가 뒤집힌 비율. 0은 동일, 1은 완전 역순이다. */
export function normalizedKendallDistance(left: readonly string[], right: readonly string[]) {
  const rightRanks = new Map(right.map((value, index) => [value, index]));
  const common = [...new Set(left)].filter((value) => rightRanks.has(value));
  if (common.length < 2) return undefined;
  let discordant = 0;
  let pairs = 0;
  for (let first = 0; first < common.length - 1; first += 1) {
    for (let second = first + 1; second < common.length; second += 1) {
      pairs += 1;
      if ((rightRanks.get(common[first]) as number) > (rightRanks.get(common[second]) as number)) discordant += 1;
    }
  }
  return pairs ? discordant / pairs : undefined;
}

export type KemenyConsensus = {
  ranking: string[];
  totalPairwiseDisagreement: number;
  normalizedPairwiseDisagreement?: number;
  exact: boolean;
  allOptimalRankingsEnumerated: boolean;
  equallyOptimalRankings: string[][];
  heuristicEvaluationCount?: number;
  heuristicEvaluationLimitReached?: boolean;
};

export type KemenyHeuristicOptions = {
  /** 15개 초과 근사 탐색에서 평가할 swap/insertion 이웃 수의 결정적 상한. */
  maxEvaluations?: number;
};

const DEFAULT_KEMENY_HEURISTIC_MAX_EVALUATIONS = 100_000;
const MAX_KEMENY_RESPONSES = 256;
const MAX_KEMENY_ITEMS = 128;

type KemenyHeuristicBudget = {
  evaluations: number;
  maximum: number;
  limitReached: boolean;
};

function permutations(values: readonly string[]): string[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) => permutations(values.filter((_, candidateIndex) => candidateIndex !== index))
    .map((suffix) => [value, ...suffix]));
}

function rankingDisagreement(candidate: readonly string[], rankings: readonly { ranking: readonly string[] }[]) {
  const candidateRank = new Map(candidate.map((item, index) => [item, index]));
  let disagreement = 0;
  let comparedPairs = 0;
  rankings.forEach((entry) => {
    const observed = [...new Set(entry.ranking)].filter((item) => candidateRank.has(item));
    for (let left = 0; left < observed.length - 1; left += 1) {
      for (let right = left + 1; right < observed.length; right += 1) {
        comparedPairs += 1;
        if ((candidateRank.get(observed[left]) as number) > (candidateRank.get(observed[right]) as number)) disagreement += 1;
      }
    }
  });
  return { disagreement, comparedPairs };
}

function buildPairwiseBeforeCounts(
  items: readonly string[],
  rankings: readonly { ranking: readonly string[] }[],
) {
  const itemIndex = new Map(items.map((item, index) => [item, index]));
  const beforeCounts = Array.from({ length: items.length }, () => Array<number>(items.length).fill(0));
  rankings.forEach((entry) => {
    const observed = [...new Set(entry.ranking)].filter((item) => itemIndex.has(item));
    for (let left = 0; left < observed.length - 1; left += 1) {
      for (let right = left + 1; right < observed.length; right += 1) {
        beforeCounts[itemIndex.get(observed[left]) as number][itemIndex.get(observed[right]) as number] += 1;
      }
    }
  });
  return { beforeCounts, itemIndex };
}

function exactKemenyBySubset(
  items: readonly string[],
  beforeCounts: readonly (readonly number[])[],
) {
  const size = 1 << items.length;
  const costs = Array<number>(size).fill(Number.POSITIVE_INFINITY);
  const paths = Array<string[] | undefined>(size);
  costs[0] = 0;
  paths[0] = [];
  for (let mask = 1; mask < size; mask += 1) {
    for (let last = 0; last < items.length; last += 1) {
      if ((mask & (1 << last)) === 0) continue;
      const previousMask = mask ^ (1 << last);
      let addedDisagreement = 0;
      for (let earlier = 0; earlier < items.length; earlier += 1) {
        if ((previousMask & (1 << earlier)) !== 0) addedDisagreement += beforeCounts[last][earlier];
      }
      const cost = costs[previousMask] + addedDisagreement;
      const candidate = [...(paths[previousMask] as string[]), items[last]];
      const current = paths[mask];
      if (cost < costs[mask] || (cost === costs[mask]
        && (!current || compareText(rankingSignature(candidate), rankingSignature(current)) < 0))) {
        costs[mask] = cost;
        paths[mask] = candidate;
      }
    }
  }
  return paths[size - 1] as string[];
}

function locallyImproveKemeny(
  initial: readonly string[],
  itemIndex: ReadonlyMap<string, number>,
  beforeCounts: readonly (readonly number[])[],
  budget: KemenyHeuristicBudget,
) {
  const costForOrder = (candidate: readonly string[]) => {
    let cost = 0;
    for (let earlier = 0; earlier < candidate.length - 1; earlier += 1) {
      const earlierIndex = itemIndex.get(candidate[earlier]) as number;
      for (let later = earlier + 1; later < candidate.length; later += 1) {
        const laterIndex = itemIndex.get(candidate[later]) as number;
        cost += beforeCounts[laterIndex][earlierIndex];
      }
    }
    return cost;
  };
  const swapDelta = (candidate: readonly string[], left: number, right: number) => {
    const leftIndex = itemIndex.get(candidate[left]) as number;
    const rightIndex = itemIndex.get(candidate[right]) as number;
    let delta = beforeCounts[leftIndex][rightIndex] - beforeCounts[rightIndex][leftIndex];
    for (let middle = left + 1; middle < right; middle += 1) {
      const middleIndex = itemIndex.get(candidate[middle]) as number;
      delta += beforeCounts[leftIndex][middleIndex] - beforeCounts[middleIndex][leftIndex];
      delta += beforeCounts[middleIndex][rightIndex] - beforeCounts[rightIndex][middleIndex];
    }
    return delta;
  };
  const insertionDelta = (candidate: readonly string[], from: number, to: number) => {
    const movedIndex = itemIndex.get(candidate[from]) as number;
    let delta = 0;
    if (from < to) {
      for (let index = from + 1; index <= to; index += 1) {
        const crossedIndex = itemIndex.get(candidate[index]) as number;
        delta += beforeCounts[movedIndex][crossedIndex] - beforeCounts[crossedIndex][movedIndex];
      }
    } else {
      for (let index = to; index < from; index += 1) {
        const crossedIndex = itemIndex.get(candidate[index]) as number;
        delta += beforeCounts[crossedIndex][movedIndex] - beforeCounts[movedIndex][crossedIndex];
      }
    }
    return delta;
  };
  const reserveEvaluation = () => {
    if (budget.evaluations >= budget.maximum) {
      budget.limitReached = true;
      return false;
    }
    budget.evaluations += 1;
    return true;
  };
  let current = [...initial];
  let currentCost = costForOrder(current);
  while (true) {
    let best = current;
    let bestCost = currentCost;
    const consider = (candidate: string[], cost: number) => {
      if (cost < bestCost || (cost === bestCost
        && compareText(rankingSignature(candidate), rankingSignature(best)) < 0)) {
        best = candidate;
        bestCost = cost;
      }
    };
    let stopped = false;
    for (let left = 0; left < current.length - 1; left += 1) {
      for (let right = left + 1; right < current.length; right += 1) {
        if (!reserveEvaluation()) {
          stopped = true;
          break;
        }
        const candidate = [...current];
        [candidate[left], candidate[right]] = [candidate[right], candidate[left]];
        consider(candidate, currentCost + swapDelta(current, left, right));
      }
      if (stopped) break;
    }
    if (!stopped) {
      for (let from = 0; from < current.length; from += 1) {
        for (let to = 0; to < current.length; to += 1) {
          if (from === to) continue;
          if (!reserveEvaluation()) {
            stopped = true;
            break;
          }
          const candidate = [...current];
          const [moved] = candidate.splice(from, 1);
          candidate.splice(to, 0, moved);
          consider(candidate, currentCost + insertionDelta(current, from, to));
        }
        if (stopped) break;
      }
    }
    if (bestCost > currentCost || (bestCost === currentCost
      && compareText(rankingSignature(best), rankingSignature(current)) >= 0)) break;
    current = best;
    currentCost = bestCost;
    if (stopped) break;
  }
  return current;
}

function deterministicKemenyStarts(
  items: readonly string[],
  rankings: readonly { ranking: readonly string[] }[],
  itemIndex: ReadonlyMap<string, number>,
  beforeCounts: readonly (readonly number[])[],
) {
  const statistics = items.map((item, index) => {
    let copeland = 0;
    let margin = 0;
    let support = 0;
    for (let other = 0; other < items.length; other += 1) {
      if (other === index) continue;
      const forward = beforeCounts[index][other];
      const backward = beforeCounts[other][index];
      copeland += forward > backward ? 1 : forward < backward ? -1 : 0;
      margin += forward - backward;
      support += forward;
    }
    return { item, copeland, margin, support };
  });
  const copelandStart = [...statistics].sort((left, right) => (
    right.copeland - left.copeland
    || right.margin - left.margin
    || right.support - left.support
    || compareText(left.item, right.item)
  )).map((entry) => entry.item);
  const pairwiseBordaStart = [...statistics].sort((left, right) => (
    right.margin - left.margin
    || right.support - left.support
    || right.copeland - left.copeland
    || compareText(left.item, right.item)
  )).map((entry) => entry.item);
  const canonicalObserved = rankings
    .map((entry) => [...new Set(entry.ranking)].filter((item) => itemIndex.has(item)))
    .sort((left, right) => right.length - left.length
      || compareText(rankingSignature(left), rankingSignature(right)))[0] ?? [];
  const observedStart = [
    ...canonicalObserved,
    ...copelandStart.filter((item) => !canonicalObserved.includes(item)),
  ];
  const unique = new Map<string, string[]>();
  [copelandStart, pairwiseBordaStart, observedStart, [...items], [...items].reverse()].forEach((start) => {
    unique.set(rankingSignature(start), start);
  });
  return [...unique.values()];
}

/** 응답 순위와의 전체 Kendall 불일치를 최소화한다. 15개 이하는 exact DP를 사용한다. */
export function deriveKemenyConsensus(
  rankings: readonly { userId: EntityId; ranking: readonly string[] }[],
  options: KemenyHeuristicOptions = {},
): KemenyConsensus {
  if (rankings.length > MAX_KEMENY_RESPONSES) {
    throw new Error(`Kemeny 순위 응답은 최대 ${MAX_KEMENY_RESPONSES}명까지 계산할 수 있습니다.`);
  }
  const maximumHeuristicEvaluations = options.maxEvaluations ?? DEFAULT_KEMENY_HEURISTIC_MAX_EVALUATIONS;
  if (!Number.isSafeInteger(maximumHeuristicEvaluations) || maximumHeuristicEvaluations < 1) {
    throw new Error("Kemeny 근사 평가 상한은 1 이상의 안전한 정수여야 합니다.");
  }
  const normalized = rankings.map((entry) => ({
    userId: entry.userId.trim(),
    ranking: [...new Set(entry.ranking.map((value) => value.trim()).filter(Boolean))],
  })).filter((entry) => entry.ranking.length > 0);
  if (normalized.some((entry) => !entry.userId) || new Set(normalized.map((entry) => entry.userId)).size !== normalized.length) {
    throw new Error("순위 응답의 참여자 ID는 비어 있거나 중복될 수 없습니다.");
  }
  const items = [...new Set(normalized.flatMap((entry) => entry.ranking))].sort(compareText);
  if (items.length > MAX_KEMENY_ITEMS) {
    throw new Error(`Kemeny 순위 항목은 최대 ${MAX_KEMENY_ITEMS}개까지 계산할 수 있습니다.`);
  }
  if (!items.length) return { ranking: [], totalPairwiseDisagreement: 0, exact: true, allOptimalRankingsEnumerated: true, equallyOptimalRankings: [] };
  const enumerateAll = items.length <= 8;
  const exact = items.length <= 15;
  const { beforeCounts, itemIndex } = buildPairwiseBeforeCounts(items, normalized);
  const heuristicBudget: KemenyHeuristicBudget = {
    evaluations: 0,
    maximum: maximumHeuristicEvaluations,
    limitReached: false,
  };
  const candidates = enumerateAll
    ? permutations(items)
    : exact
      ? [exactKemenyBySubset(items, beforeCounts)]
      : deterministicKemenyStarts(items, normalized, itemIndex, beforeCounts)
        .map((start) => locallyImproveKemeny(start, itemIndex, beforeCounts, heuristicBudget));
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [rankingSignature(candidate), candidate])).values()];
  const ranked = uniqueCandidates.map((candidate) => ({ candidate, ...rankingDisagreement(candidate, normalized) }))
    .sort((left, right) => left.disagreement - right.disagreement
      || compareText(rankingSignature(left.candidate), rankingSignature(right.candidate)));
  const best = ranked[0];
  return {
    ranking: best.candidate,
    totalPairwiseDisagreement: best.disagreement,
    ...(best.comparedPairs ? { normalizedPairwiseDisagreement: best.disagreement / best.comparedPairs } : {}),
    exact,
    allOptimalRankingsEnumerated: enumerateAll,
    equallyOptimalRankings: ranked.filter((entry) => entry.disagreement === best.disagreement).map((entry) => entry.candidate),
    ...(!exact ? {
      heuristicEvaluationCount: heuristicBudget.evaluations,
      heuristicEvaluationLimitReached: heuristicBudget.limitReached,
    } : {}),
  };
}

/** 기존 호출부 호환용: 정렬은 Kemeny 최적 순위, averageRank는 설명 근거로 함께 반환한다. */
export function deriveConsensusRanking(rankings: readonly { userId: EntityId; ranking: readonly string[] }[]) {
  const normalized = rankings.map((entry) => ({
    userId: entry.userId,
    ranking: [...new Set(entry.ranking.map((value) => value.trim()).filter(Boolean))],
  })).filter((entry) => entry.ranking.length > 0);
  const consensus = deriveKemenyConsensus(normalized);
  const order = new Map(consensus.ranking.map((item, index) => [item, index]));
  const items = consensus.ranking;
  return items.map((item) => {
    const observedRanks = normalized.flatMap((entry) => {
      const rank = entry.ranking.indexOf(item);
      return rank < 0 ? [] : [rank + 1];
    });
    return {
      item,
      averageRank: observedRanks.reduce((total, rank) => total + rank, 0) / observedRanks.length,
      respondentCount: observedRanks.length,
      normalizedPairwiseDisagreement: consensus.normalizedPairwiseDisagreement,
      exact: consensus.exact,
    };
  }).sort((left, right) => (order.get(left.item) as number) - (order.get(right.item) as number));
}
