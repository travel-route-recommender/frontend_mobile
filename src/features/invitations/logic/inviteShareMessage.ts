export type InviteShareContent = {
  inviteUrl: string;
  tripTitle: string;
  code: string;
};

export function buildInviteShareMessage(payload: InviteShareContent) {
  return `두리의 "${payload.tripTitle}" 여행방에 초대했어요.\n초대 코드: ${payload.code}\n${payload.inviteUrl}`;
}

/** Web Share의 url에는 표준 HTTPS 주소만 전달하고 custom scheme은 text로 보존한다. */
export function buildWebInviteShareData(payload: InviteShareContent) {
  const shareableWebUrl = (() => {
    try {
      const url = new URL(payload.inviteUrl);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  })();
  return {
    title: "두리 여행방 초대",
    text: shareableWebUrl
      ? `두리의 "${payload.tripTitle}" 여행방에 초대했어요.\n초대 코드: ${payload.code}`
      : buildInviteShareMessage(payload),
    ...(shareableWebUrl ? { url: shareableWebUrl } : {}),
  };
}
