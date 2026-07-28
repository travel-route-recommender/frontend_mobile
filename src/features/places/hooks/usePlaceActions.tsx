import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { EntityId } from "../../../domain";
import { useDuriStore } from "../../../store/useDuriStore";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { canAddPlaceCandidate, canSavePlace } from "../logic/placeCapabilities";
import { selectCandidateStateForPlace, selectEligibleTripsForPlaceCandidate } from "../selectors/placeSelectors";
import type { PlaceActionFeedback } from "../types";

export function usePlaceActions() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    activeTripId: state.activeTripId,
    usersById: state.usersById,
    placesById: state.placesById,
    regionsById: state.regionsById,
    tripsById: state.tripsById,
    tripOrder: state.tripOrder,
    savedPlaceIdsByUserId: state.savedPlaceIdsByUserId,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
  })));
  const toggleSavedPlace = useDuriStore((state) => state.toggleSavedPlace);
  const addCandidatePlace = useDuriStore((state) => state.addCandidatePlace);
  const removeCandidatePlace = useDuriStore((state) => state.removeCandidatePlace);
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const clearActiveTrip = useDuriStore((state) => state.clearActiveTrip);
  const [selectedPlaceId, setSelectedPlaceId] = useState<EntityId>();
  const [feedback, setFeedback] = useState<PlaceActionFeedback>();
  const eligibleTrips = useMemo(() => selectEligibleTripsForPlaceCandidate(source), [source]);
  const selectedPlace = selectedPlaceId ? source.placesById[selectedPlaceId] : undefined;

  const toggleSaved = (placeId: EntityId) => {
    const place = source.placesById[placeId];
    const decision = canSavePlace(sessionKind, source.usersById[source.currentUserId], place);
    if (!decision.allowed) {
      requireMember(() => undefined, "장소 저장");
      return;
    }
    const wasSaved = (source.savedPlaceIdsByUserId[source.currentUserId] ?? []).includes(placeId);
    toggleSavedPlace(placeId);
    setFeedback({ message: wasSaved ? "저장을 해제했어요." : "저장한 장소에 추가했어요." });
  };

  const addPlaceToTrip = (placeId: EntityId, tripId: EntityId) => {
    const place = source.placesById[placeId];
    const trip = source.tripsById[tripId];
    const decision = canAddPlaceCandidate({ sessionKind, currentUserId: source.currentUserId, trip, place, candidates: source.candidatesByTripId[tripId] ?? [], itinerary: source.itineraryByTripId[tripId] ?? [] });
    if (!decision.allowed) { setFeedback({ message: decision.reason }); return; }
    const result = addCandidatePlace(tripId, placeId);
    if (result !== "added") {
      setFeedback({ message: result === "already-exists" ? "이미 이 여행방 후보에 담긴 장소예요." : "이 여행방에는 후보를 담을 수 없어요." });
      return;
    }
    setActiveTrip(tripId);
    setSelectedPlaceId(undefined);
    setFeedback({ message: `${trip!.title} 후보에 담았어요.`, tripId });
  };

  const removePlaceFromTrip = (placeId: EntityId, tripId: EntityId) => {
    const trip = source.tripsById[tripId];
    const result = removeCandidatePlace(tripId, placeId);
    if (result === "removed-candidate" || result === "removed-contribution") {
      setFeedback({ message: `${trip?.title ?? "여행방"} 후보에서 뺐어요.`, tripId });
      return;
    }
    const message = result === "scheduled"
      ? "이미 일정에 포함된 장소예요. 일정에서 먼저 제거해 주세요."
      : result === "not-added-by-user"
        ? "내가 담은 후보가 아니라서 바로 뺄 수 없어요."
        : "이 여행방 후보를 해제할 수 없어요.";
    setFeedback({ message });
  };

  const requestCandidate = (placeId: EntityId) => {
    if (sessionKind !== "member" && sessionKind !== "guest") {
      requireMember(() => undefined, "여행 후보 추가");
      return;
    }
    if (!source.placesById[placeId]) { setFeedback({ message: "장소 정보를 찾을 수 없어요." }); return; }
    const activeTrip = source.tripsById[source.activeTripId];
    const canUseActiveTrip = activeTrip && activeTrip.status !== "completed" && activeTrip.members.some((member) => member.userId === source.currentUserId);
    if (canUseActiveTrip) {
      const candidateState = selectCandidateStateForPlace(source, activeTrip.id, placeId);
      if (candidateState === "not-added") {
        addPlaceToTrip(placeId, activeTrip.id);
        return;
      }
      if (candidateState === "candidate") {
        removePlaceFromTrip(placeId, activeTrip.id);
        return;
      }
      setFeedback({ message: "이미 일정에 포함된 장소예요. 일정에서 먼저 제거해 주세요." });
      return;
    }
    setSelectedPlaceId(placeId);
  };

  const addToTrip = (tripId: EntityId) => {
    if (!selectedPlace) { setFeedback({ message: "장소 정보를 찾을 수 없어요." }); return; }
    addPlaceToTrip(selectedPlace.id, tripId);
  };

  return {
    source,
    sessionKind,
    eligibleTrips,
    selectedPlace,
    feedback,
    memberGatePrompt,
    toggleSaved,
    requestCandidate,
    requestMember: (actionLabel: string) => requireMember(() => undefined, actionLabel),
    addToTrip,
    closeCandidatePicker: () => setSelectedPlaceId(undefined),
    clearFeedback: () => setFeedback(undefined),
    setActiveTrip,
    clearActiveTrip,
    getCandidateState: (tripId: EntityId, placeId: EntityId) => selectCandidateStateForPlace(source, tripId, placeId),
  };
}
