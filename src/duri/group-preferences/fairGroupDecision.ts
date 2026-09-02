import type { EntityId } from "../../domain";

// Pareto O(A²M), Gini O(AM²), exact decimal Nash 곱의 자릿수 폭증을 함께 제한한다.
const MAX_FAIR_DECISION_MEMBERS = 64;
const MAX_FAIR_DECISION_ALTERNATIVES = 256;

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type FairDecisionAlternative = {
  id: string;
  utilitiesByMember: Readonly<Record<EntityId, number>>;
};

export type RobustUtilityInterval = {
  /** 확인된 보수 효용. 불확실한 값을 낙관적으로 채우지 않는다. */
  lower: number;
  /** 현재 가장 타당한 점추정. */
  nominal: number;
  /** 데이터가 허용하는 낙관 효용. */
  upper: number;
};

export type RobustFairDecisionAlternative = {
  id: string;
  utilityIntervalsByMember: Readonly<Record<EntityId, RobustUtilityInterval>>;
};

export type RobustFairDecisionEvaluation = {
  alternativeId: string;
  intervalsByMember: Record<EntityId, RobustUtilityInterval>;
  worstCaseMinimumUtility: number;
  worstCaseNashWelfare: number;
  nominalMinimumUtility: number;
  nominalNashWelfare: number;
  maximumWorstCaseRegret: number;
  meanWorstCaseRegret: number;
  uncertaintyWidth: number;
};

export type RobustFairGroupDecision = {
  selectedAlternativeId?: string;
  equallyOptimalAlternativeIds: string[];
  lowerBoundParetoFrontierAlternativeIds: string[];
  evaluations: RobustFairDecisionEvaluation[];
  exact: true;
  exactScope: "provided-utility-intervals";
  assumptions: readonly [
    "모든 참여자 동일 가중치",
    "각 효용은 검증된 0~1 닫힌구간",
    "보수 최저효용, 최악후회, 보수 Nash, 명목 최저효용, 명목 Nash 순으로 비교",
  ];
};

export type FairDecisionEvaluation = {
  alternativeId: string;
  utilitiesByMember: Record<EntityId, number>;
  /** 작은 값부터 정렬한 효용 벡터. 이 벡터를 사전식으로 최대화한다. */
  leximinVector: number[];
  minimumUtility: number;
  meanUtility: number;
  nashWelfare: number;
  giniCoefficient: number;
  maximumRegret: number;
  meanRegret: number;
};

export type FairGroupDecision = {
  selectedAlternativeId?: string;
  equallyOptimalAlternativeIds: string[];
  paretoFrontierAlternativeIds: string[];
  evaluations: FairDecisionEvaluation[];
  exact: true;
  exactScope: "provided-alternatives";
  numericTolerance: number;
  assumptions: readonly [
    "모든 참여자 동일 가중치",
    "효용은 참여자별 0~1 척도",
    "불일치점 0에서 Pareto 효율 후 최저 효용, Nash 후생, leximin 보강 순으로 비교",
  ];
};

function compareNumber(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

type RationalValue = { numerator: bigint; denominator: bigint };

function decimalNumberToRational(value: number): RationalValue {
  const [mantissa, exponentSource] = value.toString().toLowerCase().split("e");
  const exponent = Number(exponentSource ?? 0);
  const [integerPart, fractionPart = ""] = mantissa.split(".");
  let numerator = BigInt(`${integerPart}${fractionPart}` || "0");
  let denominator = 10n ** BigInt(fractionPart.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  return { numerator, denominator };
}

function nashProduct(
  evaluation: FairDecisionEvaluation,
  memberIds: readonly EntityId[],
): RationalValue {
  let numerator = 1n;
  let denominator = 1n;
  for (const memberId of memberIds) {
    const factor = decimalNumberToRational(evaluation.utilitiesByMember[memberId]);
    numerator *= factor.numerator;
    denominator *= factor.denominator;
  }
  return { numerator, denominator };
}

function compareRational(left: RationalValue, right: RationalValue) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function compareLeximin(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const compared = compareNumber(left[index], right[index]);
    if (compared !== 0) return compared;
  }
  return compareNumber(left.length, right.length);
}

function geometricMean(values: readonly number[]) {
  if (!values.length) return 0;
  if (values.some((value) => value <= 0)) return 0;
  return Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length);
}

