import { ApiError } from "../../../services/apiClient";
import type { SessionKind } from "../types";

export type RestrictedFeature =
  | "trip-create"
  | "schedule-edit"
  | "save-place"
  | "duri"
  | "friend-management"
  | "preference-test"
  | "invite-management"
  | "room-join";

const guestMessages: Record<RestrictedFeature, string> = {
  "trip-create": "게스트는 새 여행방을 만들 수 없어요. 계정을 업그레이드하면 바로 시작할 수 있어요.",
  "schedule-edit": "게스트는 일정은 볼 수 있지만 편집할 수 없어요. 후보 장소 추가는 계속 이용할 수 있어요.",
  "save-place": "개인 저장 장소는 회원 전용이에요. 계정을 업그레이드하면 사용할 수 있어요.",
  duri: "두리 분석은 회원 전용이에요. 게스트 계정을 업그레이드한 뒤 이용해 주세요.",
  "friend-management": "친구 관리와 궁합 검사는 회원 전용이에요. 계정을 업그레이드한 뒤 이용해 주세요.",
  "preference-test": "취향 검사와 결과 관리는 회원 전용이에요. 계정을 업그레이드한 뒤 이용해 주세요.",
  "invite-management": "초대 관리는 회원 전용이에요. 게스트는 참여 중인 여행방을 계속 볼 수 있어요.",
  "room-join": "현재 게스트 세션으로는 이 여행방에 참여할 수 없어요. 기존 여행방을 확인하거나 계정을 업그레이드해 주세요.",
};

export const guestPagePolicy = {
  allowed: [
    "홈",
    "장소 탐색 및 장소 상세",
    "초대받은 여행 목록·상세·후보·일정 조회",
    "마이페이지",
    "초대 코드 참여 및 게스트 계정 업그레이드",
  ],
  memberOnly: [
    "저장 장소",
    "친구 관리 및 궁합 검사",
    "새 여행 만들기",
    "두리 분석 및 제안",
    "개인 취향 검사 및 온보딩",
  ],
} as const;

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
