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
const severityLabel = { info: "알아두면 좋아요", low: "참고해 주세요", medium: "조정하면 좋아요", high: "지금 확인해 주세요" } as const;
const constraintLabel = { hard: "꼭 지켜야 할 일정", soft: "더 나은 선택", informational: "참고할 내용" } as const;
const confidenceLabel = { high: "확인된 정보로 판단", medium: "여러 근거로 판단", low: "참고용 판단", unknown: "확인 정보 부족" } as const;
const sourceLabel = { "web-engine": "현재 일정에서 계산", "mobile-context": "여행방에 입력한 정보", "external-evidence": "연결된 외부 정보" } as const;

const impactByCategory: Record<DuriReportIssueCategory, string> = {
  route: "다음 장소 도착이 늦어지거나 이동이 불편해져 뒤 일정도 함께 밀릴 수 있어요.",
  density: "하루 활동이 이어지면 예상보다 빨리 지쳐 뒤 일정을 충분히 즐기기 어려울 수 있어요.",
  meal: "식사 시간을 놓치면 이동 중 급하게 식사하거나 뒤 일정을 줄여야 할 수 있어요.",
  preference: "특정 동행자의 꼭 하고 싶은 일이나 피하고 싶은 조건이 충분히 반영되지 않을 수 있어요.",
  "time-conflict": "두 일정을 모두 계획한 시간대로 진행하기 어려워 예약이나 다음 일정을 놓칠 수 있어요.",
  "day-balance": "어떤 날은 지나치게 바쁘고 다른 날은 비어 여행 흐름이 고르지 않을 수 있어요.",
  "candidate-usage": "함께 골랐던 후보가 일정에서 빠져 있는지 놓칠 수 있어요.",
  "end-condition": "마지막 이동을 시작할 시간이 부족해 기차·항공편·반납 시각을 놓칠 수 있어요.",
  "confirmed-schedule": "이미 확정한 예약이나 교통편과 일정표가 달라 실제 이용이 어려울 수 있어요.",
  "opening-hours": "도착했을 때 아직 열지 않았거나 이미 운영이 끝나 이용하지 못할 수 있어요.",
  "recommended-duration": "장소를 충분히 둘러보지 못하거나 예상보다 오래 머물러 다음 일정이 밀릴 수 있어요.",
  "route-optimization": "방문할 장소는 그대로 두고도 이동 부담을 줄일 여지가 있어요.",
  "document-check": "예약·입장권의 날짜나 장소와 일정표가 어긋난 사실을 뒤늦게 발견할 수 있어요.",
  "duplicate-visit": "같은 장소를 의도하지 않게 두 번 방문해 다른 일정을 놓칠 수 있어요.",
  "overnight-recovery": "전날 일정이 늦게 끝나고 다음 날 일찍 시작하면 충분히 쉬기 어려울 수 있어요.",
};

const actionByCategory: Record<DuriReportIssueCategory, string> = {
  route: "앞 장소의 체류시간과 다음 장소의 시작시간 사이에 실제 이동 여유가 있는지 확인해 주세요.",
  density: "예약·잠금 일정은 유지하고, 우선순위가 낮은 장소를 다른 날로 옮기거나 휴식 시간을 확보해 보세요.",
  meal: "이동과 예약을 피할 수 있는 시간에 식사 장소나 식사 시간을 먼저 넣어 주세요.",
  preference: "각자 꼭 가고 싶은 곳과 피하고 싶은 조건을 확인한 뒤 함께 양보할 수 있는 후보를 골라보세요.",
  "time-conflict": "겹친 일정 중 하나의 시작시간·체류시간을 바꾸거나 다른 날로 옮겨 주세요.",
  "day-balance": "예약·잠금 일정을 제외한 일정부터 여유가 있는 날짜로 옮겨보세요.",
  "candidate-usage": "미배치 후보가 정말 필요한지 동행자와 확인한 뒤 일정에 넣거나 후보에서 정리해 주세요.",
  "end-condition": "복귀 지점까지 갈 시간과 필요한 준비시간을 먼저 확보한 뒤 마지막 일정을 조정해 주세요.",
  "confirmed-schedule": "예약·티켓의 날짜와 시각을 기준으로 일정표를 맞추고, 변경이 필요하면 예약 변경 가능 여부부터 확인해 주세요.",
  "opening-hours": "공식 운영시간을 다시 확인하고 방문 시작시간이나 날짜를 바꿔 주세요.",
  "recommended-duration": "장소의 공식 안내와 일행의 관심도를 함께 보고 체류시간을 조정해 주세요.",
  "route-optimization": "예약·잠금 일정을 그대로 둔 제안만 미리보기에서 비교해 보세요.",
  "document-check": "연결된 문서를 열어 날짜·시각·장소를 확인하고 관련 일정과 연결해 주세요.",
  "duplicate-visit": "두 방문이 의도한 것인지 확인하고, 아니라면 하나를 삭제하거나 다른 장소로 바꿔 주세요.",
  "overnight-recovery": "다음 날 첫 일정을 늦추거나 전날 마지막 일정을 앞당겨 실제 휴식 시간을 확보해 주세요.",
};

function plainLanguage(value: string) {
  return value
    .replace(/Hard Constraint/gi, "꼭 지켜야 하는 조건")
    .replace(/Soft Constraint/gi, "더 나은 여행을 위한 기준")
    .replace(/snapshot/gi, "분석 시점의 일정")
    .replace(/Pareto/gi, "누구에게도 더 나쁘지 않은")
    .replace(/Nash/gi, "모두의 만족을 함께 높이는")
    .replace(/leximin/gi, "가장 불리한 사람부터 살피는");
}

