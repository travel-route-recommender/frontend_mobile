import { Platform, Share } from "react-native";

export type InviteShareResult = {
  status: "shared" | "copied" | "fallback";
  message: string;
};

export interface InviteShareService {
  shareToKakao(inviteUrl: string): Promise<InviteShareResult>;
  shareNative(inviteUrl: string): Promise<InviteShareResult>;
  copyLink(inviteUrl: string): Promise<InviteShareResult>;
}

export function buildMockInviteUrl(inviteToken: string) {
  return `https://example.invalid/invite/${encodeURIComponent(inviteToken)}`;
}

async function openNativeShare(inviteUrl: string) {
  await Share.share({ title: "두리 여행방 초대", message: `두리 여행방에 함께해 주세요.\n${inviteUrl}`, url: inviteUrl }, { dialogTitle: "두리 여행방 초대" });
}

export const inviteShareService: InviteShareService = {
  async shareToKakao(inviteUrl) {
    await openNativeShare(inviteUrl);
    return { status: "fallback", message: "Kakao SDK가 아직 연결되지 않아 기본 공유 창을 열었어요." };
  },
  async shareNative(inviteUrl) {
    await openNativeShare(inviteUrl);
    return { status: "shared", message: "기본 공유 창을 열었어요." };
  },
  async copyLink(inviteUrl) {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(inviteUrl);
      return { status: "copied", message: "초대 링크를 복사했어요." };
    }
    await openNativeShare(inviteUrl);
    return { status: "fallback", message: "native 클립보드 모듈이 없어 기본 공유 창을 열었어요. 공유 창에서 링크를 복사해 주세요." };
  },
};
