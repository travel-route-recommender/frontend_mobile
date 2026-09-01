import type {
  EntityId,
} from "../../../domain";
import type {
  SharedCandidateMemberSignal,
  SharedCandidatePreferenceEvidence,
  SharedDuriPreferenceEvidence,
  SharedPreferenceAxisEvidence,
  SharedPreferenceAxisId,
  SharedPreferenceMemberEvidence,
} from "../../../duri/duri-analysis";
import { apiClient, type ApiClient } from "../../../services/apiClient";

type UnknownRecord = Record<string, unknown>;

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const axisIds: readonly SharedPreferenceAxisId[] = [
  "scheduleDensity",
  "landmarkNecessity",
  "localInterest",
  "challenging",
];
const mobilityStatuses = ["present", "missing", "stale"] as const;
const updateSignalKeys = new Set(["mustVisit", "avoid", "preferenceStrength"]);

export class RoomPreferenceApiContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "RoomPreferenceApiContractError";
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new RoomPreferenceApiContractError(path, message);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "객체여야 합니다.");
  return value as UnknownRecord;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "배열이어야 합니다.");
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(path, "비어 있지 않은 문자열이어야 합니다.");
  return value.trim();
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : asString(value, path);
}

function objectId(value: unknown, path: string): EntityId {
  const id = asString(value, path);
  return MONGO_OBJECT_ID_PATTERN.test(id) ? id : fail(path, "24자리 Mongo ObjectId여야 합니다.");
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) return fail(path, "0 이상의 정수여야 합니다.");
  return value as number;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) return fail(path, "1 이상의 정수여야 합니다.");
  return value as number;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail(path, "유한한 숫자여야 합니다.");
  return value;
}

function nullableTimestamp(value: unknown, path: string): string | null {
  if (value === null) return null;
  const timestamp = asString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) return fail(path, "유효한 ISO 날짜와 시각이어야 합니다.");
  return timestamp;
}

function stringArray(value: unknown, path: string): string[] {
  return asArray(value, path).map((entry, index) => asString(entry, `${path}[${index}]`));
}

function nullableBoolean(value: unknown, path: string): boolean | null {
  if (value === null) return null;
  if (typeof value !== "boolean") return fail(path, "boolean 또는 null이어야 합니다.");
  return value;
}

function nullablePreferenceStrength(value: unknown, path: string): 1 | 2 | 3 | 4 | 5 | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    return fail(path, "1~5 정수 또는 null이어야 합니다.");
  }
  return value as 1 | 2 | 3 | 4 | 5;
}

function parseAxis(value: unknown, path: string): SharedPreferenceAxisEvidence {
  const record = asRecord(value, path);
  const range = asArray(record.range, `${path}.range`);
  if (range.length !== 2) return fail(`${path}.range`, "[최솟값, 최댓값] 두 값이어야 합니다.");
  const minimum = finiteNumber(range[0], `${path}.range[0]`);
  const maximum = finiteNumber(range[1], `${path}.range[1]`);
  const resolution = finiteNumber(record.resolution, `${path}.resolution`);
  const axisValue = finiteNumber(record.value, `${path}.value`);
  if (minimum >= maximum) return fail(`${path}.range`, "최솟값이 최댓값보다 작아야 합니다.");
  if (resolution <= 0 || resolution > maximum - minimum) return fail(`${path}.resolution`, "범위 안의 양수여야 합니다.");
  if (axisValue < minimum || axisValue > maximum) return fail(`${path}.value`, "명시된 범위 안이어야 합니다.");
  const gridPosition = (axisValue - minimum) / resolution;
  if (Math.abs(gridPosition - Math.round(gridPosition)) > Number.EPSILON * Math.max(1, Math.abs(gridPosition)) * 8) {
    return fail(`${path}.value`, "명시된 해상도 격자에 맞아야 합니다.");
  }
  if (record.unit !== "score") return fail(`${path}.unit`, "score여야 합니다.");
  if (record.source !== "quiz") return fail(`${path}.source`, "quiz여야 합니다.");
  if (record.method !== "rule-based-4axis") return fail(`${path}.method`, "rule-based-4axis여야 합니다.");
  return {
    value: axisValue,
    unit: "score",
    range: [minimum, maximum],
    resolution,
    source: "quiz",
    method: "rule-based-4axis",
  };
}

