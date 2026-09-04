const KAKAO_CORE_PLUGIN = "@react-native-kakao/core";
const GOOGLE_SIGN_IN_PLUGIN = "react-native-nitro-google-signin";

function googleIosUrlScheme(clientId) {
  const suffix = ".apps.googleusercontent.com";
  if (!clientId.endsWith(suffix)) return undefined;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

function inviteLinkConfiguration() {
  const configuredBase = process.env.DURI_INVITE_LINK_BASE_URL?.trim();
  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const candidate = configuredBase || (apiBase ? `${apiBase.replace(/\/+$/, "")}/invites` : "");
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return undefined;
    return {
      host: url.hostname,
      pathPrefix: `${url.pathname.replace(/\/+$/, "")}/`,
    };
  } catch {
    return undefined;
  }
}

module.exports = ({ config }) => {
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY?.trim();
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const androidPackage = process.env.DURI_ANDROID_PACKAGE?.trim();
  const iosBundleIdentifier = process.env.DURI_IOS_BUNDLE_IDENTIFIER?.trim();
  const androidVersionCode = /^\d+$/.test(process.env.DURI_ANDROID_VERSION_CODE?.trim() ?? "")
    ? Number(process.env.DURI_ANDROID_VERSION_CODE)
    : undefined;
  const iosBuildNumber = process.env.DURI_IOS_BUILD_NUMBER?.trim();
  const iosUrlScheme = googleIosClientId ? googleIosUrlScheme(googleIosClientId) : undefined;
  const inviteLink = inviteLinkConfiguration();
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

  return {
    ...config,
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
      ...(androidVersionCode ? { versionCode: androidVersionCode } : {}),
      ...(inviteLink ? {
        intentFilters: [
          ...(config.android?.intentFilters ?? []),
          {
            action: "VIEW",
            autoVerify: true,
            data: [{ scheme: "https", host: inviteLink.host, pathPrefix: inviteLink.pathPrefix }],
            category: ["BROWSABLE", "DEFAULT"],
          },
        ],
      } : {}),
    },
    ios: {
      ...config.ios,
      ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
      ...(iosBuildNumber ? { buildNumber: iosBuildNumber } : {}),
      ...(inviteLink ? {
        associatedDomains: [...new Set([
          ...(config.ios?.associatedDomains ?? []),
          `applinks:${inviteLink.host}`,
        ])],
      } : {}),
    },
    plugins,
  };
};
