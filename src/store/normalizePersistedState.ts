import type {
  EntityId,
  ItineraryItem,
  ItineraryItemType,
  PersonalPreferenceAnswers,
  Place,
  PreferenceDimension,
  PreferenceScore,
  Region,
  TripBudgetLevel,
  TripCandidate,
  TripIntensity,
  TripMember,
  TripRoom,
  TripStatus,
  TripTransport,
  User,
  UserPreferenceResult,
} from "../domain";
import { normalizeLegacyPreferenceResult } from "../duri/preferences";
import { createDemoData, type DuriDomainState } from "../data/mock/demoData";
import { getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime } from "../utils/schedule";

export const CURRENT_SCHEMA_VERSION = 4;

type UnknownRecord = Record<string, unknown>;

const preferenceDimensions: PreferenceDimension[] = ["pace", "budget", "mobility", "activity", "mealStyle", "planningStyle"];
const tripStatuses: TripStatus[] = ["planning", "drafting", "confirmed", "completed"];
const tripTransports: TripTransport[] = ["public", "car", "walking"];
const tripBudgets: TripBudgetLevel[] = ["budget", "standard", "premium"];
const tripIntensities: TripIntensity[] = ["relaxed", "balanced", "packed"];
const itineraryTypes: ItineraryItemType[] = ["place", "meal", "rest", "transport"];

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asFiniteNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const asOptionalFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
const unique = <Value,>(values: Value[]) => [...new Set(values)];
const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const sourceRecord = (value: unknown, fallback: UnknownRecord) => value === undefined ? fallback : isRecord(value) ? value : {};

function normalizeUsers(value: unknown, fallback: Record<EntityId, User>) {
  const source = sourceRecord(value, fallback);
  return Object.fromEntries(Object.entries(source).flatMap(([key, entry]) => {
    if (!isRecord(entry)) return [];
    const id = asString(entry.id, key);
    if (!id) return [];
    const name = asString(entry.name, "참여자");
    const profileImageUrl = asString(entry.profileImageUrl);
    const user: User = {
      id,
      name,
      initial: asString(entry.initial, name.trim().slice(0, 1) || "?"),
      ...(profileImageUrl ? { profileImageUrl } : {}),
    };
    return [[id, user]];
  }));
}

function normalizeRegions(value: unknown, fallback: Record<EntityId, Region>) {
  const source = sourceRecord(value, fallback);
  return Object.fromEntries(Object.entries(source).flatMap(([key, entry]) => {
    if (!isRecord(entry)) return [];
    const id = asString(entry.id, key);
    if (!id) return [];
    const region: Region = {
      id,
      name: asString(entry.name, "지역 미정"),
      shortName: asString(entry.shortName, asString(entry.name, "지역")),
      description: asString(entry.description),
      spots: Math.max(0, asFiniteNumber(entry.spots)),
      weather: asString(entry.weather),
      imageUrl: asString(entry.imageUrl),
    };
    return [[id, region]];
  }));
}

function normalizePlaces(value: unknown, fallback: Record<EntityId, Place>) {
  const source = sourceRecord(value, fallback);
  return Object.fromEntries(Object.entries(source).flatMap(([key, entry]) => {
    if (!isRecord(entry)) return [];
    const id = asString(entry.id, key);
    if (!id) return [];
    const fallbackPlace = fallback[id];
    const latitude = asOptionalFiniteNumber(entry.latitude) ?? fallbackPlace?.latitude;
    const longitude = asOptionalFiniteNumber(entry.longitude) ?? fallbackPlace?.longitude;
    const place: Place = {
      id,
      regionId: asString(entry.regionId),
      name: asString(entry.name, "이름 없는 장소"),
      category: asString(entry.category, "기타"),
      tags: unique(asStringArray(entry.tags)),
      rating: Math.max(0, asFiniteNumber(entry.rating)),
      distanceLabel: asString(entry.distanceLabel),
      imageUrl: asString(entry.imageUrl),
      address: asString(entry.address),
      summary: asString(entry.summary),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(isDateOnly(asString(entry.eventStartDate)) ? { eventStartDate: asString(entry.eventStartDate) } : {}),
      ...(isDateOnly(asString(entry.eventEndDate)) ? { eventEndDate: asString(entry.eventEndDate) } : {}),
    };
    return [[id, place]];
  }));
}

function normalizeMembers(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<EntityId>();
  return value.flatMap((entry): TripMember[] => {
    if (!isRecord(entry)) return [];
    const userId = asString(entry.userId);
    if (!userId || seen.has(userId)) return [];
    seen.add(userId);
    return [{
      userId,
      role: entry.role === "owner" ? "owner" : "member",
    }];
  });
}

