const KAKAO_CORE_PLUGIN = "@react-native-kakao/core";
const GOOGLE_SIGN_IN_PLUGIN = "react-native-nitro-google-signin";

function googleIosUrlScheme(clientId) {
  const suffix = ".apps.googleusercontent.com";
  if (!clientId.endsWith(suffix)) return undefined;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

module.exports = ({ config }) => {
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim();
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const iosUrlScheme = googleIosClientId ? googleIosUrlScheme(googleIosClientId) : undefined;
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== KAKAO_CORE_PLUGIN && name !== GOOGLE_SIGN_IN_PLUGIN;
  });

  if (nativeAppKey) {
    plugins.push([
      KAKAO_CORE_PLUGIN,
      {
        nativeAppKey,
        android: { authCodeHandlerActivity: true },
        ios: { handleKakaoOpenUrl: true },
      },
    ]);
  }

  if (iosUrlScheme) {
    plugins.push([GOOGLE_SIGN_IN_PLUGIN, { iosUrlScheme }]);
  }

  return { ...config, plugins };
};
