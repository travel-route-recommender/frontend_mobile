import { environment } from "../../../config/environment";

export interface WorkspaceScheduleService {
  readonly available: boolean;
  readonly editable: boolean;
  readonly message?: string;
}

const mockWorkspaceScheduleService: WorkspaceScheduleService = { available: true, editable: true };

const unavailableWorkspaceScheduleService: WorkspaceScheduleService = {
  available: false,
  editable: false,
  message: environment.dataSource === "api"
    ? "최신 일정 정보를 안전하게 확인하지 못했어요. 여행방을 다시 불러온 뒤 시도해 주세요."
    : "여행방의 일정 정보를 확인하지 못했어요. 여행 목록에서 방을 다시 열어 주세요.",
};

export const workspaceScheduleService = environment.dataSource === "mock"
  ? mockWorkspaceScheduleService
  : unavailableWorkspaceScheduleService;
