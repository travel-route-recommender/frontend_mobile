import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriGroupInsight } from "../types";

export function GroupPreferenceInsightCard({ insight }: { insight: DuriGroupInsight }) {
  return <View style={styles.card}><Text style={styles.kind}>{insight.kind === "coordination" ? "함께 조율" : insight.kind === "common" ? "공통 성향" : insight.kind === "difference" ? "성향 차이" : "응답 범위"}</Text><Text style={styles.title}>{insight.title}</Text><Text style={styles.description}>{insight.description}</Text></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kind: { ...typography.caption, color: colors.primary },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
});