function parseMember(value: unknown, path: string): SharedPreferenceMemberEvidence {
  const record = asRecord(value, path);
  const travelTypeRecord = record.travelType === null ? null : asRecord(record.travelType, `${path}.travelType`);
  const personalityRecord = record.personalityAxes === null ? null : asRecord(record.personalityAxes, `${path}.personalityAxes`);
  const mobility = asRecord(record.mobilityConstraints, `${path}.mobilityConstraints`);
  const mobilityStatus = asString(mobility.status, `${path}.mobilityConstraints.status`);
  if (!mobilityStatuses.includes(mobilityStatus as typeof mobilityStatuses[number])) {
    return fail(`${path}.mobilityConstraints.status`, "present, missing, stale 중 하나여야 합니다.");
  }
  return {
    userId: objectId(record.userId, `${path}.userId`),
    nickname: nullableString(record.nickname, `${path}.nickname`),
    travelType: travelTypeRecord ? {
      name: asString(travelTypeRecord.name, `${path}.travelType.name`),
      tags: stringArray(travelTypeRecord.tags, `${path}.travelType.tags`),
      emoji: asString(travelTypeRecord.emoji, `${path}.travelType.emoji`),
    } : null,
    personalityAxes: personalityRecord ? Object.fromEntries(axisIds.map((axisId) => [
      axisId,
      parseAxis(personalityRecord[axisId], `${path}.personalityAxes.${axisId}`),
    ])) as Record<SharedPreferenceAxisId, SharedPreferenceAxisEvidence> : null,
    mobilityConstraints: {
      values: stringArray(mobility.values, `${path}.mobilityConstraints.values`),
      status: mobilityStatus as typeof mobilityStatuses[number],
      source: asString(mobility.source, `${path}.mobilityConstraints.source`),
      version: positiveInteger(mobility.version, `${path}.mobilityConstraints.version`),
      updatedAt: nullableTimestamp(mobility.updatedAt, `${path}.mobilityConstraints.updatedAt`),
    },
    preferenceUpdatedAt: nullableTimestamp(record.preferenceUpdatedAt, `${path}.preferenceUpdatedAt`),
    interestTags: stringArray(record.interestTags, `${path}.interestTags`),
  };
}

export function parseSharedCandidateMemberSignal(value: unknown, path: string): SharedCandidateMemberSignal {
  const record = asRecord(value, path);
  return {
    userId: objectId(record.userId, `${path}.userId`),
    mustVisit: nullableBoolean(record.mustVisit, `${path}.mustVisit`),
    avoid: nullableBoolean(record.avoid, `${path}.avoid`),
    preferenceStrength: nullablePreferenceStrength(record.preferenceStrength, `${path}.preferenceStrength`),
    version: positiveInteger(record.version, `${path}.version`),
    updatedAt: nullableTimestamp(record.updatedAt, `${path}.updatedAt`),
  };
}

function parseCandidate(value: unknown, path: string): SharedCandidatePreferenceEvidence {
  const record = asRecord(value, path);
  const signals = asArray(record.signals, `${path}.signals`)
    .map((signal, index) => parseSharedCandidateMemberSignal(signal, `${path}.signals[${index}]`));
  if (new Set(signals.map((signal) => signal.userId)).size !== signals.length) {
    return fail(`${path}.signals`, "같은 userId 신호가 중복될 수 없습니다.");
  }
  return { placeId: objectId(record.placeId, `${path}.placeId`), signals };
}

function sameCandidateSignal(left: SharedCandidateMemberSignal, right: SharedCandidateMemberSignal) {
  return left.userId === right.userId
    && left.mustVisit === right.mustVisit
    && left.avoid === right.avoid
    && left.preferenceStrength === right.preferenceStrength
    && left.version === right.version
    && left.updatedAt === right.updatedAt;
}

/**
 * Backend candidatePlaces는 같은 장소를 담은 참여자별 row로 보존할 수 있다.
 * preferences 응답의 동일 placeId row를 하나의 분석 증거로 합치되, 동일
 * userId의 같은 revision이 서로 다른 값을 주장하면 임의로 선택하지 않는다.
 */
