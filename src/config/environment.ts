export type DataSourceMode = "mock" | "api" | "hybrid";
export type DuriEngineMode = "local" | "server";

function parseDataSource(value: string | undefined): DataSourceMode {
  return value === "api" || value === "hybrid" ? value : "mock";
}

function parseDuriEngine(value: string | undefined): DuriEngineMode {
  return value === "server" ? "server" : "local";
}

export const environment = {
  dataSource: parseDataSource(process.env.EXPO_PUBLIC_DATA_SOURCE),
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1",
  duriEngine: parseDuriEngine(process.env.EXPO_PUBLIC_DURI_ENGINE),
} as const;
