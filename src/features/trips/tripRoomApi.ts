import type {
  EntityId,
  ItineraryItem,
  Place,
  Region,
  TripCandidate,
  TripMember,
  TripStatus,
  User,
} from "../../domain";
import type { SharedDuriPreferenceEvidence, SharedPreferenceEvidenceStatus } from "../../duri/duri-analysis";
import { environment } from "../../config/environment";
import { apiClient } from "../../services/apiClient";
import { formatTripDateRange, formatTripStatus, isValidISODate } from "../../utils/formatters";
import { getTripTimingLabel } from "./utils/tripDateUtils";
import type { RoomPreferenceResponseSummary } from "./selectors";
import type { TripPreparationProgress, TripPreparationStep, TripRoomCardViewModel } from "./types";
import { workspaceScheduleApiGateway } from "../workspace/services/workspaceScheduleApi";
import {
  applyWorkspaceScheduleLocalOverlays,
  type WorkspaceScheduleSnapshot,
} from "../workspace/services/workspaceScheduleContract";
import { loadApiWorkspaceOverlaysWithStatus } from "../workspace/services/apiWorkspaceOverlayStorage";
import { loadApiTripLocalFactsWithStatus, type ApiTripLocalFacts } from "../trip-creation/services/apiTripFactsStorage";
import { fetchApiTripDocuments, type ApiTripDocument } from "../trip-documents/services/tripDocumentApi";
import { fetchApiPreferenceCompletion } from "../preferences/services/preferenceProfileApi";
import { hasDuplicateMemberIds, parseTravelTypeSnapshotRecord, parseTravelTypeSnapshotTags } from "./logic/travelTypeSnapshot";
import {
  RoomPreferenceApiContractError,
  assertRoomPreferenceEvidenceScope,
  roomPreferenceApiGateway,
} from "../duri/services/roomPreferenceApi";

type UnknownRecord = Record<string, unknown>;

export class TripRoomApiContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "TripRoomApiContractError";
    this.path = path;
  }
}

export type ApiTripRoomMember = TripMember & {
  joinedAt?: string;
  travelTypeName?: string;
  travelTypeTags: string[];
  hasTravelTypeSnapshot: boolean;
};

export type ApiDirectoryUser = User & {
  hasTravelType: boolean;
  travelTypeName?: string;
  travelTypeTags: string[];
};

export type ApiTripRoom = {
  id: EntityId;
  title: string;
  destinationName: string;
  destinationRegionCode?: string;
  startDate: string | null;
  endDate: string | null;
  status: TripStatus;
  createdBy: EntityId;
  members: ApiTripRoomMember[];
  inviteCode: string;
  inviteLink?: string;
  progress: { label: string; currentStep: number; percent: number };
  candidateCount: number;
  scheduleItemCount: number;
  scheduleVersion: number;
  factsVersion: number;
};

export type ApiLocalDataStatus = "loaded" | "missing" | "unavailable";

export type ApiTripDetailData = {
  room: ApiTripRoom;
  region: Region;
  usersById: Record<EntityId, User>;
  candidates: TripCandidate[];
  placesById: Record<EntityId, Place>;
  itinerary: ItineraryItem[];
  scheduleSnapshot?: WorkspaceScheduleSnapshot;
  itineraryItemLabelsById: Record<EntityId, string>;
  preferenceSummary: RoomPreferenceResponseSummary;
  preparation: TripPreparationProgress;
  localFacts: ApiTripLocalFacts | null;
  localFactsStatus: ApiLocalDataStatus;
  workspaceOverlayStatus: ApiLocalDataStatus;
  sharedPreferenceEvidence: SharedDuriPreferenceEvidence | null;
  sharedPreferenceEvidenceStatus: SharedPreferenceEvidenceStatus;
  sharedDocuments: ApiTripDocument[];
  sharedDocumentsStatus: "loaded" | "unavailable";
};

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function fail(path: string, message: string): never {
  throw new TripRoomApiContractError(path, message);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "객체 응답이어야 합니다.");
  return value as UnknownRecord;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "배열 응답이어야 합니다.");
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(path, "비어 있지 않은 문자열이어야 합니다.");
  return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return fail(path, "문자열이어야 합니다.");
  return value.trim() || undefined;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) return fail(path, `${minimum} 이상의 정수여야 합니다.`);
  return value as number;
}

