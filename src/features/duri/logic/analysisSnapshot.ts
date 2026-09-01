import type { EntityId, Place, UserPreferenceResult } from "../../../domain";
import type { DuriAnalysisInput, SharedDuriPreferenceEvidence } from "../../../duri/duri-analysis";
import { deriveGroupPlanningProfile, diagnoseGroupPreferences, isSupportedPreferenceResult } from "../../../duri/group-preferences";
import { getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime } from "../../../utils/schedule";
import { DURI_ANALYSIS_VERSION } from "../constants";
import type { DuriAnalysisAvailability, DuriAnalysisSnapshot } from "../types";

function clonePlace(place: Place): Place {
  const coordinates = place as Place & { latitude?: number; longitude?: number };
  return {
    ...place,
    tags: [...place.tags],
    infoItems: place.infoItems?.map((item) => ({ ...item })),
    classification: place.classification ? { ...place.classification } : undefined,
    ...(Number.isFinite(coordinates.latitude) ? { latitude: coordinates.latitude } : {}),
    ...(Number.isFinite(coordinates.longitude) ? { longitude: coordinates.longitude } : {}),
  } as Place;
}

function cloneSharedPreferenceEvidence(evidence: SharedDuriPreferenceEvidence): SharedDuriPreferenceEvidence {
  return {
    ...evidence,
    members: evidence.members.map((member) => ({
      ...member,
      travelType: member.travelType ? { ...member.travelType, tags: [...member.travelType.tags] } : null,
      personalityAxes: member.personalityAxes ? {
        scheduleDensity: { ...member.personalityAxes.scheduleDensity, range: [...member.personalityAxes.scheduleDensity.range] as [number, number] },
        landmarkNecessity: { ...member.personalityAxes.landmarkNecessity, range: [...member.personalityAxes.landmarkNecessity.range] as [number, number] },
        localInterest: { ...member.personalityAxes.localInterest, range: [...member.personalityAxes.localInterest.range] as [number, number] },
        challenging: { ...member.personalityAxes.challenging, range: [...member.personalityAxes.challenging.range] as [number, number] },
      } : null,
      mobilityConstraints: { ...member.mobilityConstraints, values: [...member.mobilityConstraints.values] },
      interestTags: [...member.interestTags],
    })).sort((left, right) => left.userId.localeCompare(right.userId)),
    candidateSignals: evidence.candidateSignals.map((candidate) => ({
      ...candidate,
      signals: candidate.signals.map((signal) => ({ ...signal }))
        .sort((left, right) => left.userId.localeCompare(right.userId)),
    })).sort((left, right) => left.placeId.localeCompare(right.placeId)),
  };
}

