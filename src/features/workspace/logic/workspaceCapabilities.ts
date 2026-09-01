import type { ItineraryItem, TripCandidate, TripRoom } from "../../../domain";
import type { SessionKind } from "../../auth/types";

export type WorkspaceCapabilityDecision = { allowed: true } | { allowed: false; reason: string };
export type WorkspaceMutationPermissions = {
  canAddSchedule: boolean;
  canEditSchedule: boolean;
  canDeleteSchedule: boolean;
  canEditTripStructure: boolean;
};

export function canEditTripWorkspace({
  sessionKind,
  currentUserId,
  trip,
}: {
  sessionKind: SessionKind | null;
  currentUserId: string;
  trip: TripRoom | undefined;
}): WorkspaceCapabilityDecision {
  if (!trip) return { allowed: false, reason: "여행방 정보를 찾을 수 없어요." };
  if (sessionKind !== "member" && sessionKind !== "guest") return { allowed: false, reason: "로그인하거나 초대받은 여행방에 참여해야 일정을 편집할 수 있어요." };
  if (!currentUserId || !trip.members.some((member) => member.userId === currentUserId)) return { allowed: false, reason: "이 여행방의 편집 권한이 없어요." };
  if (trip.status === "completed") return { allowed: false, reason: "완료된 여행방은 읽기 전용으로 볼 수 있어요." };
  return { allowed: true };
}

export function buildWorkspaceMutationPermissions(input: Parameters<typeof canEditTripWorkspace>[0]): {
  permissions: WorkspaceMutationPermissions;
  decision: WorkspaceCapabilityDecision;
} {
  const decision = canEditTripWorkspace(input);
  const allowed = decision.allowed;
  return {
    decision,
    permissions: {
      canAddSchedule: allowed,
      canEditSchedule: allowed,
      canDeleteSchedule: allowed,
      canEditTripStructure: allowed,
    },
  };
}

export function canEditItineraryItem(input: {
  sessionKind: SessionKind | null;
  currentUserId: string;
  trip: TripRoom | undefined;
  item: ItineraryItem | undefined;
}): WorkspaceCapabilityDecision {
  const workspace = canEditTripWorkspace(input);
  if (!workspace.allowed) return workspace;
  if (!input.item || input.item.tripId !== input.trip?.id) return { allowed: false, reason: "일정 항목을 찾을 수 없어요." };
  return { allowed: true };
}

export function canRemoveCandidate(input: {
  sessionKind: SessionKind | null;
  currentUserId: string;
  trip: TripRoom | undefined;
  candidate: TripCandidate | undefined;
  itinerary: readonly ItineraryItem[];
}): WorkspaceCapabilityDecision {
  const workspace = canEditTripWorkspace(input);
  if (!workspace.allowed) return workspace;
  if (!input.candidate || input.candidate.tripId !== input.trip?.id) return { allowed: false, reason: "후보 장소를 찾을 수 없어요." };
  if (input.itinerary.some((item) => item.placeId === input.candidate?.placeId)) {
    return { allowed: false, reason: "일정에 배치된 후보예요. 먼저 모든 일정에서 제거해 주세요." };
  }
  if (!input.candidate.addedByUserIds.includes(input.currentUserId)) {
    return { allowed: false, reason: "다른 동행자가 담은 후보는 대신 제거할 수 없어요." };
  }
  return { allowed: true };
}

