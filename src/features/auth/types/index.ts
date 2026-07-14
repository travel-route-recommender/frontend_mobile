import type { EntityId, User } from "../../../domain";

export type SessionKind = "anonymous" | "guest" | "member";
export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

export type LoginInput = { email: string; password: string };
export type SignupInput = { email: string; password: string };
export type InviteJoinInput = { code: string };

export type AuthSuccess = {
  status: "success";
  sessionKind: "guest" | "member";
  user: User;
  profileCompleted: boolean;
  onboardingIntroSeen: boolean;
  preferenceTestCompleted: boolean;
  invitedTripId?: EntityId;
};

export type AuthFailureCode =
  | "invalid-credentials"
  | "invalid-invite"
  | "contract-unavailable"
  | "provider-unavailable";

export type AuthFailure = {
  status: "error";
  code: AuthFailureCode;
  message: string;
};

export type AuthResult = AuthSuccess | AuthFailure;