export function createDuriAnalysisSnapshot(input: DuriAnalysisInput): DuriAnalysisSnapshot {
  const memberIds = [...new Set(input.trip.members.map((member) => member.userId))].sort();
  const relevantPlaceIds = [...new Set([
    ...input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []),
    ...input.candidates.map((candidate) => candidate.placeId),
    ...(input.confirmedScheduleConstraints ?? []).flatMap((constraint) => constraint.placeId ? [constraint.placeId] : []),
  ])].sort();
  const preferenceResults = Object.fromEntries(memberIds.flatMap((userId) => {
    const result = input.preferenceResults[userId];
    return isSupportedPreferenceResult(result, userId)
      ? [[userId, {
          ...result,
          answers: { ...result.answers },
          traits: [...result.traits],
          preferredTags: [...result.preferredTags],
          ...(result.detailedSignals ? { detailedSignals: {
            ...result.detailedSignals,
            mobilityModes: [...result.detailedSignals.mobilityModes],
            categoryScores: { ...result.detailedSignals.categoryScores },
            budgetRanking: [...result.detailedSignals.budgetRanking],
          } } : {}),
        } satisfies UserPreferenceResult]]
      : [];
  }));
  const trip = {
    ...input.trip,
    accommodationLocation: input.trip.accommodationLocation ? { ...input.trip.accommodationLocation } : null,
    endCondition: input.trip.endCondition ? {
      ...input.trip.endCondition,
      location: { ...input.trip.endCondition.location },
    } : null,
    members: [...input.trip.members]
      .map((member) => ({ ...member }))
      .sort((left, right) => left.userId.localeCompare(right.userId)),
  };
  const groupPreferenceDiagnosis = diagnoseGroupPreferences(trip, preferenceResults);
  const groupPlanningProfile = deriveGroupPlanningProfile(groupPreferenceDiagnosis);
  return {
    ...(input.sourceRevision ? { sourceRevision: input.sourceRevision } : {}),
    ...(input.sourceFactsVersion === undefined ? {} : { sourceFactsVersion: input.sourceFactsVersion }),
    ...(input.localPlanningFactsStatus ? { localPlanningFactsStatus: input.localPlanningFactsStatus } : {}),
    ...(input.scheduleOverlayStatus ? { scheduleOverlayStatus: input.scheduleOverlayStatus } : {}),
    ...(input.sharedPreferenceEvidenceStatus ? { sharedPreferenceEvidenceStatus: input.sharedPreferenceEvidenceStatus } : {}),
    ...(input.sharedPreferenceEvidence ? { sharedPreferenceEvidence: cloneSharedPreferenceEvidence(input.sharedPreferenceEvidence) } : {}),
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
    confirmedScheduleConstraints: [...(input.confirmedScheduleConstraints ?? [])]
      .map((constraint) => ({ ...constraint }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    routeLegEstimates: [...(input.routeLegEstimates ?? [])]
      .map((estimate) => ({ ...estimate }))
      .sort((left, right) => left.date.localeCompare(right.date)
        || left.fromItemId.localeCompare(right.fromItemId)
        || left.toItemId.localeCompare(right.toItemId)
        || left.fetchedAt.localeCompare(right.fetchedAt)),
    routeOrderEvaluations: [...(input.routeOrderEvaluations ?? [])]
      .map((evaluation) => ({
        ...evaluation,
        itemIds: [...evaluation.itemIds],
        swappedItemIds: [...evaluation.swappedItemIds] as [string, string],
        alternativeLegs: (evaluation.alternativeLegs ?? []).map((leg) => ({ ...leg })),
      }))
      .sort((left, right) => left.date.localeCompare(right.date)
        || left.swappedItemIds.join(":").localeCompare(right.swappedItemIds.join(":"))),
    placeConstraintEvidence: [...(input.placeConstraintEvidence ?? [])]
      .map((evidence) => ({ ...evidence }))
      .sort((left, right) => left.placeId.localeCompare(right.placeId)
        || left.fetchedAt.localeCompare(right.fetchedAt)),
    placeCongestionEvidence: [...(input.placeCongestionEvidence ?? [])]
      .map((evidence) => ({ ...evidence }))
      .sort((left, right) => left.placeId.localeCompare(right.placeId)
        || left.date.localeCompare(right.date)
        || left.fetchedAt.localeCompare(right.fetchedAt)),
    documentReferences: [...(input.documentReferences ?? [])]
      .map((reference) => ({
        ...reference,
        itineraryItemIds: [...new Set(reference.itineraryItemIds)].sort(),
        confirmedFactIds: [...new Set(reference.confirmedFactIds ?? [])].sort(),
        pendingReviewFactIds: [...new Set(reference.pendingReviewFactIds ?? [])].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    documentCollectionStatus: input.documentCollectionStatus ?? "loaded",
    evidenceCollection: input.evidenceCollection ? {
      route: { ...input.evidenceCollection.route },
      placeDetails: { ...input.evidenceCollection.placeDetails },
      congestion: input.evidenceCollection.congestion ? { ...input.evidenceCollection.congestion } : undefined,
    } : undefined,
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
    contentTypeId: place.contentTypeId ?? null,
    latitude: Number.isFinite(coordinates.latitude) ? coordinates.latitude : null,
    longitude: Number.isFinite(coordinates.longitude) ? coordinates.longitude : null,
  };
}

export function canonicalizeDuriInput(snapshot: DuriAnalysisSnapshot) {
  const diagnosis = snapshot.groupPreferenceDiagnosis;
  return {
    algorithmVersion: DURI_ANALYSIS_VERSION,
    sourceRevision: snapshot.sourceRevision ?? null,
    sourceFactsVersion: snapshot.sourceFactsVersion ?? null,
    localPlanningFactsStatus: snapshot.localPlanningFactsStatus ?? null,
    scheduleOverlayStatus: snapshot.scheduleOverlayStatus ?? null,
    sharedPreferenceEvidenceStatus: snapshot.sharedPreferenceEvidenceStatus ?? null,
    sharedPreferenceEvidence: snapshot.sharedPreferenceEvidence ? {
      roomId: snapshot.sharedPreferenceEvidence.roomId,
      factsVersion: snapshot.sharedPreferenceEvidence.factsVersion,
      scheduleVersion: snapshot.sharedPreferenceEvidence.scheduleVersion,
      members: snapshot.sharedPreferenceEvidence.members.map((member) => ({
        userId: member.userId,
        nickname: member.nickname,
        travelType: member.travelType ? {
          name: member.travelType.name,
          tags: [...member.travelType.tags].sort(),
          emoji: member.travelType.emoji,
        } : null,
        personalityAxes: member.personalityAxes ? Object.fromEntries(Object.entries(member.personalityAxes)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([axisId, axis]) => [axisId, {
            value: axis.value,
            unit: axis.unit,
            range: [...axis.range],
            resolution: axis.resolution,
            source: axis.source,
            method: axis.method,
          }])) : null,
        mobilityConstraints: {
          values: [...member.mobilityConstraints.values].sort(),
          status: member.mobilityConstraints.status,
          source: member.mobilityConstraints.source,
          version: member.mobilityConstraints.version,
          updatedAt: member.mobilityConstraints.updatedAt,
        },
        preferenceUpdatedAt: member.preferenceUpdatedAt,
        interestTags: [...member.interestTags].sort(),
      })).sort((left, right) => left.userId.localeCompare(right.userId)),
      candidateSignals: snapshot.sharedPreferenceEvidence.candidateSignals.map((candidate) => ({
        placeId: candidate.placeId,
        signals: candidate.signals.map((signal) => ({ ...signal }))
          .sort((left, right) => left.userId.localeCompare(right.userId)),
      })).sort((left, right) => left.placeId.localeCompare(right.placeId)),
    } : null,
    trip: {
      id: snapshot.trip.id,
      regionId: snapshot.trip.regionId,
      startDate: snapshot.trip.startDate,
      endDate: snapshot.trip.endDate,
      status: snapshot.trip.status,
      transport: snapshot.trip.transport,
      budgetLevel: snapshot.trip.budgetLevel,
      intensity: snapshot.trip.intensity,
      accommodationLocation: snapshot.trip.accommodationLocation ? {
        name: snapshot.trip.accommodationLocation.name,
        address: snapshot.trip.accommodationLocation.address ?? null,
      } : null,
      endCondition: snapshot.trip.endCondition ? {
        type: snapshot.trip.endCondition.type,
        location: {
          name: snapshot.trip.endCondition.location.name,
          address: snapshot.trip.endCondition.location.address ?? null,
        },
        deadline: snapshot.trip.endCondition.deadline,
        travelMinutes: snapshot.trip.endCondition.travelMinutes,
        serviceBufferMinutes: snapshot.trip.endCondition.serviceBufferMinutes,
        note: snapshot.trip.endCondition.note ?? null,
      } : null,
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
      note: item.note ?? null,
      lockedForDuri: Boolean(item.lockedForDuri),
    })),
    confirmedScheduleConstraints: (snapshot.confirmedScheduleConstraints ?? []).map((constraint) => ({
      id: constraint.id,
      kind: constraint.kind,
      label: constraint.label,
      source: constraint.source,
      date: constraint.date,
      startTime: constraint.startTime ?? null,
      endTime: constraint.endTime ?? null,
      itineraryItemId: constraint.itineraryItemId ?? null,
      placeId: constraint.placeId ?? null,
      sourceDocumentId: constraint.sourceDocumentId ?? null,
      confirmedAt: constraint.confirmedAt,
    })),
    documentReferences: (snapshot.documentReferences ?? []).map((reference) => ({
      id: reference.id,
      kind: reference.kind,
      itineraryItemIds: [...reference.itineraryItemIds].sort(),
      orderProtected: reference.orderProtected ?? false,
      extractionStatus: reference.extractionStatus ?? "not-requested",
      confirmedFactIds: [...(reference.confirmedFactIds ?? [])].sort(),
      pendingReviewFactIds: [...(reference.pendingReviewFactIds ?? [])].sort(),
    })),
    documentCollectionStatus: snapshot.documentCollectionStatus ?? "loaded",
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
      detailedSignals: result.detailedSignals ? {
        ...result.detailedSignals,
        mobilityModes: [...result.detailedSignals.mobilityModes].sort(),
        categoryScores: Object.fromEntries(Object.entries(result.detailedSignals.categoryScores).sort(([left], [right]) => left.localeCompare(right))),
        budgetRanking: [...result.detailedSignals.budgetRanking],
      } : null,
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
  if (!input.itinerary.length) return {
    status: "no-itinerary",
    canAnalyze: true,
    readOnly: input.trip.status === "completed",
    message: "현재 일정은 비어 있어 점검 결과는 제한적이에요. 분석 후 실제 성향·후보 근거가 있으면 검토용 자동 채우기 초안을 만들 수 있어요.",
  };
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
