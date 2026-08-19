import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ItineraryItem } from "../../../domain";
import {
  API_WORKSPACE_OVERLAY_STORAGE_VERSION,
  buildApiWorkspaceOverlays,
  parseApiWorkspaceOverlays,
} from "../logic/apiWorkspaceOverlay";

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type StoredApiWorkspaceOverlays = {
  version: typeof API_WORKSPACE_OVERLAY_STORAGE_VERSION;
  items: ReturnType<typeof buildApiWorkspaceOverlays>;
  savedAt: string;
};

function storageKey(userId: string, roomId: string) {
  const normalizedUserId = userId.trim();
  const normalizedRoomId = roomId.trim();
  if (!MONGO_OBJECT_ID_PATTERN.test(normalizedUserId) || !MONGO_OBJECT_ID_PATTERN.test(normalizedRoomId)) {
    throw new Error("서버 사용자 또는 여행방 ID 형식이 올바르지 않아요.");
  }
  return `duri:api-workspace-overlays:v${API_WORKSPACE_OVERLAY_STORAGE_VERSION}:${normalizedUserId}:${normalizedRoomId}`;
}

export async function loadApiWorkspaceOverlays(userId: string, roomId: string) {
  const raw = await AsyncStorage.getItem(storageKey(userId, roomId));
  if (!raw) return {};
  try {
    return parseApiWorkspaceOverlays(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveApiWorkspaceOverlays(userId: string, roomId: string, items: readonly ItineraryItem[]) {
  const value: StoredApiWorkspaceOverlays = {
    version: API_WORKSPACE_OVERLAY_STORAGE_VERSION,
    items: buildApiWorkspaceOverlays(items),
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(userId, roomId), JSON.stringify(value));
}