function mergeCandidateEvidence(
  candidates: readonly SharedCandidatePreferenceEvidence[],
): SharedCandidatePreferenceEvidence[] {
  const byPlace = new Map<EntityId, Map<EntityId, SharedCandidateMemberSignal>>();
  candidates.forEach((candidate, candidateIndex) => {
    const signals = byPlace.get(candidate.placeId) ?? new Map<EntityId, SharedCandidateMemberSignal>();
    candidate.signals.forEach((signal, signalIndex) => {
      const previous = signals.get(signal.userId);
      if (!previous || signal.version > previous.version) {
        signals.set(signal.userId, signal);
        return;
      }
      if (signal.version < previous.version || sameCandidateSignal(previous, signal)) return;
      fail(
        `preferences.candidateSignals[${candidateIndex}].signals[${signalIndex}]`,
        "같은 장소·사용자의 동일 revision 신호가 서로 달라 분석할 수 없습니다.",
      );
    });
    byPlace.set(candidate.placeId, signals);
  });
  return [...byPlace.entries()]
    .map(([placeId, signals]) => ({
      placeId,
      signals: [...signals.values()].sort((left, right) => left.userId.localeCompare(right.userId)),
    }))
    .sort((left, right) => left.placeId.localeCompare(right.placeId));
}

function assertExactSet(actual: readonly string[], expected: readonly string[], path: string) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length) return fail(path, "ID가 중복될 수 없습니다.");
  if (expectedSet.size !== expected.length) return fail(path, "비교할 ID가 중복되어 있습니다.");
  if (actualSet.size !== expectedSet.size || [...actualSet].some((id) => !expectedSet.has(id))) {
    return fail(path, "현재 여행방의 ID 집합과 일치하지 않습니다.");
  }
}

export function assertRoomPreferenceEvidenceScope(
  evidence: SharedDuriPreferenceEvidence,
  expected: { roomId: EntityId; memberIds: readonly EntityId[]; candidatePlaceIds?: readonly EntityId[] },
) {
  if (evidence.roomId !== expected.roomId) return fail("preferences.roomId", "요청한 여행방과 일치하지 않습니다.");
  assertExactSet(evidence.members.map((member) => member.userId), expected.memberIds, "preferences.members");
  const memberIds = new Set(expected.memberIds);
  evidence.candidateSignals.forEach((candidate, candidateIndex) => {
    candidate.signals.forEach((signal, signalIndex) => {
      if (!memberIds.has(signal.userId)) {
        fail(`preferences.candidateSignals[${candidateIndex}].signals[${signalIndex}].userId`, "여행방 멤버가 아닙니다.");
      }
    });
  });
  if (expected.candidatePlaceIds) {
    assertExactSet(
      evidence.candidateSignals.map((candidate) => candidate.placeId),
      expected.candidatePlaceIds,
      "preferences.candidateSignals",
    );
  }
  return evidence;
}

export function parseRoomPreferenceEvidence(
  value: unknown,
  expected: { roomId: EntityId; memberIds: readonly EntityId[]; candidatePlaceIds?: readonly EntityId[] },
): SharedDuriPreferenceEvidence {
  const record = asRecord(value, "preferences");
  const evidence: SharedDuriPreferenceEvidence = {
    roomId: objectId(expected.roomId, "roomId"),
    factsVersion: nonNegativeInteger(record.factsVersion, "preferences.factsVersion"),
    scheduleVersion: nonNegativeInteger(record.scheduleVersion, "preferences.scheduleVersion"),
    members: asArray(record.members, "preferences.members")
      .map((member, index) => parseMember(member, `preferences.members[${index}]`)),
    candidateSignals: mergeCandidateEvidence(
      asArray(record.candidateSignals, "preferences.candidateSignals")
        .map((candidate, index) => parseCandidate(candidate, `preferences.candidateSignals[${index}]`)),
    ),
  };
  return assertRoomPreferenceEvidenceScope(evidence, expected);
}

