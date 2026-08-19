import type { Place } from "../../domain";
import { categoryStatusFromIssues, getValidPlaceEntries, groupItineraryByDate, insufficientCategory } from "./shared";
import type { AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";

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

  for (const [date, items] of groupItineraryByDate(input.itinerary)) {
    const entries = getValidPlaceEntries(items, input.placesById);
    if (entries.length < 2) continue;
    const coordinates = entries.map(({ place }) => getCoordinates(place));

    if (coordinates.every(Boolean)) {
      analyzableDayCount += 1;
      const distances = coordinates.slice(1).map((right, index) => haversineDistanceKm(coordinates[index] as Coordinates, right as Coordinates));
      const total = distances.reduce((sum, distance) => sum + distance, 0);
      const longest = Math.max(...distances);
      issues.push({
        id: `route-distance-${date}`,
        category: "route",
        status: "good",
        severity: "info",
        title: "장소 좌표의 직선거리 흐름을 참고할 수 있어요",
        summary: `${date}의 직선거리는 공간 흐름만 보여줘요. 이동시간 부족 판정에는 외부 경로 결과만 사용하고 직선거리에 임의 임계값을 적용하지 않았어요.`,
        date,
        affectedItemIds: entries.map(({ item }) => item.id),
        affectedPlaceIds: entries.map(({ place }) => place.id),
        affectedMemberIds: [],
        evidence: [
          { label: "하루 총 예상 직선거리", value: `${total.toFixed(1)}km`, itemIds: entries.map(({ item }) => item.id), placeIds: entries.map(({ place }) => place.id) },
          { label: "가장 긴 연속 구간", value: `${longest.toFixed(1)}km` },
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
    const warning = roundTripIndexes.length > 0;
    const affectedIndexes = new Set(roundTripIndexes.flatMap((index) => [index - 2, index - 1, index]));
    const affectedEntries = affectedIndexes.size ? entries.filter((_, index) => affectedIndexes.has(index)) : entries;
    issues.push({
      id: `route-area-${date}`,
      category: "route",
      status: "good",
      severity: "info",
      title: warning ? "같은 주소 권역으로 되돌아오는 흐름이 있어요" : "주소 권역 흐름을 참고할 수 있어요",
      summary: warning ? `${date}에 A→B→A 형태의 권역 재방문이 있어요. 실제 비효율 여부는 외부 경로 결과로만 별도 판단해요.` : `${date} 일정에서 명시적인 A→B→A 권역 재방문은 찾지 못했어요.`,
      date,
      affectedItemIds: affectedEntries.map(({ item }) => item.id),
      affectedPlaceIds: affectedEntries.map(({ place }) => place.id),
      affectedMemberIds: [],
      evidence: [
        { label: "주소 권역", value: [...new Set(stableAreas)].join(" → "), itemIds: entries.map(({ item }) => item.id), placeIds: entries.map(({ place }) => place.id) },
        { label: "권역 전환", value: `${transitions}회` },
        { label: "A→B→A 왕복 패턴", value: `${roundTripIndexes.length}개` },
      ],
    });
  }

  if (!analyzableDayCount) return insufficientCategory("route", "장소 위치 정보가 부족해 동선을 분석할 수 없어요.");
  const status = categoryStatusFromIssues(issues);
  return {
    category: "route",
    status,
    summary: status === "good" ? "직선거리·주소 권역은 참고 정보로만 표시해요." : "주소상 재방문 흐름이 있어 실제 경로 결과와 함께 확인해 보세요.",
    issues,
  };
}
