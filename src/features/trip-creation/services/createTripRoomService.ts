import type { TripEndCondition, TripLocation, TripTransport } from "../../../domain";
import { apiClient, type ApiClient } from "../../../services/apiClient";
import { isValidISODate } from "../../../utils/formatters";
import { isValidClockTime } from "../../../utils/schedule";
import { environment } from "../../../config/environment";
import { resolveShareableTripInviteUrl } from "../../invitations/logic/tripInviteLinks";
import {
  workspacePlanningApiGateway,
  type WorkspacePlanningApiGateway,
  type WorkspacePlanningPatch,
} from "../../workspace/services/workspacePlanningApi";
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
  setupIssues?: CreateTripSetupIssue[];
  source?: "mock" | "api";
};

export type CreateTripSetupStep = "destination" | "dates" | "planning" | "local-details";

export type CreateTripSetupIssue = {
  step: CreateTripSetupStep;
  message: string;
};

export interface CreateTripRoomService {
  createTripRoom(request: CreateTripRoomRequest): Promise<CreateTripRoomResponse>;
  retryTripRoomSetup(roomId: string, request: CreateTripRoomRequest, steps: readonly CreateTripSetupStep[]): Promise<CreateTripSetupIssue[]>;
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

  async retryTripRoomSetup() {
    return [];
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
  const inviteCode = typeof record.inviteCode === "string" && record.inviteCode.trim()
    ? record.inviteCode.trim()
    : undefined;
  const rawInviteLink = typeof record.inviteLink === "string" && record.inviteLink.trim()
    ? record.inviteLink.trim()
    : undefined;
  return {
    id,
    title,
    members,
    ...(inviteCode ? { inviteCode } : {}),
    ...(rawInviteLink && inviteCode
      ? { inviteLink: resolveShareableTripInviteUrl(rawInviteLink, inviteCode, environment.apiBaseUrl) }
      : {}),
  };
}

type ApiCreateTripRoomDependencies = {
  client: ApiClient;
  planningGateway: WorkspacePlanningApiGateway;
  saveLocalFacts: typeof saveApiTripLocalFacts;
};

const allSetupSteps: readonly CreateTripSetupStep[] = ["destination", "dates", "planning", "local-details"];

export function buildCreateTripPlanningPatch(request: CreateTripRoomRequest): WorkspacePlanningPatch {
  const toAnchor = (location: TripLocation) => ({
    name: location.name,
    ...(location.lat !== undefined && location.lng !== undefined ? { lat: location.lat, lng: location.lng } : {}),
    ...(location.placeId ? { placeId: location.placeId } : {}),
    ...(location.externalId ? { externalId: location.externalId } : {}),
    source: location.source ?? "manual" as const,
  });
  return {
    timezone: "Asia/Seoul",
    transportMode: request.transport === "car" ? "car" : "transit",
    lodging: request.accommodationLocation ? toAnchor(request.accommodationLocation) : null,
    returnPoint: request.endCondition ? toAnchor(request.endCondition.location) : null,
    ...(request.endCondition ? {
      returnDeadline: request.endCondition.deadline,
      travelBufferMinutes: request.endCondition.travelMinutes,
      prepBufferMinutes: request.endCondition.serviceBufferMinutes,
    } : {}),
    confirm: true,
  };
}

class ApiCreateTripRoomService implements CreateTripRoomService {
  constructor(
    private readonly currentUserId: string | null,
    private readonly dependencies: ApiCreateTripRoomDependencies,
  ) {}

  private async configureRoom(
    roomId: string,
    request: CreateTripRoomRequest,
    requestedSteps: readonly CreateTripSetupStep[],
  ) {
    const steps = new Set(requestedSteps);
    const issues: CreateTripSetupIssue[] = [];
    const attempt = async (step: CreateTripSetupStep, message: string, task: () => Promise<unknown>) => {
      if (!steps.has(step)) return;
      try {
        await task();
      } catch {
        issues.push({ step, message });
      }
    };

    await attempt("destination", "여행지가 아직 저장되지 않았어요.", () => this.dependencies.client.request<unknown>({
      path: `/rooms/${encodeURIComponent(roomId)}/destination`,
      method: "PATCH",
      body: {
        name: request.regionName,
        regionCode: request.areaCode ?? request.regionId,
      },
      auth: true,
    }));

    if (!request.dateUndecided && request.startDate && request.endDate) {
      await attempt("dates", "여행 날짜가 아직 저장되지 않았어요.", () => this.dependencies.client.request<unknown>({
        path: `/rooms/${encodeURIComponent(roomId)}`,
        method: "PATCH",
        body: { startDate: request.startDate, endDate: request.endDate },
        auth: true,
      }));
    }

    await attempt("planning", "이동 방식·숙소·귀환 일정이 아직 저장되지 않았어요.", () => (
      this.dependencies.planningGateway.update(roomId, buildCreateTripPlanningPatch(request))
    ));

    await attempt("local-details", "동행 유형과 귀환 메모를 이 기기에 저장하지 못했어요.", () => (
      this.dependencies.saveLocalFacts(this.currentUserId as string, roomId, {
        startDate: request.dateUndecided ? null : request.startDate,
        endDate: request.dateUndecided ? null : request.endDate,
      }, {
        transport: request.transport,
        accommodationLocation: request.accommodationLocation,
        endCondition: request.endCondition,
        companionType: request.companionType,
        expectedMemberCount: request.expectedMemberCount,
      })
    ));
    return issues;
  }

