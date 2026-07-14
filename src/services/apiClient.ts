export type ApiRequest = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export interface ApiClient {
  request<Response>(request: ApiRequest): Promise<Response>;
}

export class ApiContractUnavailableError extends Error {
  constructor() {
    super("백엔드 OpenAPI 계약이 확정되지 않아 API 모드는 아직 사용할 수 없습니다.");
    this.name = "ApiContractUnavailableError";
  }
}
