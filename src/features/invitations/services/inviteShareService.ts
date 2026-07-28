import * as Clipboard from "expo-clipboard";
import { Platform, Share } from "react-native";
import { buildInviteShareMessage, buildWebInviteShareData } from "../logic/inviteShareMessage";

export type InviteSharePayload = {
  inviteUrl: string;
  tripTitle: string;
  code: string;
};

export type InviteShareResult = {
  status: "shared" | "copied" | "cancelled";
  message: string;
};

export interface InviteShareService {
  shareLink(payload: InviteSharePayload): Promise<InviteShareResult>;
  copyLink(payload: InviteSharePayload): Promise<InviteShareResult>;
}

function errorName(reason: unknown) {
  if (!reason || typeof reason !== "object" || !("name" in reason)) return "";
  return String(reason.name);
}

async function shareOnWeb(payload: InviteSharePayload): Promise<InviteShareResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    throw new Error("이 브라우저에서는 공유 기능을 지원하지 않아요. 링크 복사를 이용해 주세요.");
  }

  try {
    await navigator.share(buildWebInviteShareData(payload));
    return { status: "shared", message: "초대 링크를 공유했어요." };
  } catch (reason: unknown) {
    if (errorName(reason) === "AbortError") {
      return { status: "cancelled", message: "공유를 취소했어요." };
    }
    throw new Error("브라우저 공유 창을 열지 못했어요. 링크 복사를 이용해 주세요.");
  }
}

async function shareLink(payload: InviteSharePayload): Promise<InviteShareResult> {
  if (Platform.OS === "web") return shareOnWeb(payload);

  const result = await Share.share(
    {
      title: "두리 여행방 초대",
      message: buildInviteShareMessage(payload),
    },
    { dialogTitle: "두리 여행방 초대" },
  );
  if (result.action === Share.dismissedAction) return { status: "cancelled", message: "공유를 취소했어요." };
  return { status: "shared", message: "초대 링크를 공유했어요." };
}

export const inviteShareService: InviteShareService = {
  shareLink,
  async copyLink(payload) {
    const copied = await Clipboard.setStringAsync(payload.inviteUrl);
    if (!copied) throw new Error("초대 링크를 클립보드에 복사하지 못했어요.");
    return { status: "copied", message: "초대 링크를 복사했어요." };
  },
};
