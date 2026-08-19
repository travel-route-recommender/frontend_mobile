/**
 * 외부 예약 링크는 브라우저가 처리할 수 있는 http(s)만 허용한다. 임의 앱 스킴은
 * 설치 여부·권한 설정에 따라 실패 양상이 달라지고 persisted 링크 악용 가능성도 있어
 * 저장하지 않는다. https universal/app link는 설치된 앱이 있으면 OS가 앱으로 연결한다.
 */
export function normalizeExternalTravelDocumentUrl(value: string) {
  const raw = value.trim();
  if (!raw || raw.length > 2_048) return undefined;
  try {
    const parsed = new URL(raw);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname) return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}
