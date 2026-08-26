export type DataSourceMode = "mock" | "api" | "hybrid";
export type DuriEngineMode = "local" | "server";
export type PlacesDataSourceMode = "mock" | "api";

function parseDataSource(value: string | undefined): DataSourceMode {
  return value === "api" || value === "hybrid" ? value : "mock";
}

function parseDuriEngine(value: string | undefined): DuriEngineMode {
  return value === "server" ? "server" : "local";
}

function parsePlacesDataSource(value: string | undefined): PlacesDataSourceMode | undefined {
  return value === "api" || value === "mock" ? value : undefined;
}

const dataSource = parseDataSource(process.env.EXPO_PUBLIC_DATA_SOURCE);
const placesDataSource =
  parsePlacesDataSource(process.env.EXPO_PUBLIC_PLACES_DATA_SOURCE) ??
  (dataSource === "api" || dataSource === "hybrid" ? "api" : "mock");

export const environment = {
  dataSource,
  placesDataSource,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1",
  duriEngine: parseDuriEngine(process.env.EXPO_PUBLIC_DURI_ENGINE),
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  kakaoNativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
  kakaoMapJavascriptKey: process.env.EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY,
  kakaoMapBaseUrl: process.env.EXPO_PUBLIC_KAKAO_MAP_BASE_URL ?? "http://localhost:3000",
} as const;