function impactText(issue: DuriReportIssue) {
  return issue.severity === "info"
    ? "현재 확인된 범위에서 큰 문제를 찾았다는 뜻은 아니며, 여행을 결정할 때 함께 볼 참고 정보예요."
    : impactByCategory[issue.category];
}

function observedAtLabel(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("ko-KR") : value;
}

export function AnalysisIssueCard({
  issue,
  hasGeneratedSuggestion,
  affectedEntityLabels = [],
  onOpenTechnicalDetails,
}: {
  issue: DuriReportIssue;
  hasGeneratedSuggestion: boolean;
  affectedEntityLabels?: readonly string[];
  onOpenTechnicalDetails?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [entitiesExpanded, setEntitiesExpanded] = useState(false);
  const warning = issue.severity === "high" || issue.severity === "medium";
  const visibleEvidence = expanded ? issue.evidence : issue.evidence.slice(0, 1);
  return <View accessibilityLabel={`${categoryLabel[issue.category]}, ${severityLabel[issue.severity]}, ${issue.title}`} style={[styles.card, warning && styles.warningCard]}>
    <View style={styles.heading}><Text style={[styles.category, warning && styles.warningText]}>{categoryLabel[issue.category]}</Text><Text style={styles.severity}>{severityLabel[issue.severity]}</Text></View>
    <View style={styles.badges}><Text style={[styles.constraint, issue.constraintType === "hard" && styles.hardConstraint]}>{constraintLabel[issue.constraintType]}</Text><Text style={[
      styles.confidence,
      issue.confidence === "high" && styles.confidenceHigh,
      issue.confidence === "medium" && styles.confidenceMedium,
      issue.confidence === "low" && styles.confidenceLow,
      issue.confidence === "unknown" && styles.confidenceUnknown,
    ]}>{confidenceLabel[issue.confidence]}</Text></View>
    <Text style={styles.title}>{plainLanguage(issue.title)}</Text>
    <View style={styles.explanation}><Text style={styles.explanationLabel}>무엇을 확인했나요?</Text><Text style={styles.summary}>{plainLanguage(issue.summary)}</Text></View>
    {issue.date ? <Text style={styles.date}>관련 날짜 · {issue.date}</Text> : null}
    {visibleEvidence.length ? <View style={styles.evidenceList}><Text style={styles.explanationLabel}>두리가 이렇게 판단한 이유</Text>{visibleEvidence.map((entry, index) => <View key={`${entry.label}-${index}`} style={styles.evidenceRow}>
      <Text style={styles.evidence}>{entry.label} · {entry.value}</Text>
      {entry.source || entry.observedAt ? <Text style={styles.evidenceMeta}>{[entry.source ? `정보 제공 ${entry.source}` : "", entry.observedAt ? `확인한 때 ${observedAtLabel(entry.observedAt)}` : ""].filter(Boolean).join(" · ")}</Text> : null}
    </View>)}</View> : null}
    {issue.evidence.length > 1 ? <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.expand, pressed && styles.pressed]}><Text style={styles.expandText}>{expanded ? "판단 이유 접기" : `판단 이유 ${issue.evidence.length}개 모두 보기`}</Text></Pressable> : null}
    {affectedEntityLabels.length ? <View style={styles.affectedSection}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: entitiesExpanded }} onPress={() => setEntitiesExpanded((value) => !value)} style={({ pressed }) => [styles.expand, pressed && styles.pressed]}>
        <Text style={styles.expandText}>{entitiesExpanded ? "영향 대상 접기" : `영향 대상 ${affectedEntityLabels.length}개 보기`}</Text>
      </Pressable>
      {entitiesExpanded ? <View style={styles.affectedList}>{affectedEntityLabels.map((label) => <Text key={label} style={styles.affectedText}>· {label}</Text>)}</View> : null}
    </View> : null}
    <View style={styles.guidance}><Text style={styles.explanationLabel}>이 항목이 중요한 이유</Text><Text style={styles.guidanceText}>{impactText(issue)}</Text><Text style={styles.explanationLabel}>이렇게 해보세요</Text><Text style={styles.guidanceText}>{actionByCategory[issue.category]}</Text></View>
    <Text style={styles.provenance}>사용한 정보 · {sourceLabel[issue.source]}</Text>
    {hasGeneratedSuggestion ? <Text style={styles.support}>두리가 이 항목을 반영한 개선안을 준비했어요. 적용하기 전에 달라지는 내용을 확인할 수 있어요.</Text> : null}
    {onOpenTechnicalDetails ? <Pressable accessibilityRole="button" onPress={onOpenTechnicalDetails} style={({ pressed }) => [styles.technicalButton, pressed && styles.pressed]}><Text style={styles.technicalButtonText}>수식과 계산 과정 보기</Text></Pressable> : null}
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
  explanation: { gap: spacing.xxs },
  explanationLabel: { ...typography.caption, color: colors.text },
  summary: { ...typography.body, color: colors.textSecondary },
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
  guidance: { gap: spacing.xxs, borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: radius.sm, backgroundColor: colors.primarySoft, padding: spacing.sm },
  guidanceText: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  technicalButton: { minHeight: 40, alignItems: "center", justifyContent: "center", alignSelf: "stretch", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm },
  technicalButtonText: { ...typography.caption, color: colors.primary },
  pressed: { opacity: 0.7 },
});
