import type { EntityId, User } from "../../../domain";

export function filterEligibleCompanionUserIds(
  userIds: readonly EntityId[],
  ownerUserId: EntityId,
  eligibleFriendIds: readonly EntityId[],
) {
  const eligibleFriendIdSet = new Set(eligibleFriendIds);
  return [...new Set(userIds)].filter((userId) => userId !== ownerUserId && eligibleFriendIdSet.has(userId));
}

export function resolveEligibleCompanionUsers(
  eligibleFriendIds: readonly EntityId[],
  ownerUserId: EntityId,
  usersById: Readonly<Record<EntityId, User>>,
) {
  return filterEligibleCompanionUserIds(eligibleFriendIds, ownerUserId, eligibleFriendIds)
    .map((userId) => usersById[userId])
    .filter((user): user is User => Boolean(user));
}
