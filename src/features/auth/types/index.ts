import type { EntityId, User } from "../../../domain";

export type SessionKind = "anonymous" | "guest" | "member";
export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";
export type SocialProvider = "google" | "kakao";
export type AuthProvider = SocialProvider | "email" | "guest";

export type LoginInput = { email: string; password: string };
export type SignupInput = { nickname: string; email: string; password: string };
export type GuestUpgradeInput = { email: string; password: string; nickname: string };
export type InviteJoinInput = { code: string; nickname: string; tripId?: EntityId };

export type SocialChallenge = {
  challengeId: string;
  nonce: string;
  state: string;
  expiresIn: number;
};

export type InvitePreview = {
  /** Current preview DTO intentionally does not expose the room ID. */
  roomId?: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  memberCount: number;
};

export type AuthSuccess = {
  status: "success";
  sessionKind: "guest" | "member";
  provider: AuthProvider;
  user: User;
  profileCompleted: boolean;
  onboardingIntroSeen: boolean;
  preferenceTestCompleted: boolean;
  invitedTripId?: EntityId;
};

export type AuthFailureCode =
  | "invalid-credentials"
  | "invalid-invite"
  | "invite-expired"
  | "room-unavailable"
  | "room-full"
  | "contract-unavailable"
  | "provider-unavailable"
  | "account-exists"
  | "account-link-required"
  | "guest-room-limit"
  | "rate-limited"
  | "network"
  | "unknown";

export type AuthFailure = {
  status: "error";
  code: AuthFailureCode;
  message: string;
  existingRoomId?: EntityId;
};

export type AuthResult = AuthSuccess | AuthFailure;

export type SocialLinkResult =
  | { status: "success"; provider: SocialProvider; linked: true }
  | AuthFailure;
