import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, PrimaryButton } from "../../../../components/common";
import type { GroupPlanningDimension, GroupPreferenceDiagnosis } from "../../../../duri/group-preferences";
import { preferenceDimensionLabels } from "../../../../duri/preferences";
import { radius } from "../../../../theme/tokens";
import { GroupDimensionCard } from "./GroupDimensionCard";

const planningDimensions: GroupPlanningDimension[] = ["pace", "mobility", "activity", "mealStyle", "planningStyle"];

export function GroupPreferenceDiagnosisCard({ diagnosis, memberNamesById, canStartMyTest, onStartMyTest }: { diagnosis: GroupPreferenceDiagnosis; memberNamesById: Record<string, string>; canStartMyTest: boolean; onStartMyTest?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (diagnosis.coverage === "insufficient") return <Card style={styles.card}>
    <Text style={styles.eyebrow}>함께 보는 여행 성향</Text>
    <Text style={styles.title}>함께 비교하려면 최소 2명의 응답이 필요해요.</Text>
    <Text style={styles.description}>현재 {diagnosis.completedMemberCount}/{diagnosis.totalMemberCount}명이 완료했어요.</Text>
    {canStartMyTest && onStartMyTest ? <PrimaryButton accessibilityLabel="함께 비교할 여행 성향 테스트 시작" label="내 여행 성향 테스트 하기" onPress={onStartMyTest} /> : null}
  </Card>;

  const common = planningDimensions.find((dimension) => diagnosis.dimensions[dimension].status === "common");
  const compatible = planningDimensions.find((dimension) => diagnosis.dimensions[dimension].status === "compatible");
  const needsTuning = planningDimensions.find((dimension) => diagnosis.dimensions[dimension].status === "needs-tuning");
  const insight = common
    ? `${preferenceDimensionLabels[common]} 기준이 잘 맞아요.`
    : compatible
      ? `${preferenceDimensionLabels[compatible]} 선호가 가까워요.`
      : needsTuning
        ? `${preferenceDimensionLabels[needsTuning]}은 미리 이야기해보세요.`
        : "응답을 바탕으로 여행 기준을 정리했어요.";
  const coverageCopy = diagnosis.coverage === "partial" ? `현재 응답한 ${diagnosis.completedMemberCount}명 기준` : "전체 응답 반영";
  return <Card style={styles.card}>
    <View style={styles.heading}><View style={styles.flex}><Text style={styles.eyebrow}>현재 우리 여행은</Text><Text style={styles.insight}>“{insight}”</Text></View>{diagnosis.matchRate !== undefined ? <View style={styles.match}><Text style={styles.matchValue}>{diagnosis.matchRate}%</Text><Text style={styles.matchLabel}>성향 일치도</Text></View> : null}</View>
    <Text style={styles.description}>{coverageCopy}{diagnosis.sharedPreferredTags.length ? ` · 함께 좋아하는 #${diagnosis.sharedPreferredTags[0]}` : ""}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}><Text style={styles.disclosureText}>{expanded ? "성향 자세히 접기" : "성향 자세히 보기"}</Text><Text style={styles.disclosureText}>{expanded ? "⌃" : "→"}</Text></Pressable>
    {expanded ? <View style={styles.details}>
      <View style={styles.coverage}><Text style={styles.coverageTitle}>{diagnosis.coverage === "partial" ? "현재 응답 기준" : "전체 응답 반영"}</Text><Text style={styles.coverageText}>{diagnosis.coverage === "partial" ? `남은 응답에 따라 결과가 바뀔 수 있어요.` : `모든 멤버 ${diagnosis.completedMemberCount}명의 응답을 반영했어요.`}</Text></View>
      <DimensionGroup title="잘 맞는 부분" dimensions={planningDimensions.filter((dimension) => diagnosis.dimensions[dimension].status === "common")} diagnosis={diagnosis} memberNamesById={memberNamesById} empty="아직 완전히 같은 선택은 없어요." />
      <DimensionGroup title="조금 조율하면 좋은 부분" dimensions={planningDimensions.filter((dimension) => diagnosis.dimensions[dimension].status === "compatible")} diagnosis={diagnosis} memberNamesById={memberNamesById} empty="조금만 맞추면 되는 항목은 없어요." />
      <DimensionGroup title="미리 이야기할 부분" dimensions={planningDimensions.filter((dimension) => diagnosis.dimensions[dimension].status === "needs-tuning")} diagnosis={diagnosis} memberNamesById={memberNamesById} empty="큰 선호 차이는 발견되지 않았어요." />
      <View style={styles.tags}><Text style={styles.groupTitle}>함께 선호하는 키워드</Text>{diagnosis.sharedPreferredTags.length ? <View style={styles.tagList}>{diagnosis.preferredTags.filter((tag) => tag.count >= 2).map((tag) => <View key={tag.tag.toLowerCase()} style={styles.tag}><Text style={styles.tagText}>#{tag.tag} · {tag.count}명</Text></View>)}</View> : <Text style={styles.empty}>2명 이상이 함께 선택한 키워드는 아직 없어요.</Text>}</View>
    </View> : null}
  </Card>;
}

function DimensionGroup({ title, dimensions, diagnosis, memberNamesById, empty }: { title: string; dimensions: GroupPlanningDimension[]; diagnosis: GroupPreferenceDiagnosis; memberNamesById: Record<string, string>; empty: string }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text>{dimensions.length ? dimensions.map((dimension) => <GroupDimensionCard key={dimension} diagnosis={diagnosis.dimensions[dimension]} memberNamesById={memberNamesById} />) : <Text style={styles.empty}>{empty}</Text>}</View>;
}

const styles = StyleSheet.create({
  card: { gap: 12, marginTop: 10, borderColor: "#DCE7F7", backgroundColor: "#FFFFFF", padding: 16 },
  flex: { flex: 1 }, heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: { color: "#4388FF", fontSize: 10, lineHeight: 14, fontWeight: "900" },
  title: { color: "#17265F", fontSize: 15, lineHeight: 21, fontWeight: "800" },
  insight: { color: "#17265F", fontSize: 16, lineHeight: 23, fontWeight: "900", marginTop: 3 },
  description: { color: "#60719B", fontSize: 11, lineHeight: 17, fontWeight: "600" },
  match: { minWidth: 60, minHeight: 60, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#EAF7EE" }, matchValue: { color: "#2E9B66", fontSize: 18, lineHeight: 23, fontWeight: "900" }, matchLabel: { color: "#60719B", fontSize: 9, lineHeight: 12, fontWeight: "700" },
  disclosure: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#DCE7F7", paddingTop: 10 }, disclosureText: { color: "#4388FF", fontSize: 11, lineHeight: 16, fontWeight: "800" },
  details: { gap: 13 }, coverage: { borderRadius: 14, backgroundColor: "#DDEBFF", padding: 11, gap: 2 }, coverageTitle: { color: "#4388FF", fontSize: 12, lineHeight: 17, fontWeight: "800" }, coverageText: { color: "#60719B", fontSize: 10, lineHeight: 15, fontWeight: "600" },
  group: { gap: 8 }, groupTitle: { color: "#17265F", fontSize: 12, lineHeight: 17, fontWeight: "800" }, empty: { color: "#60719B", fontSize: 10, lineHeight: 15, fontWeight: "600" },
  tags: { gap: 8 }, tagList: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, tag: { borderRadius: radius.pill, backgroundColor: "#DDEBFF", paddingHorizontal: 10, paddingVertical: 6 }, tagText: { color: "#4388FF", fontSize: 10, lineHeight: 14, fontWeight: "700" }, pressed: { opacity: 0.8 },
});
