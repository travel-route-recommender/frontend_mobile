import type { TripEndCondition, TripLocation, TripTransport } from "../../../domain";
import { apiClient } from "../../../services/apiClient";
import { isValidISODate } from "../../../utils/formatters";
import { isValidClockTime } from "../../../utils/schedule";
import { saveApiTripLocalFacts } from "./apiTripFactsStorage";

export type CreateTripRoomRequest = {
  name: string;
  regionId: string;
  regionName: string;
  areaCode?: string;
  sigunguCode?: string;
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  companionType: string | null;
  expectedMemberCount: number | null;
  invitedUserIds: string[];
  transport: TripTransport;
  accommodationLocation: TripLocation | null;
  endCondition: TripEndCondition | null;
};

export type CreateTripRoomResponse = {
  roomId: string;
  inviteToken?: string;
  inviteCode?: string;
  inviteUrl?: string;
  roomTitle?: string;
  warnings?: string[];
  source?: "mock" | "api";
};

export interface CreateTripRoomService {
  createTripRoom(request: CreateTripRoomRequest): Promise<CreateTripRoomResponse>;
}

export type MockTripRoomCreator = (request: CreateTripRoomRequest) => string | Promise<string>;

export function validateCreateTripRoomRequest(request: CreateTripRoomRequest) {
  if (!request.name.trim()) return "여행방 이름을 입력해 주세요.";
  if (!request.regionId) return "여행지를 선택해 주세요.";
  if (request.transport !== "car" && request.transport !== "public") return "이동 방식을 선택해 주세요.";
  if (!request.companionType) return "동행 유형을 선택해 주세요.";
  if (request.dateUndecided) {
    if (request.startDate !== null || request.endDate !== null) return "날짜 미정 상태에는 날짜 범위를 함께 보낼 수 없어요.";
    if (request.endCondition !== null) return "날짜 미정 여행에는 종료 조건을 저장할 수 없어요.";
  } else {
    if (!isValidISODate(request.startDate) || !isValidISODate(request.endDate)) return "시작일과 종료일을 모두 선택해 주세요.";
    if (request.endDate < request.startDate) return "종료일은 시작일보다 빠를 수 없어요.";
  }
  if (request.accommodationLocation && (!request.accommodationLocation.name.trim() || request.accommodationLocation.name.trim().length > 100)) return "숙소 위치를 확인해 주세요.";
  if (request.endCondition) {
    if (!request.endCondition.location.name.trim() || request.endCondition.location.name.trim().length > 100) return "여행 종료 지점을 입력해 주세요.";
    if (!isValidClockTime(request.endCondition.deadline)) return "여행 종료 시각을 HH:mm 형식으로 입력해 주세요.";
    if (!Number.isInteger(request.endCondition.travelMinutes) || request.endCondition.travelMinutes < 0 || request.endCondition.travelMinutes > 1440) return "종료 지점까지 예상 이동시간을 확인해 주세요.";
    if (!Number.isInteger(request.endCondition.serviceBufferMinutes) || request.endCondition.serviceBufferMinutes < 0 || request.endCondition.serviceBufferMinutes > 720) return "승차 준비 또는 반납 시간을 확인해 주세요.";
    if ((request.endCondition.note?.trim().length ?? 0) > 300) return "여행 종료 조건 메모는 300자 이하로 입력해 주세요.";
  }
  return undefined;
}

class MockCreateTripRoomService implements CreateTripRoomService {
  constructor(private readonly createRoom: MockTripRoomCreator) {}

  async createTripRoom(request: CreateTripRoomRequest): Promise<CreateTripRoomResponse> {
    const validationError = validateCreateTripRoomRequest(request);
    if (validationError) throw new Error(validationError);
    const roomId = await this.createRoom(request);
    if (!roomId) throw new Error("여행방을 만들지 못했어요. 입력값과 회원 정보를 확인해 주세요.");
    return { roomId, inviteToken: `mock-${roomId}`, roomTitle: request.name, source: "mock" };
  }
}

type CreatedRoomPayload = {
  id: string;
  title: string;
  inviteCode?: string;
  inviteLink?: string;
  members: { userId: string }[];
};

