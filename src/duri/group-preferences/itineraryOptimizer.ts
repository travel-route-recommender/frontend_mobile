import type { EntityId } from "../../domain";

export type OptimizationMember = { id: EntityId };

export type OptimizationDayAnchor =
  | { kind: "node"; nodeId: string }
  | { kind: "open" };

export type OptimizationDay = {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  startAnchor: OptimizationDayAnchor;
  endAnchor: OptimizationDayAnchor;
};

export type OptimizationTimeWindow = {
  dayId: string;
  startMinute: number;
  endMinute: number;
};

export type OptimizationVisit = {
  id: string;
  nodeId: string;
  durationMinutes: number;
  /** 참여자별 비음수 정수 효용 점수. 정수만 허용해 탐색·재현성의 부동소수 오차를 줄인다. */
  utilityPointsByMember: Readonly<Record<EntityId, number>>;
  mandatory?: boolean;
  timeWindows?: readonly OptimizationTimeWindow[];
  lockedAssignment?: { dayId: string; startMinute: number };
};

export type BaselineVisitAssignment = {
  visitId: string;
  dayId: string;
  startMinute: number;
};

export type ItineraryOptimizerInput = {
  members: readonly OptimizationMember[];
  days: readonly OptimizationDay[];
  visits: readonly OptimizationVisit[];
  /** 누락과 unknown은 분석 불충분, unreachable은 확인된 이동 불가로 구분한다. */
  routeEdgesByKey: Readonly<Record<string, OptimizationRouteEdge>>;
  /** 동일 Hard Constraint에서 각 참여자가 혼자 얻을 수 있는 검증된 최대 효용. */
  idealUtilityPointsByMember?: Readonly<Partial<Record<EntityId, number>>>;
  baselineAssignments?: readonly BaselineVisitAssignment[];
  maxExpandedStates: number;
  /** dominance 판정 전 후보 label 생성 시도 상한. 생략하면 maxExpandedStates와 같다. */
  maxGeneratedStates?: number;
  /** 최저 만족도 상한 gap 목표. 전체 목적의 near-optimal 보증으로 사용하지 않는다. */
  acceptableMinimumUtilityGap?: number;
};

export type OptimizationRouteEdge =
  | {
      status: "available";
      /** 목적함수에서 비교하는 대표(명목) 이동시간. */
      durationMinutes: number;
      /** Hard 시간 가능성에 쓰는 보수적 상한. 생략하면 명목값과 같다. */
      upperDurationMinutes?: number;
    }
  | { status: "unreachable" }
  | { status: "unknown" };

export type OptimizedVisitAssignment = {
  visitId: string;
  dayId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  order: number;
};

export type ItineraryOptimizationObjective = {
  satisfactionByMember: Record<EntityId, number>;
  sortedSatisfaction: number[];
  minimumSatisfaction: number;
  nashWelfare: number;
  meanSatisfaction: number;
  changedVisitCount: number;
  shiftedMinutes: number;
  totalTravelMinutes: number;
};

export type ItineraryOptimizationCertificate = {
  status: "optimal" | "feasible" | "infeasible" | "unknown" | "insufficient-data";
  exact: boolean;
  /** exact가 false일 때 gap이 보증하는 범위. 후순위 목적까지 보증한다고 해석하면 안 된다. */
  gapScope: "full-objective" | "minimum-satisfaction" | "none";
  preferenceDataStatus: "modeled" | "partial" | "insufficient";
  expandedStates: number;
  generatedStates: number;
  prunedStates: number;
  frontierStates: number;
  peakFrontierStates: number;
  computationLimitReached: boolean;
  bestMinimumSatisfaction?: number;
  minimumSatisfactionUpperBound?: number;
  absoluteMinimumSatisfactionGap?: number;
  bestMinimumSatisfactionFraction?: RationalCertificateValue;
  minimumSatisfactionUpperBoundFraction?: RationalCertificateValue;
  absoluteMinimumSatisfactionGapFraction?: RationalCertificateValue;
  minimumSatisfactionGapWithinTarget?: boolean;
  modeledMemberIds: EntityId[];
  unmodeledMemberIds: EntityId[];
  assumptions: string[];
};

export type RationalCertificateValue = {
  numerator: string;
  denominator: string;
};

export type ItineraryOptimizationResult = {
  assignments: OptimizedVisitAssignment[];
  unselectedVisitIds: string[];
  objective?: ItineraryOptimizationObjective;
  certificate: ItineraryOptimizationCertificate;
};

export type IndividualIdealUtilityResult = {
  idealUtilityPointsByMember: Partial<Record<EntityId, number>>;
  exact: boolean;
  /** 후보 전체 효용이 0이라 정규화 목적에서 제외해야 하는 참여자. */
  zeroUtilityMemberIds: EntityId[];
  unavailableMemberIds: EntityId[];
  certificatesByMember: Record<EntityId, ItineraryOptimizationCertificate>;
};

type SearchState = {
  dayIndex: number;
  currentMinute: number;
  currentNodeId?: string;
  visitedMask: bigint;
  utilityTotals: number[];
  totalTravelMinutes: number;
  assignments: OptimizedVisitAssignment[];
  upperMinimumSatisfaction: RationalValue;
};

type FinalCandidate = {
  state: SearchState;
  objective: ItineraryOptimizationObjective;
};

type RationalValue = {
  numerator: bigint;
  denominator: bigint;
};

const ZERO_RATIONAL: RationalValue = { numerator: 0n, denominator: 1n };
const MAX_OPTIMIZATION_MEMBERS = 64;
const MAX_OPTIMIZATION_DAYS = 62;
const MAX_OPTIMIZATION_VISITS = 128;

function greatestCommonDivisor(left: bigint, right: bigint) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function normalizeRational(value: RationalValue): RationalValue {
  if (value.denominator <= 0n) throw new Error("유리수 분모는 0보다 커야 합니다.");
  const divisor = greatestCommonDivisor(value.numerator, value.denominator);
  return { numerator: value.numerator / divisor, denominator: value.denominator / divisor };
}

