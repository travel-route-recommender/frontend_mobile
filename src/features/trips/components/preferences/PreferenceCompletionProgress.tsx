import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../../theme/tokens";

export function PreferenceCompletionProgress({ completed, total, rate }: { completed: number; total: number; rate: number }) {
  const percentage = Math.round(Math.max(0, Math.min(1, rate)) * 100);
  return <View style={styles.wrap}>
    <View style={styles.heading}><Text style={styles.count}>{completed} / {total}명 완료</Text><Text style={styles.percentage}>{percentage}%</Text></View>
    <View accessibilityRole="progressbar" accessibilityLabel={`여행 성향 응답 ${total}명 중 ${completed}명 완료, ${percentage}퍼센트`} accessibilityValue={{ min: 0, max: 100, now: percentage }} style={styles.track}><View style={[styles.fill, { width: `${percentage}%` }]} /></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  count: { ...typography.bodyStrong, color: colors.text },
  percentage: { ...typography.bodyStrong, color: colors.primary },
  track: { height: 10, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.border },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
});
