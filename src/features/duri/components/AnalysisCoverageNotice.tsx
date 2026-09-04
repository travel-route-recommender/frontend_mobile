import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { plainDuriUserText } from "../presentation/plainDuriUserText";
import type { DuriAnalysisCoverage } from "../types";

const coverageLabel = { insufficient: "확인 정보 부족", partial: "확인된 만큼 반영", complete: "모두 확인", unavailable: "확인하지 못함", available: "확인 완료" } as const;

export function AnalysisCoverageNotice({ coverage }: { coverage: DuriAnalysisCoverage }) {
  const [expanded, setExpanded] = useState(false);
  return <View accessibilityLabel={`분석 범위. 일정 ${coverageLabel[coverage.itinerary]}, 그룹 성향 ${coverageLabel[coverage.preferences]}, 실제 동선 ${coverageLabel[coverage.routeData]}, 운영정보 ${coverageLabel[coverage.operatingData]}, 관광 혼잡 ${coverageLabel[coverage.congestionData]}, 예약 문서 ${coverageLabel[coverage.documentData]}`} style={styles.wrap}>
    <Text accessibilityRole="header" style={styles.title}>두리가 확인한 정보</Text>
    <Text style={styles.intro}>확인하지 못한 정보는 임의의 값으로 채우지 않고 이번 판단에서 제외했어요.</Text>
    <View style={styles.row}><Coverage label="일정" value={coverageLabel[coverage.itinerary]} /><Coverage label="그룹 성향" value={coverageLabel[coverage.preferences]} /><Coverage label="실제 동선" value={coverageLabel[coverage.routeData]} /><Coverage label="운영정보" value={coverageLabel[coverage.operatingData]} /><Coverage label="관광 혼잡" value={coverageLabel[coverage.congestionData]} /><Coverage label="예약·문서" value={coverageLabel[coverage.documentData]} /></View>
    <View style={styles.summary}><Text style={styles.subtitle}>이번 분석에서 확인하지 못한 범위</Text><Text style={styles.description}>{coverage.limitations.length ? `${coverage.limitations.length}가지가 있어요. 이 항목은 문제가 없다는 뜻이 아니라 아직 판단하지 않았다는 뜻이에요.` : "현재 표시할 추가 한계가 없어요."}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.expand, pressed && styles.pressed]}><Text style={styles.expandText}>{expanded ? "정보 범위 접기" : "정보 범위 자세히 보기"}</Text></Pressable>
    {expanded ? <View style={styles.details}>
      <EvidenceMessage title="이동 경로" value={plainDuriUserText(coverage.routeMessage)} />
      <EvidenceMessage title="운영·휴무" value={plainDuriUserText(coverage.operatingMessage)} />
      <EvidenceMessage title="관광 혼잡" value={plainDuriUserText(coverage.congestionMessage)} />
      <EvidenceMessage title="예약·문서" value={plainDuriUserText(coverage.documentMessage)} />
      {coverage.limitations.length ? <View style={styles.limitations}><Text style={styles.subtitle}>현재 판단하지 않은 내용</Text>{coverage.limitations.map((limitation, index) => <Text key={`${index}-${limitation}`} style={styles.description}>· {plainDuriUserText(limitation)}</Text>)}</View> : null}
    </View> : null}
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
  intro: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  coverage: { minWidth: 92, flexGrow: 1, flexBasis: "30%", gap: spacing.xxs, borderRadius: radius.sm, backgroundColor: colors.surface, padding: spacing.sm },
  coverageLabel: { ...typography.caption, color: colors.textMuted },
  coverageValue: { ...typography.caption, color: colors.primary },
  message: { gap: spacing.xxs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  summary: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm },
  details: { gap: spacing.sm },
  limitations: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  subtitle: { ...typography.caption, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  expand: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  expandText: { ...typography.caption, color: colors.primary },
  pressed: { opacity: 0.72 },
});