function normalizeTrips(value: unknown, fallback: Record<EntityId, TripRoom>) {
  const source = sourceRecord(value, fallback);
  return Object.fromEntries(Object.entries(source).flatMap(([key, entry]) => {
    if (!isRecord(entry)) return [];
    const id = asString(entry.id, key);
    if (!id) return [];
    const status = tripStatuses.includes(entry.status as TripStatus) ? entry.status as TripStatus : "planning";
    const transport = tripTransports.includes(entry.transport as TripTransport) ? entry.transport as TripTransport : "public";
    const budgetLevel = tripBudgets.includes(entry.budgetLevel as TripBudgetLevel) ? entry.budgetLevel as TripBudgetLevel : "standard";
    const intensity = tripIntensities.includes(entry.intensity as TripIntensity) ? entry.intensity as TripIntensity : "balanced";
    const trip: TripRoom = {
      id,
      title: asString(entry.title, "이름 없는 여행방"),
      regionId: asString(entry.regionId),
      startDate: asString(entry.startDate),
      endDate: asString(entry.endDate),
      status,
      transport,
      budgetLevel,
      intensity,
      members: normalizeMembers(entry.members),
    };
    return [[id, trip]];
  }));
}

function normalizeTripOrder(value: unknown, tripsById: Record<EntityId, TripRoom>) {
  const listed = unique(asStringArray(value)).filter((tripId) => Boolean(tripsById[tripId]));
  return [...listed, ...Object.keys(tripsById).filter((tripId) => !listed.includes(tripId))];
}

function normalizeCandidates(
  value: unknown,
  fallback: Record<EntityId, TripCandidate[]>,
  tripsById: Record<EntityId, TripRoom>,
  placesById: Record<EntityId, Place>,
) {
  const source = sourceRecord(value, fallback);
  return Object.fromEntries(Object.keys(tripsById).map((tripId) => {
    const trip = tripsById[tripId];
    const memberIds = new Set(trip.members.map((member) => member.userId));
    const entries = Array.isArray(source[tripId]) ? source[tripId] : [];
    const byPlaceId = new Map<EntityId, TripCandidate>();
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const placeId = asString(entry.placeId);
      if (!placeId || !placesById[placeId]) continue;
      const addedByUserIds = unique(asStringArray(entry.addedByUserIds)).filter((userId) => memberIds.has(userId));
      const existing = byPlaceId.get(placeId);
      byPlaceId.set(placeId, {
        tripId,
        placeId,
        addedByUserIds: unique([...(existing?.addedByUserIds ?? []), ...addedByUserIds]),
        recommendedByDuri: Boolean(existing?.recommendedByDuri || entry.recommendedByDuri),
        ...(asString(entry.addedAt) ? { addedAt: asString(entry.addedAt) } : existing?.addedAt ? { addedAt: existing.addedAt } : {}),
      });
    }
    return [tripId, [...byPlaceId.values()]];
  }));
}

function normalizeItinerary(
  value: unknown,
  fallback: Record<EntityId, ItineraryItem[]>,
  tripsById: Record<EntityId, TripRoom>,
  usersById: Record<EntityId, User>,
  placesById: Record<EntityId, Place>,
) {
  const source = sourceRecord(value, fallback);
  return Object.fromEntries(Object.keys(tripsById).map((tripId) => {
    const trip = tripsById[tripId];
    const validDates = new Set(getTripDates(trip.startDate, trip.endDate));
    const memberIds = new Set(trip.members.map((member) => member.userId));
    const entries = Array.isArray(source[tripId]) ? source[tripId] : [];
    const seen = new Set<EntityId>();
    const items = entries.flatMap((entry): ItineraryItem[] => {
      if (!isRecord(entry)) return [];
      const id = asString(entry.id);
      const placeId = asString(entry.placeId);
      const itemType = itineraryTypes.includes(entry.itemType as ItineraryItemType) ? entry.itemType as ItineraryItemType : "place";
      const item: ItineraryItem = {
        id,
        tripId,
        ...(placeId ? { placeId } : {}),
        date: asString(entry.date),
        startTime: asString(entry.startTime),
        durationMinutes: asFiniteNumber(entry.durationMinutes),
        itemType,
        preferredByUserIds: unique(asStringArray(entry.preferredByUserIds)).filter(
          (userId) => Boolean(usersById[userId]) && memberIds.has(userId),
        ),
        ...(asString(entry.note) ? { note: asString(entry.note) } : {}),
      };
      if (!id || seen.has(id) || !validDates.has(item.date) || !isValidScheduleRange(item)) return [];
      if (itemType === "place" && (!placeId || !placesById[placeId])) return [];
      if (placeId && !placesById[placeId]) return [];
      seen.add(id);
      return [item];
    });
    return [tripId, sortItineraryItemsByDateAndTime(items)];
  }));
}

