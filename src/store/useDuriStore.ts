import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  EntityId,
  DuriPreferenceSignals,
  ItineraryItem,
  PersonalPreferenceAnswers,
  Place,
  TripEndCondition,
  TripLocation,
  TripRoom,
  TripTransport,
  User,
  UserPreferenceResult,
} from "../domain";
import {
  calculatePersonalPreferenceResult,
} from "../duri/preferences";
import {
  applySuggestionChanges,
  buildItineraryFingerprint,
} from "../duri/duri-suggestions";
import type {
  DuriSuggestion,
  SuggestionApplyResult,
} from "../duri/duri-suggestions";
import { createDemoData, type DuriDomainState } from "../data/mock/demoData";
import { CURRENT_SCHEMA_VERSION, normalizePersistedState } from "./normalizePersistedState";
import { createPersistHydrationStore } from "./createPersistHydrationStore";
import { DEFAULT_PLACE_DURATION_MINUTES } from "../data/workspaceSchedule";
import { isValidISODate } from "../utils/formatters";
import { createUniqueEntityId } from "../utils/ids";
import { toggleUniqueId } from "../utils/entityRelations";
import {
  findOverlappingItem,
  getTripDates,
  isValidClockTime,
  isValidScheduleRange,
  sortItineraryItemsByDateAndTime,
} from "../utils/schedule";
import {
  addDaysToDate,
  moveTripDaySchedule,
  moveTripDayScheduleToIndex,
  moveItemToIndexWithinDate,
  moveItemWithinDate,
  remapScheduleToTripDateRange,
  removeTripDayFromSchedule,
} from "../features/workspace/logic/workspaceDateTime";
import type { ItineraryMoveDirection, TripDayMoveDirection } from "../features/workspace/types";
import type {
  ApplyDuriSuggestionAtomicallyInput,
  ApplyDuriSuggestionAtomicallyResult,
} from "../features/duri/types";
import { prepareDuriSuggestionAtomicApply } from "../features/duri/validation/atomicSuggestionApply";
import {
  analyzeTripEndCondition,
  resolveTripEndConditionAddition,
  resolveTripEndConditionMutation,
} from "../features/workspace/logic/tripEndCondition";
import {
  prepareLockedDocumentScheduleAddition,
  type LockedDocumentScheduleDraft,
  type LockedDocumentScheduleAdditionFailure,
} from "../features/trip-documents/logic/documentSchedule";

export type AddPlaceToItineraryInput = {
  tripId: EntityId;
  placeId: EntityId;
  date: string;
  startTime?: string;
  durationMinutes?: number;
  preferredByUserIds?: EntityId[];
  note?: string;
  lockedForDuri?: boolean;
};

export type CreateTripInput = {
  title?: string;
  regionId: EntityId;
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  transport: TripTransport;
  accommodationLocation: TripLocation | null;
  endCondition: TripEndCondition | null;
  companionType?: string | null;
  expectedMemberCount?: number | null;
  invitedUserIds: EntityId[];
};

export type UpdateTripPlanningFactsInput = {
  transport: TripTransport;
  accommodationLocation: TripLocation | null;
  endCondition: TripEndCondition | null;
};

export type TripPlanningFactsMutationResult =
  | "success"
  | "success-adjusted"
  | "invalid-trip"
  | "trip-not-editable"
  | "not-member"
  | "invalid-facts"
  | "end-condition";

export type AccessMode = "member" | "guest";

function isValidCreateTripEndCondition(condition: TripEndCondition | null) {
  if (!condition) return true;
  return ["train", "intercity-bus", "rental-car-return", "other"].includes(condition.type)
    && Boolean(condition.location.name.trim())
    && condition.location.name.trim().length <= 100
    && isValidClockTime(condition.deadline)
    && Number.isInteger(condition.travelMinutes)
    && condition.travelMinutes >= 0
    && condition.travelMinutes <= 1440
    && Number.isInteger(condition.serviceBufferMinutes)
    && condition.serviceBufferMinutes >= 0
    && condition.serviceBufferMinutes <= 720
    && (condition.note?.trim().length ?? 0) <= 300;
}

export type UpdateCurrentUserProfileInput = {
  name: string;
  avatar: string;
};

export type AddCandidatePlaceResult =
  | "added"
  | "already-exists"
  | "invalid-trip"
  | "invalid-place"
  | "trip-not-editable"
  | "not-member";

export type RemoveCandidatePlaceResult =
  | "removed-candidate"
  | "removed-contribution"
  | "invalid-trip"
  | "invalid-candidate"
  | "trip-not-editable"
  | "not-member"
  | "not-added-by-user"
  | "scheduled";

