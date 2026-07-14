import type { EntityId } from "../../domain";
import type { GroupPreferredTagSummary } from "./types";

export function summarizeGroupPreferredTags(
  memberPreferredTags: Readonly<Record<EntityId, readonly string[]>>,
): GroupPreferredTagSummary[] {
  const memberIds = Object.keys(memberPreferredTags);
  if (!memberIds.length) return [];
  const byKey = new Map<string, { tag: string; memberIds: EntityId[]; order: number }>();
  let order = 0;

  for (const memberId of memberIds) {
    const seenForMember = new Set<string>();
    for (const rawTag of memberPreferredTags[memberId] ?? []) {
      const tag = rawTag.trim();
      const key = tag.toLowerCase();
      if (!tag || seenForMember.has(key)) continue;
      seenForMember.add(key);
      const current = byKey.get(key);
      if (current) current.memberIds.push(memberId);
      else byKey.set(key, { tag, memberIds: [memberId], order: order++ });
    }
  }

  return [...byKey.values()]
    .sort((left, right) => right.memberIds.length - left.memberIds.length || left.order - right.order)
    .map(({ tag, memberIds: tagMemberIds }) => ({
      tag,
      count: tagMemberIds.length,
      memberIds: [...tagMemberIds],
      ratio: tagMemberIds.length / memberIds.length,
      isCommonToAllRespondents: tagMemberIds.length === memberIds.length,
    }));
}