function normalizePreferenceAnswers(value: unknown): PersonalPreferenceAnswers | undefined {
  if (!isRecord(value)) return undefined;
  const entries = preferenceDimensions.map((dimension) => value[dimension]);
  if (!entries.every((score) => score === 0 || score === 1 || score === 2)) return undefined;
  return Object.fromEntries(preferenceDimensions.map((dimension) => [dimension, value[dimension] as PreferenceScore])) as PersonalPreferenceAnswers;
}

function normalizePreferenceResults(value: unknown, usersById: Record<EntityId, User>) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, entry]) => {
    if (!usersById[userId] || !isRecord(entry)) return [];
    const answers = normalizePreferenceAnswers(entry.answers);
    const traits = asStringArray(entry.traits);
    const preferredTags = asStringArray(entry.preferredTags);
    const hasLegacySignal = typeof entry.profileType === "string" || traits.length > 0 || preferredTags.length > 0;
    if (!answers && !hasLegacySignal) return [];
    if (answers) {
      const result: UserPreferenceResult = {
        userId,
        answers,
        profileType: asString(entry.profileType, "균형형 여행자"),
        traits,
        preferredTags,
        completedAt: asString(entry.completedAt),
        // 명시적인 미지원 버전은 selector에서 invalid로 판정할 수 있도록 보존한다.
        version: typeof entry.version === "number" ? entry.version : 0,
      };
      return [[userId, result]];
    }
    const safeValue: Partial<UserPreferenceResult> = {
      ...(typeof entry.profileType === "string" ? { profileType: entry.profileType } : {}),
      traits,
      preferredTags,
      ...(typeof entry.completedAt === "string" ? { completedAt: entry.completedAt } : {}),
      ...(typeof entry.version === "number" ? { version: entry.version } : {}),
    };
    return [[userId, normalizeLegacyPreferenceResult(userId, safeValue)]];
  }));
}

function normalizeSavedPlaces(value: unknown, usersById: Record<EntityId, User>, placesById: Record<EntityId, Place>) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.keys(usersById).map((userId) => [
    userId,
    unique(asStringArray(value[userId])).filter((placeId) => Boolean(placesById[placeId])),
  ]));
}

export function normalizePersistedState(value: unknown, fallback = createDemoData()): DuriDomainState {
  const source = isRecord(value) ? value : {};
  const usersById = normalizeUsers(source.usersById, fallback.usersById);
  const regionsById = normalizeRegions(source.regionsById, fallback.regionsById);
  const placesById = normalizePlaces(source.placesById, fallback.placesById);
  const tripsById = normalizeTrips(source.tripsById, fallback.tripsById);
  const tripOrder = normalizeTripOrder(source.tripOrder ?? fallback.tripOrder, tripsById);
  const currentUserCandidate = typeof source.currentUserId === "string" ? source.currentUserId : fallback.currentUserId;
  const currentUserId = usersById[currentUserCandidate] ? currentUserCandidate : "";
  const candidatesByTripId = normalizeCandidates(source.candidatesByTripId, fallback.candidatesByTripId, tripsById, placesById);
  const itineraryByTripId = normalizeItinerary(source.itineraryByTripId, fallback.itineraryByTripId, tripsById, usersById, placesById);
  const preferenceResultsByUserId = normalizePreferenceResults(
    source.preferenceResultsByUserId === undefined ? fallback.preferenceResultsByUserId : source.preferenceResultsByUserId,
    usersById,
  );
  const savedPlaceIdsByUserId = normalizeSavedPlaces(
    source.savedPlaceIdsByUserId === undefined ? fallback.savedPlaceIdsByUserId : source.savedPlaceIdsByUserId,
    usersById,
    placesById,
  );
  const activeCandidate = typeof source.activeTripId === "string" ? source.activeTripId : fallback.activeTripId;
  const activeTripId = tripsById[activeCandidate]?.members.some((member) => member.userId === currentUserId)
    ? activeCandidate
    : "";

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    currentUserId,
    activeTripId,
    usersById,
    regionsById,
    placesById,
    tripsById,
    tripOrder,
    candidatesByTripId,
    itineraryByTripId,
    preferenceResultsByUserId,
    analysesByTripId: {},
    savedPlaceIdsByUserId,
  };
}
