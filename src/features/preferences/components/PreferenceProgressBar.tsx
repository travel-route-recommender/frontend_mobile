import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function PreferenceProgressBar({
  current,
  total,
  accessibilityLabel = "여행 성향 테스트 진행률",
  detailLabel,
  label = "개인 여행 성향",
  valueLabel,
}: {
  current: number;
  total: number;
  accessibilityLabel?: string;
  detailLabel?: string;
  label?: string;
  valueLabel?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  const percentage = (safeCurrent / safeTotal) * 100;
  const detailed = Boolean(detailLabel);
  return <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: safeTotal, now: safeCurrent, text: valueLabel ?? `${safeCurrent} / ${safeTotal}` }} style={[styles.wrap, detailed && styles.detailedWrap]}>
    <View style={styles.labels}>
      <Text style={[styles.label, detailed && styles.chapter]}>{detailed ? valueLabel : label}</Text>
      <Text style={styles.value}>{detailed ? detailLabel : valueLabel ?? `${safeCurrent} / ${total}`}</Text>
    </View>
    {detailed ? <Text numberOfLines={2} style={styles.detail}>{label}</Text> : null}
    <View style={styles.track}><View style={[styles.fill, { width: `${percentage}%` }]} /></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  detailedWrap: { gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#F3F1FF", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  labels: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typography.caption, color: colors.textSecondary },
  chapter: { color: colors.primary },
  value: { ...typography.caption, color: colors.primary },
  detail: { fontSize: 17, lineHeight: 23, fontWeight: "800", color: "#17265F" },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
