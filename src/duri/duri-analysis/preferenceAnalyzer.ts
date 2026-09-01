import type { EntityId, ItineraryItem } from "../../domain";
import { categoryStatusFromIssues, insufficientCategory } from "./shared";
import type { AnalysisEvidence, AnalysisIssue, CategoryAnalysisResult, DuriAnalysisInput } from "./types";

type PreferenceSource = "preferred" | "candidate";

function resolvePreferredMemberIds(item: ItineraryItem, input: DuriAnalysisInput): { ids: EntityId[]; source?: PreferenceSource } {
  const memberIds = new Set(input.trip.members.map((member) => member.userId));
  const preferred = [...new Set(item.preferredByUserIds)].filter((userId) => memberIds.has(userId));
  if (preferred.length) return { ids: preferred, source: "preferred" };

  const candidate = item.placeId ? input.candidates.find((entry) => entry.placeId === item.placeId) : undefined;
  const proposed = [...new Set(candidate?.addedByUserIds ?? [])].filter((userId) => memberIds.has(userId));
  if (proposed.length) return { ids: proposed, source: "candidate" };

  return { ids: [] };
}

export function analyzePreferences(input: DuriAnalysisInput): CategoryAnalysisResult {
  const memberIds = input.trip.members.map((member) => member.userId);
  if (memberIds.length <= 1) return insufficientCategory("preference", "혼자 여행에서는 동행자 선호 균형을 분석하지 않아요.");

  const counts = Object.fromEntries(memberIds.map((memberId) => [memberId, 0])) as Record<EntityId, number>;
  const itemIdsByMember = Object.fromEntries(memberIds.map((memberId) => [memberId, []])) as Record<EntityId, EntityId[]>;
  const placeIdsByMember = Object.fromEntries(memberIds.map((memberId) => [memberId, []])) as Record<EntityId, EntityId[]>;
  const sourceCounts: Record<PreferenceSource, number> = { preferred: 0, candidate: 0 };
  let analyzableItems = 0;
  let attributedMinutes = 0;

  for (const item of input.itinerary) {
    const resolved = resolvePreferredMemberIds(item, input);
    if (!resolved.ids.length || !resolved.source) continue;
    analyzableItems += 1;
    attributedMinutes += item.durationMinutes;
    sourceCounts[resolved.source] += 1;
    const credit = item.durationMinutes / resolved.ids.length;
    for (const memberId of resolved.ids) {
      counts[memberId] += credit;
      itemIdsByMember[memberId].push(item.id);
      if (item.placeId) placeIdsByMember[memberId].push(item.placeId);
    }
  }
  if (!analyzableItems) return insufficientCategory("preference", "직접 선호 표시 또는 후보 제안자를 확인할 수 있는 일정이 없어요.");

  const evidence: AnalysisEvidence[] = memberIds.map((memberId) => {
    const userName = input.members.find((member) => member.id === memberId)?.name ?? "참여자";
    const ratio = attributedMinutes ? counts[memberId] / attributedMinutes : 0;
    return {
      label: `${userName} 반영`,
      value: `${counts[memberId].toFixed(1)}분 크레딧 · ${Math.round(ratio * 100)}%`,
      itemIds: itemIdsByMember[memberId],
      placeIds: placeIdsByMember[memberId],
      memberIds: [memberId],
    };
  });
  const maxCount = Math.max(...Object.values(counts));
  const minCount = Math.min(...Object.values(counts));
  const equalShare = attributedMinutes / memberIds.length;
  const squaredTotal = Object.values(counts).reduce((total, count) => total + count ** 2, 0);
  const jainFairness = squaredTotal ? (attributedMinutes ** 2) / (memberIds.length * squaredTotal) : 1;
  const issues: AnalysisIssue[] = [];

  for (const memberId of memberIds) {
    if (counts[memberId] + Number.EPSILON >= equalShare) continue;
    const userName = input.members.find((member) => member.id === memberId)?.name ?? "참여자";
    issues.push({
      id: `preference-member-${memberId}`,
      category: "preference",
      status: "attention",
      severity: counts[memberId] === 0 ? "medium" : "low",
      title: `${userName}님의 선호가 아직 적게 반영됐어요`,
      summary: `${userName}님의 선호 표시 노출시간은 ${counts[memberId].toFixed(1)}분 크레딧이고, 동일 몫 기준은 ${equalShare.toFixed(1)}분이에요. 공동 선호 일정은 시간을 균등 분할하며, 만족도 자체가 아닌 보조 지표예요.`,
      affectedItemIds: itemIdsByMember[memberId],
      affectedPlaceIds: placeIdsByMember[memberId],
      affectedMemberIds: [memberId],
      evidence: [evidence.find((entry) => entry.memberIds?.includes(memberId)) as AnalysisEvidence],
    });
  }

  if (maxCount - minCount > Number.EPSILON) {
    issues.push({
      id: "preference-count-gap",
      category: "preference",
      status: "attention",
      severity: "low",
      title: "참여자별 반영 일정 수 차이가 있어요",
      summary: `선호 표시 일정의 시간 크레딧으로 계산한 Jain 균등도는 ${(jainFairness * 100).toFixed(1)}%예요. 100%는 동일 노출시간이며, 최대·최소 차이는 ${(maxCount - minCount).toFixed(1)}분이에요. 실제 만족도와 동일한 값은 아니에요.`,
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
    : "후보를 담은 사람";
  return { category: "preference", status, summary: status === "good" ? `${sourceLabel} 기준으로 동행자 선호가 고르게 반영되어 있어요.` : `${sourceLabel} 기준으로 참여자별 반영 정도를 조금 더 맞춰 보세요.`, issues };
}
