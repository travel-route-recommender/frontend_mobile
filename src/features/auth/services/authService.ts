import type { User } from "../../../domain";
import { environment, type DataSourceMode } from "../../../config/environment";
import { nativeTokenStorage } from "../../../services/tokenStorage";
import { DEMO_GUEST_USER_ID, DEMO_INVITED_TRIP_ID, DEMO_INVITE_CODE, DEMO_MEMBER_EMAIL, DEMO_MEMBER_ID, DEMO_MEMBER_PASSWORD } from "../config";
import type { AuthResult, InviteJoinInput, LoginInput, SignupInput } from "../types";
import { createStableMockUserId } from "../utils/stableUserId";
import { normalizeEmail, normalizeInviteCode } from "../validation";

export interface AuthService {
  login(input: LoginInput): Promise<AuthResult>;
  signup(input: SignupInput): Promise<AuthResult>;
  joinByInvite(input: InviteJoinInput): Promise<AuthResult>;
  loginWithKakao(): Promise<AuthResult>;
  logout(): Promise<void>;
}

const unavailable = (provider = false): AuthResult => ({
  status: "error",
  code: provider ? "provider-unavailable" : "contract-unavailable",
  message: provider ? "카카오 네이티브 로그인 연동 준비 중입니다." : "현재 서버 인증 계약 연결 전입니다.",
});

class MockAuthService implements AuthService {
  async login(input: LoginInput): Promise<AuthResult> {
    if (normalizeEmail(input.email) !== DEMO_MEMBER_EMAIL || input.password !== DEMO_MEMBER_PASSWORD) {
      return { status: "error", code: "invalid-credentials", message: "데모 이메일 또는 비밀번호가 올바르지 않아요." };
    }
    return this.demoMember();
  }

  async signup(input: SignupInput): Promise<AuthResult> {
    const user: User = { id: createStableMockUserId(input.email), name: "새 여행자", initial: "🧭" };
    return { status: "success", sessionKind: "member", user, profileCompleted: false, onboardingIntroSeen: false, preferenceTestCompleted: false };
  }

  async joinByInvite(input: InviteJoinInput): Promise<AuthResult> {
    if (normalizeInviteCode(input.code) !== DEMO_INVITE_CODE) return { status: "error", code: "invalid-invite", message: "사용할 수 없는 데모 초대 코드예요." };
    const user: User = { id: DEMO_GUEST_USER_ID, name: "게스트 여행자", initial: "🧭" };
    return { status: "success", sessionKind: "guest", user, profileCompleted: false, onboardingIntroSeen: false, preferenceTestCompleted: false, invitedTripId: DEMO_INVITED_TRIP_ID };
  }

  async loginWithKakao(): Promise<AuthResult> { return this.demoMember(); }
  async logout() { await nativeTokenStorage.clearTokens(); }

  private demoMember(): AuthResult {
    return { status: "success", sessionKind: "member", user: { id: DEMO_MEMBER_ID, name: "수민", initial: "수" }, profileCompleted: true, onboardingIntroSeen: true, preferenceTestCompleted: true };
  }
}

class UnavailableApiAuthService implements AuthService {
  async login(): Promise<AuthResult> { return unavailable(); }
  async signup(): Promise<AuthResult> { return unavailable(); }
  async joinByInvite(): Promise<AuthResult> { return unavailable(); }
  async loginWithKakao(): Promise<AuthResult> { return unavailable(true); }
  async logout() { await nativeTokenStorage.clearTokens(); }
}

export function createAuthService(mode: DataSourceMode): AuthService {
  return mode === "mock" ? new MockAuthService() : new UnavailableApiAuthService();
}

export const authService = createAuthService(environment.dataSource);
