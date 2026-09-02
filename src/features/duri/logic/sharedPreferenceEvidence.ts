import type { EntityId } from "../../../domain";
import type {
  DuriAnalysisInput,
  SharedCandidateMemberSignal,
  SharedDuriPreferenceEvidence,
  SharedPreferenceAxisId,
} from "../../../duri/duri-analysis";

export type SharedCandidateSignalConflict = {
  placeId: EntityId;
  mustVisitMemberIds: EntityId[];
  avoidMemberIds: EntityId[];
  internallyContradictoryMemberIds: EntityId[];
};

/** stale/unavailable 파생값은 일정 판단 근거에서 제외한다. */
export function getUsableSharedPreferenceEvidence(
  input: Pick<DuriAnalysisInput, "trip" | "sourceFactsVersion" | "sharedPreferenceEvidence" | "sharedPreferenceEvidenceStatus">,
): SharedDuriPreferenceEvidence | undefined {
  const evidence = input.sharedPreferenceEvidence;
  if (input.sharedPreferenceEvidenceStatus !== "loaded" || !evidence) return undefined;
  if (evidence.roomId !== input.trip.id) return undefined;
  if (input.sourceFactsVersion !== undefined && evidence.factsVersion !== input.sourceFactsVersion) return undefined;
  return evidence;
}

function mergedSignalsForPlace(evidence: SharedDuriPreferenceEvidence, placeId: EntityId) {
  const byUserId = new Map<EntityId, SharedDuriPreferenceEvidence["candidateSignals"][number]["signals"]>();
  evidence.candidateSignals
    .filter((candidate) => candidate.placeId === placeId)
    .flatMap((candidate) => candidate.signals)
    .forEach((signal) => byUserId.set(signal.userId, [...(byUserId.get(signal.userId) ?? []), signal]));
  return [...byUserId.entries()].map(([userId, signals]) => {
    const latestVersion = Math.max(...signals.map((signal) => signal.version));
    const latest = signals.filter((signal) => signal.version === latestVersion);
    return {
      userId,
      // 같은 revision의 중복 행이 모순되면 둘 다 true로 보존하여 conflict
      // 검사에서 빠지지 않게 한다. 더 오래된 revision은 최신 명시값을 덮지 않는다.
      mustVisit: latest.some((signal) => signal.mustVisit === true)
        ? true
        : latest.some((signal) => signal.mustVisit === false) ? false : null,
      avoid: latest.some((signal) => signal.avoid === true)
        ? true
        : latest.some((signal) => signal.avoid === false) ? false : null,
      preferenceStrength: latest.reduce<1 | 2 | 3 | 4 | 5 | null>((maximum, signal) => (
        signal.preferenceStrength !== null && (maximum === null || signal.preferenceStrength > maximum)
          ? signal.preferenceStrength
          : maximum
      ), null),
      version: latestVersion,
      updatedAt: latest.map((signal) => signal.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    };
  }).sort((left, right) => left.userId.localeCompare(right.userId));
}

export function findSharedCandidateSignalConflicts(
  input: Pick<DuriAnalysisInput, "trip" | "sourceFactsVersion" | "sharedPreferenceEvidence" | "sharedPreferenceEvidenceStatus">,
): SharedCandidateSignalConflict[] {
  const evidence = getUsableSharedPreferenceEvidence(input);
  if (!evidence) return [];
  const currentMemberIds = new Set(input.trip.members.map((member) => member.userId));
  const placeIds = [...new Set(evidence.candidateSignals.map((candidate) => candidate.placeId))].sort();
  return placeIds.flatMap((placeId) => {
    // 탈퇴·제거된 사용자의 오래된 signal이 현재 참여자의 must와 충돌해
    // 장소 전체를 보류시키지 않도록 현재 방 구성원만 판단에 사용한다.
    const signals = mergedSignalsForPlace(evidence, placeId)
      .filter((signal) => currentMemberIds.has(signal.userId));
    const mustVisitMemberIds = signals.filter((signal) => signal.mustVisit === true)
      .map((signal) => signal.userId).sort();
    const avoidMemberIds = signals.filter((signal) => signal.avoid === true)
      .map((signal) => signal.userId).sort();
    if (!mustVisitMemberIds.length || !avoidMemberIds.length) return [];
    const avoidSet = new Set(avoidMemberIds);
    return [{
      placeId,
      mustVisitMemberIds,
      avoidMemberIds,
      internallyContradictoryMemberIds: mustVisitMemberIds.filter((memberId) => avoidSet.has(memberId)),
    }];
  });
}

export function getSharedCandidateSignal(
  input: Pick<DuriAnalysisInput, "trip" | "sourceFactsVersion" | "sharedPreferenceEvidence" | "sharedPreferenceEvidenceStatus">,
  placeId: EntityId,
  userId: EntityId,
): SharedCandidateMemberSignal | undefined {
  const evidence = getUsableSharedPreferenceEvidence(input);
  if (!evidence || !input.trip.members.some((member) => member.userId === userId)) return undefined;
  return mergedSignalsForPlace(evidence, placeId).find((signal) => signal.userId === userId);
}

export function getSharedAxisObservations(
  input: Pick<DuriAnalysisInput, "trip" | "sourceFactsVersion" | "sharedPreferenceEvidence" | "sharedPreferenceEvidenceStatus">,
  axisId: SharedPreferenceAxisId,
) {
  const currentMemberIds = new Set(input.trip.members.map((member) => member.userId));
  return (getUsableSharedPreferenceEvidence(input)?.members ?? []).filter((member) => currentMemberIds.has(member.userId)).flatMap((member) => {
    const axis = member.personalityAxes?.[axisId];
    return axis ? [{ userId: member.userId, axis }] : [];
  });
}
