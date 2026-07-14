import { StyleSheet, Text, View } from "react-native";
import { personalTestQuestions, preferenceDimensionLabels } from "../../../../duri/preferences";
import type { GroupPreferenceDimensionDiagnosis } from "../../../../duri/group-preferences";
import { colors, radius, spacing, typography } from "../../../../theme/tokens";

const statusMeta = {
  common: { label: "잘 맞아요", description: "응답자들이 같은 기준을 선택했어요.", color: colors.success, background: colors.successSoft },
  compatible: { label: "조금만 맞추면 좋아요", description: "선호가 가까워서 일정에서 조정하기 쉬워요.", color: colors.warning, background: colors.warningSoft },
  "needs-tuning": { label: "미리 이야기해보세요", description: "선호 차이가 커서 일정 전에 기준을 정하면 좋아요.", color: colors.danger, background: colors.dangerSoft },
} as const;

function getChoiceLabel(diagnosis: GroupPreferenceDimensionDiagnosis, score: number) {
  const question = personalTestQuestions.find((item) => item.dimension === diagnosis.dimension);
  return question?.choices.find((choice) => choice.value === score)?.label ?? "선택 확인 필요";
}

export function GroupDimensionCard({ diagnosis, memberNamesById }: { diagnosis: GroupPreferenceDimensionDiagnosis; memberNamesById: Record<string, string> }) {
  if (!diagnosis.status) return null;
  const meta = statusMeta[diagnosis.status];
  return <View accessibilityLabel={`${preferenceDimensionLabels[diagnosis.dimension]}, ${meta.label}. ${meta.description}`} style={styles.card}>
    <View style={styles.heading}><Text style={styles.dimension}>{preferenceDimensionLabels[diagnosis.dimension]}</Text><View style={[styles.badge, { backgroundColor: meta.background }]}><Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text></View></View>
    <Text style={styles.description}>{meta.description}</Text>
    <View style={styles.responses}>{diagnosis.responses.map((response) => <View key={response.userId} style={styles.response}><Text numberOfLines={1} style={styles.memberName}>{memberNamesById[response.userId] ?? "알 수 없는 참여자"}</Text><Text style={styles.choice}>{getChoiceLabel(diagnosis, response.score)}</Text></View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.sm, gap: spacing.xs },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  dimension: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 4 },
  badgeText: { ...typography.caption, fontSize: 10 },
  description: { ...typography.caption, color: colors.textSecondary },
  responses: { gap: spacing.xxs },
  response: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  memberName: { ...typography.caption, color: colors.textSecondary, maxWidth: "34%" },
  choice: { ...typography.caption, color: colors.text, flex: 1, textAlign: "right" },
});
