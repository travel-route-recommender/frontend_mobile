import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriReportIssue, DuriReportIssueCategory } from "../types";

const categoryLabel: Record<DuriReportIssueCategory, string> = {
  route: "동선",
  density: "일정 밀도",
  meal: "식사",
  preference: "동행자 선호",
  "time-conflict": "시간 충돌",
  "day-balance": "날짜 균형",
  "candidate-usage": "후보 활용",
};
const severityLabel = { info: "참고해보세요", low: "참고해보세요", medium: "조금 조정하면 좋아요", high: "먼저 확인해보세요" } as const;

export function AnalysisIssueCard({ issue, hasGeneratedSuggestion }: { issue: DuriReportIssue; hasGeneratedSuggestion: boolean }) {
  const warning = issue.severity === "high" || issue.severity === "medium";
  return <View accessibilityLabel={`${categoryLabel[issue.category]}, ${severityLabel[issue.severity]}, ${issue.title}`} style={[styles.card, warning && styles.warningCard]}>
    <View style={styles.heading}><Text style={[styles.category, warning && styles.warningText]}>{categoryLabel[issue.category]}</Text><Text style={styles.severity}>{severityLabel[issue.severity]}</Text></View>
    <Text style={styles.title}>{issue.title}</Text>
    <Text style={styles.summary}>{issue.summary}</Text>
    {issue.date ? <Text style={styles.date}>관련 날짜 · {issue.date}</Text> : null}
    {issue.evidence.slice(0, 4).map((entry, index) => <Text key={`${entry.label}-${index}`} style={styles.evidence}>· {entry.label}: {entry.value}</Text>)}
    <Text style={styles.support}>{hasGeneratedSuggestion ? "이 이슈를 위한 미리보기 가능한 제안이 있어요." : issue.suggestionSupported ? "적용 가능한 변경이 있을 때만 제안을 만들어요." : "자동 변경보다 동행자와 확인할 항목이에요."}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  warningCard: { borderColor: "#F1C98E" },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  category: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  warningText: { color: colors.warning, backgroundColor: colors.warningSoft },
  severity: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.bodyStrong, color: colors.text },
  summary: { ...typography.caption, color: colors.textSecondary },
  date: { ...typography.caption, color: colors.primary },
  evidence: { ...typography.caption, color: colors.textMuted },
  support: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
});
