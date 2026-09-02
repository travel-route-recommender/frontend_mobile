import { apiClient, type ApiClient } from "../../../services/apiClient";
import {
  parseBackendWorkspacePlanning,
  type BackendPlaceAnchor,
  type BackendWorkspacePlanning,
} from "./workspaceScheduleContract";

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TRANSPORT_MODES = ["car", "transit", "walk", "mixed"] as const;
const ANCHOR_SOURCES = ["tour", "kakao", "manual"] as const;
const PLANNING_FIELDS = new Set([
  "timezone",
  "lodging",
  "returnPoint",
  "transportMode",
  "returnDeadline",
  "travelBufferMinutes",
  "prepBufferMinutes",
  "confirm",
]);
const ANCHOR_FIELDS = new Set(["name", "lat", "lng", "placeId", "externalId", "source"]);

export type WorkspacePlanningPatch = {
  timezone?: string;
  lodging?: BackendPlaceAnchor | null;
  returnPoint?: BackendPlaceAnchor | null;
  transportMode?: typeof TRANSPORT_MODES[number];
  returnDeadline?: string;
  travelBufferMinutes?: number;
  prepBufferMinutes?: number;
  confirm?: boolean;
};

export class WorkspacePlanningRequestError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "WorkspacePlanningRequestError";
    this.field = field;
  }
}

function fail(field: string, message: string): never {
  throw new WorkspacePlanningRequestError(field, message);
}

function normalizeRoomId(roomId: string) {
  const normalized = roomId.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(normalized)) {
    return fail("roomId", "서버 여행방 ObjectId 형식이어야 합니다.");
  }
  return normalized;
}

function normalizeRequiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) return fail(field, "비어 있을 수 없습니다.");
  return normalized;
}

function normalizeTimezone(value: string) {
  const normalized = normalizeRequiredText(value, "planning.timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
  } catch {
    return fail("planning.timezone", "지원되는 IANA timezone이어야 합니다.");
  }
  return normalized;
}

function normalizeAnchor(anchor: BackendPlaceAnchor, field: "planning.lodging" | "planning.returnPoint"): BackendPlaceAnchor {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
    return fail(field, "장소 객체여야 합니다.");
  }
  const unknownField = Object.keys(anchor).find((key) => !ANCHOR_FIELDS.has(key));
  if (unknownField) return fail(`${field}.${unknownField}`, "Backend PlaceAnchorDto에 없는 필드입니다.");
  const name = normalizeRequiredText(anchor.name, `${field}.name`);
  const hasLat = anchor.lat !== undefined;
  const hasLng = anchor.lng !== undefined;
  if (hasLat !== hasLng) return fail(field, "좌표는 lat과 lng를 함께 전달해야 합니다.");
  if (hasLat && (!Number.isFinite(anchor.lat) || (anchor.lat as number) < -90 || (anchor.lat as number) > 90)) {
    return fail(`${field}.lat`, "-90부터 90 사이의 유한한 숫자여야 합니다.");
  }
  if (hasLng && (!Number.isFinite(anchor.lng) || (anchor.lng as number) < -180 || (anchor.lng as number) > 180)) {
    return fail(`${field}.lng`, "-180부터 180 사이의 유한한 숫자여야 합니다.");
  }
  if (anchor.placeId !== undefined && !MONGO_OBJECT_ID_PATTERN.test(anchor.placeId.trim())) {
    return fail(`${field}.placeId`, "서버 장소 ObjectId 형식이어야 합니다.");
  }
  if (anchor.source !== undefined && !ANCHOR_SOURCES.includes(anchor.source)) {
    return fail(`${field}.source`, `${ANCHOR_SOURCES.join(", ")} 중 하나여야 합니다.`);
  }
  const externalId = anchor.externalId === undefined
    ? undefined
    : normalizeRequiredText(anchor.externalId, `${field}.externalId`);
  return {
    name,
    ...(hasLat ? { lat: anchor.lat, lng: anchor.lng } : {}),
    ...(anchor.placeId ? { placeId: anchor.placeId.trim() } : {}),
    ...(externalId ? { externalId } : {}),
    ...(anchor.source ? { source: anchor.source } : {}),
  };
}

function normalizeNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail(field, "0 이상의 안전한 정수여야 합니다.");
  }
  return value;
}

/**
 * Build the exact UpdatePlanningDto wire body. Undefined means "do not edit";
 * only lodging and returnPoint support explicit null deletion in the Backend.
 */
export function buildWorkspacePlanningPatch(patch: WorkspacePlanningPatch): WorkspacePlanningPatch {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return fail("planning", "수정 객체여야 합니다.");
  }
  const unknownField = Object.keys(patch).find((key) => !PLANNING_FIELDS.has(key));
  if (unknownField) return fail(`planning.${unknownField}`, "Backend UpdatePlanningDto에 없는 필드입니다.");
  const body: WorkspacePlanningPatch = {};
  if (patch.timezone !== undefined) body.timezone = normalizeTimezone(patch.timezone);
  if (patch.lodging !== undefined) body.lodging = patch.lodging === null ? null : normalizeAnchor(patch.lodging, "planning.lodging");
  if (patch.returnPoint !== undefined) body.returnPoint = patch.returnPoint === null ? null : normalizeAnchor(patch.returnPoint, "planning.returnPoint");
  if (patch.transportMode !== undefined) {
    if (!TRANSPORT_MODES.includes(patch.transportMode)) {
      return fail("planning.transportMode", `${TRANSPORT_MODES.join(", ")} 중 하나여야 합니다.`);
    }
    body.transportMode = patch.transportMode;
  }
  if (patch.returnDeadline !== undefined) {
    if (!TIME_PATTERN.test(patch.returnDeadline)) return fail("planning.returnDeadline", "HH:mm 형식이어야 합니다.");
    body.returnDeadline = patch.returnDeadline;
  }
  if (patch.travelBufferMinutes !== undefined) {
    body.travelBufferMinutes = normalizeNonNegativeInteger(patch.travelBufferMinutes, "planning.travelBufferMinutes");
  }
  if (patch.prepBufferMinutes !== undefined) {
    body.prepBufferMinutes = normalizeNonNegativeInteger(patch.prepBufferMinutes, "planning.prepBufferMinutes");
  }
  if (patch.confirm !== undefined) {
    if (typeof patch.confirm !== "boolean") return fail("planning.confirm", "boolean이어야 합니다.");
    body.confirm = patch.confirm;
  }
  if (!Object.keys(body).some((key) => key !== "confirm")) {
    return fail("planning", "수정할 planning 값이 하나 이상 필요합니다.");
  }
  return body;
}

export interface WorkspacePlanningApiGateway {
  update(roomId: string, patch: WorkspacePlanningPatch, signal?: AbortSignal): Promise<BackendWorkspacePlanning>;
}

export class HttpWorkspacePlanningApiGateway implements WorkspacePlanningApiGateway {
  constructor(private readonly client: ApiClient = apiClient) {}

  async update(roomId: string, patch: WorkspacePlanningPatch, signal?: AbortSignal) {
    const normalizedRoomId = normalizeRoomId(roomId);
    const body = buildWorkspacePlanningPatch(patch);
    const payload = await this.client.request<unknown>({
      path: `/rooms/${encodeURIComponent(normalizedRoomId)}/planning`,
      method: "PATCH",
      body,
      signal,
      auth: true,
    });
    const planning = parseBackendWorkspacePlanning(payload, "planning");
    if (!planning) return fail("planning", "서버가 planning 객체를 반환하지 않았습니다.");
    return planning;
  }
}

export const workspacePlanningApiGateway = new HttpWorkspacePlanningApiGateway();
