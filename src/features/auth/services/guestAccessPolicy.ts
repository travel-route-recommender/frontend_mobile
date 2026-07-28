import { ApiError } from "../../../services/apiClient";
import type { SessionKind } from "../types";

export type RestrictedFeature =
  | "trip-create"
  | "schedule-edit"
  | "save-place"
  | "duri"
  | "invite-management"
  | "room-join";

const guestMessages: Record<RestrictedFeature, string> = {
  "trip-create": "게스트는 새 여행방을 만들 수 없어요. 계정을 업그레이드하면 바로 시작할 수 있어요.",
  "schedule-edit": "게스트는 일정은 볼 수 있지만 편집할 수 없어요. 후보 장소 추가는 계속 이용할 수 있어요.",
  "save-place": "개인 저장 장소는 회원 전용이에요. 계정을 업그레이드하면 사용할 수 있어요.",
  duri: "두리 분석은 회원 전용이에요. 게스트 계정을 업그레이드한 뒤 이용해 주세요.",
  "invite-management": "초대 관리는 회원 전용이에요. 게스트는 참여 중인 여행방을 계속 볼 수 있어요.",
  "room-join": "현재 게스트 세션으로는 이 여행방에 참여할 수 없어요. 기존 여행방을 확인하거나 계정을 업그레이드해 주세요.",
};

export function restrictedFeatureMessage(sessionKind: SessionKind | null, feature: RestrictedFeature) {
  if (sessionKind === "guest") return guestMessages[feature];
  if (sessionKind === "anonymous" || sessionKind === null) return "로그인 후 이용할 수 있는 기능이에요.";
  return "이 작업을 수행할 권한이 없어요.";
}

export function apiPermissionMessage(
  error: unknown,
  sessionKind: SessionKind | null,
  feature: RestrictedFeature,
  fallback: string,
) {
  if (error instanceof ApiError && error.status === 403) {
    return restrictedFeatureMessage(sessionKind, feature);
  }
  return error instanceof Error ? error.message : fallback;
}