function giniCoefficient(values: readonly number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  if (mean === 0) return 0;
  let absoluteDifference = 0;
  for (const left of values) {
    for (const right of values) absoluteDifference += Math.abs(left - right);
  }
  return absoluteDifference / (2 * values.length * values.length * mean);
}

function validateMembers(memberIds: readonly EntityId[]) {
  const normalized = [...new Set(memberIds.map((memberId) => memberId.trim()).filter(Boolean))].sort(compareText);
  if (normalized.length !== memberIds.length) throw new Error("참여자 ID는 비어 있거나 중복될 수 없습니다.");
  return normalized;
}

function evaluateAlternative(
  memberIds: readonly EntityId[],
  idealUtilityByMember: Readonly<Record<EntityId, number>>,
  alternative: FairDecisionAlternative,
): FairDecisionEvaluation {
  if (!alternative.id.trim()) throw new Error("대안 ID가 비어 있습니다.");
  if (Object.keys(alternative.utilitiesByMember).some((memberId) => !memberIds.includes(memberId))) {
    throw new Error(`${alternative.id}에 참여자가 아닌 효용 키가 있습니다.`);
  }
  const utilitiesByMember = Object.fromEntries(memberIds.map((memberId) => {
    const utility = alternative.utilitiesByMember[memberId];
    if (!Number.isFinite(utility) || utility < 0 || utility > 1) {
      throw new Error(`${alternative.id}의 ${memberId} 효용은 0~1의 유한한 값이어야 합니다.`);
    }
    return [memberId, utility];
  }));
  const utilities = memberIds.map((memberId) => utilitiesByMember[memberId]);
  const regrets = memberIds.map((memberId) => idealUtilityByMember[memberId] - utilitiesByMember[memberId]);
  const leximinVector = [...utilities].sort((left, right) => left - right);
  const meanUtility = utilities.reduce((total, value) => total + value, 0) / utilities.length;
  return {
    alternativeId: alternative.id,
    utilitiesByMember,
    leximinVector,
    minimumUtility: leximinVector[0] ?? 0,
    meanUtility,
    nashWelfare: geometricMean(utilities),
    giniCoefficient: giniCoefficient(utilities),
    maximumRegret: Math.max(...regrets),
    meanRegret: regrets.reduce((total, value) => total + value, 0) / regrets.length,
  };
}

