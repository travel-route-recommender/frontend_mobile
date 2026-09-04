import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const separator = trimmed.indexOf("=");
    if (separator < 1) return [];
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return [[key, value]];
  }));
}

// 낮은 우선순위부터 합쳐 Expo production dotenv 우선순위를 재현한다.
const fileEnv = [".env", ".env.production", ".env.local", ".env.production.local"]
  .reduce((merged, name) => ({ ...merged, ...parseEnvFile(path.join(root, name)) }), {});
const runtimeEnv = { ...process.env };
const env = { ...fileEnv, ...runtimeEnv };
Object.assign(process.env, fileEnv, runtimeEnv);
const staticApp = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
const require = createRequire(import.meta.url);
const resolveAppConfig = require(path.join(root, "app.config.js"));
const app = resolveAppConfig({ config: staticApp });
const errors = [];
const warnings = [];

function requireValue(name, message) {
  const value = String(env[name] ?? "").trim();
  if (!value || /^(?:replace-|your-|example)/i.test(value)) errors.push(message);
}

function checkRemoteHttps(name, fallback, label) {
  const value = String(env[name] ?? fallback ?? "").trim();
  if (!value) {
    errors.push(`${label}가 비어 있습니다.`);
    return;
  }
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"].includes(url.hostname)
      || /^192\.168\./.test(url.hostname)
      || /^10\./.test(url.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
    if (url.protocol !== "https:" || local || /(?:^|\.)example\.(?:com|org|net)$/i.test(url.hostname)) errors.push(`${label}는 실제 공개 HTTPS 주소여야 합니다.`);
  } catch {
    errors.push(`${label}가 올바른 URL이 아닙니다.`);
  }
}

if (env.EXPO_PUBLIC_DATA_SOURCE !== "api") errors.push("EXPO_PUBLIC_DATA_SOURCE는 출시 빌드에서 api여야 합니다.");
if (String(env.EXPO_PUBLIC_DURI_ENGINE ?? "").trim()) errors.push("더 이상 사용하지 않는 EXPO_PUBLIC_DURI_ENGINE을 출시 환경에서 제거해 주세요.");

checkRemoteHttps("EXPO_PUBLIC_API_BASE_URL", undefined, "공통 API 주소");
["EXPO_PUBLIC_ANDROID_API_BASE_URL", "EXPO_PUBLIC_IOS_API_BASE_URL", "EXPO_PUBLIC_WEB_API_BASE_URL"]
  .filter((name) => String(env[name] ?? "").trim())
  .forEach((name) => checkRemoteHttps(name, undefined, `${name} 주소`));
checkRemoteHttps("EXPO_PUBLIC_KAKAO_MAP_BASE_URL", undefined, "카카오 지도 기준 주소");
requireValue("EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY", "카카오 네이티브 앱 키가 없습니다.");
requireValue("EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY", "카카오 지도 JavaScript 키가 없습니다.");

const apiBaseUrl = String(env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
const inviteBaseUrl = String(env.DURI_INVITE_LINK_BASE_URL ?? "").trim()
  || (apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, "")}/invites` : "");
checkRemoteHttps("DURI_INVITE_LINK_BASE_URL", inviteBaseUrl, "초대 링크 주소");
try {
  const inviteUrl = new URL(inviteBaseUrl);
  const expectedPathPrefix = `${inviteUrl.pathname.replace(/\/+$/, "")}/`;
  const hasAndroidLink = (app.android?.intentFilters ?? []).some((filter) => filter?.autoVerify === true
    && (filter.data ?? []).some((data) => data?.scheme === "https"
      && data?.host === inviteUrl.hostname
      && data?.pathPrefix === expectedPathPrefix));
  if (!hasAndroidLink) errors.push("Android 초대 App Link 설정이 공개 초대 주소와 일치하지 않습니다.");
  if (!(app.ios?.associatedDomains ?? []).includes(`applinks:${inviteUrl.hostname}`)) {
    errors.push("iOS 초대 Universal Link 설정이 공개 초대 주소와 일치하지 않습니다.");
  }
} catch {
  // URL 자체의 오류는 checkRemoteHttps가 사용자에게 설명한다.
}
const schemes = Array.isArray(app.scheme) ? app.scheme : [app.scheme];
if (!schemes.includes("tripmatch")) errors.push("기존 초대 링크 호환을 위한 tripmatch 앱 scheme이 없습니다.");
if (!fs.existsSync(path.join(root, "app", "+native-intent.tsx"))) {
  errors.push("외부 초대 URL을 앱의 초대 화면으로 변환하는 +native-intent 경로가 없습니다.");
}

const androidPackage = String(app.android?.package ?? "").trim();
const iosBundleIdentifier = String(app.ios?.bundleIdentifier ?? "").trim();
if (!androidPackage || /(?:^|\.)(?:dev|development)(?:\.|$)/i.test(androidPackage) || /^com\.example\./i.test(androidPackage)) errors.push("출시용 Android applicationId를 DURI_ANDROID_PACKAGE로 설정해 주세요.");
if (!iosBundleIdentifier || /(?:^|\.)(?:dev|development)(?:\.|$)/i.test(iosBundleIdentifier) || /^com\.example\./i.test(iosBundleIdentifier)) errors.push("출시용 iOS bundleIdentifier를 DURI_IOS_BUNDLE_IDENTIFIER로 설정해 주세요.");
if (!Number.isInteger(app.android?.versionCode) || app.android.versionCode < 1) errors.push("Android versionCode를 DURI_ANDROID_VERSION_CODE로 설정해 주세요.");
if (!String(app.ios?.buildNumber ?? "").trim()) errors.push("iOS buildNumber를 DURI_IOS_BUILD_NUMBER로 설정해 주세요.");

warnings.forEach((message) => console.warn(`주의: ${message}`));

if (errors.length) {
  console.error(`출시 설정 확인 실패 (${errors.length}개)`);
  errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("출시 설정 확인 완료: 원격 API, 초대 링크, 지도, 카카오 로그인, 앱 식별자와 빌드 번호가 준비되었습니다.");
}
