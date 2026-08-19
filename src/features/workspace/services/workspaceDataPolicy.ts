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
    ? "서버 일정 편집은 연결됐지만 두리 분석 Store와 서버 일정 snapshot의 단일 원본 연결은 아직 분리되어 있어요. mock 일정으로 자동 전환하지 않았습니다."
    : "서버 trip·place·candidate·item ID와 로컬 관계의 호환 계약이 필요합니다. 확인 전에는 일정을 혼합하거나 수정하지 않아요.",
};

export const workspaceScheduleService = environment.dataSource === "mock"
  ? mockWorkspaceScheduleService
  : unavailableWorkspaceScheduleService;