function dominates(left: FairDecisionEvaluation, right: FairDecisionEvaluation, memberIds: readonly EntityId[]) {
  let strictlyBetter = false;
  for (const memberId of memberIds) {
    const compared = compareNumber(left.utilitiesByMember[memberId], right.utilitiesByMember[memberId]);
    if (compared < 0) return false;
    if (compared > 0) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * 유한한 대안 집합을 완전 탐색하므로 반환한 선택은 주어진 효용표 안에서 정확하다.
 * 임의 가중합을 쓰지 않고 Pareto 지배 대안을 제거한 뒤 최저 효용과 Nash 후생을 우선한다.
 */
export function solveFairGroupDecision(
  memberIds: readonly EntityId[],
  alternatives: readonly FairDecisionAlternative[],
): FairGroupDecision {
  const members = validateMembers(memberIds);
  if (members.length > MAX_FAIR_DECISION_MEMBERS) {
    throw new Error(`공정 결정 참여자는 최대 ${MAX_FAIR_DECISION_MEMBERS}명까지 계산할 수 있습니다.`);
  }
  if (alternatives.length > MAX_FAIR_DECISION_ALTERNATIVES) {
    throw new Error(`공정 결정 대안은 최대 ${MAX_FAIR_DECISION_ALTERNATIVES}개까지 계산할 수 있습니다.`);
  }
  if (!members.length || !alternatives.length) {
    return {
      equallyOptimalAlternativeIds: [],
      paretoFrontierAlternativeIds: [],
      evaluations: [],
      exact: true,
      exactScope: "provided-alternatives",
      numericTolerance: 0,
      assumptions: [
        "모든 참여자 동일 가중치",
        "효용은 참여자별 0~1 척도",
        "불일치점 0에서 Pareto 효율 후 최저 효용, Nash 후생, leximin 보강 순으로 비교",
      ],
    };
  }
  const ids = alternatives.map((alternative) => alternative.id);
  if (new Set(ids).size !== ids.length) throw new Error("대안 ID는 중복될 수 없습니다.");
  const idealUtilityByMember = Object.fromEntries(members.map((memberId) => [
    memberId,
    Math.max(...alternatives.map((alternative) => alternative.utilitiesByMember[memberId])),
  ]));
  const evaluations = alternatives.map((alternative) => evaluateAlternative(members, idealUtilityByMember, alternative));
  const pareto = evaluations.filter((candidate) => !evaluations.some((other) => (
    other.alternativeId !== candidate.alternativeId && dominates(other, candidate, members)
  )));
  const nashProductByAlternativeId = new Map(pareto.map((candidate) => [
    candidate.alternativeId,
    nashProduct(candidate, members),
  ]));
  const ranked = [...pareto].sort((left, right) => (
    -compareNumber(left.minimumUtility, right.minimumUtility)
    || -compareRational(
      nashProductByAlternativeId.get(left.alternativeId) as RationalValue,
      nashProductByAlternativeId.get(right.alternativeId) as RationalValue,
    )
    || -compareLeximin(left.leximinVector, right.leximinVector)
    || compareText(left.alternativeId, right.alternativeId)
  ));
  const best = ranked[0];
  const equallyOptimalAlternativeIds = best ? ranked.filter((candidate) => (
    compareNumber(candidate.minimumUtility, best.minimumUtility) === 0
    && compareRational(
      nashProductByAlternativeId.get(candidate.alternativeId) as RationalValue,
      nashProductByAlternativeId.get(best.alternativeId) as RationalValue,
    ) === 0
    && compareLeximin(candidate.leximinVector, best.leximinVector) === 0
  )).map((candidate) => candidate.alternativeId).sort(compareText) : [];
  return {
    selectedAlternativeId: best?.alternativeId,
    equallyOptimalAlternativeIds,
    paretoFrontierAlternativeIds: pareto.map((candidate) => candidate.alternativeId).sort(compareText),
    evaluations: [...evaluations].sort((left, right) => compareText(left.alternativeId, right.alternativeId)),
    exact: true,
    exactScope: "provided-alternatives",
    numericTolerance: 0,
    assumptions: [
      "모든 참여자 동일 가중치",
      "효용은 참여자별 0~1 척도",
      "불일치점 0에서 Pareto 효율 후 최저 효용, Nash 후생, leximin 보강 순으로 비교",
    ],
  };
}

function validateRobustInterval(
  alternativeId: string,
  memberId: EntityId,
  interval: RobustUtilityInterval | undefined,
) {
  if (!interval
    || ![interval.lower, interval.nominal, interval.upper].every(Number.isFinite)
    || interval.lower < 0
    || interval.upper > 1
    || interval.lower > interval.nominal
    || interval.nominal > interval.upper) {
    throw new Error(`${alternativeId}의 ${memberId} 효용 구간은 0~1 안에서 lower <= nominal <= upper여야 합니다.`);
  }
  return { ...interval };
}

function lowerBoundDominates(
  left: RobustFairDecisionEvaluation,
  right: RobustFairDecisionEvaluation,
  memberIds: readonly EntityId[],
) {
  let strictlyBetter = false;
  for (const memberId of memberIds) {
    const compared = compareNumber(
      left.intervalsByMember[memberId].lower,
      right.intervalsByMember[memberId].lower,
    );
    if (compared < 0) return false;
    if (compared > 0) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * 효용이 한 값으로 확정되지 않은 유한 대안 집합을 Wald식 보수 효용과
 * Savage식 최악 후회로 함께 비교한다. 모든 대안을 열거하므로 반환 순위는
 * 입력으로 제공된 효용 구간 안에서는 정확하며, 확률분포를 임의로 가정하지 않는다.
 */
export function solveRobustFairGroupDecision(
  memberIds: readonly EntityId[],
  alternatives: readonly RobustFairDecisionAlternative[],
): RobustFairGroupDecision {
  const members = validateMembers(memberIds);
  if (members.length > MAX_FAIR_DECISION_MEMBERS) {
    throw new Error(`공정 결정 참여자는 최대 ${MAX_FAIR_DECISION_MEMBERS}명까지 계산할 수 있습니다.`);
  }
  if (alternatives.length > MAX_FAIR_DECISION_ALTERNATIVES) {
    throw new Error(`공정 결정 대안은 최대 ${MAX_FAIR_DECISION_ALTERNATIVES}개까지 계산할 수 있습니다.`);
  }
  const assumptions = [
    "모든 참여자 동일 가중치",
    "각 효용은 검증된 0~1 닫힌구간",
    "보수 최저효용, 최악후회, 보수 Nash, 명목 최저효용, 명목 Nash 순으로 비교",
  ] as const;
  if (!members.length || !alternatives.length) {
    return {
      equallyOptimalAlternativeIds: [],
      lowerBoundParetoFrontierAlternativeIds: [],
      evaluations: [],
      exact: true,
      exactScope: "provided-utility-intervals",
      assumptions,
    };
  }
  const alternativeIds = alternatives.map((alternative) => alternative.id.trim());
  if (alternativeIds.some((id) => !id) || new Set(alternativeIds).size !== alternativeIds.length) {
    throw new Error("대안 ID는 비어 있거나 중복될 수 없습니다.");
  }
  const unexpectedMember = alternatives.find((alternative) => (
    Object.keys(alternative.utilityIntervalsByMember).some((memberId) => !members.includes(memberId))
  ));
  if (unexpectedMember) throw new Error(`${unexpectedMember.id}에 참여자가 아닌 효용 키가 있습니다.`);

  const validated = alternatives.map((alternative) => ({
    id: alternative.id.trim(),
    intervalsByMember: Object.fromEntries(members.map((memberId) => [
      memberId,
      validateRobustInterval(alternative.id, memberId, alternative.utilityIntervalsByMember[memberId]),
    ])),
  }));
  const optimisticIdealByMember = Object.fromEntries(members.map((memberId) => [
    memberId,
    Math.max(...validated.map((alternative) => alternative.intervalsByMember[memberId].upper)),
  ]));
  const evaluations = validated.map((alternative): RobustFairDecisionEvaluation => {
    const lower = members.map((memberId) => alternative.intervalsByMember[memberId].lower);
    const nominal = members.map((memberId) => alternative.intervalsByMember[memberId].nominal);
    const regrets = members.map((memberId) => (
      optimisticIdealByMember[memberId] - alternative.intervalsByMember[memberId].lower
    ));
    return {
      alternativeId: alternative.id,
      intervalsByMember: alternative.intervalsByMember,
      worstCaseMinimumUtility: Math.min(...lower),
      worstCaseNashWelfare: geometricMean(lower),
      nominalMinimumUtility: Math.min(...nominal),
      nominalNashWelfare: geometricMean(nominal),
      maximumWorstCaseRegret: Math.max(...regrets),
      meanWorstCaseRegret: regrets.reduce((sum, regret) => sum + regret, 0) / regrets.length,
      uncertaintyWidth: members.reduce((sum, memberId) => {
        const interval = alternative.intervalsByMember[memberId];
        return sum + interval.upper - interval.lower;
      }, 0) / members.length,
    };
  });
  const frontier = evaluations.filter((candidate) => !evaluations.some((other) => (
    other.alternativeId !== candidate.alternativeId
    && lowerBoundDominates(other, candidate, members)
  )));
  const lowerNash = new Map(frontier.map((candidate) => [candidate.alternativeId, nashProduct({
    alternativeId: candidate.alternativeId,
    utilitiesByMember: Object.fromEntries(members.map((memberId) => [
      memberId,
      candidate.intervalsByMember[memberId].lower,
    ])),
    leximinVector: [],
    minimumUtility: candidate.worstCaseMinimumUtility,
    meanUtility: 0,
    nashWelfare: candidate.worstCaseNashWelfare,
    giniCoefficient: 0,
    maximumRegret: 0,
    meanRegret: 0,
  }, members)]));
  const nominalNash = new Map(frontier.map((candidate) => [candidate.alternativeId, nashProduct({
    alternativeId: candidate.alternativeId,
    utilitiesByMember: Object.fromEntries(members.map((memberId) => [
      memberId,
      candidate.intervalsByMember[memberId].nominal,
    ])),
    leximinVector: [],
    minimumUtility: candidate.nominalMinimumUtility,
    meanUtility: 0,
    nashWelfare: candidate.nominalNashWelfare,
    giniCoefficient: 0,
    maximumRegret: 0,
    meanRegret: 0,
  }, members)]));
  const compareRobust = (left: RobustFairDecisionEvaluation, right: RobustFairDecisionEvaluation) => (
    -compareNumber(left.worstCaseMinimumUtility, right.worstCaseMinimumUtility)
    || compareNumber(left.maximumWorstCaseRegret, right.maximumWorstCaseRegret)
    || -compareRational(
      lowerNash.get(left.alternativeId) as RationalValue,
      lowerNash.get(right.alternativeId) as RationalValue,
    )
    || -compareNumber(left.nominalMinimumUtility, right.nominalMinimumUtility)
    || -compareRational(
      nominalNash.get(left.alternativeId) as RationalValue,
      nominalNash.get(right.alternativeId) as RationalValue,
    )
    || compareNumber(left.uncertaintyWidth, right.uncertaintyWidth)
    || compareText(left.alternativeId, right.alternativeId)
  );
  const ranked = [...frontier].sort(compareRobust);
  const best = ranked[0];
  const equallyOptimalAlternativeIds = best ? ranked.filter((candidate) => (
    compareNumber(candidate.worstCaseMinimumUtility, best.worstCaseMinimumUtility) === 0
    && compareNumber(candidate.maximumWorstCaseRegret, best.maximumWorstCaseRegret) === 0
    && compareRational(
      lowerNash.get(candidate.alternativeId) as RationalValue,
      lowerNash.get(best.alternativeId) as RationalValue,
    ) === 0
    && compareNumber(candidate.nominalMinimumUtility, best.nominalMinimumUtility) === 0
    && compareRational(
      nominalNash.get(candidate.alternativeId) as RationalValue,
      nominalNash.get(best.alternativeId) as RationalValue,
    ) === 0
    && compareNumber(candidate.uncertaintyWidth, best.uncertaintyWidth) === 0
  )).map((candidate) => candidate.alternativeId).sort(compareText) : [];
  return {
    selectedAlternativeId: best?.alternativeId,
    equallyOptimalAlternativeIds,
    lowerBoundParetoFrontierAlternativeIds: frontier.map((candidate) => candidate.alternativeId).sort(compareText),
    evaluations: [...evaluations].sort((left, right) => compareText(left.alternativeId, right.alternativeId)),
    exact: true,
    exactScope: "provided-utility-intervals",
    assumptions,
  };
}
