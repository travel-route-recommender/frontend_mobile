import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json을 기본값으로 두고, .env에 의존하는 설정만 여기서 덧붙인다.
// Kakao Native 앱 키는 .env(gitignore 대상)에 있으므로 app.json에 넣지 않는다.
export default ({ config }: ConfigContext): ExpoConfig => {
  const kakaoNativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim();
  const plugins = [...(config.plugins ?? [])];

  // Kakao Android SDK는 Maven Central에 없고 Kakao 자체 저장소에만 있다.
  // android/는 prebuild가 재생성하므로 build.gradle을 직접 고치면 날아간다.
  plugins.push([
    "expo-build-properties",
    { android: { extraMavenRepos: ["https://devrepo.kakao.com/nexus/content/groups/public/"] } },
  ]);

  // 키가 없으면 플러그인을 빼서 빌드 자체는 통과시킨다.
  // 카카오 로그인을 시도하는 시점에 socialAuth가 안내 메시지를 던진다.
  if (kakaoNativeAppKey) {
    plugins.push([
      "@react-native-kakao/core",
      {
        nativeAppKey: kakaoNativeAppKey,
        ios: { handleKakaoOpenUrl: true },
        // 카카오톡 앱 로그인이 kakao{앱키}://oauth로 돌아온다.
        android: { authCodeHandlerActivity: true },
      },
    ]);
  }

  return { ...config, plugins } as ExpoConfig;
};
