export type DataSourceMode = "mock" | "api" | "hybrid";
export type PlacesDataSourceMode = "mock" | "api";

declare const __DEV__: boolean;

function parseDataSource(value: string | undefined): DataSourceMode {
  // A missing or misspelled release variable must never expose demo data.
  // Mock/hybrid behavior is available only when a developer opts into it.
  return value === "mock" || value === "hybrid" ? value : "api";
}

function parsePlacesDataSource(value: string | undefined): PlacesDataSourceMode | undefined {
  return value === "api" || value === "mock" ? value : undefined;
}

const dataSource = parseDataSource(process.env.EXPO_PUBLIC_DATA_SOURCE);
const placesDataSource =
  parsePlacesDataSource(process.env.EXPO_PUBLIC_PLACES_DATA_SOURCE) ??
  (dataSource === "api" || dataSource === "hybrid" ? "api" : "mock");

const platformApiBaseUrl = process.env.EXPO_OS === "android"
  ? process.env.EXPO_PUBLIC_ANDROID_API_BASE_URL
  : process.env.EXPO_OS === "ios"
    ? process.env.EXPO_PUBLIC_IOS_API_BASE_URL
    : process.env.EXPO_OS === "web"
      ? process.env.EXPO_PUBLIC_WEB_API_BASE_URL
      : undefined;
const apiBaseUrl =
  platformApiBaseUrl?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "http://localhost:3000/api/v1";
const developerMode = typeof __DEV__ !== "undefined" && __DEV__;

export const environment = {
  dataSource,
  placesDataSource,
  apiBaseUrl,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  kakaoNativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY,
  kakaoMapJavascriptKey: process.env.EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY,
  kakaoMapBaseUrl: process.env.EXPO_PUBLIC_KAKAO_MAP_BASE_URL ?? "https://localhost:3000",
  // 수식·내부 계산 식별자는 일반 사용자에게 노출하지 않고, 개발 중 명시적으로
  // 요청한 경우에만 상세 화면을 연다. Release bundle에서는 항상 false다.
  showDuriDiagnostics: developerMode && process.env.EXPO_PUBLIC_SHOW_DURI_DIAGNOSTICS === "true",
} as const;
