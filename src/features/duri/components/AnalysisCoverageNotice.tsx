import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisCoverage } from "../types";

const coverageLabel = { insufficient: "근거 부족", partial: "일부 반영", complete: "전체 반영", unavailable: "사용 불가", available: "사용 가능" } as const;

export function AnalysisCoverageNotice({ coverage }: { coverage: DuriAnalysisCoverage }) {
  return <View accessibilityLabel={`분석 범위. 일정 ${coverageLabel[coverage.itinerary]}, 그룹 성향 ${coverageLabel[coverage.preferences]}, 실제 동선 ${coverageLabel[coverage.routeData]}, 운영정보 ${coverageLabel[coverage.operatingData]}, 관광 혼잡 ${coverageLabel[coverage.congestionData]}, 예약 문서 ${coverageLabel[coverage.documentData]}`} style={styles.wrap}>
    <Text accessibilityRole="header" style={styles.title}>판단에 사용한 근거</Text>
    <View style={styles.row}><Coverage label="일정" value={coverageLabel[coverage.itinerary]} /><Coverage label="그룹 성향" value={coverageLabel[coverage.preferences]} /><Coverage label="실제 동선" value={coverageLabel[coverage.routeData]} /><Coverage label="운영정보" value={coverageLabel[coverage.operatingData]} /><Coverage label="관광 혼잡" value={coverageLabel[coverage.congestionData]} /><Coverage label="예약·문서" value={coverageLabel[coverage.documentData]} /></View>
    <EvidenceMessage title="이동 경로" value={coverage.routeMessage} />
    <EvidenceMessage title="운영·휴무" value={coverage.operatingMessage} />
    <EvidenceMessage title="관광 혼잡" value={coverage.congestionMessage} />
    <EvidenceMessage title="예약·문서" value={coverage.documentMessage} />
    <View style={styles.limitations}><Text style={styles.subtitle}>현재 판단하지 않은 범위</Text>{coverage.limitations.map((limitation, index) => <Text key={`${index}-${limitation}`} style={styles.description}>· {limitation}</Text>)}</View>
  </View>;
}

function Coverage({ label, value }: { label: string; value: string }) {
  return <View style={styles.coverage}><Text style={styles.coverageLabel}>{label}</Text><Text style={styles.coverageValue}>{value}</Text></View>;
}

function EvidenceMessage({ title, value }: { title: string; value: string }) {
  return <View style={styles.message}><Text style={styles.subtitle}>{title}</Text><Text style={styles.description}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  title: { ...typography.bodyStrong, color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  coverage: { minWidth: 92, flexGrow: 1, flexBasis: "30%", gap: spacing.xxs, borderRadius: radius.sm, backgroundColor: colors.surface, padding: spacing.sm },
  coverageLabel: { ...typography.caption, color: colors.textMuted },
  coverageValue: { ...typography.caption, color: colors.primary },
  message: { gap: spacing.xxs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  limitations: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  subtitle: { ...typography.caption, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
});