  async createTripRoom(request: CreateTripRoomRequest): Promise<CreateTripRoomResponse> {
    const validationError = validateCreateTripRoomRequest(request);
    if (validationError) throw new Error(validationError);
    if (!this.currentUserId || !/^[a-f\d]{24}$/i.test(this.currentUserId)) throw new Error("로그인 사용자 ID를 확인하지 못했어요.");

    const created = parseCreatedRoom(await this.dependencies.client.request<unknown>({
      path: request.invitedUserIds.length ? "/rooms/from-compatibility" : "/rooms",
      method: "POST",
      body: request.invitedUserIds.length
        ? { title: request.name, memberUserIds: request.invitedUserIds }
        : { title: request.name },
      auth: true,
    }));
    const warnings: string[] = [];
    const setupIssues = await this.configureRoom(created.id, request, allSetupSteps);

    const acceptedMemberIds = new Set(created.members.map((member) => member.userId));
    const missingInviteCount = request.invitedUserIds.filter((userId) => !acceptedMemberIds.has(userId)).length;
    if (missingInviteCount) warnings.push(`선택한 동행자 중 ${missingInviteCount}명은 바로 추가되지 않았어요. 초대 링크를 보내 참여를 요청해 주세요.`);

    return {
      roomId: created.id,
      roomTitle: created.title,
      inviteToken: created.inviteCode,
      inviteCode: created.inviteCode,
      inviteUrl: created.inviteLink,
      ...(warnings.length ? { warnings } : {}),
      ...(setupIssues.length ? { setupIssues } : {}),
      source: "api",
    };
  }

  async retryTripRoomSetup(roomId: string, request: CreateTripRoomRequest, steps: readonly CreateTripSetupStep[]) {
    const validationError = validateCreateTripRoomRequest(request);
    if (validationError) throw new Error(validationError);
    if (!this.currentUserId || !/^[a-f\d]{24}$/i.test(this.currentUserId)) throw new Error("로그인 사용자 ID를 확인하지 못했어요.");
    if (!/^[a-f\d]{24}$/i.test(roomId)) throw new Error("여행방 정보를 확인하지 못했어요.");
    return this.configureRoom(roomId, request, [...new Set(steps)].filter((step) => allSetupSteps.includes(step)));
  }
}

class UnavailableCreateTripRoomService implements CreateTripRoomService {
  async createTripRoom(): Promise<CreateTripRoomResponse> {
    throw new Error("현재 실행 설정에서는 새 여행방을 만들 수 없어요. 앱을 다시 시작한 뒤 시도해 주세요.");
  }

  async retryTripRoomSetup(): Promise<CreateTripSetupIssue[]> {
    throw new Error("현재 실행 설정에서는 여행방 정보를 저장할 수 없어요.");
  }
}

export function createTripRoomService(
  mode: "mock" | "api" | "hybrid",
  createMockRoom: MockTripRoomCreator,
  currentUserId: string | null = null,
  apiDependencies: Partial<ApiCreateTripRoomDependencies> = {},
): CreateTripRoomService {
  if (mode === "mock") return new MockCreateTripRoomService(createMockRoom);
  if (mode === "api") return new ApiCreateTripRoomService(currentUserId, {
    client: apiDependencies.client ?? apiClient,
    planningGateway: apiDependencies.planningGateway ?? workspacePlanningApiGateway,
    saveLocalFacts: apiDependencies.saveLocalFacts ?? saveApiTripLocalFacts,
  });
  return new UnavailableCreateTripRoomService();
}