function optionalDateOnly(value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return fail(path, "날짜 문자열이어야 합니다.");
  const dateOnly = value.slice(0, 10);
  if (!isValidISODate(dateOnly)) return fail(path, "YYYY-MM-DD 또는 ISO 날짜여야 합니다.");
  return dateOnly;
}

function parseStatus(value: unknown, path: string): TripStatus {
  if (value === "completed") return "completed";
  if (value === "ongoing") return "planning";
  return fail(path, "ongoing 또는 completed여야 합니다.");
}

function assertRoomId(roomId: string) {
  const normalized = roomId.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(normalized)) return fail("roomId", "24자리 Mongo ObjectId여야 합니다.");
  return normalized;
}

function parseMember(value: unknown, path: string): ApiTripRoomMember {
  const record = asRecord(value, path);
  const userId = asString(record.userId, `${path}.userId`);
  if (!MONGO_OBJECT_ID_PATTERN.test(userId)) return fail(`${path}.userId`, "24자리 Mongo ObjectId여야 합니다.");
  const role = record.role === "owner" || record.role === "member"
    ? record.role
    : fail(`${path}.role`, "owner 또는 member여야 합니다.");
  const parsedTravelType = parseTravelTypeSnapshotRecord(record.travelTypeSnapshot);
  if (!parsedTravelType.ok) return fail(`${path}.travelTypeSnapshot`, parsedTravelType.message);
  const travelType = parsedTravelType.snapshot;
  const joinedAt = optionalString(record.joinedAt, `${path}.joinedAt`);
  const travelTypeName = optionalString(travelType?.name, `${path}.travelTypeSnapshot.name`);
  const parsedTravelTypeTags = parseTravelTypeSnapshotTags(travelType?.tags);
  if (!parsedTravelTypeTags.ok) return fail(`${path}.travelTypeSnapshot.tags`, parsedTravelTypeTags.message);
  return {
    userId,
    role,
    ...(joinedAt ? { joinedAt } : {}),
    ...(travelTypeName ? { travelTypeName } : {}),
    travelTypeTags: parsedTravelTypeTags.tags,
    hasTravelTypeSnapshot: Boolean(travelType && Object.keys(travelType).length),
  };
}

export function parseApiTripRoom(value: unknown): ApiTripRoom {
  const record = asRecord(value, "room");
  const id = asString(record.id, "room.id");
  if (!MONGO_OBJECT_ID_PATTERN.test(id)) return fail("room.id", "24자리 Mongo ObjectId여야 합니다.");
  const destination = record.destination === undefined || record.destination === null
    ? undefined
    : asRecord(record.destination, "room.destination");
  const progressRecord = asRecord(record.progress, "room.progress");
  const members = asArray(record.members, "room.members").map((member, index) => parseMember(member, `room.members[${index}]`));
  if (hasDuplicateMemberIds(members.map((member) => member.userId))) return fail("room.members", "같은 userId가 중복될 수 없습니다.");
  if (!members.some((member) => member.role === "owner")) return fail("room.members", "방장 멤버가 필요합니다.");
  const destinationRegionCode = optionalString(destination?.regionCode, "room.destination.regionCode");
  const inviteLink = optionalString(record.inviteLink, "room.inviteLink");
  return {
    id,
    title: asString(record.title, "room.title"),
    destinationName: optionalString(destination?.name, "room.destination.name") ?? "목적지 미정",
    ...(destinationRegionCode ? { destinationRegionCode } : {}),
    startDate: optionalDateOnly(record.startDate, "room.startDate"),
    endDate: optionalDateOnly(record.endDate, "room.endDate"),
    status: parseStatus(record.status, "room.status"),
    createdBy: asString(record.createdBy, "room.createdBy"),
    members,
    inviteCode: asString(record.inviteCode, "room.inviteCode"),
    ...(inviteLink ? { inviteLink } : {}),
    progress: {
      label: asString(progressRecord.label, "room.progress.label"),
      currentStep: integer(progressRecord.currentStep, "room.progress.currentStep"),
      percent: integer(progressRecord.percent, "room.progress.percent"),
    },
    candidateCount: integer(record.candidateCount, "room.candidateCount"),
    scheduleItemCount: integer(record.scheduleItemCount, "room.scheduleItemCount"),
    scheduleVersion: integer(record.scheduleVersion ?? 0, "room.scheduleVersion"),
    factsVersion: integer(record.factsVersion, "room.factsVersion"),
  };
}