export type ItineraryMutationResult =
  | "success"
  | "success-adjusted"
  | "invalid-trip"
  | "trip-not-editable"
  | "not-member"
  | "invalid-item"
  | "invalid-place"
  | "invalid-candidate"
  | "duplicate-place"
  | "invalid-date"
  | "invalid-time"
  | "overlap"
  | "boundary"
  | "invalid-attachment"
  | "protected-item"
  | "end-condition";

export type AddPlaceToItineraryResult = Exclude<ItineraryMutationResult, "success-adjusted">;

export type AddPlaceToItineraryWithIdResult =
  | { status: "success"; itemId: EntityId }
  | { status: Exclude<AddPlaceToItineraryResult, "success"> };

export type AddLockedDocumentScheduleResult =
  | { status: "success"; itemId: EntityId; created: boolean }
  | { status: LockedDocumentScheduleAdditionFailure };

export type ExtendTripEndDateResult =
  | { status: "success"; endDate: string }
  | { status: "invalid-trip" | "trip-not-editable" | "not-member" | "invalid-date" };

export type TripDateMutationResult =
  | {
      status: "success";
      startDate: string;
      endDate: string;
      selectedDate: string;
      removedItineraryCount: number;
      endConditionAdjusted: boolean;
    }
  | {
      status:
        | "invalid-trip"
        | "trip-not-editable"
        | "not-member"
        | "invalid-date"
        | "invalid-itinerary"
        | "boundary"
        | "end-condition";
    };

type DuriActions = {
  accessMode: AccessMode;
  setAccessMode: (mode: AccessMode) => void;
  upsertUser: (user: User) => void;
  upsertPlaces: (places: Place[]) => void;
  setCurrentUser: (userId: EntityId | null) => void;
  addTripMember: (tripId: EntityId, userId: EntityId) => void;
  updateCurrentUserProfile: (input: UpdateCurrentUserProfileInput) => boolean;
  createTrip: (input: CreateTripInput) => EntityId;
  updateTripPlanningFacts: (
    tripId: EntityId,
    input: UpdateTripPlanningFactsInput,
    automaticShiftProtectedItemIds?: readonly EntityId[],
  ) => TripPlanningFactsMutationResult;
  extendTripByOneDay: (tripId: EntityId) => ExtendTripEndDateResult;
  removeTripDay: (tripId: EntityId, date: string, automaticShiftProtectedItemIds?: readonly EntityId[]) => TripDateMutationResult;
  moveTripDay: (tripId: EntityId, date: string, direction: TripDayMoveDirection, automaticShiftProtectedItemIds?: readonly EntityId[]) => TripDateMutationResult;
  moveTripDayToIndex: (tripId: EntityId, date: string, targetIndex: number, automaticShiftProtectedItemIds?: readonly EntityId[]) => TripDateMutationResult;
  updateTripDateRange: (
    tripId: EntityId,
    startDate: string,
    endDate: string,
    selectedDate?: string,
    automaticShiftProtectedItemIds?: readonly EntityId[],
  ) => TripDateMutationResult;
  setActiveTrip: (tripId: EntityId) => void;
  clearActiveTrip: () => void;
  toggleSavedPlace: (placeId: EntityId, userId?: EntityId) => void;
  addCandidatePlace: (tripId: EntityId, placeId: EntityId, addedByUserId?: EntityId) => AddCandidatePlaceResult;
  removeCandidatePlace: (tripId: EntityId, placeId: EntityId) => RemoveCandidatePlaceResult;
  addPlaceToItinerary: (input: AddPlaceToItineraryInput) => AddPlaceToItineraryResult;
  addPlaceToItineraryWithId: (input: AddPlaceToItineraryInput) => AddPlaceToItineraryWithIdResult;
  addLockedDocumentSchedule: (tripId: EntityId, draft: LockedDocumentScheduleDraft) => AddLockedDocumentScheduleResult;
  removeItineraryItem: (tripId: EntityId, itineraryItemId: EntityId) => ItineraryMutationResult;
  updateItineraryItem: (
    tripId: EntityId,
    itineraryItemId: EntityId,
    patch: Partial<Omit<ItineraryItem, "id" | "tripId">>,
    automaticShiftProtectedItemIds?: readonly EntityId[],
  ) => ItineraryMutationResult;
  moveItineraryItem: (tripId: EntityId, itineraryItemId: EntityId, direction: ItineraryMoveDirection, automaticShiftProtectedItemIds?: readonly EntityId[]) => ItineraryMutationResult;
  moveItineraryItemToIndex: (tripId: EntityId, itineraryItemId: EntityId, targetIndex: number, automaticShiftProtectedItemIds?: readonly EntityId[]) => ItineraryMutationResult;
  reorderItinerary: (tripId: EntityId, orderedItemIds: EntityId[]) => ItineraryMutationResult;
  applyDuriSuggestion: (tripId: EntityId, suggestion: DuriSuggestion) => SuggestionApplyResult;
  applyDuriSuggestionAtomically: (input: ApplyDuriSuggestionAtomicallyInput) => ApplyDuriSuggestionAtomicallyResult;
  savePersonalPreferenceResult: (
    userId: EntityId | undefined,
    answers: PersonalPreferenceAnswers,
    completedAt?: string,
    detailedSignals?: DuriPreferenceSignals,
  ) => UserPreferenceResult | undefined;
  resetDemoData: () => void;
};

