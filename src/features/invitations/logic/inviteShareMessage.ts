export type InviteShareContent = {
  inviteUrl: string;
  tripTitle: string;
  code: string;
};

export function buildInviteShareMessage(payload: InviteShareContent) {
  return `두리의 "${payload.tripTitle}" 여행방에 초대했어요.\n초대 코드: ${payload.code}\n${payload.inviteUrl}`;
}

/** Web Share의 url 필드는 http(s) 외 custom scheme을 거부할 수 있어 text에만 담는다. */
export function buildWebInviteShareData(payload: InviteShareContent) {
  return {
    title: "두리 여행방 초대",
    text: buildInviteShareMessage(payload),
  };
}
