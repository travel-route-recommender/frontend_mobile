import type { EntityId, ItineraryItem, Place, TripCandidate, TripRoom, User } from "../../../domain";
import type { SessionKind } from "../../auth/types";

export type CapabilityDecision = { allowed: true } | { allowed: false; reason: string };

export function canSavePlace(sessionKind: SessionKind | null, currentUser: User | undefined, place: Place | undefined): CapabilityDecision {
  if (sessionKind !== "member") return { allowed: false, reason: "장소 저장은 정식 회원 계정에서 사용할 수 있어요." };
  if (!currentUser) return { allowed: false, reason: "저장할 사용자 정보를 확인해 주세요." };
  if (!place) return { allowed: false, reason: "장소 정보를 찾을 수 없어요." };
  return { allowed: true };
}

export function canAddPlaceCandidate({ sessionKind, currentUserId, trip, place, candidates, itinerary }: { sessionKind: SessionKind | null; currentUserId: EntityId; trip: TripRoom | undefined; place: Place | undefined; candidates: readonly TripCandidate[]; itinerary: readonly ItineraryItem[] }): CapabilityDecision {
  if (sessionKind !== "member" && sessionKind !== "guest") return { allowed: false, reason: "로그인하거나 초대받은 여행방에 참여한 뒤 후보를 담을 수 있어요." };
  if (!currentUserId) return { allowed: false, reason: "현재 사용자 정보를 확인해 주세요." };
  if (!place) return { allowed: false, reason: "장소 정보를 찾을 수 없어요." };
  if (!trip) return { allowed: false, reason: "여행방을 찾을 수 없어요." };
  if (!trip.members.some((member) => member.userId === currentUserId)) return { allowed: false, reason: "참여 중인 여행방에만 후보를 담을 수 있어요." };
  if (trip.status === "completed") return { allowed: false, reason: "완료된 여행에는 후보를 추가할 수 없어요." };
  if (itinerary.some((item) => item.placeId === place.id)) return { allowed: false, reason: "이미 이 여행 일정에 포함된 장소예요." };
  if (candidates.some((candidate) => candidate.placeId === place.id)) return { allowed: false, reason: "이미 이 여행방 후보에 담긴 장소예요." };
  return { allowed: true };
}

