import { StyleSheet, Text, View } from "react-native";
import { Card, PrimaryButton } from "../../../../components/common";
import type { GroupPlanningDimension, GroupPreferenceDiagnosis } from "../../../../duri/group-preferences";
import { colors, radius, spacing, typography } from "../../../../theme/tokens";
import { GroupDimensionCard } from "./GroupDimensionCard";

const planningDimensions: GroupPlanningDimension[] = ["pace", "mobility", "activity", "mealStyle", "planningStyle"];

export function GroupPreferenceDiagnosisCard({ diagnosis, memberNamesById, canStartMyTest, onStartMyTest }: { diagnosis: GroupPreferenceDiagnosis; memberNamesById: Record<string, string>; canStartMyTest: boolean; onStartMyTest?: () => void }) {
  if (diagnosis.coverage === "insufficient") return <Card style={styles.card}>
    <Text style={styles.title}>그룹 진단을 위해 최소 2명의 응답이 필요해요.</Text>
    <Text style={styles.description}>현재 {diagnosis.completedMemberCount}/{diagnosis.totalMemberCount}명이 완료했어요. 개인 결과는 유지되지만 아직 그룹 차이를 확정하지 않아요.</Text>
    {canStartMyTest && onStartMyTest ? <PrimaryButton accessibilityLabel="그룹 진단에 참여할 여행 성향 테스트 시작" label="내 여행 성향 테스트 하기" onPress={onStartMyTest} /> : null}
  </Card>;

  const coverageCopy = diagnosis.coverage === "partial"
    ? `현재 응답한 ${diagnosis.completedMemberCount}명 기준 분석이에요. 남은 응답에 따라 결과가 바뀔 수 있어요.`
    : `모든 멤버 ${diagnosis.completedMemberCount}명의 응답을 반영했어요.`;
  return <Card style={styles.card}>
    <View style={styles.coverage}><Text style={styles.coverageTitle}>{diagnosis.coverage === "partial" ? "현재 응답 기준" : "전체 응답 반영"}</Text><Text style={styles.coverageText}>{coverageCopy}</Text></View>
    {diagnosis.matchRate !== undefined ? <View accessibilityRole="summary" accessibilityLabel={`현재 응답 기준 조율 지표 ${diagnosis.matchRate}퍼센트. 여행 성공 가능성이 아니라 선호 차이의 크기를 보여주는 참고 지표`} style={styles.matchBox}><View style={styles.matchHeading}><Text style={styles.matchLabel}>현재 응답 기준 조율 지표</Text><Text style={styles.matchValue}>{diagnosis.matchRate}%</Text></View><View style={styles.matchTrack}><View style={[styles.matchFill, { width: `${diagnosis.matchRate}%` }]} /></View><Text style={styles.matchHelp}>여행 성공 가능성이 아니라 현재 응답에서 드러난 선호 차이의 크기를 보여주는 참고 지표예요.</Text></View> : null}
    <DimensionGroup title="잘 맞는 부분" dimensions={planningDimensions.filter((dimension) => diagnosis.dimensions[dimension].status === "common")} diagnosis={diagnosis} memberNamesById={memberNamesById} empty="아직 완전히 같은 선택은 없어요." />
    <DimensionGroup title="조금 조율하면 좋은 부분" dimensions={planningDimensions.filter((dimension) => diagnosis.dimensions[dimension].status === "compatible")} diagnosis={diagnosis} memberNamesById={memberNamesById} empty="가까운 차이로 분류된 항목은 없어요." />
    <DimensionGroup title="미리 이야기할 부분" dimensions={planningDimensions.filter((dimension) => diagnosis.dimensions[dimension].status === "needs-tuning")} diagnosis={diagnosis} memberNamesById={memberNamesById} empty="큰 선호 차이는 발견되지 않았어요." />
    <View style={styles.tags}><Text style={styles.groupTitle}>함께 선호하는 키워드</Text>{diagnosis.sharedPreferredTags.length ? <View style={styles.tagList}>{diagnosis.preferredTags.filter((tag) => tag.count >= 2).map((tag) => <View key={tag.tag.toLowerCase()} style={styles.tag}><Text style={styles.tagText}>#{tag.tag} · {tag.count}명</Text></View>)}</View> : <Text style={styles.empty}>2명 이상이 함께 선택한 키워드는 아직 없어요.</Text>}<Text style={styles.tagHelp}>완료한 응답자 {diagnosis.completedMemberCount}명 기준이에요.</Text></View>
  </Card>;
}

function DimensionGroup({ title, dimensions, diagnosis, memberNamesById, empty }: { title: string; dimensions: GroupPlanningDimension[]; diagnosis: GroupPreferenceDiagnosis; memberNamesById: Record<string, string>; empty: string }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text>{dimensions.length ? dimensions.map((dimension) => <GroupDimensionCard key={dimension} diagnosis={diagnosis.dimensions[dimension]} memberNamesById={memberNamesById} />) : <Text style={styles.empty}>{empty}</Text>}</View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.xl },
  title: { ...typography.subtitle, color: colors.text },
  description: { ...typography.body, color: colors.textSecondary },
  coverage: { borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm, gap: 2 },
  coverageTitle: { ...typography.bodyStrong, color: colors.primary },
  coverageText: { ...typography.caption, color: colors.textSecondary },
  matchBox: { gap: spacing.xs },
  matchHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  matchLabel: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  matchValue: { ...typography.title, color: colors.primary },
  matchTrack: { height: 8, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.border },
  matchFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  matchHelp: { ...typography.caption, color: colors.textSecondary },
  group: { gap: spacing.xs },
  groupTitle: { ...typography.bodyStrong, color: colors.text },
  empty: { ...typography.caption, color: colors.textSecondary },
  tags: { gap: spacing.xs },
  tagList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tag: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  tagText: { ...typography.caption, color: colors.primary },
  tagHelp: { ...typography.caption, color: colors.textMuted },
});
