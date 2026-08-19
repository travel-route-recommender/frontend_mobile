import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  "end-condition": "여행 종료",
  "confirmed-schedule": "확정 일정",
  "opening-hours": "운영시간",
  "recommended-duration": "권장 체류",
  "route-optimization": "동선 개선",
  "document-check": "예약·문서",
  "duplicate-visit": "중복 방문",
  "overnight-recovery": "밤사이 회복",
};
const severityLabel = { info: "참고해보세요", low: "참고해보세요", medium: "조금 조정하면 좋아요", high: "먼저 확인해보세요" } as const;
const constraintLabel = { hard: "Hard · 반드시 확인", soft: "Soft · 함께 조율", informational: "참고 정보" } as const;
const confidenceLabel = { high: "신뢰도 높음", medium: "신뢰도 중간", low: "신뢰도 낮음", unknown: "신뢰도 미확인" } as const;
const sourceLabel = { "web-engine": "기존 휴리스틱", "mobile-context": "앱에 저장된 사실", "external-evidence": "외부 근거" } as const;

function observedAtLabel(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("ko-KR") : value;
}

export function AnalysisIssueCard({
  issue,
  hasGeneratedSuggestion,
  affectedEntityLabels = [],
}: {
  issue: DuriReportIssue;
  hasGeneratedSuggestion: boolean;
  affectedEntityLabels?: readonly string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [entitiesExpanded, setEntitiesExpanded] = useState(false);
  const warning = issue.severity === "high" || issue.severity === "medium";
  const visibleEvidence = expanded ? issue.evidence : issue.evidence.slice(0, 2);
  return <View accessibilityLabel={`${categoryLabel[issue.category]}, ${severityLabel[issue.severity]}, ${issue.title}`} style={[styles.card, warning && styles.warningCard]}>
    <View style={styles.heading}><Text style={[styles.category, warning && styles.warningText]}>{categoryLabel[issue.category]}</Text><Text style={styles.severity}>{severityLabel[issue.severity]}</Text></View>
    <View style={styles.badges}><Text style={[styles.constraint, issue.constraintType === "hard" && styles.hardConstraint]}>{constraintLabel[issue.constraintType]}</Text><Text style={[
      styles.confidence,
      issue.confidence === "high" && styles.confidenceHigh,
      issue.confidence === "medium" && styles.confidenceMedium,
      issue.confidence === "low" && styles.confidenceLow,
      issue.confidence === "unknown" && styles.confidenceUnknown,
    ]}>{confidenceLabel[issue.confidence]}</Text></View>
    <Text style={styles.title}>{issue.title}</Text>
    <Text style={styles.summary}>{issue.summary}</Text>
    {issue.date ? <Text style={styles.date}>관련 날짜 · {issue.date}</Text> : null}
    {visibleEvidence.length ? <View style={styles.evidenceList}>{visibleEvidence.map((entry, index) => <View key={`${entry.label}-${index}`} style={styles.evidenceRow}>
      <Text style={styles.evidence}>· {entry.label}: {entry.value}</Text>
      {entry.source || entry.observedAt ? <Text style={styles.evidenceMeta}>{[entry.source ? `출처 ${entry.source}` : "", entry.observedAt ? `확인 ${observedAtLabel(entry.observedAt)}` : ""].filter(Boolean).join(" · ")}</Text> : null}
    </View>)}</View> : null}
    {issue.evidence.length > 2 ? <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.expand, pressed && styles.pressed]}><Text style={styles.expandText}>{expanded ? "근거 접기" : `근거 ${issue.evidence.length}개 모두 보기`}</Text></Pressable> : null}
    {affectedEntityLabels.length ? <View style={styles.affectedSection}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: entitiesExpanded }} onPress={() => setEntitiesExpanded((value) => !value)} style={({ pressed }) => [styles.expand, pressed && styles.pressed]}>
        <Text style={styles.expandText}>{entitiesExpanded ? "영향 대상 접기" : `영향 대상 ${affectedEntityLabels.length}개 보기`}</Text>
      </Pressable>
      {entitiesExpanded ? <View style={styles.affectedList}>{affectedEntityLabels.map((label) => <Text key={label} style={styles.affectedText}>· {label}</Text>)}</View> : null}
    </View> : null}
    <Text style={styles.provenance}>판정 출처 · {sourceLabel[issue.source]}</Text>
    <Text style={styles.support}>{hasGeneratedSuggestion ? "이 이슈를 위한 미리보기 가능한 제안이 있어요." : issue.suggestionSupported ? "적용 가능한 변경이 있을 때만 제안을 만들어요." : "자동 변경보다 동행자와 확인할 항목이에요."}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  warningCard: { borderColor: "#F1C98E" },
  heading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  category: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  warningText: { color: colors.warning, backgroundColor: colors.warningSoft },
  severity: { ...typography.caption, color: colors.textSecondary },
  constraint: { ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  hardConstraint: { color: colors.danger, backgroundColor: colors.dangerSoft },
  confidence: { ...typography.caption, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  confidenceHigh: { color: colors.success, backgroundColor: colors.successSoft },
  confidenceMedium: { color: colors.warning, backgroundColor: colors.warningSoft },
  confidenceLow: { color: colors.textSecondary, backgroundColor: colors.surfaceMuted },
  confidenceUnknown: { color: colors.textMuted, backgroundColor: colors.surfaceMuted },
  title: { ...typography.bodyStrong, color: colors.text },
  summary: { ...typography.caption, color: colors.textSecondary },
  date: { ...typography.caption, color: colors.primary },
  evidenceList: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  evidenceRow: { gap: spacing.xxs },
  evidence: { ...typography.caption, color: colors.textSecondary },
  evidenceMeta: { ...typography.caption, color: colors.textMuted, paddingLeft: spacing.sm },
  expand: { minHeight: 36, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: spacing.xs },
  expandText: { ...typography.caption, color: colors.primary },
  affectedSection: { gap: spacing.xxs },
  affectedList: { gap: spacing.xxs, borderLeftWidth: 2, borderLeftColor: colors.borderStrong, paddingLeft: spacing.sm },
  affectedText: { ...typography.caption, color: colors.textSecondary },
  provenance: { ...typography.caption, color: colors.textMuted },
  support: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  pressed: { opacity: 0.7 },
});