function parseCreatedRoom(value: unknown): CreatedRoomPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("여행방 생성 응답 형식이 올바르지 않아요.");
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!/^[a-f\d]{24}$/i.test(id) || !title) throw new Error("여행방 생성 응답의 ID 또는 제목이 올바르지 않아요.");
  const members = Array.isArray(record.members) ? record.members.flatMap((member) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) return [];
    const userId = (member as Record<string, unknown>).userId;
    return typeof userId === "string" && /^[a-f\d]{24}$/i.test(userId) ? [{ userId }] : [];
  }) : [];
  return {
    id,
    title,
    members,
    ...(typeof record.inviteCode === "string" && record.inviteCode.trim() ? { inviteCode: record.inviteCode.trim() } : {}),
    ...(typeof record.inviteLink === "string" && record.inviteLink.trim() ? { inviteLink: record.inviteLink.trim() } : {}),
  };
}

class ApiCreateTripRoomService implements CreateTripRoomService {
  constructor(private readonly currentUserId: string | null) {}

  async createTripRoom(request: CreateTripRoomRequest): Promise<CreateTripRoomResponse> {
    const validationError = validateCreateTripRoomRequest(request);
    if (validationError) throw new Error(validationError);
    if (!this.currentUserId || !/^[a-f\d]{24}$/i.test(this.currentUserId)) throw new Error("로그인 사용자 ID를 확인하지 못했어요.");

    const created = parseCreatedRoom(await apiClient.request<unknown>({
      path: request.invitedUserIds.length ? "/rooms/from-compatibility" : "/rooms",
      method: "POST",
      body: request.invitedUserIds.length
        ? { title: request.name, memberUserIds: request.invitedUserIds }
        : { title: request.name },
      auth: true,
    }));
    const warnings: string[] = [];

    try {
      await apiClient.request<unknown>({
        path: `/rooms/${encodeURIComponent(created.id)}/destination`,
        method: "PATCH",
        body: { name: request.regionName, regionCode: request.regionId },
        auth: true,
      });
    } catch {
      warnings.push("여행방은 생성됐지만 목적지 저장에 실패했어요. 여행방에서 다시 확인해 주세요.");
    }

    if (!request.dateUndecided && request.startDate && request.endDate) {
      try {
        await apiClient.request<unknown>({
          path: `/rooms/${encodeURIComponent(created.id)}`,
          method: "PATCH",
          body: { startDate: request.startDate, endDate: request.endDate },
          auth: true,
        });
      } catch {
        warnings.push("여행방은 생성됐지만 날짜 저장에 실패했어요. 여행방에서 다시 확인해 주세요.");
      }
    }

    const acceptedMemberIds = new Set(created.members.map((member) => member.userId));
    const missingInviteCount = request.invitedUserIds.filter((userId) => !acceptedMemberIds.has(userId)).length;
    if (missingInviteCount) warnings.push(`선택한 동행자 중 ${missingInviteCount}명은 서버 여행방에 추가되지 않았어요.`);

    try {
      await saveApiTripLocalFacts(this.currentUserId, created.id, {
        transport: request.transport,
        accommodationLocation: request.accommodationLocation,
        endCondition: request.endCondition,
        companionType: request.companionType,
        expectedMemberCount: request.expectedMemberCount,
      });
    } catch {
      warnings.push("이동 방식·숙소·종료 조건을 이 기기에 저장하지 못했어요. 서버에는 아직 이 필드 계약이 없어요.");
    }

    return {
      roomId: created.id,
      roomTitle: created.title,
      inviteToken: created.inviteCode,
      inviteCode: created.inviteCode,
      inviteUrl: created.inviteLink,
      ...(warnings.length ? { warnings } : {}),
      source: "api",
    };
  }
}

class UnavailableCreateTripRoomService implements CreateTripRoomService {
  async createTripRoom(): Promise<CreateTripRoomResponse> {
    throw new Error("hybrid 모드에서는 서버와 로컬 여행방을 혼합해 생성하지 않아요.");
  }
}

export function createTripRoomService(
  mode: "mock" | "api" | "hybrid",
  createMockRoom: MockTripRoomCreator,
  currentUserId: string | null = null,
): CreateTripRoomService {
  if (mode === "mock") return new MockCreateTripRoomService(createMockRoom);
  if (mode === "api") return new ApiCreateTripRoomService(currentUserId);
  return new UnavailableCreateTripRoomService();
}
