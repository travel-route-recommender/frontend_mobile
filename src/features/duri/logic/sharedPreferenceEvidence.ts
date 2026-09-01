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
export function findSharedCandidateSignalConflicts(
  input: Pick<DuriAnalysisInput, "trip" | "sourceFactsVersion" | "sharedPreferenceEvidence" | "sharedPreferenceEvidenceStatus">,
): SharedCandidateSignalConflict[] {
  const evidence = getUsableSharedPreferenceEvidence(input);
  if (!evidence) return [];
  return evidence.candidateSignals.flatMap((candidate) => {
    const mustVisitMemberIds = candidate.signals.filter((signal) => signal.mustVisit === true)
      .map((signal) => signal.userId).sort();
    const avoidMemberIds = candidate.signals.filter((signal) => signal.avoid === true)
      .map((signal) => signal.userId).sort();
    if (!mustVisitMemberIds.length || !avoidMemberIds.length) return [];
    const avoidSet = new Set(avoidMemberIds);
    return [{
      placeId: candidate.placeId,
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
  return getUsableSharedPreferenceEvidence(input)?.candidateSignals
    .find((candidate) => candidate.placeId === placeId)?.signals
    .find((signal) => signal.userId === userId);
}

export function getSharedAxisObservations(
  input: Pick<DuriAnalysisInput, "trip" | "sourceFactsVersion" | "sharedPreferenceEvidence" | "sharedPreferenceEvidenceStatus">,
  axisId: SharedPreferenceAxisId,
) {
  return (getUsableSharedPreferenceEvidence(input)?.members ?? []).flatMap((member) => {
    const axis = member.personalityAxes?.[axisId];
    return axis ? [{ userId: member.userId, axis }] : [];
  });
}
