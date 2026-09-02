const DEFAULT_AUTH_ERROR_MESSAGE = "인증 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  userInfo?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : undefined;
}

function errorParts(error: unknown) {
  if (typeof error === "string") return { message: error, searchable: error };

  const record = asRecord(error) as ErrorLike | undefined;
  const message = typeof record?.message === "string" ? record.message.trim() : "";
  const code = typeof record?.code === "string" ? record.code.trim() : "";
  const userInfo = asRecord(record?.userInfo);
  const nativeMessage = typeof userInfo?.nativeErrorMessage === "string"
    ? userInfo.nativeErrorMessage.trim()
    : "";

  return {
    message,
    searchable: [code, message, nativeMessage].filter(Boolean).join(" "),
  };
}

/**
 * 네이티브 인증 SDK와 백엔드가 전달한 원문을 사용자용 한국어 문구로 바꾼다.
 * 앱에서 직접 작성한 한국어 오류는 구체적인 안내를 잃지 않도록 그대로 유지한다.
 */
export function toKoreanAuthErrorMessage(
  error: unknown,
  fallback = DEFAULT_AUTH_ERROR_MESSAGE,
) {
  const { message, searchable } = errorParts(error);

  if (/err_web_browser_blocked|popup (?:was )?blocked|pop-up (?:was )?blocked/i.test(searchable)) {
    return "로그인 창을 열 수 없어요. 팝업 차단을 해제한 뒤 다시 시도해 주세요.";
  }
  if (/err_web_browser_redirect|no auth session is currently in progress|redirect url.*(?:not match|mismatch)/i.test(searchable)) {
    return "로그인 완료 정보를 앱으로 가져오지 못했어요. 다시 시도해 주세요.";
  }
  if (/cancel(?:l)?ed|cancel(?:l)?ation|user[_ -]?cancel|access[_ -]?denied|dismiss(?:ed|al)?/i.test(searchable)) {
    return "로그인이 취소됐어요.";
  }
  if (/email already registered|email.*(?:already|duplicate|exists)|account.*(?:already|exists)/i.test(searchable)) {
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  }
  if (/invalid credentials|incorrect (?:email|password)|wrong password|authentication failed/i.test(searchable)) {
    return "이메일 또는 비밀번호가 올바르지 않아요.";
  }
  if (/invalid invite code|invite.*(?:invalid|expired)/i.test(searchable)) {
    return "유효하지 않거나 만료된 초대 코드예요.";
  }
  if (/invalid refresh token|invalid token|token.*expired|session.*expired|unauthori[sz]ed/i.test(searchable)) {
    return "로그인 정보가 만료됐어요. 다시 로그인해 주세요.";
  }
  if (/network request failed|failed to fetch|network error|internet|offline|timed? ?out|timeout|connection (?:failed|lost|refused)|unable to resolve host/i.test(searchable)) {
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }

  if (/[가-힣]/.test(message)) return message;
  return fallback;
}