type ApiTripSummary = {
  id: string;
  title: string;
  destination: string;
  status: TripStatus;
  startDate: string | null;
  endDate: string | null;
  currentStep: number;
};

function parseApiTripSummary(value: unknown, path: string): ApiTripSummary {
  const record = asRecord(value, path);
  const id = asString(record.id, `${path}.id`);
  if (!MONGO_OBJECT_ID_PATTERN.test(id)) return fail(`${path}.id`, "24자리 Mongo ObjectId여야 합니다.");
  return {
    id,
    title: asString(record.title, `${path}.title`),
    destination: asString(record.destination, `${path}.destination`),
    status: parseStatus(record.status, `${path}.status`),
    startDate: optionalDateOnly(record.startDate, `${path}.startDate`),
    endDate: optionalDateOnly(record.endDate, `${path}.endDate`),
    currentStep: integer(record.currentStep, `${path}.currentStep`),
  };
}

export function parseApiUserDirectory(value: unknown): Record<EntityId, ApiDirectoryUser> {
  const record = asRecord(value, "users");
  return Object.fromEntries(asArray(record.data, "users.data").map((entry, index) => {
    const user = asRecord(entry, `users.data[${index}]`);
    const id = asString(user.id, `users.data[${index}].id`);
    const name = asString(user.nickname, `users.data[${index}].nickname`);
    const profileImageUrl = optionalString(user.profileImageUrl, `users.data[${index}].profileImageUrl`);
    const parsedTravelType = parseTravelTypeSnapshotRecord(user.travelType);
    if (!parsedTravelType.ok) return fail(`users.data[${index}].travelType`, parsedTravelType.message);
    const travelTypeName = optionalString(parsedTravelType.snapshot?.name, `users.data[${index}].travelType.name`);
    const parsedTags = parseTravelTypeSnapshotTags(parsedTravelType.snapshot?.tags);
    if (!parsedTags.ok) return fail(`users.data[${index}].travelType.tags`, parsedTags.message);
    return [id, {
      id,
      name,
      initial: Array.from(name)[0] ?? "?",
      ...(profileImageUrl ? { profileImageUrl } : {}),
      hasTravelType: Boolean(parsedTravelType.snapshot && Object.keys(parsedTravelType.snapshot).length),
      ...(travelTypeName ? { travelTypeName } : {}),
      travelTypeTags: parsedTags.tags,
    } satisfies ApiDirectoryUser];
  }));
}

export async function fetchApiUserDirectory(signal?: AbortSignal) {
  const payload = await apiClient.request<unknown>({
    path: "/users",
    query: { page: 1, limit: 100, includeGuests: true },
    signal,
    auth: false,
  });
  return parseApiUserDirectory(payload);
}

function usersForRoom(room: ApiTripRoom, directory: Readonly<Record<EntityId, ApiDirectoryUser>>, currentUserId?: string | null) {
  return Object.fromEntries(room.members.map((member, index) => {
    const fromDirectory = directory[member.userId];
    if (fromDirectory) return [member.userId, fromDirectory];
    const name = member.userId === currentUserId
      ? "나"
      : member.role === "owner" ? "방장" : `동행자 ${index + 1}`;
    return [member.userId, {
      id: member.userId,
      name,
      initial: Array.from(name)[0] ?? "?",
      hasTravelType: member.hasTravelTypeSnapshot,
      ...(member.travelTypeName ? { travelTypeName: member.travelTypeName } : {}),
      travelTypeTags: member.travelTypeTags,
    } satisfies ApiDirectoryUser];
  }));
}

function hasCurrentPreference(
  member: ApiTripRoomMember,
  usersById: Readonly<Record<EntityId, ApiDirectoryUser>>,
  currentUserId?: string | null,
  currentUserCompleted?: boolean,
) {
  if (member.userId === currentUserId && currentUserCompleted !== undefined) return currentUserCompleted;
  return usersById[member.userId]?.hasTravelType ?? member.hasTravelTypeSnapshot;
}

