import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Linking, Platform, Share } from "react-native";
import { normalizeExternalTravelDocumentUrl } from "../logic/externalDocumentUrl";
import { TRAVEL_DOCUMENT_SESSION_ID, type TravelDocument, type TravelDocumentKind, type TravelDocumentPickResult } from "../types";

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const DOCUMENT_DIRECTORY_NAME = "trip-documents";
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/*",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);
const compatibleMimeTypes: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg", "image/*"],
  jpeg: ["image/jpeg", "image/*"],
  png: ["image/png", "image/*"],
  webp: ["image/webp", "image/*"],
  heic: ["image/heic", "image/heif", "image/*"],
  heif: ["image/heic", "image/heif", "image/*"],
};
const mimeTypeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
function safeSegment(value: string, fallback: string) {
  const normalized = value.normalize("NFKC").replace(/[^0-9A-Za-z._-]+/g, "-").replace(/^-+|-+$/g, "");
  const safe = !normalized || normalized === "." || normalized === ".." ? fallback : normalized;
  return safe.slice(0, 72);
}

function extensionOf(fileName: string) {
  return fileName.split(".").at(-1)?.toLowerCase() ?? "";
}

function isAllowedDocument(fileName: string, mimeType?: string) {
  const extension = extensionOf(fileName);
  if (!allowedExtensions.has(extension)) return false;
  if (!mimeType) return true;
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime === "application/octet-stream") return true;
  return allowedMimeTypes.has(normalizedMime) && Boolean(compatibleMimeTypes[extension]?.includes(normalizedMime));
}

function isKnownFileSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function createDocumentId() {
  return `travel-document-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createExternalTravelDocument({
  tripId,
  kind,
  createdByUserId,
  url,
  displayName,
  createdAt,
}: {
  tripId: string;
  kind: TravelDocumentKind;
  createdByUserId: string;
  url: string;
  displayName?: string;
  createdAt?: string;
}): TravelDocumentPickResult {
  const normalizedUrl = normalizeExternalTravelDocumentUrl(url);
  if (!normalizedUrl) {
    return { status: "rejected", message: "http:// 또는 https://로 시작하는 올바른 예약 링크를 입력해 주세요." };
  }
  const id = createDocumentId();
  const host = new URL(normalizedUrl).hostname.replace(/^www\./, "");
  return {
    status: "selected",
    document: {
      id,
      tripId,
      itineraryItemIds: [],
      kind,
      displayName: displayName?.trim().slice(0, 80) || host,
      fileName: `${safeSegment(host, "reservation-link")}.url`,
      mimeType: "text/uri-list",
      sizeBytes: 0,
      localUri: normalizedUrl,
      storage: "external-url",
      createdByUserId,
      createdAt: createdAt ?? new Date().toISOString(),
    },
  };
}

function managedDocumentRootUri() {
  const rootUri = new Directory(Paths.document, DOCUMENT_DIRECTORY_NAME).uri;
  return rootUri.endsWith("/") ? rootUri : rootUri + "/";
}

function managedNativeDocumentFile(uri: string) {
  try {
    const decodedSegments = decodeURIComponent(uri).replace(/\\/g, "/").split("/");
    if (decodedSegments.includes("..")) return undefined;
    const file = new File(uri);
    return file.uri.startsWith(managedDocumentRootUri()) ? file : undefined;
  } catch {
    return undefined;
  }
}

function formatPickerError(error: unknown) {
  if (error instanceof Error && /permission|access|denied/i.test(error.message)) {
    return "파일에 접근할 권한이 없어요. 기기 설정을 확인해 주세요.";
  }
  return "문서를 가져오지 못했어요. 파일을 다시 선택해 주세요.";
}

export async function pickTravelDocument({
  tripId,
  kind,
  createdByUserId,
}: {
  tripId: string;
  kind: TravelDocumentKind;
  createdByUserId: string;
}): Promise<TravelDocumentPickResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
    if (result.canceled) return { status: "cancelled" };
    const asset = result.assets[0];
    if (!asset) return { status: "error", message: "선택한 문서를 읽을 수 없어요." };
    if (!isAllowedDocument(asset.name, asset.mimeType)) {
      return { status: "rejected", message: "PDF 또는 이미지 파일만 추가할 수 있어요." };
    }
    const reportedSize = asset.size ?? asset.file?.size;
    if (reportedSize !== undefined && !isKnownFileSize(reportedSize)) {
      return { status: "rejected", message: "문서 파일 크기를 확인할 수 없어 추가하지 않았어요." };
    }
    if (isKnownFileSize(reportedSize) && reportedSize > MAX_DOCUMENT_BYTES) {
      return { status: "rejected", message: "문서는 15MB 이하만 추가할 수 있어요." };
    }
    if (Platform.OS === "web" && !isKnownFileSize(reportedSize)) {
      return { status: "rejected", message: "웹에서 파일 크기를 확인할 수 없어 추가하지 않았어요." };
    }

    const id = createDocumentId();
    const extension = extensionOf(asset.name);
    const mimeType = !asset.mimeType || asset.mimeType === "application/octet-stream" || asset.mimeType === "image/*"
      ? mimeTypeByExtension[extension] ?? "application/octet-stream"
      : asset.mimeType;
    let localUri = asset.uri;
    let sizeBytes = reportedSize ?? 0;

    if (Platform.OS !== "web") {
      const root = new Directory(Paths.document, DOCUMENT_DIRECTORY_NAME);
      root.create({ intermediates: true, idempotent: true });
      const tripDirectory = new Directory(root, safeSegment(tripId, "trip"));
      tripDirectory.create({ intermediates: true, idempotent: true });
      const destination = new File(tripDirectory, `${safeSegment(id, "document")}-${safeSegment(asset.name, "document")}`);
      try {
        await new File(asset.uri).copy(destination);
        localUri = destination.uri;
        const copiedSize = destination.size;
        if (!isKnownFileSize(copiedSize)) {
          if (destination.exists) destination.delete();
          return { status: "rejected", message: "복사한 문서의 크기를 확인할 수 없어 추가하지 않았어요." };
        }
        sizeBytes = copiedSize;
        if (sizeBytes > MAX_DOCUMENT_BYTES) {
          if (destination.exists) destination.delete();
          return { status: "rejected", message: "문서는 15MB 이하만 추가할 수 있어요." };
        }
      } catch (error) {
        if (destination.exists) destination.delete();
        throw error;
      }
    }

    const document: TravelDocument = {
      id,
      tripId,
      itineraryItemIds: [],
      kind,
      displayName: asset.name.slice(0, 80),
      fileName: asset.name,
      mimeType,
      sizeBytes,
      localUri,
      storage: Platform.OS === "web" ? "web-session" : "native-private",
      ...(Platform.OS === "web" ? { sessionId: TRAVEL_DOCUMENT_SESSION_ID } : {}),
      createdByUserId,
      createdAt: new Date().toISOString(),
    };
    return { status: "selected", document };
  } catch (error) {
    return { status: "error", message: formatPickerError(error) };
  }
}

export function isTravelDocumentAvailable(document: TravelDocument) {
  if (document.storage === "external-url") {
    return normalizeExternalTravelDocumentUrl(document.localUri) !== undefined;
  }
  if (document.storage === "web-session") {
    return document.sessionId === TRAVEL_DOCUMENT_SESSION_ID && Boolean(document.localUri);
  }
  const file = managedNativeDocumentFile(document.localUri);
  if (!file) return false;
  try {
    return file.exists;
  } catch {
    return false;
  }
}

export async function openOrShareTravelDocument(document: TravelDocument) {
  if (!isTravelDocumentAvailable(document)) {
    return { ok: false as const, message: document.storage === "web-session" ? "웹을 새로고침한 뒤에는 이 파일을 다시 선택해야 해요." : "기기에서 파일을 찾을 수 없어요." };
  }
  try {
    if (document.storage === "external-url") {
      // canOpenURL은 Android manifest/iOS query 설정 때문에 reject될 수도 있다.
      // 그 경우에도 표준 http(s)는 openURL을 직접 시도하고 실제 실패만 값으로 격리한다.
      const canOpen = Platform.OS === "web" ? true : await Linking.canOpenURL(document.localUri).catch(() => true);
      if (!canOpen) return { ok: false as const, message: "이 기기에서 예약 링크를 열 수 없어요. 아래에서 일정 정보를 직접 입력해 주세요." };
      await Linking.openURL(document.localUri);
      return { ok: true as const };
    }
    if (Platform.OS === "web") {
      await Linking.openURL(document.localUri);
      return { ok: true as const };
    }
    if (!await Sharing.isAvailableAsync()) {
      return { ok: false as const, message: "이 기기에서는 파일 열기·공유를 사용할 수 없어요." };
    }
    await Sharing.shareAsync(document.localUri, {
      dialogTitle: document.displayName,
      mimeType: document.mimeType,
      UTI: document.mimeType === "application/pdf" ? "com.adobe.pdf" : undefined,
    });
    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      message: document.storage === "external-url"
        ? "예약 링크를 열지 못했어요. 아래에서 일정 정보를 직접 입력해 주세요."
        : "파일을 열거나 공유하지 못했어요.",
    };
  }
}

export async function shareExternalTravelDocument(document: TravelDocument) {
  if (document.storage !== "external-url" || !normalizeExternalTravelDocumentUrl(document.localUri)) {
    return { ok: false as const, message: "공유할 수 있는 예약 링크가 아니에요." };
  }
  try {
    await Share.share({
      title: document.displayName,
      message: `${document.displayName}\n${document.localUri}`,
      url: document.localUri,
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "예약 링크를 공유하지 못했어요." };
  }
}

export async function deleteStoredTravelDocument(document: TravelDocument) {
  if (document.storage === "external-url") return { ok: true as const };
  if (document.storage === "web-session") {
    if (document.localUri.startsWith("blob:") && typeof globalThis.URL?.revokeObjectURL === "function") {
      globalThis.URL.revokeObjectURL(document.localUri);
    }
    return { ok: true as const };
  }
  try {
    const file = managedNativeDocumentFile(document.localUri);
    if (!file) {
      return { ok: false as const, message: "앱 문서함 밖의 파일은 삭제하지 않았어요." };
    }
    if (file.exists) file.delete();
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "파일 삭제를 완료하지 못했어요. 문서 목록은 유지했어요." };
  }
}

export function formatTravelDocumentSize(sizeBytes: number) {
  if (!sizeBytes) return "크기 정보 없음";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}
