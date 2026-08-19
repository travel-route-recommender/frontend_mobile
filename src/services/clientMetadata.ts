import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getBrowserItem, setBrowserItem } from "./browserStorage";

export type ClientPlatform = "android" | "ios" | "web" | "unknown";

export type ClientMetadata = {
  installationId: string;
  platform: ClientPlatform;
  deviceName?: string;
  appVersion?: string;
};

const INSTALLATION_ID_KEY = "tripmatch.installation-id";
const INSTALLATION_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "tripmatch.installation",
};

let installationIdPromise: Promise<string> | undefined;

function currentPlatform(): ClientPlatform {
  if (Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "web") return Platform.OS;
  return "unknown";
}

async function loadOrCreateInstallationId() {
  const existing = Platform.OS === "web"
    ? getBrowserItem("local", INSTALLATION_ID_KEY)
    : await SecureStore.getItemAsync(INSTALLATION_ID_KEY, INSTALLATION_OPTIONS);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  if (Platform.OS === "web") setBrowserItem("local", INSTALLATION_ID_KEY, created);
  else await SecureStore.setItemAsync(INSTALLATION_ID_KEY, created, INSTALLATION_OPTIONS);
  return created;
}

export function getInstallationId() {
  installationIdPromise ??= loadOrCreateInstallationId().catch((error) => {
    installationIdPromise = undefined;
    throw error;
  });
  return installationIdPromise;
}

export async function getClientMetadata(): Promise<ClientMetadata> {
  const installationId = await getInstallationId();
  const deviceName = Device.modelName?.trim();
  const appVersion = Constants.expoConfig?.version?.trim();
  return {
    installationId,
    platform: currentPlatform(),
    ...(deviceName ? { deviceName } : {}),
    ...(appVersion ? { appVersion } : {}),
  };
}

export function createRequestId() {
  return Crypto.randomUUID();
}
