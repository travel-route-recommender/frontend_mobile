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
    ? "Candidates·Schedule API 계약이 연결되기 전입니다. mock 후보와 일정으로 자동 전환하지 않았어요."
    : "서버 trip·place·candidate·item ID와 로컬 관계의 호환 계약이 필요합니다. 확인 전에는 일정을 혼합하거나 수정하지 않아요.",
};

export const workspaceScheduleService = environment.dataSource === "mock"
  ? mockWorkspaceScheduleService
  : unavailableWorkspaceScheduleService;