function compareRational(left: RationalValue, right: RationalValue) {
  const compared = left.numerator * right.denominator - right.numerator * left.denominator;
  return compared < 0n ? -1 : compared > 0n ? 1 : 0;
}

function rationalToNumber(value: RationalValue) {
  return Number(value.numerator) / Number(value.denominator);
}

function finiteDecimalToRational(value: number): RationalValue {
  if (!Number.isFinite(value)) throw new Error("유한한 숫자만 유리수로 변환할 수 있습니다.");
  const [mantissa, exponentSource] = value.toString().toLowerCase().split("e");
  const exponent = Number(exponentSource ?? 0);
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [integerPart, fractionPart = ""] = unsigned.split(".");
  let numerator = BigInt(`${integerPart}${fractionPart}` || "0");
  let denominator = 10n ** BigInt(fractionPart.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  if (negative) numerator = -numerator;
  return normalizeRational({ numerator, denominator });
}

function rationalCertificate(value: RationalValue): RationalCertificateValue {
  const normalized = normalizeRational(value);
  return { numerator: normalized.numerator.toString(), denominator: normalized.denominator.toString() };
}

function subtractRational(left: RationalValue, right: RationalValue) {
  const difference = {
    numerator: left.numerator * right.denominator - right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
  return normalizeRational(difference.numerator < 0n ? ZERO_RATIONAL : difference);
}

function finiteInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label}은 안전한 정수여야 합니다.`);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isoDateOrdinal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const milliseconds = Date.UTC(year, month - 1, day);
  const parsed = new Date(milliseconds);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return Math.floor(milliseconds / 86_400_000);
}

function compareNumber(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function geometricMean(values: readonly number[]) {
  if (!values.length || values.some((value) => value <= 0)) return 0;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function arithmeticMean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function routeEdgeKey(fromNodeId: string, toNodeId: string) {
  return `${fromNodeId}\u0000${toNodeId}`;
}

function anchorNodeId(anchor: OptimizationDayAnchor) {
  return anchor.kind === "node" ? anchor.nodeId : undefined;
}

function readTravelMinutes(input: ItineraryOptimizerInput, fromNodeId?: string, toNodeId?: string) {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return { nominal: 0, upper: 0 };
  const edge = input.routeEdgesByKey[routeEdgeKey(fromNodeId, toNodeId)];
  if (edge?.status !== "available") return undefined;
  return {
    nominal: edge.durationMinutes,
    upper: edge.upperDurationMinutes ?? edge.durationMinutes,
  };
}

function setBit(mask: bigint, index: number) {
  return mask | (1n << BigInt(index));
}

function hasBit(mask: bigint, index: number) {
  return (mask & (1n << BigInt(index))) !== 0n;
}

function binaryHeap<T>(isHigherPriority: (left: T, right: T) => boolean) {
  const values: T[] = [];
  return {
    get size() { return values.length; },
    peek: () => values[0],
    push(value: T) {
      values.push(value);
      let index = values.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!isHigherPriority(values[index], values[parent])) break;
        [values[index], values[parent]] = [values[parent], values[index]];
        index = parent;
      }
    },
    pop() {
      if (!values.length) return undefined;
      const top = values[0];
      const tail = values.pop();
      if (values.length && tail !== undefined) {
        values[0] = tail;
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          let best = index;
          if (left < values.length && isHigherPriority(values[left], values[best])) best = left;
          if (right < values.length && isHigherPriority(values[right], values[best])) best = right;
          if (best === index) break;
          [values[index], values[best]] = [values[best], values[index]];
          index = best;
        }
      }
      return top;
    },
  };
}

function normalizeInput(input: ItineraryOptimizerInput) {
  finiteInteger(input.maxExpandedStates, "maxExpandedStates");
  if (input.maxExpandedStates < 1) throw new Error("maxExpandedStates는 1 이상이어야 합니다.");
  const maxGeneratedStates = input.maxGeneratedStates ?? input.maxExpandedStates;
  finiteInteger(maxGeneratedStates, "maxGeneratedStates");
  if (maxGeneratedStates < 1) throw new Error("maxGeneratedStates는 1 이상이어야 합니다.");
  const acceptableGap = input.acceptableMinimumUtilityGap ?? 0;
  if (!Number.isFinite(acceptableGap) || acceptableGap < 0 || acceptableGap > 1) throw new Error("acceptableMinimumUtilityGap은 0~1이어야 합니다.");
  if (input.members.length > MAX_OPTIMIZATION_MEMBERS) {
    throw new Error(`일정 공정성 최적화 참여자는 최대 ${MAX_OPTIMIZATION_MEMBERS}명까지 계산할 수 있습니다.`);
  }
  const memberIds = input.members.map((member) => member.id.trim());
  if (memberIds.some((id) => !id) || new Set(memberIds).size !== memberIds.length) throw new Error("참여자 ID는 비어 있거나 중복될 수 없습니다.");
  if (Object.keys(input.idealUtilityPointsByMember ?? {}).some((memberId) => !memberIds.includes(memberId))) {
    throw new Error("개인 최적 효용에 참여자가 아닌 키가 있습니다.");
  }
  const days = [...input.days].sort((left, right) => compareText(left.date, right.date) || compareText(left.id, right.id));
  if (!days.length) throw new Error("최적화할 날짜가 없습니다.");
  if (days.length > MAX_OPTIMIZATION_DAYS) {
    throw new Error(`일정 최적화 DAY는 최대 ${MAX_OPTIMIZATION_DAYS}개까지 계산할 수 있습니다.`);
  }
  if (new Set(days.map((day) => day.id)).size !== days.length) throw new Error("날짜 ID는 중복될 수 없습니다.");
  if (new Set(days.map((day) => day.date)).size !== days.length) throw new Error("같은 여행 날짜를 둘 이상의 DAY로 만들 수 없습니다.");
  days.forEach((day) => {
    if (!day.id.trim()) throw new Error("DAY ID는 비어 있을 수 없습니다.");
    if (isoDateOrdinal(day.date) === undefined) throw new Error(`${day.id} 날짜는 실제 존재하는 YYYY-MM-DD여야 합니다.`);
    finiteInteger(day.startMinute, `${day.id} 시작 시각`);
    finiteInteger(day.endMinute, `${day.id} 종료 시각`);
    if (day.startMinute < 0 || day.endMinute > 1440 || day.startMinute >= day.endMinute) throw new Error(`${day.id} 시간 범위가 올바르지 않습니다.`);
    [day.startAnchor, day.endAnchor].forEach((anchor) => {
      if (anchor.kind === "node" && !anchor.nodeId.trim()) throw new Error(`${day.id} anchor node ID가 비어 있습니다.`);
    });
  });
  if (input.visits.length > MAX_OPTIMIZATION_VISITS) {
    throw new Error(`일정 최적화 방문 후보는 최대 ${MAX_OPTIMIZATION_VISITS}개까지 계산할 수 있습니다.`);
  }
  if (new Set(input.visits.map((visit) => visit.id)).size !== input.visits.length) throw new Error("방문 ID는 중복될 수 없습니다.");
  const dayIds = new Set(days.map((day) => day.id));
  const visits = [...input.visits].sort((left, right) => compareText(left.id, right.id));
  visits.forEach((visit) => {
    if (!visit.id.trim() || !visit.nodeId.trim()) throw new Error("방문 ID와 node ID는 비어 있을 수 없습니다.");
    if (Object.keys(visit.utilityPointsByMember).some((memberId) => !memberIds.includes(memberId))) {
      throw new Error(`${visit.id}에 참여자가 아닌 효용 키가 있습니다.`);
    }
    finiteInteger(visit.durationMinutes, `${visit.id} 체류시간`);
    if (visit.durationMinutes < 1 || visit.durationMinutes > 1440) throw new Error(`${visit.id} 체류시간이 올바르지 않습니다.`);
    memberIds.forEach((memberId) => {
      const utility = visit.utilityPointsByMember[memberId];
      if (!Number.isSafeInteger(utility) || utility < 0) throw new Error(`${visit.id}의 ${memberId} 효용 점수는 0 이상의 안전한 정수여야 합니다.`);
    });
    visit.timeWindows?.forEach((window) => {
      if (!dayIds.has(window.dayId)) throw new Error(`${visit.id}에 알 수 없는 날짜 window가 있습니다.`);
      finiteInteger(window.startMinute, `${visit.id} window 시작`);
      finiteInteger(window.endMinute, `${visit.id} window 종료`);
      if (window.startMinute < 0 || window.endMinute > 1440 || window.startMinute >= window.endMinute) throw new Error(`${visit.id} window가 올바르지 않습니다.`);
    });
    if (visit.lockedAssignment) {
      if (!dayIds.has(visit.lockedAssignment.dayId)) throw new Error(`${visit.id} 잠금 날짜가 여행 범위 밖입니다.`);
      finiteInteger(visit.lockedAssignment.startMinute, `${visit.id} 잠금 시작 시각`);
    }
  });
  const baseline = new Map<string, BaselineVisitAssignment>();
  const visitIds = new Set(visits.map((visit) => visit.id));
  input.baselineAssignments?.forEach((assignment) => {
    if (baseline.has(assignment.visitId)) throw new Error("기준 일정 방문 ID는 중복될 수 없습니다.");
    if (!visitIds.has(assignment.visitId)) throw new Error("기준 일정은 최적화 방문 목록의 ID만 참조할 수 있습니다.");
    if (!dayIds.has(assignment.dayId)) throw new Error("기준 일정 날짜가 여행 범위 밖입니다.");
    finiteInteger(assignment.startMinute, "기준 일정 시작 시각");
    if (assignment.startMinute < 0 || assignment.startMinute > 1440) throw new Error("기준 일정 시작 시각 범위가 올바르지 않습니다.");
    baseline.set(assignment.visitId, assignment);
  });
  const maximumCandidateUtility = memberIds.map((memberId) => visits.reduce((sum, visit) => sum + visit.utilityPointsByMember[memberId], 0));
  if (maximumCandidateUtility.some((value) => !Number.isSafeInteger(value))) throw new Error("참여자별 전체 효용 점수 합이 안전한 정수 범위를 벗어났습니다.");
  const denominators = memberIds.map((memberId, index) => {
    const ideal = input.idealUtilityPointsByMember?.[memberId];
    if (ideal === undefined) return 0;
    if (!Number.isSafeInteger(ideal) || ideal <= 0 || ideal > maximumCandidateUtility[index]) {
      throw new Error(`${memberId}의 개인 최적 효용은 0보다 크고 전체 후보 효용 합 이하여야 합니다.`);
    }
    return ideal;
  });
  const modeledMemberIndexes = denominators.flatMap((denominator, index) => denominator > 0 ? [index] : []);
  const unmodeledMemberIds = memberIds.filter((_, index) => !modeledMemberIndexes.includes(index));
  const requiredRouteEdgeKeys = new Set<string>();
  const requireEdge = (fromNodeId?: string, toNodeId?: string) => {
    if (fromNodeId && toNodeId && fromNodeId !== toNodeId) requiredRouteEdgeKeys.add(routeEdgeKey(fromNodeId, toNodeId));
  };
  days.forEach((day) => {
    const eligibleVisits = visits.filter((visit) => {
      if (visit.lockedAssignment) return visit.lockedAssignment.dayId === day.id;
      return !visit.timeWindows?.length || visit.timeWindows.some((window) => window.dayId === day.id);
    });
    const startNodeId = anchorNodeId(day.startAnchor);
    const endNodeId = anchorNodeId(day.endAnchor);
    requireEdge(startNodeId, endNodeId);
    eligibleVisits.forEach((visit) => {
      requireEdge(startNodeId, visit.nodeId);
      requireEdge(visit.nodeId, endNodeId);
      eligibleVisits.forEach((nextVisit) => requireEdge(visit.nodeId, nextVisit.nodeId));
    });
  });
  const unknownRouteEdgeKeys = [...requiredRouteEdgeKeys].flatMap((key) => {
    const edge = input.routeEdgesByKey[key];
    if (!edge || edge.status === "unknown") return [key];
    if (edge.status === "available") {
      finiteInteger(edge.durationMinutes, `${key} 이동시간`);
      if (edge.durationMinutes < 0) throw new Error(`${key} 이동시간은 0 이상이어야 합니다.`);
      const upperDurationMinutes = edge.upperDurationMinutes ?? edge.durationMinutes;
      finiteInteger(upperDurationMinutes, `${key} 이동시간 상한`);
      if (upperDurationMinutes < edge.durationMinutes) {
        throw new Error(`${key} 이동시간 상한은 명목 이동시간 이상이어야 합니다.`);
      }
    }
    return [];
  });
  return { acceptableGap, baseline, days, denominators, maxGeneratedStates, memberIds, modeledMemberIndexes, unknownRouteEdgeKeys, unmodeledMemberIds, visits };
}

function satisfactionFractions(utilityTotals: readonly number[], denominators: readonly number[], modeledIndexes: readonly number[]) {
  return modeledIndexes.map((index) => {
    if (utilityTotals[index] > denominators[index]) {
      throw new Error("개인 최적 효용보다 큰 일정이 발견되었습니다. idealUtilityPointsByMember 근거를 다시 계산해야 합니다.");
    }
    return normalizeRational({ numerator: BigInt(utilityTotals[index]), denominator: BigInt(denominators[index]) });
  }).sort(compareRational);
}

function fractionalUtilityUpperBound(
  state: Pick<SearchState, "dayIndex" | "currentMinute" | "visitedMask" | "utilityTotals">,
  days: readonly OptimizationDay[],
  visits: readonly OptimizationVisit[],
  memberIds: readonly EntityId[],
  denominators: readonly number[],
  modeledIndexes: readonly number[],
) {
  const remainingMinutes = Math.max(0, days[state.dayIndex].endMinute - state.currentMinute)
    + days.slice(state.dayIndex + 1).reduce((sum, day) => sum + day.endMinute - day.startMinute, 0);
  const upper = modeledIndexes.map((memberIndex): RationalValue => {
    let capacity = remainingMinutes;
    let utilityNumerator = BigInt(state.utilityTotals[memberIndex]);
    let utilityDenominator = 1n;
    const remaining = visits.flatMap((visit, visitIndex) => {
      if (hasBit(state.visitedMask, visitIndex)) return [];
      const value = visit.utilityPointsByMember[memberIds[memberIndex]];
      return value > 0 ? [{ value, duration: visit.durationMinutes }] : [];
    }).sort((left, right) => {
      const leftProduct = BigInt(left.value) * BigInt(right.duration);
      const rightProduct = BigInt(right.value) * BigInt(left.duration);
      if (leftProduct !== rightProduct) return leftProduct > rightProduct ? -1 : 1;
      return left.duration - right.duration || left.value - right.value;
    });
    for (const item of remaining) {
      if (capacity <= 0) break;
      if (capacity >= item.duration) {
        utilityNumerator += BigInt(item.value) * utilityDenominator;
        capacity -= item.duration;
      } else {
        const itemDuration = BigInt(item.duration);
        utilityNumerator = utilityNumerator * itemDuration
          + BigInt(item.value) * BigInt(capacity) * utilityDenominator;
        utilityDenominator *= itemDuration;
        capacity = 0;
      }
    }
    const satisfaction = normalizeRational({
      numerator: utilityNumerator,
      denominator: utilityDenominator * BigInt(denominators[memberIndex]),
    });
    return compareRational(satisfaction, { numerator: 1n, denominator: 1n }) >= 0
      ? { numerator: 1n, denominator: 1n }
      : satisfaction;
  }).sort(compareRational);
  return upper;
}

function candidateStarts(
  day: OptimizationDay,
  visit: OptimizationVisit,
  arrivalMinute: number,
) {
  const windows = visit.timeWindows?.length
    ? visit.timeWindows.filter((window) => window.dayId === day.id)
    : [{ dayId: day.id, startMinute: day.startMinute, endMinute: day.endMinute }];
  if (!windows.length) return [];
  const locked = visit.lockedAssignment;
  if (locked && locked.dayId !== day.id) return [];
  const starts = new Set<number>();
  windows.forEach((window) => {
    const earliest = Math.max(arrivalMinute, day.startMinute, window.startMinute);
    const latest = Math.min(window.endMinute, day.endMinute) - visit.durationMinutes;
    const candidates = locked ? [locked.startMinute] : Array.from(
      { length: Math.max(0, latest - earliest + 1) },
      (_, offset) => earliest + offset,
    );
    candidates.forEach((startMinute) => {
      if (startMinute < earliest) return;
      const endMinute = startMinute + visit.durationMinutes;
      if (endMinute <= Math.min(window.endMinute, day.endMinute)) starts.add(startMinute);
    });
  });
  return [...starts].sort((left, right) => left - right);
}

function changedMetrics(
  assignments: readonly OptimizedVisitAssignment[],
  baseline: ReadonlyMap<string, BaselineVisitAssignment>,
  days: readonly OptimizationDay[],
) {
  const assigned = new Map(assignments.map((assignment) => [assignment.visitId, assignment]));
  const allVisitIds = new Set([...baseline.keys(), ...assigned.keys()]);
  const firstDayOrdinal = isoDateOrdinal(days[0].date) as number;
  const timelineOffsetByDayId = new Map(days.map((day) => [
    day.id,
    ((isoDateOrdinal(day.date) as number) - firstDayOrdinal) * 1440,
  ]));
  let changedVisitCount = 0;
  let shiftedMinutes = 0;
  allVisitIds.forEach((visitId) => {
    const before = baseline.get(visitId);
    const after = assigned.get(visitId);
    if (!before || !after) {
      changedVisitCount += 1;
      return;
    }
    if (before.dayId !== after.dayId || before.startMinute !== after.startMinute) changedVisitCount += 1;
    const beforeTimelineMinute = (timelineOffsetByDayId.get(before.dayId) as number) + before.startMinute;
    const afterTimelineMinute = (timelineOffsetByDayId.get(after.dayId) as number) + after.startMinute;
    shiftedMinutes += Math.abs(beforeTimelineMinute - afterTimelineMinute);
  });
  return { changedVisitCount, shiftedMinutes };
}

function canonicalAssignmentSignature(assignments: readonly OptimizedVisitAssignment[]) {
  return JSON.stringify(assignments.map((entry) => [
    entry.date,
    entry.dayId,
    entry.startMinute,
    entry.endMinute,
    entry.order,
    entry.visitId,
  ]));
}

function searchStateLabelKey(state: SearchState) {
  return JSON.stringify([
    state.dayIndex,
    state.currentNodeId ?? null,
    state.visitedMask.toString(),
  ]);
}

/**
 * 같은 DAY·현재 노드·방문 집합이면 이후 선택지는 현재 시각 이후의 일정에만 의존한다.
 * 더 이른 상태가 기존 일정 변경 목적에서도 사전식으로 나쁘지 않을 때만 제거하므로
 * exact 목적값과 결정론적 최종 tie-break를 보존한다.
 */
function dominatesSearchState(
  left: SearchState,
  right: SearchState,
  baseline: ReadonlyMap<string, BaselineVisitAssignment>,
  days: readonly OptimizationDay[],
) {
  if (left.dayIndex !== right.dayIndex
    || left.currentNodeId !== right.currentNodeId
    || left.visitedMask !== right.visitedMask
    || left.currentMinute > right.currentMinute) return false;
  const leftChange = changedMetrics(left.assignments, baseline, days);
  const rightChange = changedMetrics(right.assignments, baseline, days);
  if (leftChange.changedVisitCount !== rightChange.changedVisitCount) {
    return leftChange.changedVisitCount < rightChange.changedVisitCount;
  }
  if (leftChange.shiftedMinutes !== rightChange.shiftedMinutes) {
    return leftChange.shiftedMinutes < rightChange.shiftedMinutes;
  }
  if (left.totalTravelMinutes !== right.totalTravelMinutes) {
    return left.totalTravelMinutes < right.totalTravelMinutes;
  }
  return compareText(
    canonicalAssignmentSignature(left.assignments),
    canonicalAssignmentSignature(right.assignments),
  ) <= 0;
}

function buildObjective(
  state: SearchState,
  memberIds: readonly EntityId[],
  denominators: readonly number[],
  modeledIndexes: readonly number[],
  baseline: ReadonlyMap<string, BaselineVisitAssignment>,
  days: readonly OptimizationDay[],
): ItineraryOptimizationObjective {
  const modeledSatisfaction = satisfactionFractions(state.utilityTotals, denominators, modeledIndexes)
    .map(rationalToNumber);
  const satisfactionByMember = Object.fromEntries(memberIds.flatMap((memberId, index) => (
    denominators[index] > 0 ? [[memberId, state.utilityTotals[index] / denominators[index]]] : []
  )));
  const sortedSatisfaction = [...modeledSatisfaction].sort((left, right) => left - right);
  const meanSatisfaction = arithmeticMean(modeledSatisfaction);
  return {
    satisfactionByMember,
    sortedSatisfaction,
    minimumSatisfaction: sortedSatisfaction[0] ?? 0,
    nashWelfare: geometricMean(modeledSatisfaction),
    meanSatisfaction,
    ...changedMetrics(state.assignments, baseline, days),
    totalTravelMinutes: state.totalTravelMinutes,
  };
}

function compareNashProduct(
  leftTotals: readonly number[],
  rightTotals: readonly number[],
  modeledIndexes: readonly number[],
) {
  const leftProduct = modeledIndexes.reduce((product, index) => product * BigInt(leftTotals[index]), 1n);
  const rightProduct = modeledIndexes.reduce((product, index) => product * BigInt(rightTotals[index]), 1n);
  return leftProduct < rightProduct ? -1 : leftProduct > rightProduct ? 1 : 0;
}

function compareSatisfactionFractions(left: readonly RationalValue[], right: readonly RationalValue[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const compared = compareRational(left[index], right[index]);
    if (compared !== 0) return compared;
  }
  return compareNumber(left.length, right.length);
}

function betterCandidate(
  left: FinalCandidate,
  right: FinalCandidate | undefined,
  denominators: readonly number[],
  modeledIndexes: readonly number[],
) {
  if (!right) return true;
  const leftObjective = left.objective;
  const rightObjective = right.objective;
  const leftSatisfaction = satisfactionFractions(left.state.utilityTotals, denominators, modeledIndexes);
  const rightSatisfaction = satisfactionFractions(right.state.utilityTotals, denominators, modeledIndexes);
  const minimum = compareRational(leftSatisfaction[0] ?? ZERO_RATIONAL, rightSatisfaction[0] ?? ZERO_RATIONAL);
  if (minimum !== 0) return minimum > 0;
  const nash = compareNashProduct(left.state.utilityTotals, right.state.utilityTotals, modeledIndexes);
  if (nash !== 0) return nash > 0;
  const leximinFallback = compareSatisfactionFractions(leftSatisfaction, rightSatisfaction);
  if (leximinFallback !== 0) return leximinFallback > 0;
  if (leftObjective.changedVisitCount !== rightObjective.changedVisitCount) return leftObjective.changedVisitCount < rightObjective.changedVisitCount;
  if (leftObjective.shiftedMinutes !== rightObjective.shiftedMinutes) return leftObjective.shiftedMinutes < rightObjective.shiftedMinutes;
  if (leftObjective.totalTravelMinutes !== rightObjective.totalTravelMinutes) return leftObjective.totalTravelMinutes < rightObjective.totalTravelMinutes;
  return compareText(
    canonicalAssignmentSignature(left.state.assignments),
    canonicalAssignmentSignature(right.state.assignments),
  ) < 0;
}

function upperBoundCanImprove(
  state: SearchState,
  best: FinalCandidate | undefined,
  denominators: readonly number[],
  modeledIndexes: readonly number[],
) {
  if (!best) return true;
  // 유리수 교차곱으로 최저 만족도만 안전하게 가지치기한다.
  // 동률이면 Nash·leximin·변경량 비교를 위해 계속 탐색한다.
  const bestMinimum = satisfactionFractions(best.state.utilityTotals, denominators, modeledIndexes)[0] ?? ZERO_RATIONAL;
  return compareRational(state.upperMinimumSatisfaction, bestMinimum) >= 0;
}

function allMandatoryVisited(mask: bigint, visits: readonly OptimizationVisit[]) {
  return visits.every((visit, index) => (!(visit.mandatory || visit.lockedAssignment) || hasBit(mask, index)));
}

function nextDayState(
  input: ItineraryOptimizerInput,
  state: SearchState,
  days: readonly OptimizationDay[],
  visits: readonly OptimizationVisit[],
  memberIds: readonly EntityId[],
  denominators: readonly number[],
  modeledIndexes: readonly number[],
) {
  const day = days[state.dayIndex];
  const returnTravel = readTravelMinutes(input, state.currentNodeId, anchorNodeId(day.endAnchor));
  if (returnTravel === undefined || state.currentMinute + returnTravel.upper > day.endMinute) return undefined;
  if (state.dayIndex === days.length - 1) {
    return {
      final: true as const,
      state: { ...state, totalTravelMinutes: state.totalTravelMinutes + returnTravel.nominal },
    };
  }
  const nextDayIndex = state.dayIndex + 1;
  const nextDay = days[nextDayIndex];
  const next = {
    ...state,
    dayIndex: nextDayIndex,
    currentMinute: nextDay.startMinute,
    currentNodeId: anchorNodeId(nextDay.startAnchor),
    totalTravelMinutes: state.totalTravelMinutes + returnTravel.nominal,
  };
  const upper = fractionalUtilityUpperBound(next, days, visits, memberIds, denominators, modeledIndexes);
  return {
    final: false as const,
    state: {
      ...next,
      upperMinimumSatisfaction: upper[0] ?? ZERO_RATIONAL,
    },
  };
}

/**
 * 정적 이동시간과 분 단위 시간창을 사용하는 multi-day orienteering reference solver.
 * 정수·유리수 비교로 탐색을 끝내면 전체 목적의 정확 최적을 증명한다.
 * 중단되면 최저 만족도의 admissible bound와 gap만 보고하며 near-optimal이라고 부르지 않는다.
 */
export function optimizeGroupItinerary(input: ItineraryOptimizerInput): ItineraryOptimizationResult {
  const normalized = normalizeInput(input);
  const {
    acceptableGap,
    baseline,
    days,
    denominators,
    maxGeneratedStates,
    memberIds,
    modeledMemberIndexes,
    unknownRouteEdgeKeys,
    unmodeledMemberIds,
    visits,
  } = normalized;
  const assumptions = [
    "Hard Constraint를 만족하는 일정만 비교",
    "응답 근거가 있는 참여자만 동일 가중치로 비교",
    "동일 Hard Constraint의 개인 최적 효용을 1로 정규화한 뒤 최저 만족도, Nash 후생, leximin 보강 순으로 최대화",
    "동률이면 기존 일정 변경량과 정적 이동시간을 최소화",
    "방문 시작 시각은 허용된 모든 정수 분을 탐색",
    "최적성 비교와 가지치기 상한은 정수·유리수 교차곱으로 계산",
    "이동 Hard Constraint는 경로별 보수적 상한, 이동시간 동률 비교는 명목값을 사용",
    "이동시간은 입력된 정적 행렬이며 시간대별 교통 변화는 경로 상한 근거에 반영되어야 함",
  ];
  const preferenceDataStatus = modeledMemberIndexes.length === memberIds.length
    ? "modeled" as const
    : modeledMemberIndexes.length
      ? "partial" as const
      : "insufficient" as const;
  const firstDay = days[0];
  const emptyState = {
    dayIndex: 0,
    currentMinute: firstDay.startMinute,
    currentNodeId: anchorNodeId(firstDay.startAnchor),
    visitedMask: 0n,
    utilityTotals: memberIds.map(() => 0),
    totalTravelMinutes: 0,
    assignments: [],
  };
  const initialUpper = fractionalUtilityUpperBound(emptyState, days, visits, memberIds, denominators, modeledMemberIndexes);
  const initial: SearchState = {
    ...emptyState,
    upperMinimumSatisfaction: initialUpper[0] ?? ZERO_RATIONAL,
  };
  const frontier = binaryHeap<SearchState>((left, right) => {
    const minimum = compareRational(left.upperMinimumSatisfaction, right.upperMinimumSatisfaction);
    if (minimum !== 0) return minimum > 0;
    if (left.assignments.length !== right.assignments.length) return left.assignments.length > right.assignments.length;
    return compareText(
      canonicalAssignmentSignature(left.assignments),
      canonicalAssignmentSignature(right.assignments),
    ) < 0;
  });
  let best: FinalCandidate | undefined;
  let expandedStates = 0;
  let generatedStates = 0;
  let prunedStates = 0;
  let peakFrontierStates = 0;
  let generationLimitReached = false;
  let generationLimitUpperBound: RationalValue | undefined;
  const labelsByStateKey = new Map<string, SearchState[]>();
  const activeFrontierStates = new Set<SearchState>();
  const enqueue = (candidate: SearchState, omittedBranchUpper = candidate.upperMinimumSatisfaction) => {
    if (generatedStates >= maxGeneratedStates) {
      generationLimitReached = true;
      if (!generationLimitUpperBound
        || compareRational(omittedBranchUpper, generationLimitUpperBound) > 0) {
        generationLimitUpperBound = omittedBranchUpper;
      }
      return;
    }
    generatedStates += 1;
    const key = searchStateLabelKey(candidate);
    const labels = labelsByStateKey.get(key) ?? [];
    if (labels.some((label) => dominatesSearchState(label, candidate, baseline, days))) {
      prunedStates += 1;
      return;
    }
    const survivors = labels.filter((label) => {
      if (!dominatesSearchState(candidate, label, baseline, days)) return true;
      if (activeFrontierStates.delete(label)) prunedStates += 1;
      return false;
    });
    labelsByStateKey.set(key, [...survivors, candidate]);
    activeFrontierStates.add(candidate);
    frontier.push(candidate);
    peakFrontierStates = Math.max(peakFrontierStates, frontier.size);
  };
  enqueue(initial);

  while (frontier.size && expandedStates < input.maxExpandedStates) {
    const state = frontier.pop() as SearchState;
    if (!activeFrontierStates.delete(state)) continue;
    if (!upperBoundCanImprove(state, best, denominators, modeledMemberIndexes)) {
      prunedStates += 1;
      continue;
    }
    expandedStates += 1;
    const day = days[state.dayIndex];
    const finish = nextDayState(input, state, days, visits, memberIds, denominators, modeledMemberIndexes);
    if (finish?.final) {
      if (allMandatoryVisited(finish.state.visitedMask, visits)) {
        const candidate = { state: finish.state, objective: buildObjective(finish.state, memberIds, denominators, modeledMemberIndexes, baseline, days) };
        if (betterCandidate(candidate, best, denominators, modeledMemberIndexes)) best = candidate;
      }
    } else if (finish) {
      enqueue(finish.state, state.upperMinimumSatisfaction);
    }

    visits.forEach((visit, visitIndex) => {
      if (generationLimitReached) return;
      if (hasBit(state.visitedMask, visitIndex)) return;
      const travel = readTravelMinutes(input, state.currentNodeId, visit.nodeId);
      if (travel === undefined) return;
      const arrivalMinute = state.currentMinute + travel.upper;
      const starts = candidateStarts(day, visit, arrivalMinute);
      starts.forEach((startMinute) => {
        if (generationLimitReached) return;
        const endMinute = startMinute + visit.durationMinutes;
        const visitedMask = setBit(state.visitedMask, visitIndex);
        const utilityTotals = memberIds.map((memberId, memberIndex) => (
          state.utilityTotals[memberIndex] + visit.utilityPointsByMember[memberId]
        ));
        const order = state.assignments.filter((assignment) => assignment.dayId === day.id).length;
        const nextBase = {
          ...state,
          currentMinute: endMinute,
          currentNodeId: visit.nodeId,
          visitedMask,
          utilityTotals,
          totalTravelMinutes: state.totalTravelMinutes + travel.nominal,
          assignments: [...state.assignments, {
            visitId: visit.id,
            dayId: day.id,
            date: day.date,
            startMinute,
            endMinute,
            order,
          }],
        };
        const upper = fractionalUtilityUpperBound(nextBase, days, visits, memberIds, denominators, modeledMemberIndexes);
        const boundedState = {
          ...nextBase,
          upperMinimumSatisfaction: upper[0] ?? ZERO_RATIONAL,
        };
        if (!upperBoundCanImprove(boundedState, best, denominators, modeledMemberIndexes)) {
          prunedStates += 1;
          return;
        }
        enqueue(boundedState, state.upperMinimumSatisfaction);
      });
    });
  }

  while (frontier.size && !activeFrontierStates.has(frontier.peek() as SearchState)) frontier.pop();
  const knownRouteSearchExact = activeFrontierStates.size === 0 && !generationLimitReached;
  const expandedLimitReached = activeFrontierStates.size > 0
    && expandedStates >= input.maxExpandedStates;
  const frontierUpper = frontier.peek()?.upperMinimumSatisfaction;
  const bestMinimumFraction = best
    ? satisfactionFractions(best.state.utilityTotals, denominators, modeledMemberIndexes)[0] ?? ZERO_RATIONAL
    : undefined;
  const knownRouteUpper = knownRouteSearchExact
    ? bestMinimumFraction
    : bestMinimumFraction && frontierUpper
      ? compareRational(bestMinimumFraction, frontierUpper) >= 0 ? bestMinimumFraction : frontierUpper
      : bestMinimumFraction ?? frontierUpper;
  const boundedKnownRouteUpper = generationLimitUpperBound && knownRouteUpper
    ? compareRational(generationLimitUpperBound, knownRouteUpper) >= 0
      ? generationLimitUpperBound
      : knownRouteUpper
    : generationLimitUpperBound ?? knownRouteUpper;

  // unknown을 이동 불가로 본 보수 탐색에서 해가 없으면, unknown을 0분으로 본
  // 낙관 문제도 확인한다. 낙관 문제마저 exact infeasible일 때만 실제 infeasible이다.
  let infeasibleEvenWithOptimisticUnknown = false;
  if (!best && unknownRouteEdgeKeys.length) {
    const optimisticEdges = { ...input.routeEdgesByKey };
    unknownRouteEdgeKeys.forEach((key) => {
      optimisticEdges[key] = { status: "available", durationMinutes: 0, upperDurationMinutes: 0 };
    });
    const optimistic = optimizeGroupItinerary({
      ...input,
      routeEdgesByKey: optimisticEdges,
      idealUtilityPointsByMember: undefined,
    });
    infeasibleEvenWithOptimisticUnknown = optimistic.certificate.exact
      && optimistic.certificate.status === "infeasible";
  }
  const exact = infeasibleEvenWithOptimisticUnknown
    || (knownRouteSearchExact && unknownRouteEdgeKeys.length === 0);
  // unknown 경로가 있으면 개인 ideal도 같은 완전한 경로 모델에서 증명됐는지
  // 확인할 수 없으므로 normalized upper/gap을 인증하지 않는다.
  const upperBoundFraction = unknownRouteEdgeKeys.length ? undefined : boundedKnownRouteUpper;
  const gapFraction = bestMinimumFraction && upperBoundFraction
    ? subtractRational(upperBoundFraction, bestMinimumFraction)
    : undefined;
  const bestMinimum = bestMinimumFraction ? rationalToNumber(bestMinimumFraction) : undefined;
  const upperBound = upperBoundFraction ? rationalToNumber(upperBoundFraction) : undefined;
  const gap = gapFraction ? rationalToNumber(gapFraction) : undefined;
  const gapWithinTarget = gapFraction !== undefined
    ? compareRational(gapFraction, finiteDecimalToRational(acceptableGap)) <= 0
    : undefined;
  const status: ItineraryOptimizationCertificate["status"] = best
    ? exact
      ? "optimal"
      : "feasible"
    : infeasibleEvenWithOptimisticUnknown || (knownRouteSearchExact && unknownRouteEdgeKeys.length === 0)
      ? "infeasible"
      : unknownRouteEdgeKeys.length
        ? "insufficient-data"
        : "unknown";
  const selectedIds = new Set(best?.state.assignments.map((assignment) => assignment.visitId) ?? []);
  return {
    assignments: best?.state.assignments ?? [],
    unselectedVisitIds: visits.filter((visit) => !selectedIds.has(visit.id)).map((visit) => visit.id),
    objective: best?.objective,
    certificate: {
      status,
      exact,
      gapScope: exact
        ? "full-objective"
        : best && modeledMemberIndexes.length && unknownRouteEdgeKeys.length === 0
          ? "minimum-satisfaction"
          : "none",
      preferenceDataStatus,
      expandedStates,
      generatedStates,
      prunedStates,
      frontierStates: activeFrontierStates.size,
      peakFrontierStates,
      computationLimitReached: generationLimitReached
        || expandedLimitReached,
      bestMinimumSatisfaction: bestMinimum,
      minimumSatisfactionUpperBound: upperBound,
      absoluteMinimumSatisfactionGap: gap,
      ...(bestMinimumFraction ? { bestMinimumSatisfactionFraction: rationalCertificate(bestMinimumFraction) } : {}),
      ...(upperBoundFraction ? { minimumSatisfactionUpperBoundFraction: rationalCertificate(upperBoundFraction) } : {}),
      ...(gapFraction ? { absoluteMinimumSatisfactionGapFraction: rationalCertificate(gapFraction) } : {}),
      ...(gapWithinTarget === undefined ? {} : { minimumSatisfactionGapWithinTarget: gapWithinTarget }),
      modeledMemberIds: modeledMemberIndexes.map((index) => memberIds[index]),
      unmodeledMemberIds,
      assumptions: unknownRouteEdgeKeys.length
        ? [
            ...assumptions,
            `경로 상태 unknown 또는 누락 ${unknownRouteEdgeKeys.length}건은 보수 해에서 사용하지 않음`,
            "미확인 경로가 있으면 개인 최적 효용의 동일 모델 증명을 확인할 수 없어 normalized gap을 제공하지 않음",
            ...(generationLimitReached ? [`생성 label 상한 ${maxGeneratedStates}건에 도달해 탐색을 중단`] : []),
            ...(expandedLimitReached ? [`확장 상태 상한 ${input.maxExpandedStates}건에 도달해 탐색을 중단`] : []),
          ]
        : generationLimitReached
          ? [
              ...assumptions,
              `생성 label 상한 ${maxGeneratedStates}건에 도달해 탐색을 중단`,
              ...(expandedLimitReached ? [`확장 상태 상한 ${input.maxExpandedStates}건에 도달해 탐색을 중단`] : []),
            ]
          : expandedLimitReached
            ? [...assumptions, `확장 상태 상한 ${input.maxExpandedStates}건에 도달해 탐색을 중단`]
            : assumptions,
    },
  };
}

/**
 * 같은 Hard Constraint에서 참여자별 단독 최적 효용을 먼저 정확히 계산한다.
 * 한 명이라도 탐색이 중단되면 해당 값을 그룹 정규화 근거로 사용하지 않는다.
 */
export function calculateExactIndividualIdealUtilityPoints(
  input: Omit<ItineraryOptimizerInput, "idealUtilityPointsByMember">,
): IndividualIdealUtilityResult {
  const idealUtilityPointsByMember: Partial<Record<EntityId, number>> = {};
  const zeroUtilityMemberIds: EntityId[] = [];
  const unavailableMemberIds: EntityId[] = [];
  const certificatesByMember: Record<EntityId, ItineraryOptimizationCertificate> = {};
  [...input.members].sort((left, right) => compareText(left.id, right.id)).forEach((member) => {
    const maximumCandidatePoints = input.visits.reduce((sum, visit) => sum + visit.utilityPointsByMember[member.id], 0);
    if (maximumCandidatePoints <= 0) {
      zeroUtilityMemberIds.push(member.id);
      return;
    }
    const singleMemberVisits = input.visits.map((visit) => ({
      ...visit,
      utilityPointsByMember: { [member.id]: visit.utilityPointsByMember[member.id] },
    }));
    const result = optimizeGroupItinerary({
      ...input,
      members: [{ id: member.id }],
      visits: singleMemberVisits,
      idealUtilityPointsByMember: { [member.id]: maximumCandidatePoints },
      acceptableMinimumUtilityGap: 0,
    });
    certificatesByMember[member.id] = result.certificate;
    if (!result.certificate.exact || result.certificate.status !== "optimal") {
      unavailableMemberIds.push(member.id);
      return;
    }
    const selected = new Set(result.assignments.map((assignment) => assignment.visitId));
    const idealPoints = singleMemberVisits.reduce((sum, visit) => (
      selected.has(visit.id) ? sum + visit.utilityPointsByMember[member.id] : sum
    ), 0);
    if (idealPoints > 0) idealUtilityPointsByMember[member.id] = idealPoints;
  });
  return {
    idealUtilityPointsByMember,
    exact: unavailableMemberIds.length === 0,
    zeroUtilityMemberIds,
    unavailableMemberIds,
    certificatesByMember,
  };
}
