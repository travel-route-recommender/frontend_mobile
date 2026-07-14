import type { EntityId, Place, UserPreferenceResult } from "../../../domain";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { deriveGroupPlanningProfile, diagnoseGroupPreferences, isSupportedPreferenceResult } from "../../../duri/group-preferences";
import { getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime } from "../../../utils/schedule";
import { DURI_ANALYSIS_VERSION } from "../constants";
import type { DuriAnalysisAvailability, DuriAnalysisSnapshot } from "../types";

function clonePlace(place: Place): Place {
  const coordinates = place as Place & { latitude?: number; longitude?: number };
  return {
    ...place,
    tags: [...place.tags],
    ...(Number.isFinite(coordinates.latitude) ? { latitude: coordinates.latitude } : {}),
    ...(Number.isFinite(coordinates.longitude) ? { longitude: coordinates.longitude } : {}),
  } as Place;
}

export function createDuriAnalysisSnapshot(input: DuriAnalysisInput): DuriAnalysisSnapshot {
  const memberIds = [...new Set(input.trip.members.map((member) => member.userId))].sort();
  const relevantPlaceIds = [...new Set([
    ...input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []),
    ...input.candidates.map((candidate) => candidate.placeId),
  ])].sort();
  const preferenceResults = Object.fromEntries(memberIds.flatMap((userId) => {
    const result = input.preferenceResults[userId];
    return isSupportedPreferenceResult(result, userId)
      ? [[userId, {
          ...result,
          answers: { ...result.answers },
          traits: [...result.traits],
          preferredTags: [...result.preferredTags],
        } satisfies UserPreferenceResult]]
      : [];
  }));
  const trip = {
    ...input.trip,
    members: [...input.trip.members]
      .map((member) => ({ ...member }))
      .sort((left, right) => left.userId.localeCompare(right.userId)),
  };
  const groupPreferenceDiagnosis = diagnoseGroupPreferences(trip, preferenceResults);
  const groupPlanningProfile = deriveGroupPlanningProfile(groupPreferenceDiagnosis);
  return {
    trip,
    members: [...input.members]
      .filter((member) => memberIds.includes(member.id))
      .map((member) => ({ ...member }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    placesById: Object.fromEntries(relevantPlaceIds.flatMap((placeId) => input.placesById[placeId]
      ? [[placeId, clonePlace(input.placesById[placeId])]]
      : [])),
    candidates: [...input.candidates]
      .map((candidate) => ({ ...candidate, addedByUserIds: [...new Set(candidate.addedByUserIds)].sort() }))
      .sort((left, right) => left.placeId.localeCompare(right.placeId)),
    itinerary: sortItineraryItemsByDateAndTime(input.itinerary.map((item) => ({
      ...item,
      preferredByUserIds: [...new Set(item.preferredByUserIds)].sort(),
    }))),
    preferenceResults,
    groupPreferenceDiagnosis,
    groupPlanningProfile,
  };
}

function canonicalPlace(place: Place) {
  const coordinates = place as Place & { latitude?: number; longitude?: number };
  return {
    id: place.id,
    regionId: place.regionId,
    name: place.name,
    category: place.category,
    tags: [...place.tags].sort(),
    address: place.address,
    latitude: Number.isFinite(coordinates.latitude) ? coordinates.latitude : null,
    longitude: Number.isFinite(coordinates.longitude) ? coordinates.longitude : null,
  };
}

export function canonicalizeDuriInput(snapshot: DuriAnalysisSnapshot) {
  const diagnosis = snapshot.groupPreferenceDiagnosis;
  return {
    algorithmVersion: DURI_ANALYSIS_VERSION,
    trip: {
      id: snapshot.trip.id,
      regionId: snapshot.trip.regionId,
      startDate: snapshot.trip.startDate,
      endDate: snapshot.trip.endDate,
      status: snapshot.trip.status,
      transport: snapshot.trip.transport,
      budgetLevel: snapshot.trip.budgetLevel,
      intensity: snapshot.trip.intensity,
      members: snapshot.trip.members.map((member) => ({ userId: member.userId, role: member.role })),
    },
    itinerary: snapshot.itinerary.map((item, order) => ({
      id: item.id,
      tripId: item.tripId,
      placeId: item.placeId ?? null,
      date: item.date,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
      order,
      itemType: item.itemType,
      preferredByUserIds: [...item.preferredByUserIds].sort(),
    })),
    candidates: snapshot.candidates.map((candidate) => ({
      tripId: candidate.tripId,
      placeId: candidate.placeId,
      addedByUserIds: [...candidate.addedByUserIds].sort(),
      recommendedByDuri: candidate.recommendedByDuri,
    })),
    places: Object.values(snapshot.placesById).map(canonicalPlace).sort((left, right) => left.id.localeCompare(right.id)),
    preferences: Object.values(snapshot.preferenceResults).map((result) => ({
      userId: result.userId,
      version: result.version,
      answers: Object.fromEntries(Object.entries(result.answers).sort(([left], [right]) => left.localeCompare(right))),
      preferredTags: [...result.preferredTags].sort(),
      profileType: result.profileType,
    })).sort((left, right) => left.userId.localeCompare(right.userId)),
    groupDiagnosis: {
      coverage: diagnosis.coverage,
      completedMemberIds: [...diagnosis.completedMemberIds].sort(),
      pendingMemberIds: [...diagnosis.pendingMemberIds].sort(),
      invalidMemberIds: [...diagnosis.invalidMemberIds].sort(),
      dimensions: Object.fromEntries(Object.entries(diagnosis.dimensions).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, {
        responses: [...value.responses].sort((left, right) => left.userId.localeCompare(right.userId)),
        status: value.status ?? null,
        min: value.min ?? null,
        max: value.max ?? null,
        average: value.average ?? null,
        spread: value.spread ?? null,
      }])),
      commonPreferredTags: [...diagnosis.commonPreferredTags].sort(),
      sharedPreferredTags: [...diagnosis.sharedPreferredTags].sort(),
    },
    groupProfile: snapshot.groupPlanningProfile,
  };
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createDuriInputFingerprint(input: DuriAnalysisInput | DuriAnalysisSnapshot) {
  const snapshot = "groupPlanningProfile" in input && input.groupPlanningProfile && input.groupPreferenceDiagnosis
    ? input as DuriAnalysisSnapshot
    : createDuriAnalysisSnapshot(input);
  return `duri-${DURI_ANALYSIS_VERSION}-${stableHash(JSON.stringify(canonicalizeDuriInput(snapshot)))}`;
}

