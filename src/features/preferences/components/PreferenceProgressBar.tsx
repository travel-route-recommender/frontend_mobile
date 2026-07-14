import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function PreferenceProgressBar({ current, total, accessibilityLabel = "여행 성향 테스트 진행률" }: { current: number; total: number; accessibilityLabel?: string }) {
  const safeTotal = Math.max(total, 1);
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  const percentage = (safeCurrent / safeTotal) * 100;
  return <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: safeTotal, now: safeCurrent, text: `${safeCurrent} / ${safeTotal}` }} style={styles.wrap}>
    <View style={styles.labels}><Text style={styles.label}>개인 여행 성향</Text><Text style={styles.value}>{safeCurrent} / {total}</Text></View>
    <View style={styles.track}><View style={[styles.fill, { width: `${percentage}%` }]} /></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.caption, color: colors.primary },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
