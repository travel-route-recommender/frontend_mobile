import type { InviteJoinInput, LoginInput, SignupInput, SocialProvider } from "../types";
import { normalizeEmail, normalizeInviteCode } from "../validation";

/**
 * Authentication capabilities exposed by the backend main branch.
 * Keep unsupported client flows out of the network layer until matching
 * backend endpoints are added.
 */
export const backendAuthCapabilities = {
  socialProviders: ["kakao"] as const satisfies readonly SocialProvider[],
  socialIdentityLinking: false,
  guestUpgrade: false,
  accountDeletion: false,
} as const;

export function supportsBackendSocialProvider(provider: SocialProvider) {
  return backendAuthCapabilities.socialProviders.some((supported) => supported === provider);
}

export function createLoginRequestBody(input: LoginInput) {
  return {
    email: normalizeEmail(input.email),
    password: input.password,
  };
}

export function createSignupRequestBody(input: SignupInput) {
  return {
    nickname: input.nickname.trim(),
    email: normalizeEmail(input.email),
    password: input.password,
  };
}

export function createInviteJoinRequestBody(input: InviteJoinInput) {
  return {
    inviteCode: normalizeInviteCode(input.code),
    nickname: input.nickname.trim(),
  };
}

export function createRefreshRequestBody(refreshToken: string, operationId: string) {
  return { refreshToken, operationId };
}
