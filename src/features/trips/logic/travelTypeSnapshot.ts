const MAX_TRAVEL_TYPE_TAG_COUNT = 64;
const MAX_TRAVEL_TYPE_TAG_LENGTH = 80;

export type TravelTypeTagParseResult =
  | { ok: true; tags: string[] }
  | { ok: false; message: string };

export type TravelTypeSnapshotRecordParseResult =
  | { ok: true; snapshot?: Record<string, unknown> }
  | { ok: false; message: string };

export function parseTravelTypeSnapshotRecord(value: unknown): TravelTypeSnapshotRecordParseResult {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "객체여야 합니다." };
  return { ok: true, snapshot: value as Record<string, unknown> };
}

export function hasDuplicateMemberIds(memberIds: readonly string[]) {
  return new Set(memberIds).size !== memberIds.length;
}

/**
 * 서버가 실제로 보존한 travelTypeSnapshot.tags만 읽는다. 누락은 근거 없음으로
 * 유지하고, 존재하는 값의 타입·크기는 엄격히 제한해 분석 입력 오염을 막는다.
 */
export function parseTravelTypeSnapshotTags(value: unknown): TravelTypeTagParseResult {
  if (value === undefined) return { ok: true, tags: [] };
  if (!Array.isArray(value)) return { ok: false, message: "문자열 배열이어야 합니다." };
  if (value.length > MAX_TRAVEL_TYPE_TAG_COUNT) {
    return { ok: false, message: `${MAX_TRAVEL_TYPE_TAG_COUNT}개 이하여야 합니다.` };
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) {
      return { ok: false, message: "각 태그는 비어 있지 않은 문자열이어야 합니다." };
    }
    const tag = entry.trim();
    if (tag.length > MAX_TRAVEL_TYPE_TAG_LENGTH) {
      return { ok: false, message: `각 태그는 ${MAX_TRAVEL_TYPE_TAG_LENGTH}자 이하여야 합니다.` };
    }
    const normalized = tag.normalize("NFKC").toLocaleLowerCase("ko-KR");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(tag);
  }
  return { ok: true, tags };
}
