import type { EntityId, ItineraryItem } from "../../domain";
import { DURI_ANALYSIS_CONFIG } from "./config";
import { categoryStatusFromIssues, insufficientCategory, normalizeTrait } from "./shared";
import type { AnalysisEvidence, AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";

type PreferenceSource = "preferred" | "candidate" | "tags";

function resolvePreferredMemberIds(item: ItineraryItem, input: DuriAnalysisInput): { ids: EntityId[]; source?: PreferenceSource } {
  const memberIds = new Set(input.trip.members.map((member) => member.userId));
  const preferred = [...new Set(item.preferredByUserIds)].filter((userId) => memberIds.has(userId));
  if (preferred.length) return { ids: preferred, source: "preferred" };

  const candidate = item.placeId ? input.candidates.find((entry) => entry.placeId === item.placeId) : undefined;
  const proposed = [...new Set(candidate?.addedByUserIds ?? [])].filter((userId) => memberIds.has(userId));
  if (proposed.length) return { ids: proposed, source: "candidate" };

  const place = item.placeId ? input.placesById[item.placeId] : undefined;
  if (!place) return { ids: [] };
  const placeTags = place.tags.map(normalizeTrait);
  const tagMatches = input.trip.members.flatMap((member) => {
    const preferredTags = input.preferenceResults[member.userId]?.preferredTags ?? [];
    const matchCount = preferredTags.filter((tag) => placeTags.includes(normalizeTrait(tag))).length;
    return matchCount >= 2 ? [member.userId] : [];
  });
  return tagMatches.length ? { ids: tagMatches, source: "tags" } : { ids: [] };
}

export function analyzePreferences(input: DuriAnalysisInput): CategoryAnalysisResult {
  const memberIds = input.trip.members.map((member) => member.userId);
  if (memberIds.length <= 1) return insufficientCategory("preference", "혼자 여행에서는 동행자 선호 균형을 분석하지 않아요.");
  if (input.itinerary.length < DURI_ANALYSIS_CONFIG.preference.minimumAnalyzableItems) return insufficientCategory("preference", "일정이 3개 이상 모이면 동행자별 선호 반영 균형을 분석할 수 있어요.");

  const counts = Object.fromEntries(memberIds.map((memberId) => [memberId, 0])) as Record<EntityId, number>;
  const itemIdsByMember = Object.fromEntries(memberIds.map((memberId) => [memberId, []])) as Record<EntityId, EntityId[]>;
  const placeIdsByMember = Object.fromEntries(memberIds.map((memberId) => [memberId, []])) as Record<EntityId, EntityId[]>;
  const sourceCounts: Record<PreferenceSource, number> = { preferred: 0, candidate: 0, tags: 0 };
  let analyzableItems = 0;

  for (const item of input.itinerary) {
    const resolved = resolvePreferredMemberIds(item, input);
    if (!resolved.ids.length || !resolved.source) continue;
    analyzableItems += 1;
    sourceCounts[resolved.source] += 1;
    for (const memberId of resolved.ids) {
      counts[memberId] += 1;
      itemIdsByMember[memberId].push(item.id);
      if (item.placeId) placeIdsByMember[memberId].push(item.placeId);
    }
  }
  if (analyzableItems < DURI_ANALYSIS_CONFIG.preference.minimumAnalyzableItems) return insufficientCategory("preference", "선호 주체를 확인할 수 있는 일정이 부족해 균형을 판단하지 않았어요.");

  const evidence: AnalysisEvidence[] = memberIds.map((memberId) => {
    const userName = input.members.find((member) => member.id === memberId)?.name ?? "참여자";
    const ratio = counts[memberId] / analyzableItems;
    return {
      label: `${userName} 반영`,
      value: `${counts[memberId]}개 · ${Math.round(ratio * 100)}%`,
      itemIds: itemIdsByMember[memberId],
      placeIds: placeIdsByMember[memberId],
      memberIds: [memberId],
    };
  });
  const maxCount = Math.max(...Object.values(counts));
  const minCount = Math.min(...Object.values(counts));
  const issues: AnalysisIssue[] = [];

  for (const memberId of memberIds) {
    const ratio = counts[memberId] / analyzableItems;
    if (counts[memberId] > 0 && ratio >= DURI_ANALYSIS_CONFIG.preference.minimumReflectionRatio) continue;
    const userName = input.members.find((member) => member.id === memberId)?.name ?? "참여자";
    issues.push({
      id: `preference-member-${memberId}`,
      category: "preference",
      status: "attention",
      severity: counts[memberId] === 0 ? "medium" : "low",
      title: `${userName}님의 선호가 아직 적게 반영됐어요`,
      summary: `${userName}님의 근거가 있는 일정은 ${counts[memberId]}개예요.`,
      affectedItemIds: itemIdsByMember[memberId],
      affectedPlaceIds: placeIdsByMember[memberId],
      affectedMemberIds: [memberId],
      evidence: [evidence.find((entry) => entry.memberIds?.includes(memberId)) as AnalysisEvidence],
    });
  }

  if (maxCount - minCount >= DURI_ANALYSIS_CONFIG.preference.reflectionCountDifferenceWarning) {
    issues.push({
      id: "preference-count-gap",
      category: "preference",
      status: "attention",
      severity: "medium",
      title: "참여자별 반영 일정 수 차이가 있어요",
      summary: `가장 많은 참여자와 가장 적은 참여자의 반영 일정 차이가 ${maxCount - minCount}개예요.`,
      affectedItemIds: [...new Set(Object.values(itemIdsByMember).flat())],
      affectedPlaceIds: [...new Set(Object.values(placeIdsByMember).flat())],
      affectedMemberIds: memberIds,
      evidence,
    });
  }

  if (!issues.length) {
    issues.push({
      id: "preference-balance",
      category: "preference",
      status: "good",
      severity: "info",
      title: "동행자 선호가 고르게 반영되어 있어요",
      summary: `${analyzableItems}개 일정에서 참여자별 선호 근거를 확인했어요.`,
      affectedItemIds: [...new Set(Object.values(itemIdsByMember).flat())],
      affectedPlaceIds: [...new Set(Object.values(placeIdsByMember).flat())],
      affectedMemberIds: memberIds,
      evidence,
    });
  }

  const status = categoryStatusFromIssues(issues);
  const sourceLabel = sourceCounts.preferred
    ? "일정 선호 응답"
    : sourceCounts.candidate
      ? "후보를 담은 사람"
      : "선호 태그 2개 이상 일치";
  return { category: "preference", status, summary: status === "good" ? `${sourceLabel} 기준으로 동행자 선호가 고르게 반영되어 있어요.` : `${sourceLabel} 기준으로 참여자별 반영 정도를 조금 더 맞춰 보세요.`, issues };
}
