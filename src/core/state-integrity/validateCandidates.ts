import type { DuriDomainState } from "../../data/mock/demoData";
import type { StateIntegrityIssue } from "./types";
import { issue } from "./types";

export function validateCandidates(domain: DuriDomainState): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];
  for (const [tripId, candidates] of Object.entries(domain.candidatesByTripId)) {
    const trip = domain.tripsById[tripId];
    if (!trip) {
      issues.push(issue("error", "candidate.trip-reference-missing", "trip", "후보 목록의 여행방이 존재하지 않습니다.", tripId));
      continue;
    }
    const placeIds = new Set<string>();
    const memberIds = new Set(trip.members.map((member) => member.userId));
    for (const candidate of candidates) {
      if (candidate.tripId !== tripId) {
        issues.push(issue("error", "candidate.trip-key-mismatch", "candidate", "후보의 tripId가 저장된 여행방 key와 다릅니다.", candidate.placeId));
      }
      if (placeIds.has(candidate.placeId)) {
        issues.push(issue("error", "candidate.place-duplicate", "candidate", "같은 여행방에 같은 장소 후보가 중복되어 있습니다.", candidate.placeId));
      }
      placeIds.add(candidate.placeId);
      if (!domain.placesById[candidate.placeId]) {
        issues.push(issue("warning", "candidate.place-reference-missing", "place", "후보 장소 정보를 찾을 수 없습니다.", candidate.placeId));
      }
      if (new Set(candidate.addedByUserIds).size !== candidate.addedByUserIds.length) {
        issues.push(issue("error", "candidate.contributor-duplicate", "candidate", "후보 제안자 ID가 중복되어 있습니다.", candidate.placeId));
      }
      if (candidate.addedByUserIds.some((userId) => !memberIds.has(userId))) {
        issues.push(issue("warning", "candidate.contributor-not-member", "candidate", "여행방 멤버가 아닌 후보 제안자가 포함되어 있습니다.", candidate.placeId));
      }
    }
  }
  return issues;
}

export function validateSavedPlaces(domain: DuriDomainState): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];
  for (const [userId, placeIds] of Object.entries(domain.savedPlaceIdsByUserId)) {
    if (!domain.usersById[userId]) {
      issues.push(issue("warning", "saved.user-reference-missing", "user", "저장 관계의 사용자를 찾을 수 없습니다.", userId));
    }
    const seen = new Set<string>();
    for (const placeId of placeIds) {
      if (seen.has(placeId)) {
        issues.push(issue("error", "saved.place-duplicate", "place", "한 사용자의 저장 장소가 중복되어 있습니다.", placeId));
      }
      seen.add(placeId);
      if (!domain.placesById[placeId]) {
        issues.push(issue("warning", "saved.place-reference-missing", "place", "저장한 장소 정보를 찾을 수 없습니다.", placeId));
      }
    }
  }
  return issues;
}