function buildPreparation(
  room: ApiTripRoom,
  usersById: Readonly<Record<EntityId, ApiDirectoryUser>> = {},
  currentUserId?: string | null,
  currentUserCompleted?: boolean,
): TripPreparationProgress {
  const validRoom = room.destinationName !== "목적지 미정"
    && room.startDate !== null
    && room.endDate !== null
    && room.endDate >= room.startDate;
  const completedPreferenceCount = room.members.filter((member) => hasCurrentPreference(member, usersById, currentUserId, currentUserCompleted)).length;
  const preferenceStatus: TripPreparationStep["status"] = room.members.length > 0 && completedPreferenceCount === room.members.length
    ? "completed"
    : completedPreferenceCount > 0 ? "active" : "pending";
  const steps: TripPreparationStep[] = [
    { id: "room", label: "여행방 생성", description: validRoom ? "여행 지역과 날짜를 정했어요." : "여행 지역과 날짜를 확인해 주세요.", status: validRoom ? "completed" : "pending" },
    { id: "preferences", label: "동행자 성향 응답", description: `${completedPreferenceCount}/${room.members.length}명이 응답했어요.`, status: preferenceStatus, ...(preferenceStatus === "pending" ? { actionLabel: "내 성향 테스트" } : {}) },
    { id: "candidates", label: "후보 장소 수집", description: room.candidateCount ? `${room.candidateCount}곳을 후보로 모으는 중이에요.` : "함께 가고 싶은 장소를 모아보세요.", status: room.candidateCount ? "active" : "pending", actionLabel: room.candidateCount ? "후보 확인" : "장소 탐색" },
    { id: "itinerary", label: "일정 구성", description: room.scheduleItemCount ? `${room.scheduleItemCount}개 일정 항목을 구성하는 중이에요.` : "후보 장소를 일정으로 배치해 보세요.", status: room.scheduleItemCount ? "active" : "pending", actionLabel: "워크스페이스" },
    { id: "confirmation", label: "최종 확인", description: room.status === "completed" ? "완료된 여행이에요." : "모두와 확인한 뒤 일정을 확정해요.", status: room.status === "completed" ? "completed" : "pending", actionLabel: "일정 확인" },
  ];
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const activeSteps = steps.filter((step) => step.status === "active").length;
  const rate = steps.reduce((score, step) => score + (step.status === "completed" ? 1 : step.status === "active" ? 0.5 : 0), 0) / steps.length;
  return { completedSteps, activeSteps, totalSteps: steps.length, rate, steps };
}

function buildPreferenceSummary(
  room: ApiTripRoom,
  usersById: Readonly<Record<EntityId, ApiDirectoryUser>>,
  currentUserId?: string | null,
  currentUserCompleted?: boolean,
): RoomPreferenceResponseSummary {
  const members = room.members.map((member) => {
    const currentTravelTypeName = usersById[member.userId]?.travelTypeName ?? member.travelTypeName;
    return {
      userId: member.userId,
      role: member.role,
      name: usersById[member.userId]?.name ?? "알 수 없는 참여자",
      initial: usersById[member.userId]?.initial ?? "?",
      ...(usersById[member.userId]?.profileImageUrl ? { profileImageUrl: usersById[member.userId].profileImageUrl } : {}),
      state: hasCurrentPreference(member, usersById, currentUserId, currentUserCompleted) ? "completed" as const : "pending" as const,
      ...(currentTravelTypeName ? { profileType: currentTravelTypeName } : {}),
      isCurrentUser: member.userId === currentUserId,
    };
  });
  const completedMemberIds = members.filter((member) => member.state === "completed").map((member) => member.userId);
  const pendingMemberIds = members.filter((member) => member.state === "pending").map((member) => member.userId);
  const completedCount = completedMemberIds.length;
  const totalCount = members.length;
  const isComplete = totalCount > 0 && completedCount === totalCount;
  return {
    roomId: room.id,
    members,
    completedMemberIds,
    pendingMemberIds,
    invalidMemberIds: [],
    completedCount,
    pendingCount: pendingMemberIds.length,
    invalidCount: 0,
    totalCount,
    completionRate: totalCount ? completedCount / totalCount : 0,
    coverage: completedCount < 2 ? "insufficient" : isComplete ? "complete" : "partial",
    hasEnoughDataForGroupDiagnosis: completedCount >= 2,
    isComplete,
  };
}

