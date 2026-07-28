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
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  googleIosRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_URI,
  googleAndroidRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_REDIRECT_URI,
  kakaoRestApiKey: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
  kakaoRedirectUri: process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI,
} as const;
