export type TripSnapshotVersion = {
  scheduleVersion: number;
  factsVersion: number;
};

/**
 * factsVersion 도입 전 서버가 방 상세에서 필드를 생략한 경우만 최초 버전 0으로
 * 해석한다. null, 문자열, 음수처럼 손상된 값은 계약 오류로 남긴다.
 */
export function normalizeLegacyRoomFactsVersion(value: unknown) {
  if (value === undefined) return 0;
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

export type VersionFencedRead<T> = {
  value?: T;
  versions: readonly TripSnapshotVersion[];
};

export const TRIP_SNAPSHOT_MAX_ATTEMPTS = 3;

export function sameTripSnapshotVersion(
  left: TripSnapshotVersion,
  right: TripSnapshotVersion,
) {
  return left.scheduleVersion === right.scheduleVersion
    && left.factsVersion === right.factsVersion;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  const error = new Error("Request aborted");
  error.name = "AbortError";
  throw error;
}

/**
 * 여러 API에서 조합한 여행방 상세가 하나의 schedule/facts revision에
 * 속할 때만 게시한다. 변경 중인 snapshot은 짧게 다시 읽고, 끝까지
 * 안정되지 않으면 undefined를 반환해 호출자가 사용자용 오류로 바꾼다.
 */
export async function readVersionFencedTripSnapshot<T>(input: {
  readAttempt: (attempt: number) => Promise<VersionFencedRead<T>>;
  signal?: AbortSignal;
  maxAttempts?: number;
}) {
  const maxAttempts = input.maxAttempts ?? TRIP_SNAPSHOT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(input.signal);
    const result = await input.readAttempt(attempt);
    throwIfAborted(input.signal);
    const reference = result.versions[0];
    if (
      result.value !== undefined
      && reference
      && result.versions.every((version) => sameTripSnapshotVersion(reference, version))
    ) {
      return result.value;
    }
  }
  return undefined;
}
