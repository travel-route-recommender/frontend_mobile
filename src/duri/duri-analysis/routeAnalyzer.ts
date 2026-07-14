import type { Place } from "../../domain";
import { DURI_ANALYSIS_CONFIG } from "./config";
import { categoryStatusFromIssues, getValidPlaceEntries, groupItineraryByDate, insufficientCategory } from "./shared";
import type { AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";
import { buildGroupProfileEvidence, canAdjustGroupThreshold, getGroupDimensionTone } from "../group-preferences";

type Coordinates = { latitude: number; longitude: number };

export function extractStableArea(address: string) {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  const province = tokens.find((token) => /(?:특별시|광역시|특별자치시|특별자치도|도|시)$/.test(token));
  const district = tokens.find((token) => /(?:구|군)$/.test(token));
  if (district) return [province, district].filter(Boolean).join(" ");
  const neighborhood = tokens.find((token) => /(?:동|읍|면)$/.test(token));
  return neighborhood ? [province, neighborhood].filter(Boolean).join(" ") : undefined;
}

function getCoordinates(place: Place): Coordinates | undefined {
  const candidate = place as Place & Partial<Coordinates>;
  return Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)
    ? { latitude: candidate.latitude as number, longitude: candidate.longitude as number }
    : undefined;
}

export function haversineDistanceKm(left: Coordinates, right: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function analyzeRoute(input: DuriAnalysisInput): CategoryAnalysisResult {
  const issues: AnalysisIssue[] = [];
  let analyzableDayCount = 0;
  const mobilityTone = getGroupDimensionTone(input.groupPlanningProfile, "mobility");
  let transitionThreshold: number = DURI_ANALYSIS_CONFIG.route.excessiveRegionTransitions;
  let longSegmentKm: number = DURI_ANALYSIS_CONFIG.route.longStraightSegmentKm;
  let dailyDistanceKm: number = DURI_ANALYSIS_CONFIG.route.highDailyStraightDistanceKm;
  if (canAdjustGroupThreshold(input.groupPlanningProfile, "mobility")) {
    if (mobilityTone === "low") {
      transitionThreshold = Math.max(transitionThreshold - 1, 2);
      longSegmentKm *= 0.85;
      dailyDistanceKm *= 0.85;
    } else if (mobilityTone === "high") {
      transitionThreshold += 1;
      longSegmentKm *= 1.15;
      dailyDistanceKm *= 1.15;
    }
  }
  const groupEvidence = buildGroupProfileEvidence(input.groupPlanningProfile, "mobility");

  for (const [date, items] of groupItineraryByDate(input.itinerary)) {
    const entries = getValidPlaceEntries(items, input.placesById);
    if (entries.length < 2) continue;
    const coordinates = entries.map(({ place }) => getCoordinates(place));

    if (coordinates.every(Boolean)) {
      analyzableDayCount += 1;
      const distances = coordinates.slice(1).map((right, index) => haversineDistanceKm(coordinates[index] as Coordinates, right as Coordinates));
      const total = distances.reduce((sum, distance) => sum + distance, 0);
      const longest = Math.max(...distances);
      const severe = total >= dailyDistanceKm || longest >= longSegmentKm;
      const severity = severe && mobilityTone === "low" && canAdjustGroupThreshold(input.groupPlanningProfile, "mobility") ? "high" : severe ? "medium" : "info";
      issues.push({
        id: `route-distance-${date}`,
        category: "route",
        status: severe ? "attention" : "good",
        severity,
        title: severe ? "공간적 이동 부담을 확인해 주세요" : "직선거리 기준 이동 흐름이 안정적이에요",
        summary: severe ? `${date} 일정에 직선거리 기준 긴 이동 구간이 있어요.` : `${date} 일정은 직선거리 기준 큰 이동 부담이 감지되지 않았어요.`,
        date,
        affectedItemIds: entries.map(({ item }) => item.id),
        affectedPlaceIds: entries.map(({ place }) => place.id),
        affectedMemberIds: [],
        evidence: [
          { label: "하루 총 예상 직선거리", value: `${total.toFixed(1)}km`, itemIds: entries.map(({ item }) => item.id), placeIds: entries.map(({ place }) => place.id) },
          { label: "가장 긴 연속 구간", value: `${longest.toFixed(1)}km` },
          ...groupEvidence,
        ],
      });
      continue;
    }

    const areas = entries.map(({ place }) => extractStableArea(place.address));
    if (areas.some((area) => !area)) continue;
    analyzableDayCount += 1;
    const stableAreas = areas as string[];
    const transitions = stableAreas.slice(1).filter((area, index) => area !== stableAreas[index]).length;
    const roundTripIndexes = stableAreas.flatMap((area, index) =>
      index >= 2 && area === stableAreas[index - 2] && area !== stableAreas[index - 1] ? [index] : [],
    );
    const warning = transitions >= transitionThreshold || roundTripIndexes.length > 0;
    const severity = warning && mobilityTone === "low" && canAdjustGroupThreshold(input.groupPlanningProfile, "mobility") ? "high" : warning ? "medium" : "info";
    const affectedIndexes = new Set(roundTripIndexes.flatMap((index) => [index - 2, index - 1, index]));
    const affectedEntries = affectedIndexes.size ? entries.filter((_, index) => affectedIndexes.has(index)) : entries;
    issues.push({
      id: `route-area-${date}`,
      category: "route",
      status: warning ? "attention" : "good",
      severity,
      title: roundTripIndexes.length ? "같은 권역을 다시 방문하는 흐름이 있어요" : warning ? "권역 전환이 잦아요" : "권역 흐름이 단순해요",
      summary: warning ? `${date}에 권역 전환 ${transitions}회${roundTripIndexes.length ? `, 왕복 패턴 ${roundTripIndexes.length}개` : ""}가 감지됐어요.` : `${date} 일정은 주소 권역 기준으로 자연스럽게 이어져요.`,
      date,
      affectedItemIds: affectedEntries.map(({ item }) => item.id),
      affectedPlaceIds: affectedEntries.map(({ place }) => place.id),
      affectedMemberIds: [],
      evidence: [
        { label: "주소 권역", value: [...new Set(stableAreas)].join(" → "), itemIds: entries.map(({ item }) => item.id), placeIds: entries.map(({ place }) => place.id) },
        { label: "권역 전환", value: `${transitions}회` },
        { label: "A→B→A 왕복 패턴", value: `${roundTripIndexes.length}개` },
        ...groupEvidence,
      ],
    });
  }

  if (!analyzableDayCount) return insufficientCategory("route", "장소 위치 정보가 부족해 동선을 분석할 수 없어요.");
  const status = categoryStatusFromIssues(issues);
  return {
    category: "route",
    status,
    summary: status === "good" ? "현재 일정은 권역 이동이 비교적 단순해요." : "같은 날의 권역 전환이나 왕복 흐름을 확인해 보세요.",
    issues,
  };
}
