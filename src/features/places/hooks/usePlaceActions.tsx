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
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
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

  const requestCandidate = (placeId: EntityId) => {
    if (sessionKind !== "member" && sessionKind !== "guest") {
      requireMember(() => undefined, "여행 후보 추가");
      return;
    }
    if (!source.placesById[placeId]) { setFeedback({ message: "장소 정보를 찾을 수 없어요." }); return; }
    setSelectedPlaceId(placeId);
  };

  const addToTrip = (tripId: EntityId) => {
    const trip = source.tripsById[tripId];
    const decision = canAddPlaceCandidate({ sessionKind, currentUserId: source.currentUserId, trip, place: selectedPlace, candidates: source.candidatesByTripId[tripId] ?? [], itinerary: source.itineraryByTripId[tripId] ?? [] });
    if (!decision.allowed) { setFeedback({ message: decision.reason }); return; }
    const result = addCandidatePlace(tripId, selectedPlace!.id);
    if (result !== "added") {
      setFeedback({ message: result === "already-exists" ? "이미 이 여행방 후보에 담긴 장소예요." : "이 여행방에는 후보를 담을 수 없어요." });
      return;
    }
    setActiveTrip(tripId);
    setSelectedPlaceId(undefined);
    setFeedback({ message: `${trip!.title} 후보에 담았어요.`, tripId });
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
    getCandidateState: (tripId: EntityId, placeId: EntityId) => selectCandidateStateForPlace(source, tripId, placeId),
  };
}
