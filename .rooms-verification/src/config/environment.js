"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.environment = void 0;
function parseDataSource(value) {
    if (value === "mock" || value === "hybrid")
        return value;
    return "api";
}
function parseDuriEngine(value) {
    return value === "server" ? "server" : "local";
}
exports.environment = {
    dataSource: parseDataSource(process.env.EXPO_PUBLIC_DATA_SOURCE),
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000/api",
    duriEngine: parseDuriEngine(process.env.EXPO_PUBLIC_DURI_ENGINE),
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    googleIosRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_URI,
    googleAndroidRedirectUri: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_REDIRECT_URI,
    kakaoRestApiKey: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
    kakaoRedirectUri: process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI,
};
