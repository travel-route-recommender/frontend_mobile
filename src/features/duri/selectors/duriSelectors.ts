import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { deriveGroupPlanningProfile, diagnoseGroupPreferences } from "../../../duri/group-preferences";
import type { DuriInputSource } from "../types";

export function buildDuriAnalysisInputFromState(
  state: DuriInputSource,
  tripId: string,
): DuriAnalysisInput | undefined {
  const trip = state.tripsById[tripId];
  if (!trip) return undefined;
  const groupPreferenceDiagnosis = diagnoseGroupPreferences(trip, state.preferenceResultsByUserId);
  return {
    trip,
    members: trip.members.flatMap((member) => state.usersById[member.userId] ? [state.usersById[member.userId]] : []),
    placesById: state.placesById,
    candidates: state.candidatesByTripId[tripId] ?? [],
    itinerary: state.itineraryByTripId[tripId] ?? [],
    preferenceResults: state.preferenceResultsByUserId,
    groupPreferenceDiagnosis,
    groupPlanningProfile: deriveGroupPlanningProfile(groupPreferenceDiagnosis),
  };
}
