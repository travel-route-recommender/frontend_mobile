const DEFAULT_PREVIEW_LENGTH = 96;

const replacements: readonly [RegExp, string][] = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[이메일 숨김]"],
  [/(^|[^\d])\d{6}\s*[- ]\s*[1-8]\d{6}(?=$|[^\d])/g, "$1[주민번호 숨김]"],
  [/(^|[^\d])(?:\+?82[-.\s]?(?:0)?|0)(?:1[016789]|2|[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?=$|[^\d])/g, "$1[전화번호 숨김]"],
  [/((?:(?:\b(?:PNR|booking\s*(?:id|no\.?|number|code|ref(?:erence)?)|reservation\s*(?:id|no\.?|number|code|ref(?:erence)?)|confirmation\s*(?:id|no\.?|number|code)|ticket\s*(?:id|no\.?|number)|passport\s*(?:id|no\.?|number)))|(?:예약(?:번호|코드)|예매번호|발권번호|승차권번호|티켓번호|여권번호))\s*[:#-]?\s*)[A-Z0-9][A-Z0-9-]{3,}/gi, "$1[식별정보 숨김]"],
  [/(^|[^\d])(?:\d[ -]?){13,19}(?=$|[^\d])/g, "$1[결제·티켓번호 숨김]"],
  [/([?&](?:token|access_token|key|booking|reservation|confirmation|ticket_id)=)[^&#\s]+/gi, "$1[숨김]"],
];

export function redactSensitiveText(value: string) {
  let redacted = value.normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .trim();
  replacements.forEach(([pattern, replacement]) => {
    redacted = redacted.replace(pattern, replacement);
  });
  return redacted;
}

/** OCR 원문을 저장하지 않고 검토에 필요한 짧은 비식별 preview만 남긴다. */
export function redactSensitiveTextPreview(value: string, maxLength = DEFAULT_PREVIEW_LENGTH) {
  const safeLength = Math.min(160, Math.max(0, Math.trunc(maxLength)));
  return redactSensitiveText(value).replace(/\s+/g, " ").slice(0, safeLength);
}
