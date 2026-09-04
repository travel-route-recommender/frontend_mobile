const TECHNICAL_API_MESSAGE_PATTERNS = [
  /^cannot\s+(?:get|post|put|patch|delete)\s+\//i,
  /\bproperty\s+["']?[^\s,"']+["']?\s+should not exist\b/i,
  /^\s*(?:<!doctype\s+html|<html|\{\s*"(?:statusCode|error)")/i,
  /^(?:bad request|unauthorized|forbidden|not found|internal server error|service unavailable|gateway timeout)$/i,
  /^[A-Za-z][A-Za-z0-9_.[\]=/-]*:\s/,
  /\b(?:dto|payload|metadata|boolean|undefined)\b/i,
] as const;

/**
 * API 원문 중 사용자가 이해할 수 있는 한국어 안내는 유지하고, 라우트·DTO·HTML처럼
 * 행동에 도움이 되지 않는 구현 세부사항만 화면별 안내 문구로 대체한다.
 */
export function toUserFacingApiErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : "";
  const payload = error && typeof error === "object"
    ? (error as { payload?: unknown }).payload
    : undefined;
  const payloadMessage = payload && typeof payload === "object"
    ? (payload as { message?: unknown }).message
    : undefined;
  const candidates = Array.isArray(payloadMessage)
    ? payloadMessage.filter((entry): entry is string => typeof entry === "string")
    : typeof payloadMessage === "string"
      ? [payloadMessage]
      : [message];
  const userFacing = [...new Set(candidates
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && /[가-힣]/.test(entry))
    .filter((entry) => !TECHNICAL_API_MESSAGE_PATTERNS.some((pattern) => pattern.test(entry))))];
  return userFacing.length ? userFacing.join(" ") : fallback;
}