export type UpdateRoomCandidateSignalInput = {
  mustVisit?: boolean;
  avoid?: boolean;
  preferenceStrength?: 1 | 2 | 3 | 4 | 5;
};

export type UpdateRoomCandidateSignalResult = {
  placeId: EntityId;
  signal: SharedCandidateMemberSignal;
  factsVersion: number;
};

export function buildUpdateRoomCandidateSignalPayload(input: UpdateRoomCandidateSignalInput) {
  const record = input as UnknownRecord;
  const keys = Object.keys(record);
  if (!keys.length) return fail("candidateSignal", "변경할 신호가 하나 이상 필요합니다.");
  if (keys.some((key) => !updateSignalKeys.has(key))) return fail("candidateSignal", "지원하지 않는 필드가 있습니다.");
  if (input.mustVisit !== undefined && typeof input.mustVisit !== "boolean") return fail("candidateSignal.mustVisit", "boolean이어야 합니다.");
  if (input.avoid !== undefined && typeof input.avoid !== "boolean") return fail("candidateSignal.avoid", "boolean이어야 합니다.");
  if (input.preferenceStrength !== undefined && (!Number.isInteger(input.preferenceStrength) || input.preferenceStrength < 1 || input.preferenceStrength > 5)) {
    return fail("candidateSignal.preferenceStrength", "1~5 정수여야 합니다.");
  }
  if (input.mustVisit === true && input.avoid === true) return fail("candidateSignal", "mustVisit과 avoid를 동시에 true로 저장할 수 없습니다.");
  return {
    ...(input.mustVisit === undefined ? {} : { mustVisit: input.mustVisit }),
    ...(input.avoid === undefined ? {} : { avoid: input.avoid }),
    ...(input.preferenceStrength === undefined ? {} : { preferenceStrength: input.preferenceStrength }),
  };
}

export function parseUpdateRoomCandidateSignalResult(
  value: unknown,
  expected: { placeId: EntityId; userId?: EntityId },
): UpdateRoomCandidateSignalResult {
  const record = asRecord(value, "candidateSignalResult");
  const placeId = objectId(record.placeId, "candidateSignalResult.placeId");
  if (placeId !== expected.placeId) return fail("candidateSignalResult.placeId", "요청한 후보와 일치하지 않습니다.");
  const signal = parseSharedCandidateMemberSignal(record.signal, "candidateSignalResult.signal");
  if (expected.userId && signal.userId !== expected.userId) {
    return fail("candidateSignalResult.signal.userId", "현재 사용자와 일치하지 않습니다.");
  }
  return {
    placeId,
    signal,
    factsVersion: nonNegativeInteger(record.factsVersion, "candidateSignalResult.factsVersion"),
  };
}

export function createRoomPreferenceApiGateway(client: ApiClient) {
  return {
    async fetch(
      roomId: EntityId,
      expected: { memberIds: readonly EntityId[]; candidatePlaceIds?: readonly EntityId[] },
      signal?: AbortSignal,
    ) {
      const id = objectId(roomId, "roomId");
      const payload = await client.request<unknown>({
        path: `/rooms/${encodeURIComponent(id)}/preferences`,
        signal,
        auth: true,
      });
      return parseRoomPreferenceEvidence(payload, { roomId: id, ...expected });
    },
    async updateCandidateSignal(
      roomId: EntityId,
      placeId: EntityId,
      input: UpdateRoomCandidateSignalInput,
      options: { userId?: EntityId; signal?: AbortSignal } = {},
    ) {
      const id = objectId(roomId, "roomId");
      const candidateId = objectId(placeId, "placeId");
      const payload = await client.request<unknown>({
        path: `/rooms/${encodeURIComponent(id)}/candidates/${encodeURIComponent(candidateId)}/signals`,
        method: "PUT",
        body: buildUpdateRoomCandidateSignalPayload(input),
        signal: options.signal,
        auth: true,
      });
      return parseUpdateRoomCandidateSignalResult(payload, {
        placeId: candidateId,
        ...(options.userId ? { userId: objectId(options.userId, "userId") } : {}),
      });
    },
  };
}

export const roomPreferenceApiGateway = createRoomPreferenceApiGateway(apiClient);
