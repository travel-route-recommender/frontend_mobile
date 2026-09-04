import type { DocumentPickerAsset, DocumentPickerResult } from "expo-document-picker";
import { environment } from "../../../config/environment";
import { apiClient } from "../../../services/apiClient";

type UnknownRecord = Record<string, unknown>;

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DOWNLOAD_RENEWAL_WINDOW_MS = 60_000;
const MAX_NOTE_LENGTH = 200;

export const API_TRIP_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, ApiTripDocumentMimeType>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const COMPATIBLE_MIME_BY_EXTENSION: Readonly<Record<string, readonly ApiTripDocumentMimeType[]>> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
  heif: ["image/heic", "image/heif"],
};

export type ApiTripDocumentMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif";

export type ApiTripDocumentDownload = {
  token: string;
  url: string;
  path: string;
  expiresAt: string;
  expiresInSec: number;
};

/**
 * Backend 공유 문서 계약. 현재 서버는 파일과 메모만 공유하며 문서 종류,
 * OCR 결과, 일정 연결 정보는 이 응답에 포함하지 않는다.
 */
export type ApiTripDocument = {
  id: string;
  roomId: string;
  fileUrl: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  note?: string;
  uploadedBy: string;
  createdAt?: string;
  download?: ApiTripDocumentDownload;
};

export type ApiTripDocumentCollection = {
  documents: ApiTripDocument[];
  scheduleVersion: number;
  factsVersion: number;
};

export type ApiTripDocumentMutationVersion = Pick<
  ApiTripDocumentCollection,
  "scheduleVersion" | "factsVersion"
>;

export type ApiTripDocumentUploadResult =
  | ({ status: "uploaded"; document: ApiTripDocument } & ApiTripDocumentMutationVersion)
  | { status: "cancelled" }
  | { status: "rejected"; message: string }
  | { status: "error"; message: string };

export class ApiTripDocumentContractError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ApiTripDocumentContractError";
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new ApiTripDocumentContractError(path, message);
}

function asRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "객체 응답이어야 합니다.");
  }
  return value as UnknownRecord;
}

function asString(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim()) return fail(path, "비어 있지 않은 문자열이어야 합니다.");
  return value.trim();
}

function optionalString(value: unknown, path: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return fail(path, "문자열 또는 null이어야 합니다.");
  return value.trim() || undefined;
}

function objectId(value: unknown, path: string) {
  const id = asString(value, path);
  if (!MONGO_OBJECT_ID_PATTERN.test(id)) return fail(path, "24자리 Mongo ObjectId여야 합니다.");
  return id;
}

function assertRoomId(roomId: string) {
  return objectId(roomId.trim(), "roomId");
}

function nonNegativeInteger(value: unknown, path: string) {
  if (!Number.isInteger(value) || (value as number) < 0) return fail(path, "0 이상의 정수여야 합니다.");
  return value as number;
}

function positiveInteger(value: unknown, path: string) {
  if (!Number.isInteger(value) || (value as number) <= 0) return fail(path, "양의 정수여야 합니다.");
  return value as number;
}

function isoDateTime(value: unknown, path: string) {
  const dateTime = asString(value, path);
  if (!Number.isFinite(Date.parse(dateTime))) return fail(path, "유효한 ISO 날짜와 시각이어야 합니다.");
  return dateTime;
}

function optionalIsoDateTime(value: unknown, path: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return isoDateTime(value, path);
}

function httpUrl(value: unknown, path: string) {
  const url = asString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(path, "유효한 다운로드 URL이어야 합니다.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail(path, "http 또는 https 다운로드 URL이어야 합니다.");
  }
  return url;
}

function documentPath(value: unknown, roomId: string, path: string) {
  const fileUrl = asString(value, path);
  if (fileUrl.includes("\\") || fileUrl.includes("?") || fileUrl.includes("#")) {
    return fail(path, "쿼리와 역슬래시가 없는 문서 업로드 경로여야 합니다.");
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(fileUrl);
  } catch {
    return fail(path, "올바르게 인코딩된 문서 업로드 경로여야 합니다.");
  }
  if (decoded.split("/").includes("..") || !decoded.startsWith(`/uploads/documents/${roomId}/`)) {
    return fail(path, "현재 여행방의 문서 업로드 경로여야 합니다.");
  }
  return fileUrl;
}

function parseDownload(value: unknown, path: string, roomId: string, expectedFileUrl: string) {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, path);
  const signedPath = documentPath(record.path, roomId, `${path}.path`);
  if (signedPath !== expectedFileUrl) return fail(`${path}.path`, "문서 fileUrl과 일치해야 합니다.");
  return {
    token: asString(record.token, `${path}.token`),
    url: httpUrl(record.url, `${path}.url`),
    path: signedPath,
    expiresAt: isoDateTime(record.expiresAt, `${path}.expiresAt`),
    expiresInSec: positiveInteger(record.expiresInSec, `${path}.expiresInSec`),
  } satisfies ApiTripDocumentDownload;
}