function regionForRoom(room: ApiTripRoom): Region {
  const regionId = room.destinationRegionCode?.trim().toLocaleLowerCase("en-US") || `api-room-${room.id}`;
  return {
    id: regionId,
    name: room.destinationName,
    shortName: room.destinationName,
    description: "서버 여행방에 저장된 목적지",
    spots: room.candidateCount,
    weather: "",
    imageUrl: "",
  };
}

function placeFromCandidate(value: unknown, path: string, fallbackId: string, regionId: string): Place {
  const record = asRecord(value, path);
  const id = optionalString(record.placeId, `${path}.placeId`) ?? fallbackId;
  const name = asString(record.name, `${path}.name`);
  const tags = record.tags === undefined ? [] : asArray(record.tags, `${path}.tags`).map((tag, index) => asString(tag, `${path}.tags[${index}]`));
  const latitude = typeof record.lat === "number" && Number.isFinite(record.lat) ? record.lat : undefined;
  const longitude = typeof record.lng === "number" && Number.isFinite(record.lng) ? record.lng : undefined;
  return {
    id,
    regionId,
    name,
    category: optionalString(record.category, `${path}.category`) ?? optionalString(record.contentTypeLabel, `${path}.contentTypeLabel`) ?? "장소",
    ...(typeof record.contentTypeId === "number" && Number.isInteger(record.contentTypeId) ? { contentTypeId: record.contentTypeId } : {}),
    tags,
    distanceLabel: "",
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    imageUrl: optionalString(record.thumbnailUrl, `${path}.thumbnailUrl`) ?? "",
    address: optionalString(record.address, `${path}.address`) ?? "주소 정보 없음",
    summary: optionalString(record.description, `${path}.description`) ?? "",
  };
}

function parseCandidates(value: unknown, room: ApiTripRoom, region: Region) {
  const grouped = new Map<string, { candidate: TripCandidate; place?: Place }>();
  asArray(value, "candidates").forEach((entry, index) => {
    const record = asRecord(entry, `candidates[${index}]`);
    const placeId = asString(record.placeId, `candidates[${index}].placeId`);
    const addedBy = asString(record.addedBy, `candidates[${index}].addedBy`);
    const existing = grouped.get(placeId);
    const place = record.place ? placeFromCandidate(record.place, `candidates[${index}].place`, placeId, region.id) : existing?.place;
    const addedAt = optionalString(record.addedAt, `candidates[${index}].addedAt`);
    grouped.set(placeId, {
      candidate: {
        tripId: room.id,
        placeId,
        addedByUserIds: [...new Set([...(existing?.candidate.addedByUserIds ?? []), addedBy])],
        recommendedByDuri: false,
        ...(addedAt ? { addedAt } : {}),
      },
      ...(place ? { place } : {}),
    });
  });
  return {
    candidates: [...grouped.values()].map((value) => value.candidate),
    placesById: Object.fromEntries([...grouped.values()].flatMap((value) => value.place ? [[value.place.id, value.place]] : [])),
  };
}

