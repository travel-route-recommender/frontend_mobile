import type { DuriDomainState } from "../../data/mock/demoData";
import type { StateIntegrityIssue } from "./types";
import { issue } from "./types";
import { isValidISODate } from "../../utils/formatters";

export function validateTrips(domain: DuriDomainState): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];
  const ordered = new Set<string>();

  for (const tripId of domain.tripOrder) {
    if (ordered.has(tripId)) {
      issues.push(issue("error", "trip.order-duplicate", "trip", "tripOrder에 같은 여행방 ID가 중복되어 있습니다.", tripId));
    }
    ordered.add(tripId);
    if (!domain.tripsById[tripId]) {
      issues.push(issue("error", "trip.order-reference-missing", "trip", "tripOrder가 존재하지 않는 여행방을 가리킵니다.", tripId));
    }
  }

  for (const [tripKey, trip] of Object.entries(domain.tripsById)) {
    if (trip.id !== tripKey) {
      issues.push(issue("error", "trip.key-id-mismatch", "trip", "tripsById key와 TripRoom.id가 다릅니다.", tripKey));
    }
    if (!ordered.has(tripKey)) {
      issues.push(issue("warning", "trip.order-entry-missing", "trip", "여행방이 tripOrder에 포함되어 있지 않습니다.", tripKey));
    }
    if (!domain.regionsById[trip.regionId]) {
      issues.push(issue("warning", "trip.region-reference-missing", "trip", "여행방의 지역 정보를 찾을 수 없습니다.", tripKey));
    }
    if (trip.dateUndecided) {
      if (trip.startDate !== null || trip.endDate !== null) issues.push(issue("error", "trip.date-undecided-range-present", "trip", "날짜 미정 여행방에 날짜 범위가 함께 저장되어 있습니다.", tripKey));
      if (trip.endCondition) issues.push(issue("error", "trip.date-undecided-end-condition-present", "trip", "날짜 미정 여행방에 종료 조건이 저장되어 있습니다.", tripKey));
    } else if (!isValidISODate(trip.startDate) || !isValidISODate(trip.endDate) || trip.endDate < trip.startDate) {
      issues.push(issue("error", "trip.date-range-invalid", "trip", "여행방 날짜 범위가 올바르지 않습니다.", tripKey));
    }
    if (trip.accommodationLocation && !trip.accommodationLocation.name.trim()) {
      issues.push(issue("error", "trip.accommodation-location-invalid", "trip", "숙소 위치 이름이 비어 있습니다.", tripKey));
    }
    if (trip.endCondition) {
      if (!trip.endCondition.location.name.trim()) issues.push(issue("error", "trip.end-condition-location-invalid", "trip", "여행 종료 지점이 비어 있습니다.", tripKey));
      if (!/^([01]\d|2[0-3]):(?:00|15|30|45)$/.test(trip.endCondition.deadline)) issues.push(issue("error", "trip.end-condition-deadline-invalid", "trip", "여행 종료 시각이 올바른 15분 단위가 아닙니다.", tripKey));
      if (!Number.isInteger(trip.endCondition.travelMinutes) || trip.endCondition.travelMinutes < 0 || trip.endCondition.travelMinutes > 1440) issues.push(issue("error", "trip.end-condition-travel-invalid", "trip", "여행 종료 지점까지 예상 이동시간이 올바르지 않습니다.", tripKey));
      if (!Number.isInteger(trip.endCondition.serviceBufferMinutes) || trip.endCondition.serviceBufferMinutes < 0 || trip.endCondition.serviceBufferMinutes > 720) issues.push(issue("error", "trip.end-condition-buffer-invalid", "trip", "여행 종료 준비시간이 올바르지 않습니다.", tripKey));
    }

    const memberIds = new Set<string>();
    let ownerCount = 0;
    for (const member of trip.members) {
      if (!member.userId) {
        issues.push(issue("error", "trip.member-id-empty", "trip", "빈 사용자 ID를 가진 멤버가 있습니다.", tripKey));
        continue;
      }
      if (memberIds.has(member.userId)) {
        issues.push(issue("error", "trip.member-duplicate", "trip", "같은 사용자가 여행방 멤버에 중복되어 있습니다.", tripKey));
      }
      memberIds.add(member.userId);
      if (member.role === "owner") ownerCount += 1;
      if (!domain.usersById[member.userId]) {
        issues.push(issue("warning", "trip.member-reference-missing", "user", "여행방 멤버의 사용자 정보를 찾을 수 없습니다.", member.userId));
      }
    }
    if (ownerCount === 0) {
      issues.push(issue("error", "trip.owner-missing", "trip", "여행방에 owner가 없습니다. 임의 owner는 생성하지 않습니다.", tripKey));
    } else if (ownerCount > 1) {
      issues.push(issue("error", "trip.owner-duplicate", "trip", "여행방에 owner가 여러 명입니다.", tripKey));
    }
  }

  if (domain.activeTripId) {
    const activeTrip = domain.tripsById[domain.activeTripId];
    if (!activeTrip) {
      issues.push(issue("error", "trip.active-reference-missing", "trip", "activeTripId가 존재하지 않는 여행방을 가리킵니다.", domain.activeTripId));
    } else if (!domain.currentUserId || !activeTrip.members.some((member) => member.userId === domain.currentUserId)) {
      issues.push(issue("error", "trip.active-membership-mismatch", "trip", "현재 사용자가 참여하지 않은 여행방이 activeTripId로 설정되어 있습니다.", domain.activeTripId));
    }
  }

  return issues;
}