export function parseApiTripDocument(value: unknown, path = "document"): ApiTripDocument {
  const record = asRecord(value, path);
  const roomId = objectId(record.roomId, `${path}.roomId`);
  const fileUrl = documentPath(record.fileUrl, roomId, `${path}.fileUrl`);
  const sizeBytes = record.size === undefined || record.size === null
    ? undefined
    : nonNegativeInteger(record.size, `${path}.size`);
  const originalName = optionalString(record.originalName, `${path}.originalName`);
  const mimeType = optionalString(record.mimeType, `${path}.mimeType`);
  const note = optionalString(record.note, `${path}.note`);
  const createdAt = optionalIsoDateTime(record.createdAt, `${path}.createdAt`);
  const download = parseDownload(record.download, `${path}.download`, roomId, fileUrl);
  return {
    id: objectId(record.id, `${path}.id`),
    roomId,
    fileUrl,
    ...(originalName ? { originalName } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(note ? { note } : {}),
    uploadedBy: objectId(record.uploadedBy, `${path}.uploadedBy`),
    ...(createdAt ? { createdAt } : {}),
    ...(download ? { download } : {}),
  };
}

export function parseApiTripDocumentList(value: unknown) {
  return parseApiTripDocumentCollection(value).documents;
}

export function parseApiTripDocumentCollection(value: unknown): ApiTripDocumentCollection {
  const record = asRecord(value, "documents");
  if (!Array.isArray(record.data)) return fail("documents.data", "배열 응답이어야 합니다.");
  const documents = record.data.map((entry, index) => parseApiTripDocument(entry, `documents.data[${index}]`));
  const ids = new Set<string>();
  for (const document of documents) {
    if (ids.has(document.id)) return fail("documents.data", `중복 문서 ID가 있습니다: ${document.id}`);
    ids.add(document.id);
  }
  return {
    documents,
    scheduleVersion: nonNegativeInteger(record.scheduleVersion, "documents.scheduleVersion"),
    factsVersion: nonNegativeInteger(record.factsVersion, "documents.factsVersion"),
  };
}

function endpoint(roomId: string, suffix = "documents") {
  return `/rooms/${encodeURIComponent(assertRoomId(roomId))}/${suffix}`;
}

export async function fetchApiTripDocuments(roomId: string, signal?: AbortSignal) {
  return (await fetchApiTripDocumentCollection(roomId, signal)).documents;
}

export async function fetchApiTripDocumentCollection(roomId: string, signal?: AbortSignal) {
  const normalizedRoomId = assertRoomId(roomId);
  const payload = await apiClient.request<unknown>({
    path: endpoint(normalizedRoomId),
    auth: true,
    signal,
  });
  const collection = parseApiTripDocumentCollection(payload);
  if (collection.documents.some((document) => document.roomId !== normalizedRoomId)) {
    return fail("documents.data", "요청한 여행방과 다른 문서가 포함되어 있습니다.");
  }
  return collection;
}

function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function resolveUploadMimeType(asset: DocumentPickerAsset): ApiTripDocumentMimeType | undefined {
  const extension = extensionOf(asset.name);
  const extensionMime = MIME_BY_EXTENSION[extension];
  if (!extensionMime) return undefined;
  const rawMime = asset.mimeType?.trim().toLowerCase();
  if (!rawMime || rawMime === "application/octet-stream" || rawMime === "image/*") return extensionMime;
  const compatible = COMPATIBLE_MIME_BY_EXTENSION[extension];
  return compatible?.includes(rawMime as ApiTripDocumentMimeType)
    ? rawMime as ApiTripDocumentMimeType
    : undefined;
}

function validateUploadAsset(asset: DocumentPickerAsset) {
  const mimeType = resolveUploadMimeType(asset);
  if (!mimeType) return { ok: false as const, message: "PDF, JPG, PNG, WEBP, HEIC, HEIF 파일만 업로드할 수 있어요." };
  const reportedSize = asset.size ?? asset.file?.size;
  if (typeof reportedSize !== "number" || !Number.isFinite(reportedSize) || reportedSize <= 0) {
    return { ok: false as const, message: "파일 크기를 확인할 수 없어 업로드하지 않았어요." };
  }
  if (reportedSize > API_TRIP_DOCUMENT_MAX_BYTES) {
    return { ok: false as const, message: "공유 문서는 10MB 이하만 업로드할 수 있어요." };
  }
  return { ok: true as const, mimeType };
}

export async function uploadApiTripDocument(input: {
  roomId: string;
  asset: DocumentPickerAsset;
  note?: string;
}) {
  const { Platform } = await import("react-native");
  const roomId = assertRoomId(input.roomId);
  const validated = validateUploadAsset(input.asset);
  if (!validated.ok) return validated;
  const note = input.note?.trim();
  if (note && note.length > MAX_NOTE_LENGTH) {
    return { ok: false as const, message: `메모는 ${MAX_NOTE_LENGTH}자 이하로 입력해 주세요.` };
  }

  const form = new FormData();
  if (Platform.OS === "web" && input.asset.file) {
    form.append("file", input.asset.file, input.asset.name);
  } else {
    form.append("file", {
      uri: input.asset.uri,
      name: input.asset.name,
      type: validated.mimeType,
    } as unknown as Blob);
  }
  if (note) form.append("note", note);

  const payload = await apiClient.request<unknown>({
    path: endpoint(roomId),
    method: "POST",
    body: form,
    auth: true,
  });
  const record = asRecord(payload, "documentUpload");
  const document = parseApiTripDocument(record, "documentUpload");
  if (document.roomId !== roomId) return fail("document.roomId", "업로드한 여행방과 일치해야 합니다.");
  return {
    ok: true as const,
    document,
    scheduleVersion: nonNegativeInteger(record.scheduleVersion, "documentUpload.scheduleVersion"),
    factsVersion: nonNegativeInteger(record.factsVersion, "documentUpload.factsVersion"),
  };
}

export async function pickAndUploadApiTripDocument(input: {
  roomId: string;
  note?: string;
}): Promise<ApiTripDocumentUploadResult> {
  let result: DocumentPickerResult;
  try {
    const DocumentPicker = await import("expo-document-picker");
    result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
  } catch {
    return { status: "error", message: "문서 선택 화면을 열지 못했어요. 파일 접근 권한을 확인해 주세요." };
  }
  if (result.canceled) return { status: "cancelled" };
  const asset = result.assets[0];
  if (!asset) return { status: "error", message: "선택한 문서를 읽을 수 없어요." };
  const uploaded = await uploadApiTripDocument({ ...input, asset });
  return uploaded.ok
    ? {
        status: "uploaded",
        document: uploaded.document,
        scheduleVersion: uploaded.scheduleVersion,
        factsVersion: uploaded.factsVersion,
      }
    : { status: "rejected", message: uploaded.message };
}

function parseDeleteResult(value: unknown) {
  const record = asRecord(value, "documentDelete");
  if (record.success !== true) return fail("documentDelete.success", "true여야 합니다.");
  return {
    scheduleVersion: nonNegativeInteger(record.scheduleVersion, "documentDelete.scheduleVersion"),
    factsVersion: nonNegativeInteger(record.factsVersion, "documentDelete.factsVersion"),
  };
}

export async function deleteApiTripDocument(roomId: string, documentId: string) {
  const normalizedRoomId = assertRoomId(roomId);
  const normalizedDocumentId = objectId(documentId.trim(), "documentId");
  const payload = await apiClient.request<unknown>({
    path: endpoint(normalizedRoomId, `documents/${encodeURIComponent(normalizedDocumentId)}`),
    method: "DELETE",
    auth: true,
  });
  return parseDeleteResult(payload);
}

export async function renewApiTripDocumentDownload(roomId: string, fileUrl: string) {
  const normalizedRoomId = assertRoomId(roomId);
  const normalizedFileUrl = documentPath(fileUrl, normalizedRoomId, "fileUrl");
  const payload = await apiClient.request<unknown>({
    path: endpoint(normalizedRoomId, "files/signed-url"),
    method: "POST",
    body: { path: normalizedFileUrl },
    auth: true,
  });
  return parseDownload(payload, "download", normalizedRoomId, normalizedFileUrl)
    ?? fail("download", "서명 다운로드 정보가 필요합니다.");
}

export async function ensureFreshApiTripDocumentDownload(
  roomId: string,
  document: ApiTripDocument,
  now = Date.now(),
) {
  const normalizedRoomId = assertRoomId(roomId);
  if (document.roomId !== normalizedRoomId) return fail("document.roomId", "요청한 여행방과 일치해야 합니다.");
  const current = document.download;
  const expiresAt = current ? Date.parse(current.expiresAt) : Number.NaN;
  const download = current && Number.isFinite(expiresAt) && expiresAt - now > DOWNLOAD_RENEWAL_WINDOW_MS
    ? current
    : await renewApiTripDocumentDownload(normalizedRoomId, document.fileUrl);
  return {
    document: download === current ? document : { ...document, download },
    download,
  };
}

/**
 * Backend의 APP_BASE_URL이 localhost로 남아 있어도 실제 기기가 현재 설정된
 * API host로 접근하도록, 서버가 서명한 opaque token만 보존해 URL을 만든다.
 */
export function buildApiTripDocumentDownloadUrl(download: ApiTripDocumentDownload) {
  return `${environment.apiBaseUrl.replace(/\/+$/, "")}/files/download?token=${encodeURIComponent(download.token)}`;
}

export async function openApiTripDocumentDownload(roomId: string, document: ApiTripDocument) {
  const { Linking, Platform } = await import("react-native");
  const fresh = await ensureFreshApiTripDocumentDownload(roomId, document);
  const downloadUrl = buildApiTripDocumentDownloadUrl(fresh.download);
  const canOpen = Platform.OS === "web"
    ? true
    : await Linking.canOpenURL(downloadUrl).catch(() => true);
  if (!canOpen) throw new Error("이 기기에서 문서 다운로드 링크를 열 수 없어요.");
  await Linking.openURL(downloadUrl);
  return fresh.document;
}
