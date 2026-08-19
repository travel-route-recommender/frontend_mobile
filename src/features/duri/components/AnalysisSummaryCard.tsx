import { StyleSheet, Text, View } from "react-native";
import { Card } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisSession } from "../types";

const statusLabel = {
  good: "좋아요",
  attention: "조금 조정하면 좋아요",
  warning: "먼저 확인해보세요",
  "insufficient-data": "데이터가 더 필요해요",
} as const;

export function AnalysisSummaryCard({ session }: { session: DuriAnalysisSession }) {
  const hardCount = session.issues.filter((issue) => issue.constraintType === "hard").length;
  const softCount = session.issues.filter((issue) => issue.constraintType === "soft").length;
  const informationalCount = session.issues.filter((issue) => issue.constraintType === "informational").length;
  return <Card style={styles.card}>
    <View style={styles.top}><View style={styles.star}><Text style={styles.starText}>✦</Text></View><View style={styles.copy}><Text style={styles.badge}>{statusLabel[session.overallStatus]}</Text><Text style={styles.title}>{session.overallMessage}</Text></View></View>
    <View style={styles.metrics}><Metric value={session.result.analyzedItemCount} label="분석 일정" /><Metric value={hardCount} label="필수 확인" tone="danger" /><Metric value={softCount} label="조율 항목" tone="warning" /><Metric value={informationalCount} label="참고 정보" /></View>
    <Text style={styles.time}>분석 시점 {new Date(session.analyzedAt).toLocaleString("ko-KR")} · 알고리즘 {session.algorithmVersion}</Text>
  </Card>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone?: "danger" | "warning" }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, tone === "danger" && styles.danger, tone === "warning" && styles.warning]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  star: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  starText: { fontSize: 24, color: colors.primary },
  copy: { flex: 1, gap: spacing.xs },
  badge: { alignSelf: "flex-start", ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill },
  title: { ...typography.subtitle, color: colors.text },
  metrics: { flexDirection: "row", flexWrap: "wrap", borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingVertical: spacing.sm },
  metric: { flexBasis: "50%", alignItems: "center", gap: spacing.xxs, paddingVertical: spacing.xs },
  metricValue: { ...typography.subtitle, color: colors.primary },
  danger: { color: colors.danger },
  warning: { color: colors.warning },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  time: { ...typography.caption, color: colors.textMuted },
});
