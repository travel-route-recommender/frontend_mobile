const KAKAO_CORE_PLUGIN = "@react-native-kakao/core";

module.exports = ({ config }) => {
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim();
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== KAKAO_CORE_PLUGIN;
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

  return { ...config, plugins };
};