async function fetchUserDirectory(signal?: AbortSignal) {
  try {
    return await fetchApiUserDirectory(signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return {};
  }
}

async function fetchCurrentPreferenceCompletion(currentUserId?: string | null, signal?: AbortSignal) {
  if (!currentUserId) return undefined;
  try {
    return await fetchApiPreferenceCompletion(signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

export async function fetchApiTripList(currentUserId?: string | null, signal?: AbortSignal) {
  const payload = await apiClient.request<unknown>({ path: "/rooms/me", signal, auth: true });
  const summaries = asArray(payload, "rooms").map((room, index) => parseApiTripSummary(room, `rooms[${index}]`));
  const directoryPromise = fetchUserDirectory(signal);
  const currentPreferenceCompletionPromise = fetchCurrentPreferenceCompletion(currentUserId, signal);
  const details: ApiTripRoom[] = [];
  for (let offset = 0; offset < summaries.length; offset += 4) {
    const group = summaries.slice(offset, offset + 4);
    details.push(...await Promise.all(group.map(async (summary) => parseApiTripRoom(await apiClient.request<unknown>({
      path: `/rooms/${encodeURIComponent(summary.id)}`,
      signal,
      auth: true,
    })))));
  }
  const [directory, currentUserCompleted] = await Promise.all([directoryPromise, currentPreferenceCompletionPromise]);
  const detailById = Object.fromEntries(details.map((detail) => [detail.id, detail]));
  return summaries.flatMap((summary) => {
    const room = detailById[summary.id];
    if (!room) return [];
    const usersById = usersForRoom(room, directory, currentUserId);
    const completedPreferenceCount = room.members.filter((member) => hasCurrentPreference(member, directory, currentUserId, currentUserCompleted)).length;
    const timingLabel = getTripTimingLabel(room.startDate, room.endDate);
    const viewModel: TripRoomCardViewModel = {
      id: room.id,
      title: room.title,
      destinationName: room.destinationName,
      dateLabel: formatTripDateRange(room.startDate, room.endDate),
      status: room.status,
      statusLabel: formatTripStatus(room.status),
      ...(timingLabel ? { timingLabel } : {}),
      members: room.members.flatMap((member) => usersById[member.userId] ? [{
        userId: member.userId,
        name: usersById[member.userId].name,
        initial: usersById[member.userId].initial,
        ...(usersById[member.userId].profileImageUrl ? { profileImageUrl: usersById[member.userId].profileImageUrl } : {}),
      }] : []),
      memberCount: room.members.length,
      candidateCount: room.candidateCount,
      itineraryCount: room.scheduleItemCount,
      preferenceCompletedCount: completedPreferenceCount,
      preferenceTotalCount: room.members.length,
      preparation: buildPreparation(room, directory, currentUserId, currentUserCompleted),
      isOwner: room.members.some((member) => member.userId === currentUserId && member.role === "owner"),
    };
    return [{ id: room.id, viewModel }];
  });
}

export async function fetchApiTripDetail(roomId: string, currentUserId?: string | null, signal?: AbortSignal): Promise<ApiTripDetailData> {
  const id = assertRoomId(roomId);
  const room = parseApiTripRoom(await apiClient.request<unknown>({
    path: `/rooms/${encodeURIComponent(id)}`,
    signal,
    auth: true,
  }));
  const region = regionForRoom(room);
  const hasValidLocalUserScope = Boolean(currentUserId && MONGO_OBJECT_ID_PATTERN.test(currentUserId));
  const unavailableLocalUserScope = Boolean(currentUserId) && !hasValidLocalUserScope;
  const [candidatePayload, directory, localFactsResult, preferenceResult, sharedDocumentsResult, currentUserCompleted] = await Promise.all([
    apiClient.request<unknown>({ path: `/rooms/${encodeURIComponent(id)}/candidates`, signal, auth: true }),
    fetchUserDirectory(signal),
    hasValidLocalUserScope
      ? loadApiTripLocalFactsWithStatus(currentUserId as string, id, {
          startDate: room.startDate,
          endDate: room.endDate,
        })
      : Promise.resolve(unavailableLocalUserScope
          ? { status: "unavailable" as const, value: null }
          : { status: "missing" as const, value: null }),
    roomPreferenceApiGateway.fetch(id, { memberIds: room.members.map((member) => member.userId) }, signal)
      .then((value) => ({ status: "loaded" as const, value }))
      .catch((error: unknown) => {
        if (signal?.aborted) throw error;
        return {
          status: error instanceof RoomPreferenceApiContractError && error.path === "preferences.members"
            ? "stale" as const
            : "unavailable" as const,
          value: null,
        };
      }),
    fetchApiTripDocuments(id, signal)
      .then((value) => ({ status: "loaded" as const, value }))
      .catch((error: unknown) => {
        if (signal?.aborted) throw error;
        return { status: "unavailable" as const, value: [] as ApiTripDocument[] };
      }),
    fetchCurrentPreferenceCompletion(currentUserId, signal),
  ]);
  const candidateData = parseCandidates(candidatePayload, room, region);
  const usersById = usersForRoom(room, directory, currentUserId);
  let itinerary: ItineraryItem[] = [];
  let scheduleSnapshot: WorkspaceScheduleSnapshot | undefined;
  let workspaceOverlayStatus: ApiLocalDataStatus = "missing";
  const placesById = { ...candidateData.placesById };
  if (room.startDate && room.endDate) {
    const serverSnapshot = await workspaceScheduleApiGateway.load({
      roomId: room.id,
      tripId: room.id,
      startDate: room.startDate,
      endDate: room.endDate,
      signal,
    });
    const overlayResult = hasValidLocalUserScope
      ? await loadApiWorkspaceOverlaysWithStatus(currentUserId as string, id, serverSnapshot)
      : unavailableLocalUserScope
        ? { status: "unavailable" as const, value: {} }
        : { status: "missing" as const, value: {} };
    workspaceOverlayStatus = overlayResult.status;
    const snapshot = overlayResult.status === "loaded"
      ? applyWorkspaceScheduleLocalOverlays(serverSnapshot, overlayResult.value)
      : serverSnapshot;
    scheduleSnapshot = snapshot;
    itinerary = snapshot.itinerary.map((item) => {
      const metadata = snapshot.metadataByItemId[item.id];
      if (item.placeId && !placesById[item.placeId]) {
        placesById[item.placeId] = {
          id: item.placeId,
          regionId: region.id,
          name: metadata?.placeName ?? "장소 일정",
          category: metadata?.tags[0] ?? "장소",
          tags: [...(metadata?.tags ?? [])],
          distanceLabel: "",
          ...(metadata?.lat !== undefined ? { latitude: metadata.lat } : {}),
          ...(metadata?.lng !== undefined ? { longitude: metadata.lng } : {}),
          imageUrl: "",
          address: "주소 정보 없음",
          summary: metadata?.reason ?? "",
        };
      }
      return !item.placeId && !item.note && metadata?.placeName ? { ...item, note: metadata.placeName } : item;
    });
  }
  const itineraryItemLabelsById = Object.fromEntries(itinerary.map((item) => [
    item.id,
    `${item.date} ${item.startTime} · ${item.placeId ? placesById[item.placeId]?.name ?? "장소 일정" : item.note?.trim() || "일정"}`,
  ]));
  let sharedPreferenceEvidence = preferenceResult.value;
  let sharedPreferenceEvidenceStatus: SharedPreferenceEvidenceStatus = preferenceResult.status;
  if (sharedPreferenceEvidence) {
    try {
      assertRoomPreferenceEvidenceScope(sharedPreferenceEvidence, {
        roomId: room.id,
        memberIds: room.members.map((member) => member.userId),
        candidatePlaceIds: candidateData.candidates.map((candidate) => candidate.placeId),
      });
      const currentScheduleVersion = scheduleSnapshot?.scheduleVersion ?? room.scheduleVersion;
      if (sharedPreferenceEvidence.factsVersion !== room.factsVersion
        || sharedPreferenceEvidence.scheduleVersion !== currentScheduleVersion) {
        sharedPreferenceEvidenceStatus = "stale";
      }
    } catch {
      sharedPreferenceEvidenceStatus = "stale";
    }
  }
  if (sharedPreferenceEvidenceStatus !== "loaded") sharedPreferenceEvidence = null;
  return {
    room,
    region,
    usersById,
    candidates: candidateData.candidates,
    placesById,
    itinerary,
    ...(scheduleSnapshot ? { scheduleSnapshot } : {}),
    itineraryItemLabelsById,
    preferenceSummary: buildPreferenceSummary(room, usersById, currentUserId, currentUserCompleted),
    preparation: buildPreparation(room, usersById, currentUserId, currentUserCompleted),
    localFacts: localFactsResult.value,
    localFactsStatus: localFactsResult.status,
    workspaceOverlayStatus,
    sharedPreferenceEvidence,
    sharedPreferenceEvidenceStatus,
    sharedDocuments: sharedDocumentsResult.value,
    sharedDocumentsStatus: sharedDocumentsResult.status,
  };
}

export const apiTripRoomService = {
  available: environment.dataSource === "api",
  fetchList: fetchApiTripList,
  fetchDetail: fetchApiTripDetail,
};
