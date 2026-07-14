import { MOCK_INVITE_CODE_LENGTH, MOCK_NICKNAME_MAX_LENGTH, MOCK_NICKNAME_MIN_LENGTH, MOCK_PASSWORD_MIN_LENGTH } from "../config";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_PATTERN = /^[A-Z0-9]+$/;

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function normalizeInviteCode(value: string) { return value.trim().toUpperCase(); }

export function validateEmail(value: string) {
  const normalized = normalizeEmail(value);
  if (!normalized) return "이메일을 입력해 주세요.";
  return EMAIL_PATTERN.test(normalized) ? undefined : "이메일 형식을 확인해 주세요.";
}

export function validatePassword(value: string) {
  if (!value) return "비밀번호를 입력해 주세요.";
  return value.length >= MOCK_PASSWORD_MIN_LENGTH ? undefined : `비밀번호는 ${MOCK_PASSWORD_MIN_LENGTH}자 이상 입력해 주세요.`;
}

export function validatePasswordConfirmation(password: string, confirmation: string) {
  if (!confirmation) return "비밀번호를 다시 입력해 주세요.";
  return password === confirmation ? undefined : "비밀번호가 일치하지 않아요.";
}

export function validateRequiredAgreement(checked: boolean, label: string) {
  return checked ? undefined : `${label}에 동의해 주세요.`;
}

export function validateInviteCode(value: string) {
  const normalized = normalizeInviteCode(value);
  if (!normalized) return "초대 코드를 입력해 주세요.";
  if (normalized.length !== MOCK_INVITE_CODE_LENGTH || !INVITE_PATTERN.test(normalized)) return `영문 대문자와 숫자 ${MOCK_INVITE_CODE_LENGTH}자리로 입력해 주세요.`;
  return undefined;
}

export function validateNickname(value: string) {
  const normalized = value.trim();
  if (!normalized) return "닉네임을 입력해 주세요.";
  if (normalized.length < MOCK_NICKNAME_MIN_LENGTH) return `닉네임은 ${MOCK_NICKNAME_MIN_LENGTH}자 이상 입력해 주세요.`;
  if (normalized.length > MOCK_NICKNAME_MAX_LENGTH) return `닉네임은 ${MOCK_NICKNAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
  return undefined;
}
