import { rewriteTripInviteSystemPath } from "../src/features/invitations/logic/tripInviteLinks";

/** 외부 공유 링크를 실제 초대 화면으로 안전하게 연결한다. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return rewriteTripInviteSystemPath(path);
}
