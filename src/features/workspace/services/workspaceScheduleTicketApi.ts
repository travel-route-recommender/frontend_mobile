import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import { apiClient } from "../../../services/apiClient";

const MAX_TICKET_BYTES = 5 * 1024 * 1024;
const ALLOWED_TICKET_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

export type ScheduleTicketUploadResult =
  | { status: "uploaded" }
  | { status: "cancelled" }
  | { status: "rejected"; message: string };

function endpoint(roomId: string, itemId: string, ticketId?: string) {
  const base = `/rooms/${encodeURIComponent(roomId)}/schedule/items/${encodeURIComponent(itemId)}/tickets`;
  return ticketId ? `${base}/${encodeURIComponent(ticketId)}` : base;
}

function extensionOf(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

export async function pickAndUploadScheduleTicket(input: {
  roomId: string;
  itemId: string;
  note?: string;
}): Promise<ScheduleTicketUploadResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return { status: "cancelled" };
  const asset = result.assets[0];
  if (!asset) return { status: "rejected", message: "선택한 티켓 이미지를 읽을 수 없어요." };
  if (!ALLOWED_TICKET_EXTENSIONS.has(extensionOf(asset.name))) {
    return { status: "rejected", message: "JPG, PNG, WEBP, HEIC, HEIF 티켓 이미지만 업로드할 수 있어요." };
  }
  const size = asset.size ?? asset.file?.size;
  if (typeof size === "number" && size > MAX_TICKET_BYTES) {
    return { status: "rejected", message: "서버 티켓 이미지는 5MB 이하만 업로드할 수 있어요." };
  }

  const form = new FormData();
  if (Platform.OS === "web" && asset.file) {
    form.append("image", asset.file, asset.name);
  } else {
    form.append("image", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
  }
  const note = input.note?.trim();
  if (note) form.append("note", note.slice(0, 200));
  await apiClient.request({
    path: endpoint(input.roomId, input.itemId),
    method: "POST",
    body: form,
    auth: true,
  });
  return { status: "uploaded" };
}

export async function deleteScheduleTicket(roomId: string, itemId: string, ticketId: string) {
  await apiClient.request({
    path: endpoint(roomId, itemId, ticketId),
    method: "DELETE",
    auth: true,
  });
}
