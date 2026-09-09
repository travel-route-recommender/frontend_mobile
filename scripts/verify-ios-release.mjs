import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const app = readJson("app.json").expo;
const eas = readJson("eas.json");
const store = readJson("store.config.json");
const packageJson = readJson("package.json");
const backendContract = fs.readFileSync(path.join(root, "src/features/auth/services/backendAuthContract.ts"), "utf8");
const appConfigSource = fs.readFileSync(path.join(root, "app.config.js"), "utf8");
const legalSources = [
  "src/features/auth/legal/legalDocuments.ts",
  "docs/TERMS_OF_SERVICE_DRAFT.md",
  "docs/PRIVACY_POLICY_DRAFT.md",
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
const errors = [];
const blockers = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const block = (condition, message) => { if (condition) blockers.push(message); };

check(app.version, "iOS 앱 버전이 없습니다.");
check(/^\d+$/.test(app.ios?.buildNumber ?? ""), "iOS buildNumber가 정수가 아닙니다.");
check(app.ios?.usesAppleSignIn === true, "Sign in with Apple entitlement가 설정되지 않았습니다.");
check(app.ios?.config?.usesNonExemptEncryption === false, "수출 규정 암호화 설정이 없습니다.");
check(app.plugins?.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "expo-apple-authentication"), "Apple Authentication 플러그인이 없습니다.");
check(Boolean(packageJson.dependencies?.["expo-apple-authentication"]), "Apple Authentication 패키지가 없습니다.");
check(/thirdPartySocialLogin:\s*true/.test(backendContract), "iOS 제3자 로그인 활성 정책이 명시되지 않았습니다.");
const iosAutolinkingExcludes = packageJson.expo?.autolinking?.ios?.exclude ?? [];
check(!iosAutolinkingExcludes.includes("@react-native-kakao/core") && !iosAutolinkingExcludes.includes("@react-native-kakao/user"), "카카오 네이티브 SDK가 iOS autolinking에서 제외되어 있습니다.");
check(/ios:\s*\{\s*handleKakaoOpenUrl:\s*true\s*\}/.test(appConfigSource), "카카오 iOS 로그인 URL 처리가 설정되지 않았습니다.");
const secureStorePlugin = app.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-secure-store");
check(secureStorePlugin?.[1]?.faceIDPermission === false, "사용하지 않는 Face ID 권한 문구가 비활성화되지 않았습니다.");
check(eas.build?.production?.distribution === "store", "production 배포 유형이 store가 아닙니다.");
check(eas.build?.production?.ios?.image === "sdk-57", "production iOS 빌드 이미지가 SDK 57이 아닙니다.");
check(eas.build?.production?.ios?.autoIncrement === "buildNumber", "iOS 빌드 번호 자동 증가가 없습니다.");
check(eas.submit?.production?.ios?.metadataPath === "./store.config.json", "스토어 메타데이터 경로가 없습니다.");
for (const key of ["EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_IOS_API_BASE_URL", "EXPO_PUBLIC_KAKAO_MAP_BASE_URL"]) {
  const value = eas.build?.production?.env?.[key];
  check(typeof value === "string" && value.startsWith("https://") && !value.includes("localhost"), `${key}가 운영 HTTPS 주소가 아닙니다.`);
}
check(store.apple?.info?.ko?.title?.startsWith(app.name), "스토어 앱 이름에 앱 설정 이름이 포함되지 않았습니다.");
check(store.apple?.version === app.version, "스토어 메타데이터 버전과 앱 버전이 다릅니다.");
check(Boolean(store.apple?.info?.ko?.description), "한국어 스토어 설명이 없습니다.");
check((store.apple?.categories?.length ?? 0) > 0, "스토어 카테고리가 없습니다.");

const iconPath = path.join(root, app.ios?.icon ?? app.icon ?? "");
check(fs.existsSync(iconPath), "iOS 아이콘 파일이 없습니다.");
if (fs.existsSync(iconPath)) {
  const png = fs.readFileSync(iconPath);
  check(png.subarray(1, 4).toString("ascii") === "PNG", "iOS 아이콘이 PNG가 아닙니다.");
  if (png.length >= 26) {
    check(png.readUInt32BE(16) === 1024 && png.readUInt32BE(20) === 1024, "iOS 아이콘은 1024×1024여야 합니다.");
    check(![4, 6].includes(png[25]), "iOS 아이콘에는 알파 채널이 없어야 합니다.");
  }
}

block(!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(app.ios?.bundleIdentifier ?? ""), "iOS Bundle ID가 유효한 reverse-DNS 형식이 아닙니다.");
block(app.extra?.release?.iosBundleIdentifierFinalized !== true, "iOS Bundle ID 확정 표시가 없습니다.");
block(!app.extra?.eas?.projectId, "EAS projectId가 없습니다. EAS 계정 연결이 필요합니다.");
block(!store.apple?.info?.ko?.privacyPolicyUrl, "공개 개인정보 처리방침 URL이 없습니다.");
block(!store.apple?.info?.ko?.supportUrl, "고객지원 URL이 없습니다.");
block(!store.apple?.review, "심사용 연락처와 로그인 정보가 없습니다.");
block(!store.apple?.copyright, "저작권 소유자 정보가 없습니다.");
const screenshotDirectory = path.join(root, "store-assets/ios");
const screenshots = fs.existsSync(screenshotDirectory)
  ? fs.readdirSync(screenshotDirectory).filter((file) => /\.png$/i.test(file))
  : [];
block(screenshots.length === 0, "App Store용 실제 앱 화면 스크린샷이 없습니다.");
block(/accountDeletion:\s*false/.test(backendContract), "백엔드 계정 삭제 API가 준비되지 않았습니다.");
block(/\{\{[A-Z0-9_]+\}\}|출시 전[^\n]*(확정|예정|필요)/.test(legalSources), "약관·개인정보 처리방침에 출시 전 확정값이 남아 있습니다.");

if (errors.length) {
  console.error("iOS 출시 구성 오류:");
  errors.forEach((message) => console.error(`- ${message}`));
}
if (blockers.length) {
  console.error("iOS 출시 차단 항목:");
  blockers.forEach((message) => console.error(`- ${message}`));
}
if (errors.length || blockers.length) process.exitCode = 1;
else console.log("iOS App Store 출시 준비 검사를 통과했습니다.");
