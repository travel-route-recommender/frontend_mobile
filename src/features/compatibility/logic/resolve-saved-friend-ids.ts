import { getMockSavedFriendIds } from "../config/mock-friends";

const EMPTY_FRIEND_IDS: readonly string[] = [];

export function resolveSavedFriendIds(
  savedFriendIdsByUserId: Readonly<Record<string, string[] | undefined>>,
  userId: string | null | undefined,
): readonly string[] {
  if (!userId) return EMPTY_FRIEND_IDS;
  return savedFriendIdsByUserId[userId] ?? getMockSavedFriendIds(userId);
}
