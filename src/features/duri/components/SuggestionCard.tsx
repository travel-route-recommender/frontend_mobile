import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriSuggestionEnvelope } from "../types";

export function SuggestionCard({ envelope, issueTitles, affectedDates, onPreview }: { envelope: DuriSuggestionEnvelope; issueTitles: string[]; affectedDates: string[]; onPreview: () => void }) {
  const suggestion = envelope.suggestion;
  return <View accessibilityLabel={`두리 제안, ${suggestion.title}, 변경 ${suggestion.changes.length}개`} style={styles.card}>
    <View style={styles.top}><Text style={styles.priority}>{suggestion.priority === "high" ? "우선 확인" : suggestion.priority === "medium" ? "조정 제안" : "선택 제안"}</Text><Text style={styles.count}>변경 {suggestion.changes.length}개</Text></View>
    <Text style={styles.title}>{suggestion.title}</Text>
    <Text style={styles.summary}>{suggestion.summary}</Text>
    {issueTitles.length ? <Text style={styles.meta}>해결 대상 · {issueTitles.join(" · ")}</Text> : null}
    {affectedDates.length ? <Text style={styles.meta}>영향 날짜 · {affectedDates.join(" · ")}</Text> : null}
    {!suggestion.canApply ? <Text accessibilityRole="alert" style={styles.unavailable}>{suggestion.unavailableReason ?? "현재 일정에는 바로 적용할 수 없어요."}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`${suggestion.title} 변경 전후 미리보기`} onPress={onPreview} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>변경 전·후 미리보기</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  priority: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  count: { ...typography.caption, color: colors.textMuted },
  title: { ...typography.subtitle, color: colors.text },
  summary: { ...typography.caption, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textMuted },
  unavailable: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: spacing.sm },
  button: { minHeight: 46, marginTop: spacing.xs, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft },
  buttonText: { ...typography.bodyStrong, color: colors.primary },
  pressed: { opacity: 0.8 },
});