export function isSuggestionStale(baseFingerprint: string, currentFingerprint: string) {
  return baseFingerprint !== currentFingerprint;
}

export function getDuriAnalysisAvailability({
  input,
  engineAvailable,
}: {
  input?: DuriAnalysisInput;
  engineAvailable: boolean;
}): DuriAnalysisAvailability {
  if (!engineAvailable) return { status: "engine-unavailable", canAnalyze: false, readOnly: false, message: "서버 두리 계약이 확인되지 않아 분석을 실행할 수 없어요." };
  if (!input || !getTripDates(input.trip.startDate, input.trip.endDate).length) return { status: "invalid-trip-dates", canAnalyze: false, readOnly: false, message: "여행 날짜를 확인한 뒤 분석해 주세요." };
  if (!input.itinerary.length) return { status: "no-itinerary", canAnalyze: false, readOnly: input.trip.status === "completed", message: "일정을 하나 이상 추가하면 두리가 점검할 수 있어요." };
  const tripDates = new Set(getTripDates(input.trip.startDate, input.trip.endDate));
  const ids = new Set<EntityId>();
  const invalid = input.itinerary.some((item) => {
    const duplicate = ids.has(item.id);
    ids.add(item.id);
    return duplicate || item.tripId !== input.trip.id || !tripDates.has(item.date) || !isValidScheduleRange(item) || (item.placeId ? !input.placesById[item.placeId] : false);
  });
  if (invalid) return { status: "invalid-itinerary", canAnalyze: false, readOnly: input.trip.status === "completed", message: "날짜·시간·장소 정보가 올바르지 않은 일정이 있어 먼저 확인해 주세요." };
  if (input.itinerary.length === 1) return { status: "limited", canAnalyze: true, readOnly: input.trip.status === "completed", message: "일정 1개를 제한적으로 분석해요. 비교와 균형은 일정이 더 필요해요." };
  return { status: "available", canAnalyze: true, readOnly: input.trip.status === "completed", message: "현재 일정 구조와 응답된 그룹 성향을 분석할 수 있어요." };
}
