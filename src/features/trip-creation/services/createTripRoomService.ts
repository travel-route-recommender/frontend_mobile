import type { TripBudgetLevel, TripIntensity, TripTransport } from "../../../domain";
import { isValidISODate } from "../../../utils/formatters";

export type CreateTripRoomRequest = {
  name: string;
  regionId: string;
  areaCode?: string;
  sigunguCode?: string;
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  travelStyles: string[];
  companionType: string | null;
  expectedMemberCount: number | null;
  invitedUserIds: string[];
  transport: TripTransport;
  budgetLevel: TripBudgetLevel;
  intensity: TripIntensity;
};

export type CreateTripRoomResponse = {
  roomId: string;
  inviteToken?: string;
};

export interface CreateTripRoomService {
  createTripRoom(request: CreateTripRoomRequest): Promise<CreateTripRoomResponse>;
}

export type MockTripRoomCreator = (request: CreateTripRoomRequest) => string | Promise<string>;

export function validateCreateTripRoomRequest(request: CreateTripRoomRequest) {
  if (!request.name.trim()) return "여행방 이름을 입력해 주세요.";
  if (!request.regionId) return "여행지를 선택해 주세요.";
  if (!request.companionType) return "동행 유형을 선택해 주세요.";
  if (request.dateUndecided) {
    if (request.startDate !== null || request.endDate !== null) return "날짜 미정 상태에는 날짜 범위를 함께 보낼 수 없어요.";
  } else {
    if (!isValidISODate(request.startDate) || !isValidISODate(request.endDate)) return "시작일과 종료일을 모두 선택해 주세요.";
    if (request.endDate < request.startDate) return "종료일은 시작일보다 빠를 수 없어요.";
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
    return { roomId, inviteToken: `mock-${roomId}` };
  }
}

class UnavailableCreateTripRoomService implements CreateTripRoomService {
  async createTripRoom(): Promise<CreateTripRoomResponse> {
    throw new Error("Rooms 생성 API 계약이 연결되기 전입니다. endpoint와 DTO를 추측하지 않았어요.");
  }
}

export function createTripRoomService(mode: "mock" | "api" | "hybrid", createMockRoom: MockTripRoomCreator): CreateTripRoomService {
  return mode === "mock" ? new MockCreateTripRoomService(createMockRoom) : new UnavailableCreateTripRoomService();
}
