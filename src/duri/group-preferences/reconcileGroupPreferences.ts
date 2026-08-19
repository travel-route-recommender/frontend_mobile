import type { EntityId, PreferenceScore } from "../../domain";

export type GroupPreferenceCompromise = {
  recommendedScore?: PreferenceScore;
  /** 동일한 최소최대 후회를 만드는 후보. UI에서는 자동 결정보다 조율 범위로 사용한다. */
  equallyFairScores: PreferenceScore[];
  maximumRegret: number;
  meanRegret: number;
  mostAffectedMemberIds: EntityId[];
};

/**
 * 다수결 평균이 소수의 강한 선호를 지우지 않도록 먼저 최대 후회를 최소화하고,
 * 동률일 때 전체 평균 후회가 작은 점수를 고른다. 점수는 설문의 실제 0/1/2만 쓴다.
 */
export function calculateMinimaxPreferenceCompromise(
  responses: readonly { userId: EntityId; score: PreferenceScore }[],
): GroupPreferenceCompromise {
  if (!responses.length) {
    return { equallyFairScores: [], maximumRegret: 0, meanRegret: 0, mostAffectedMemberIds: [] };
  }
  const candidates = ([0, 1, 2] as const).map((score) => {
    const regrets = responses.map((response) => ({
      userId: response.userId,
      value: Math.abs(response.score - score) / 2,
    }));
    const maximumRegret = Math.max(...regrets.map((entry) => entry.value));
    const meanRegret = regrets.reduce((total, entry) => total + entry.value, 0) / regrets.length;
    return { score, regrets, maximumRegret, meanRegret };
  }).sort((left, right) => left.maximumRegret - right.maximumRegret
    || left.meanRegret - right.meanRegret
    || left.score - right.score);
  const best = candidates[0];
  const equallyFairScores = candidates
    .filter((candidate) => candidate.maximumRegret === best.maximumRegret)
    .map((candidate) => candidate.score)
    .sort((left, right) => left - right);
  return {
    recommendedScore: best.score,
    equallyFairScores,
    maximumRegret: best.maximumRegret,
    meanRegret: best.meanRegret,
    mostAffectedMemberIds: best.regrets
      .filter((entry) => entry.value === best.maximumRegret)
      .map((entry) => entry.userId)
      .sort(),
  };
}

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
    modes: [...new Set(response.modes.map((mode) => mode.trim()).filter(Boolean))].sort(),
  })).filter((response) => response.modes.length > 0);
  const support = new Map<string, EntityId[]>();
  normalized.forEach((response) => response.modes.forEach((mode) => {
    support.set(mode, [...(support.get(mode) ?? []), response.userId]);
  }));
  const supportEntries: [string, EntityId[]][] = [...support.entries()]
    .map(([mode, memberIds]): [string, EntityId[]] => [mode, [...new Set(memberIds)].sort()])
    .sort(([left], [right]) => left.localeCompare(right));
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

/** Borda 평균 순위. 동률은 이름으로만 안정 정렬하며 자동 결제·삭제 근거로 쓰지 않는다. */
export function deriveConsensusRanking(rankings: readonly { userId: EntityId; ranking: readonly string[] }[]) {
  const normalized = rankings.map((entry) => ({
    userId: entry.userId,
    ranking: [...new Set(entry.ranking.map((value) => value.trim()).filter(Boolean))],
  })).filter((entry) => entry.ranking.length > 0);
  const items = [...new Set(normalized.flatMap((entry) => entry.ranking))];
  return items.map((item) => {
    const observedRanks = normalized.flatMap((entry) => {
      const rank = entry.ranking.indexOf(item);
      return rank < 0 ? [] : [rank + 1];
    });
    return {
      item,
      averageRank: observedRanks.reduce((total, rank) => total + rank, 0) / observedRanks.length,
      respondentCount: observedRanks.length,
    };
  }).sort((left, right) => left.averageRank - right.averageRank
    || right.respondentCount - left.respondentCount
    || left.item.localeCompare(right.item));
}
