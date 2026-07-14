import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisCoverage } from "../types";

const coverageLabel = { insufficient: "근거 부족", partial: "일부 반영", complete: "전체 반영", unavailable: "사용 불가", available: "사용 가능" } as const;

export function AnalysisCoverageNotice({ coverage }: { coverage: DuriAnalysisCoverage }) {
  return <View accessibilityLabel={`분석 범위. 일정 ${coverageLabel[coverage.itinerary]}, 그룹 성향 ${coverageLabel[coverage.preferences]}, 좌표 동선 ${coverageLabel[coverage.routeData]}`} style={styles.wrap}>
    <Text style={styles.title}>분석 범위</Text>
    <View style={styles.row}><Coverage label="일정" value={coverageLabel[coverage.itinerary]} /><Coverage label="그룹 성향" value={coverageLabel[coverage.preferences]} /><Coverage label="좌표 동선" value={coverageLabel[coverage.routeData]} /></View>
    <Text style={styles.description}>{coverage.routeMessage}</Text>
  </View>;
}

function Coverage({ label, value }: { label: string; value: string }) {
  return <View style={styles.coverage}><Text style={styles.coverageLabel}>{label}</Text><Text style={styles.coverageValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  title: { ...typography.bodyStrong, color: colors.text },
  row: { flexDirection: "row", gap: spacing.xs },
  coverage: { flex: 1, gap: spacing.xxs, borderRadius: radius.sm, backgroundColor: colors.surface, padding: spacing.sm },
  coverageLabel: { ...typography.caption, color: colors.textMuted },
  coverageValue: { ...typography.caption, color: colors.primary },
  description: { ...typography.caption, color: colors.textSecondary },
});