export type DuriState = DuriDomainState & DuriActions;

export const useDuriHydrationState = createPersistHydrationStore();

function createItineraryId(state: DuriDomainState, tripId: EntityId, placeId: EntityId, date: string) {
  const prefix = `itinerary-${tripId}-${date}-${placeId}`;
  const existingIds = new Set((state.itineraryByTripId[tripId] ?? []).map((item) => item.id));
  return createUniqueEntityId(prefix, existingIds);
}

function createDocumentItineraryId(state: DuriDomainState, tripId: EntityId, date: string) {
  const prefix = `itinerary-${tripId}-${date}-document`;
  const existingIds = new Set((state.itineraryByTripId[tripId] ?? []).map((item) => item.id));
  return createUniqueEntityId(prefix, existingIds);
}

function violatesTripEndCondition(trip: TripRoom, itinerary: readonly ItineraryItem[]) {
  const assessment = analyzeTripEndCondition(trip, itinerary);
  return assessment.status === "infeasible" || assessment.status === "invalid";
}

export const useDuriStore = create<DuriState>()(
  persist(
    (set, get) => ({
      ...createDemoData(),
      // 실제 인증 계약 전까지 guest 둘러보기 UX에만 사용하는 비영속 접근 모드다.
      accessMode: "member",
      setAccessMode: (mode) => set({ accessMode: mode }),
      upsertUser: (user) => set((state) => ({
        usersById: { ...state.usersById, [user.id]: user },
        savedPlaceIdsByUserId: state.savedPlaceIdsByUserId[user.id]
          ? state.savedPlaceIdsByUserId
          : { ...state.savedPlaceIdsByUserId, [user.id]: [] },
      })),
      upsertPlaces: (places) => set((state) => {
        const nextPlaces = places.filter((place) => place.id);
        if (!nextPlaces.length) return state;
        return {
          placesById: {
            ...state.placesById,
            ...Object.fromEntries(nextPlaces.map((place) => [place.id, place])),
          },
        };
      }),
      setCurrentUser: (userId) => set((state) => {
        if (!userId) return { currentUserId: "", activeTripId: "" };
        if (!state.usersById[userId]) return state;
        const currentTrip = state.tripsById[state.activeTripId];
        const activeTripId = currentTrip?.members.some((member) => member.userId === userId)
          ? currentTrip.id
          : state.tripOrder.find((tripId) => state.tripsById[tripId]?.members.some((member) => member.userId === userId)) ?? "";
        return { currentUserId: userId, activeTripId };
      }),
      addTripMember: (tripId, userId) => set((state) => {
        const trip = state.tripsById[tripId];
        if (!trip || !state.usersById[userId] || trip.members.some((member) => member.userId === userId)) return state;
        return {
          tripsById: {
            ...state.tripsById,
            [tripId]: {
              ...trip,
              members: [...trip.members, { userId, role: "member" }],
            },
          },
          activeTripId: state.currentUserId === userId ? tripId : state.activeTripId,
        };
      }),
      updateCurrentUserProfile: (input) => {
        let updated = false;
        set((state) => {
          const currentUser = state.usersById[state.currentUserId];
          const name = input.name.trim();
          const avatar = input.avatar.trim();
          if (!currentUser || name.length < 2 || !avatar) return state;
          updated = true;
          return {
            usersById: {
              ...state.usersById,
              [currentUser.id]: {
                ...currentUser,
                name,
                initial: avatar,
              },
            },
          };
        });
        return updated;
      },
      createTrip: (input) => {
        let createdTripId: EntityId = "";

        set((state) => {
          const region = state.regionsById[input.regionId];
          const currentUser = state.usersById[state.currentUserId];
          const normalizedTitle = input.title?.trim() ?? "";
          const hasValidDateState = input.dateUndecided
            ? input.startDate === null && input.endDate === null
            : isValidISODate(input.startDate) && isValidISODate(input.endDate) && input.endDate >= input.startDate;
          const hasValidFacts = (input.transport === "car" || input.transport === "public")
            && (!input.accommodationLocation || (Boolean(input.accommodationLocation.name.trim()) && input.accommodationLocation.name.trim().length <= 100))
            && (!input.dateUndecided || input.endCondition === null)
            && isValidCreateTripEndCondition(input.endCondition);

          if (!region || !currentUser || !hasValidDateState || !hasValidFacts || !normalizedTitle || normalizedTitle.length > 40) return state;

          createdTripId = createUniqueEntityId("trip", Object.keys(state.tripsById));
          const invitedUserIds = [...new Set(input.invitedUserIds)].filter(
            (userId) => userId !== state.currentUserId && Boolean(state.usersById[userId]),
          );
          const memberUserIds = [state.currentUserId, ...invitedUserIds];
          const trip: TripRoom = {
            id: createdTripId,
            title: normalizedTitle || `${region.name} 여행`,
            regionId: region.id,
            startDate: input.startDate,
            endDate: input.endDate,
            dateUndecided: input.dateUndecided,
            status: "planning",
            transport: input.transport,
            accommodationLocation: input.accommodationLocation
              ? { ...input.accommodationLocation, name: input.accommodationLocation.name.trim() }
              : null,
            endCondition: input.endCondition
              ? {
                  type: input.endCondition.type,
                  location: { ...input.endCondition.location, name: input.endCondition.location.name.trim() },
                  deadline: input.endCondition.deadline,
                  travelMinutes: input.endCondition.travelMinutes,
                  serviceBufferMinutes: input.endCondition.serviceBufferMinutes,
                  ...(input.endCondition.note?.trim() ? { note: input.endCondition.note.trim() } : {}),
                }
              : null,
            companionType: input.companionType ?? null,
            expectedMemberCount: input.expectedMemberCount ?? memberUserIds.length,
            members: memberUserIds.map((userId, index) => ({
              userId,
              role: index === 0 ? "owner" : "member",
            })),
          };

          return {
            activeTripId: trip.id,
            tripsById: { ...state.tripsById, [trip.id]: trip },
            tripOrder: state.tripOrder.includes(trip.id) ? state.tripOrder : [...state.tripOrder, trip.id],
            candidatesByTripId: { ...state.candidatesByTripId, [trip.id]: [] },
            itineraryByTripId: { ...state.itineraryByTripId, [trip.id]: [] },
          };
        });

        return createdTripId;
      },
      updateTripPlanningFacts: (tripId, input, automaticShiftProtectedItemIds) => {
        let result: TripPlanningFactsMutationResult = "invalid-trip";
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const accommodationName = input.accommodationLocation?.name.trim() ?? "";
          if (
            (input.transport !== "car" && input.transport !== "public")
            || (input.accommodationLocation !== null && (!accommodationName || accommodationName.length > 100))
            || !isValidCreateTripEndCondition(input.endCondition)
          ) {
            result = "invalid-facts";
            return state;
          }
          const nextTrip: TripRoom = {
            ...trip,
            transport: input.transport,
            accommodationLocation: input.accommodationLocation
              ? { ...input.accommodationLocation, name: accommodationName }
              : null,
            endCondition: input.endCondition
              ? {
                  ...input.endCondition,
                  location: { ...input.endCondition.location, name: input.endCondition.location.name.trim() },
                  ...(input.endCondition.note?.trim() ? { note: input.endCondition.note.trim() } : { note: undefined }),
                }
              : null,
          };
          const endResolution = resolveTripEndConditionMutation(nextTrip, state.itineraryByTripId[tripId] ?? [], automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = "end-condition";
            return state;
          }
          result = endResolution.status === "adjusted" ? "success-adjusted" : "success";
          return {
            tripsById: { ...state.tripsById, [tripId]: nextTrip },
            ...(endResolution.status === "adjusted"
              ? { itineraryByTripId: { ...state.itineraryByTripId, [tripId]: endResolution.itinerary } }
              : {}),
          };
        });
        return result;
      },
      extendTripByOneDay: (tripId) => {
        let result: ExtendTripEndDateResult = { status: "invalid-trip" };
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = { status: "trip-not-editable" };
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = { status: "not-member" };
            return state;
          }
          const endDate = addDaysToDate(trip.endDate, 1);
          if (!endDate) {
            result = { status: "invalid-date" };
            return state;
          }
          result = { status: "success", endDate };
          return {
            tripsById: {
              ...state.tripsById,
              [tripId]: { ...trip, endDate },
            },
          };
        });
        return result;
      },
      removeTripDay: (tripId, date, automaticShiftProtectedItemIds) => {
        let result: TripDateMutationResult = { status: "invalid-trip" };
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = { status: "trip-not-editable" };
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = { status: "not-member" };
            return state;
          }
          const change = removeTripDayFromSchedule(
            state.itineraryByTripId[tripId] ?? [],
            trip.startDate,
            trip.endDate,
            date,
          );
          if (change.status !== "success") {
            result = { status: change.status };
            return state;
          }
          const nextTrip = { ...trip, startDate: change.startDate, endDate: change.endDate, dateUndecided: false };
          const endResolution = resolveTripEndConditionMutation(nextTrip, change.items, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = { status: "end-condition" };
            return state;
          }
          result = {
            status: "success",
            startDate: change.startDate,
            endDate: change.endDate,
            selectedDate: change.selectedDate,
            removedItineraryCount: change.removedItineraryCount,
            endConditionAdjusted: endResolution.status === "adjusted",
          };
          return {
            tripsById: {
              ...state.tripsById,
              [tripId]: nextTrip,
            },
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });
        return result;
      },
      moveTripDay: (tripId, date, direction, automaticShiftProtectedItemIds) => {
        let result: TripDateMutationResult = { status: "invalid-trip" };
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = { status: "trip-not-editable" };
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = { status: "not-member" };
            return state;
          }
          const change = moveTripDaySchedule(
            state.itineraryByTripId[tripId] ?? [],
            trip.startDate,
            trip.endDate,
            date,
            direction,
          );
          if (change.status !== "success") {
            result = { status: change.status };
            return state;
          }
          const endResolution = resolveTripEndConditionMutation(trip, change.items, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = { status: "end-condition" };
            return state;
          }
          result = {
            status: "success",
            startDate: change.startDate,
            endDate: change.endDate,
            selectedDate: change.selectedDate,
            removedItineraryCount: 0,
            endConditionAdjusted: endResolution.status === "adjusted",
          };
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });
        return result;
      },
      moveTripDayToIndex: (tripId, date, targetIndex, automaticShiftProtectedItemIds) => {
        let result: TripDateMutationResult = { status: "invalid-trip" };
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = { status: "trip-not-editable" };
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = { status: "not-member" };
            return state;
          }
          const change = moveTripDayScheduleToIndex(
            state.itineraryByTripId[tripId] ?? [],
            trip.startDate,
            trip.endDate,
            date,
            targetIndex,
          );
          if (change.status !== "success") {
            result = { status: change.status };
            return state;
          }
          const endResolution = resolveTripEndConditionMutation(trip, change.items, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = { status: "end-condition" };
            return state;
          }
          result = {
            status: "success",
            startDate: change.startDate,
            endDate: change.endDate,
            selectedDate: change.selectedDate,
            removedItineraryCount: 0,
            endConditionAdjusted: endResolution.status === "adjusted",
          };
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });
        return result;
      },
      updateTripDateRange: (tripId, startDate, endDate, selectedDate, automaticShiftProtectedItemIds) => {
        let result: TripDateMutationResult = { status: "invalid-trip" };
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = { status: "trip-not-editable" };
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = { status: "not-member" };
            return state;
          }
          const change = remapScheduleToTripDateRange(
            state.itineraryByTripId[tripId] ?? [],
            trip.startDate,
            trip.endDate,
            startDate,
            endDate,
            selectedDate,
          );
          if (change.status !== "success") {
            result = { status: change.status };
            return state;
          }
          const nextTrip = { ...trip, startDate: change.startDate, endDate: change.endDate, dateUndecided: false };
          const endResolution = resolveTripEndConditionMutation(nextTrip, change.items, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = { status: "end-condition" };
            return state;
          }
          result = {
            status: "success",
            startDate: change.startDate,
            endDate: change.endDate,
            selectedDate: change.selectedDate,
            removedItineraryCount: change.removedItineraryCount,
            endConditionAdjusted: endResolution.status === "adjusted",
          };
          return {
            tripsById: {
              ...state.tripsById,
              [tripId]: nextTrip,
            },
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });
        return result;
      },
      setActiveTrip: (tripId) =>
        set((state) => {
          const trip = state.tripsById[tripId];
          return trip?.members.some((member) => member.userId === state.currentUserId)
            ? { activeTripId: tripId }
            : state;
        }),
      clearActiveTrip: () => set({ activeTripId: "" }),
      toggleSavedPlace: (placeId, userId) =>
        set((state) => {
          const targetUserId = userId ?? state.currentUserId;
          if (!state.placesById[placeId] || !state.usersById[targetUserId]) return state;
          const storedIds = state.savedPlaceIdsByUserId?.[targetUserId];
          const currentIds = Array.isArray(storedIds) ? storedIds : [];
          const nextIds = toggleUniqueId(currentIds, placeId);
          return {
            savedPlaceIdsByUserId: {
              ...state.savedPlaceIdsByUserId,
              [targetUserId]: nextIds,
            },
          };
        }),
      addCandidatePlace: (tripId, placeId, addedByUserId) => {
        let result: AddCandidatePlaceResult = "invalid-trip";

        set((state) => {
          const trip = state.tripsById[tripId];
          const targetUserId = addedByUserId ?? state.currentUserId;
          if (!trip) return state;
          if (!state.placesById[placeId]) {
            result = "invalid-place";
            return state;
          }
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          const currentUserIsMember = trip.members.some((member) => member.userId === state.currentUserId);
          const targetUserIsMember = trip.members.some((member) => member.userId === targetUserId);
          if (!currentUserIsMember || !targetUserIsMember) {
            result = "not-member";
            return state;
          }

          const current = state.candidatesByTripId[tripId] ?? [];
          const existing = current.find((candidate) => candidate.placeId === placeId);
          if (existing?.addedByUserIds.includes(targetUserId)) {
            result = "already-exists";
            return state;
          }

          result = "added";
          const next = existing
            ? current.map((candidate) =>
                candidate.placeId === placeId
                  ? { ...candidate, addedByUserIds: [...candidate.addedByUserIds, targetUserId] }
                  : candidate,
              )
            : [
                ...current,
                {
                  tripId,
                  placeId,
                  addedByUserIds: [targetUserId],
                  recommendedByDuri: false,
                  addedAt: new Date().toISOString().slice(0, 10),
                },
              ];
          return { candidatesByTripId: { ...state.candidatesByTripId, [tripId]: next } };
        });

        return result;
      },
      removeCandidatePlace: (tripId, placeId) => {
        let result: RemoveCandidatePlaceResult = "invalid-trip";
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const current = state.candidatesByTripId[tripId] ?? [];
          const candidate = current.find((item) => item.placeId === placeId);
          if (!candidate) {
            result = "invalid-candidate";
            return state;
          }
          if ((state.itineraryByTripId[tripId] ?? []).some((item) => item.placeId === placeId)) {
            result = "scheduled";
            return state;
          }
          if (!candidate.addedByUserIds.includes(state.currentUserId)) {
            result = "not-added-by-user";
            return state;
          }
          const remainingUserIds = candidate.addedByUserIds.filter((userId) => userId !== state.currentUserId);
          result = remainingUserIds.length ? "removed-contribution" : "removed-candidate";
          return {
            candidatesByTripId: {
              ...state.candidatesByTripId,
              [tripId]: remainingUserIds.length
                ? current.map((item) => item.placeId === placeId ? { ...item, addedByUserIds: remainingUserIds } : item)
                : current.filter((item) => item.placeId !== placeId),
            },
          };
        });
        return result;
      },
      addPlaceToItinerary: (input) => {
        let result: AddPlaceToItineraryResult = "invalid-trip";

        set((state) => {
          const trip = state.tripsById[input.tripId];
          const place = state.placesById[input.placeId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          if (!place) {
            result = "invalid-place";
            return state;
          }
          const candidate = (state.candidatesByTripId[input.tripId] ?? []).find((item) => item.placeId === input.placeId);
          if (!candidate) {
            result = "invalid-candidate";
            return state;
          }
          if (!getTripDates(trip.startDate, trip.endDate).includes(input.date)) {
            result = "invalid-date";
            return state;
          }

          const current = state.itineraryByTripId[input.tripId] ?? [];
          const nextItem: ItineraryItem = {
            id: createItineraryId(state, input.tripId, input.placeId, input.date),
            tripId: input.tripId,
            placeId: input.placeId,
            date: input.date,
            startTime: input.startTime ?? "08:00",
            durationMinutes: input.durationMinutes ?? DEFAULT_PLACE_DURATION_MINUTES,
            itemType: "place",
            preferredByUserIds: input.preferredByUserIds ?? candidate?.addedByUserIds ?? [state.currentUserId],
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
            ...(input.lockedForDuri ? { lockedForDuri: true } : {}),
          };
          if (!isValidScheduleRange(nextItem)) {
            result = "invalid-time";
            return state;
          }
          if (findOverlappingItem(current, nextItem)) {
            result = "overlap";
            return state;
          }
          const nextItinerary = sortItineraryItemsByDateAndTime([...current, nextItem]);
          const endResolution = resolveTripEndConditionAddition(trip, nextItinerary, input.date);
          if (endResolution.status === "rejected") {
            result = "end-condition";
            return state;
          }

          result = "success";
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [input.tripId]: endResolution.itinerary,
            },
          };
        });

        return result;
      },
      addPlaceToItineraryWithId: (input) => {
        const previousIds = new Set((get().itineraryByTripId[input.tripId] ?? []).map((item) => item.id));
        const status = get().addPlaceToItinerary(input);
        if (status !== "success") return { status };
        const item = (get().itineraryByTripId[input.tripId] ?? []).find((entry) => !previousIds.has(entry.id));
        return item ? { status, itemId: item.id } : { status: "invalid-item" };
      },
      addLockedDocumentSchedule: (tripId, draft) => {
        let result: AddLockedDocumentScheduleResult = { status: "invalid-trip" };
        set((state) => {
          const prepared = prepareLockedDocumentScheduleAddition({
            trip: state.tripsById[tripId],
            currentUserId: state.currentUserId,
            itinerary: state.itineraryByTripId[tripId] ?? [],
            placesById: state.placesById,
            draft,
            createItemId: () => createDocumentItineraryId(state, tripId, draft.date),
          });
          if (!prepared.ok) {
            result = { status: prepared.status };
            return state;
          }
          result = { status: "success", itemId: prepared.itemId, created: prepared.created };
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: prepared.itinerary,
            },
          };
        });
        return result;
      },
      removeItineraryItem: (tripId, itineraryItemId) => {
        let result: ItineraryMutationResult = "invalid-trip";

        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const current = state.itineraryByTripId[tripId] ?? [];
          if (!current.some((item) => item.id === itineraryItemId)) {
            result = "invalid-item";
            return state;
          }
          result = "success";
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: current.filter((item) => item.id !== itineraryItemId),
            },
          };
        });

        return result;
      },
      updateItineraryItem: (tripId, itineraryItemId, patch, automaticShiftProtectedItemIds) => {
        let result: ItineraryMutationResult = "invalid-trip";

        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const current = state.itineraryByTripId[tripId] ?? [];
          const item = current.find((entry) => entry.id === itineraryItemId);
          if (!item) {
            result = "invalid-item";
            return state;
          }
          const nextItem = { ...item, ...patch };
          if (nextItem.placeId && !state.placesById[nextItem.placeId]) {
            result = "invalid-place";
            return state;
          }
          if (!getTripDates(trip.startDate, trip.endDate).includes(nextItem.date)) {
            result = "invalid-date";
            return state;
          }
          if (!isValidScheduleRange(nextItem)) {
            result = "invalid-time";
            return state;
          }
          if (findOverlappingItem(current, nextItem, itineraryItemId)) {
            result = "overlap";
            return state;
          }
          const nextItinerary = sortItineraryItemsByDateAndTime(
            current.map((entry) => (entry.id === itineraryItemId ? nextItem : entry)),
          );
          const endResolution = resolveTripEndConditionMutation(trip, nextItinerary, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = "end-condition";
            return state;
          }
          result = endResolution.status === "adjusted" ? "success-adjusted" : "success";
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });

        return result;
      },
      moveItineraryItem: (tripId, itineraryItemId, direction, automaticShiftProtectedItemIds) => {
        let result: ItineraryMutationResult = "invalid-trip";
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const moved = moveItemWithinDate(state.itineraryByTripId[tripId] ?? [], itineraryItemId, direction);
          if (moved.status !== "success") {
            result = moved.status === "boundary" ? "boundary" : moved.status;
            return state;
          }
          const endResolution = resolveTripEndConditionMutation(trip, moved.items, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = "end-condition";
            return state;
          }
          result = endResolution.status === "adjusted" ? "success-adjusted" : "success";
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });
        return result;
      },
      moveItineraryItemToIndex: (tripId, itineraryItemId, targetIndex, automaticShiftProtectedItemIds) => {
        let result: ItineraryMutationResult = "invalid-trip";
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const moved = moveItemToIndexWithinDate(
            state.itineraryByTripId[tripId] ?? [],
            itineraryItemId,
            targetIndex,
          );
          if (moved.status !== "success") {
            result = moved.status === "boundary" ? "boundary" : moved.status;
            return state;
          }
          const endResolution = resolveTripEndConditionMutation(trip, moved.items, automaticShiftProtectedItemIds);
          if (endResolution.status === "rejected") {
            result = "end-condition";
            return state;
          }
          result = endResolution.status === "adjusted" ? "success-adjusted" : "success";
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: endResolution.itinerary,
            },
          };
        });
        return result;
      },
      reorderItinerary: (tripId, orderedItemIds) => {
        let result: ItineraryMutationResult = "invalid-trip";
        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip) return state;
          if (trip.status === "completed") {
            result = "trip-not-editable";
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = "not-member";
            return state;
          }
          const current = state.itineraryByTripId[tripId] ?? [];
          const uniqueIds = [...new Set(orderedItemIds)];
          if (uniqueIds.length !== current.length || uniqueIds.some((id) => !current.some((item) => item.id === id))) {
            result = "invalid-item";
            return state;
          }
          const byId = Object.fromEntries(current.map((item) => [item.id, item]));
          result = "success";
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: uniqueIds.map((id) => byId[id]),
            },
          };
        });
        return result;
      },
      applyDuriSuggestion: (tripId, suggestion) => {
        let result: SuggestionApplyResult = {
          status: "invalid",
          changedItemIds: [],
          message: "제안에 필요한 일정이나 장소를 찾을 수 없어요.",
        };

        set((state) => {
          const trip = state.tripsById[tripId];
          if (!trip || suggestion.tripId !== tripId) return state;
          if (trip.status === "completed") {
            result = {
              status: "trip-not-editable",
              changedItemIds: [],
              message: "완료된 여행방에서는 일정을 수정할 수 없어요.",
            };
            return state;
          }
          if (!trip.members.some((member) => member.userId === state.currentUserId)) {
            result = {
              status: "not-authorized",
              changedItemIds: [],
              message: "이 여행방의 일정을 수정할 권한이 없어요.",
            };
            return state;
          }
          const current = state.itineraryByTripId[tripId] ?? [];
          if (buildItineraryFingerprint(current) !== suggestion.itineraryFingerprint) {
            result = {
              status: "stale",
              changedItemIds: [],
              message: "일정이 변경되어 두리 제안을 다시 계산했어요.",
            };
            return state;
          }
          const changed = applySuggestionChanges(current, suggestion, {
            tripId,
            tripDates: getTripDates(trip.startDate, trip.endDate),
            placesById: state.placesById,
            candidates: state.candidatesByTripId[tripId] ?? [],
          });
          if (!changed.success) {
            result = {
              status: changed.status === "conflict" ? "conflict" : "invalid",
              changedItemIds: [],
              message: changed.status === "conflict"
                ? "현재 일정과 시간이 겹쳐 제안을 적용하지 못했어요."
                : "제안에 필요한 일정이나 장소를 찾을 수 없어요.",
            };
            return state;
          }
          if (violatesTripEndCondition(trip, changed.itinerary)) {
            result = {
              status: "invalid",
              changedItemIds: [],
              message: "제안 적용 후 여행 종료 조건을 지킬 수 없어 일정은 변경하지 않았어요.",
            };
            return state;
          }
          result = {
            status: "applied",
            changedItemIds: changed.changedItemIds,
            affectedDate: changed.affectedDate,
          };
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [tripId]: changed.itinerary,
            },
          };
        });

        return result;
      },
      applyDuriSuggestionAtomically: (input) => {
        let result: ApplyDuriSuggestionAtomicallyResult = {
          ok: false,
          reason: "unknown",
          message: "제안을 적용하지 못했어요. 일정은 변경되지 않았어요.",
        };
        set((state) => {
          const prepared = prepareDuriSuggestionAtomicApply(state, input, new Date().toISOString());
          if (!prepared.ok) {
            result = prepared.result;
            return state;
          }
          result = { ok: true, receipt: prepared.receipt };
          return {
            itineraryByTripId: {
              ...state.itineraryByTripId,
              [input.tripId]: prepared.nextItinerary,
            },
          };
        });
        return result;
      },
      savePersonalPreferenceResult: (userId, answers, completedAt, detailedSignals) => {
        let saved: UserPreferenceResult | undefined;

        set((state) => {
          const targetUserId = userId ?? state.currentUserId;
          if (targetUserId !== state.currentUserId || !state.usersById[targetUserId]) return state;
          saved = {
            ...calculatePersonalPreferenceResult(targetUserId, answers, completedAt),
            ...(detailedSignals ? { detailedSignals: {
              ...detailedSignals,
              mobilityModes: [...detailedSignals.mobilityModes],
              categoryScores: { ...detailedSignals.categoryScores },
              budgetRanking: [...detailedSignals.budgetRanking],
            } } : {}),
          };
          return {
            preferenceResultsByUserId: {
              ...state.preferenceResultsByUserId,
              [targetUserId]: saved,
            },
          };
        });

        return saved;
      },
      resetDemoData: () => set({ ...createDemoData(), accessMode: "member" }),
    }),
    {
      name: "duri-mobile-store",
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      version: CURRENT_SCHEMA_VERSION,
      migrate: (persistedState) => normalizePersistedState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedState(persistedState),
      }),
      onRehydrateStorage: () => {
        useDuriHydrationState.getState().begin();
        return (_hydratedState, error) => {
          if (error) {
            useDuriHydrationState.getState().fail("저장된 여행 정보를 불러오지 못했어요.");
            return;
          }
          useDuriHydrationState.getState().succeed();
        };
      },
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        currentUserId: state.currentUserId,
        activeTripId: state.activeTripId,
        usersById: state.usersById,
        regionsById: state.regionsById,
        placesById: state.placesById,
        tripsById: state.tripsById,
        tripOrder: state.tripOrder,
        candidatesByTripId: state.candidatesByTripId,
        itineraryByTripId: state.itineraryByTripId,
        preferenceResultsByUserId: state.preferenceResultsByUserId,
        savedPlaceIdsByUserId: state.savedPlaceIdsByUserId,
      }),
    },
  ),
);
