import type { DuriDomainState } from "../../data/mock/demoData";
import { findOverlappingItem, getTripDates, isValidScheduleRange, sortItineraryItemsByDateAndTime } from "../../utils/schedule";
import type { StateIntegrityIssue } from "./types";
import { issue } from "./types";

export function validateItinerary(domain: DuriDomainState): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];
  const globalItemIds = new Set<string>();

  for (const [tripId, items] of Object.entries(domain.itineraryByTripId)) {
    const trip = domain.tripsById[tripId];
    if (!trip) {
      issues.push(issue("error", "itinerary.trip-reference-missing", "trip", "일정 목록의 여행방이 존재하지 않습니다.", tripId));
      continue;
    }
    const tripDates = new Set(getTripDates(trip.startDate, trip.endDate));
    const memberIds = new Set(trip.members.map((member) => member.userId));
    const sortedIds = sortItineraryItemsByDateAndTime(items).map((item) => item.id);
    if (items.some((item, index) => item.id !== sortedIds[index])) {
      issues.push(issue("warning", "itinerary.order-not-normalized", "trip", "일정 배열이 날짜와 시작 시간 순서로 정규화되어 있지 않습니다.", tripId));
    }

    for (const item of items) {
      if (!item.id) {
        issues.push(issue("error", "itinerary.item-id-empty", "itinerary", "빈 일정 항목 ID가 있습니다.", tripId));
      } else if (globalItemIds.has(item.id)) {
        issues.push(issue("error", "itinerary.item-id-duplicate", "itinerary", "일정 항목 ID가 중복되어 있습니다.", item.id));
      }
      globalItemIds.add(item.id);
      if (item.tripId !== tripId) {
        issues.push(issue("error", "itinerary.trip-key-mismatch", "itinerary", "일정 항목의 tripId가 저장된 여행방 key와 다릅니다.", item.id));
      }
      if (!tripDates.has(item.date)) {
        issues.push(issue("error", "itinerary.date-out-of-range", "itinerary", "일정 날짜가 여행 기간 밖에 있습니다.", item.id));
      }
      if (!isValidScheduleRange(item)) {
        issues.push(issue("error", "itinerary.time-invalid", "itinerary", "일정 시작 시간 또는 종료 범위가 유효하지 않습니다.", item.id));
      }
      if (item.itemType === "place" && !item.placeId) {
        issues.push(issue("error", "itinerary.place-id-missing", "itinerary", "장소 일정에 placeId가 없습니다.", item.id));
      }
      if (item.placeId && !domain.placesById[item.placeId]) {
        issues.push(issue("warning", "itinerary.place-reference-missing", "place", "일정 장소 정보를 찾을 수 없습니다.", item.placeId));
      }
      if (new Set(item.preferredByUserIds).size !== item.preferredByUserIds.length) {
        issues.push(issue("error", "itinerary.preference-user-duplicate", "itinerary", "일정 선호 사용자 ID가 중복되어 있습니다.", item.id));
      }
      if (item.preferredByUserIds.some((userId) => !memberIds.has(userId))) {
        issues.push(issue("warning", "itinerary.preference-user-not-member", "itinerary", "여행방 멤버가 아닌 선호 사용자가 포함되어 있습니다.", item.id));
      }
      if (findOverlappingItem(items, item, item.id)) {
        issues.push(issue("warning", "itinerary.time-overlap", "itinerary", "같은 날짜의 다른 일정과 시간이 겹칩니다.", item.id));
      }
    }
  }

  return issues;
}

