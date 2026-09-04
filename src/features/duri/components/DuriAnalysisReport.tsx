import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, sizes, spacing, typography } from "../../../theme/tokens";
import { buildDuriAnalysisPresentation, issuePreviewText } from "../presentation/duriPresentation";
import { plainDuriUserText } from "../presentation/plainDuriUserText";
import type { DuriAnalysisSession, DuriSuggestionEnvelope } from "../types";
import { AnalysisCoverageNotice } from "./AnalysisCoverageNotice";
import { AnalysisIssueCard } from "./AnalysisIssueCard";
import { DuriIssueFilterBar, type DuriIssueFilter } from "./DuriIssueFilterBar";
import { DuriKoreanText } from "./DuriKoreanText";
import { DuriPlanningIllustration } from "./DuriPlanningIllustration";
import { GroupPreferenceInsightCard } from "./GroupPreferenceInsightCard";
import { SuggestionCard } from "./SuggestionCard";

type DetailSection = "checks" | "evidence" | "days" | "preferences" | "suggestions";
type RunStatus = "idle" | "loading" | "error";

export function DuriAnalysisReport({
  session,
  suggestions,
  analysisStatus,
  analysisError,
  suggestionStatus,
  suggestionError,
  canAnalyze,
  affectedEntityLabelsByIssueId,
  preferenceAutoFillContent,
  onReanalyze,
  onGenerateSuggestions,
  onPreviewSuggestion,
  onOpenTechnicalDetails,
}: {
  session: DuriAnalysisSession;
  suggestions: DuriSuggestionEnvelope[] | undefined;
  analysisStatus: RunStatus;
  analysisError?: string;
  suggestionStatus: RunStatus;
  suggestionError?: string;
  canAnalyze: boolean;
  affectedEntityLabelsByIssueId: Record<string, string[]>;
  preferenceAutoFillContent?: ReactNode;
  onReanalyze: () => void | Promise<void>;
  onGenerateSuggestions: () => void | Promise<void>;
  onPreviewSuggestion: (envelope: DuriSuggestionEnvelope) => void;
  onOpenTechnicalDetails?: (issueId?: string) => void;
}) {
  const { width } = useWindowDimensions();
  const compactHero = width <= 360;
  const presentation = useMemo(() => buildDuriAnalysisPresentation(session), [session]);
  const [issueFilter, setIssueFilter] = useState<DuriIssueFilter>("all");
  const [openSections, setOpenSections] = useState<Set<DetailSection>>(() => new Set());
  const filteredIssues = session.issues.filter((issue) => issueFilter === "all" || issue.constraintType === issueFilter);
  const preferenceIssues = session.issues.filter((issue) => issue.category === "preference");
  const suggestionIssueIds = new Set((suggestions ?? []).flatMap((entry) => entry.suggestion.sourceIssueIds));

  const toggleSection = (section: DetailSection) => setOpenSections((current) => {
    const next = new Set(current);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    return next;
  });
  const generateAndOpenSuggestions = () => {
    setOpenSections((current) => new Set(current).add("suggestions"));
    return onGenerateSuggestions();
  };

  return <View style={styles.report}>
    {analysisStatus === "loading" ? <View accessibilityRole="alert" style={styles.loadingBanner}>
      <ActivityIndicator color={colors.primary} />
      <View style={styles.flex}><Text style={styles.loadingTitle}>현재 일정으로 다시 점검하고 있어요</Text><Text style={styles.loadingText}>완료되면 아래 결과를 안전하게 갱신할게요.</Text></View>
    </View> : null}
    {analysisStatus === "error" && analysisError ? <View accessibilityRole="alert" style={styles.retryBanner}>
      <View style={styles.flex}><Text style={styles.retryTitle}>다시 점검하지 못했어요</Text><Text style={styles.retryText}>이전 점검 결과를 그대로 보여드리고 있어요. {plainDuriUserText(analysisError)}</Text></View>
      <Pressable accessibilityRole="button" disabled={!canAnalyze} onPress={onReanalyze} style={({ pressed }) => [styles.retryAction, pressed && styles.pressed]}><Text style={styles.retryActionText}>다시 시도</Text></Pressable>
    </View> : null}

    <View accessibilityLabel={`DURI 일정 점검 결과. ${presentation.headline}. ${plainDuriUserText(session.overallMessage)}`} style={styles.summary}>
      <View style={styles.summaryCopy}>
        <Text style={styles.eyebrow}>일정 점검 요약</Text>
        <DuriKoreanText style={styles.summaryHeadline}>{presentation.headline}</DuriKoreanText>
        {presentation.leadingIssue ? <DuriKoreanText style={styles.leadingIssue}>{plainDuriUserText(presentation.leadingIssue.title)}</DuriKoreanText> : null}
        <DuriKoreanText numberOfLines={3} style={styles.summaryText}>{plainDuriUserText(presentation.summary)}</DuriKoreanText>
      </View>
      <DuriPlanningIllustration compact={compactHero} />
    </View>

    <View accessibilityLabel="점검 요약 통계" style={styles.stats}>
      {presentation.stats.map((stat) => <View key={stat.id} style={[styles.stat, toneSoftStyle(stat.tone)]}>
        <Text style={[styles.statValue, toneTextStyle(stat.tone)]}>{stat.value}</Text>
        <Text numberOfLines={1} style={styles.statLabel}>{stat.label}</Text>
      </View>)}
    </View>

    <View style={styles.suggestionCta}>
      <View style={styles.suggestionCopy}><Text style={styles.suggestionEyebrow}>DURI 제안</Text><DuriKoreanText style={styles.suggestionTitle}>{suggestions ? suggestions.length ? `개선 제안 ${suggestions.length}개를 준비했어요` : "지금 바로 적용할 새 제안이 없어요" : "일정의 균형을 한 단계 더 다듬어볼까요?"}</DuriKoreanText><DuriKoreanText style={styles.suggestionText}>{suggestions ? suggestions.length ? "변경되는 내용과 이유를 확인하고, 적용 가능한 제안만 일정에 반영할 수 있어요." : "근거와 빈 시간을 확인할 수 있는 변경만 제안해요." : "잠금·확정 예약을 지키면서 미리 볼 수 있는 변경만 만들어요."}</DuriKoreanText></View>
      {suggestionError ? <Text accessibilityRole="alert" style={styles.inlineError}>{plainDuriUserText(suggestionError)}</Text> : null}
      {suggestions ? suggestions.length ? <PrimaryButton label={`개선 제안 ${suggestions.length}개 ${openSections.has("suggestions") ? "접기" : "보기"}`} onPress={() => toggleSection("suggestions")} /> : null : <PrimaryButton label="DURI 개선 제안 만들기" loading={suggestionStatus === "loading"} onPress={generateAndOpenSuggestions} />}
    </View>

    {openSections.has("suggestions") && suggestions?.length ? <View style={styles.detailBody}>
      {suggestions.map((envelope) => {
        const affectedDates = [...new Set(envelope.suggestion.changes.flatMap((change) => [change.before?.date, change.after?.date].filter((date): date is string => Boolean(date))))].sort();
        const issueTitles = envelope.suggestion.sourceIssueIds.flatMap((issueId) => session.issues.find((issue) => issue.id === issueId)?.title ?? []);
        return <SuggestionCard key={envelope.suggestion.id} envelope={envelope} issueTitles={issueTitles} affectedDates={affectedDates} onPreview={() => onPreviewSuggestion(envelope)} />;
      })}
    </View> : null}

    {preferenceAutoFillContent ? <View style={styles.autoFillSection}>{preferenceAutoFillContent}</View> : null}

    <View style={styles.section}>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>잘 맞는 점</Text><Text style={styles.sectionCount}>{presentation.strengths.length}개</Text></View>
      <View style={styles.groupCard}>
        {presentation.strengths.length ? presentation.strengths.slice(0, 3).map((strength, index) => <View key={strength.id} style={[styles.compactRow, index > 0 && styles.divider]}>
          <View style={[styles.rowIcon, styles.mintSoft]}><Text style={styles.mintText}>✓</Text></View>
          <View style={styles.flex}><DuriKoreanText style={styles.rowTitle}>{strength.title}</DuriKoreanText><DuriKoreanText numberOfLines={2} style={styles.rowDetail}>{strength.detail}</DuriKoreanText></View>
        </View>) : <View style={styles.emptyCompact}><DuriKoreanText style={styles.rowTitle}>확인된 강점이 아직 충분하지 않아요</DuriKoreanText><DuriKoreanText style={styles.rowDetail}>확인할 정보가 더 모이면 구체적으로 정리해드릴게요.</DuriKoreanText></View>}
      </View>
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>조정하면 좋은 점</Text><Text style={styles.sectionCount}>{presentation.actionableIssues.length}개</Text></View>
      {presentation.actionableIssues.length ? <View style={styles.groupCard}>
        {presentation.actionableIssues.slice(0, 3).map((issue, index) => <View key={issue.id} style={[styles.compactRow, index > 0 && styles.divider]}>
          <View style={[styles.rowIcon, styles.peachSoft]}><Text style={styles.peachText}>!</Text></View>
          <View style={styles.flex}><DuriKoreanText style={styles.rowTitle}>{plainDuriUserText(issue.title)}</DuriKoreanText><DuriKoreanText numberOfLines={1} style={styles.rowDetail}>{plainDuriUserText(issuePreviewText(issue))}</DuriKoreanText></View>
        </View>)}
        {presentation.actionableIssues.length > 3 ? <Text style={styles.moreHint}>나머지 {presentation.actionableIssues.length - 3}개 결과는 아래 ‘전체 점검 항목’에서 자세히 볼 수 있어요.</Text> : null}
      </View> : <View style={styles.emptyCompact}><DuriKoreanText style={styles.rowTitle}>현재 근거에서 조정할 점이 없어요</DuriKoreanText></View>}
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionTitle}>핵심 지표</Text>
      <View style={styles.metrics}>{presentation.metrics.map((metric) => <View key={metric.id} style={styles.metric}>
        <View style={[styles.metricIcon, toneSoftStyle(metric.tone)]}><Text style={toneTextStyle(metric.tone)}>●</Text></View>
        <Text style={styles.metricLabel}>{metric.label}</Text><Text style={[styles.metricValue, toneTextStyle(metric.tone)]}>{metric.value}</Text><Text style={styles.metricDetail}>{metric.detail}</Text>
      </View>)}</View>
    </View>

    <View style={styles.detailList}>
      <DisclosureRow label="전체 점검 항목" meta={`${session.issues.length}개`} open={openSections.has("checks")} onPress={() => toggleSection("checks")} />
      {openSections.has("checks") ? <View style={styles.detailBody}>
        <DuriIssueFilterBar issues={session.issues} value={issueFilter} onChange={setIssueFilter} />
        {filteredIssues.map((issue) => <AnalysisIssueCard key={issue.id} issue={issue} affectedEntityLabels={affectedEntityLabelsByIssueId[issue.id]} hasGeneratedSuggestion={suggestionIssueIds.has(issue.id)} onOpenTechnicalDetails={onOpenTechnicalDetails ? () => onOpenTechnicalDetails(issue.id) : undefined} />)}
      </View> : null}
      <DisclosureRow label="근거와 분석 한계" meta={session.coverage.routeData === "available" ? "경로 반영" : "일부 근거"} open={openSections.has("evidence")} onPress={() => toggleSection("evidence")} />
      {openSections.has("evidence") ? <View style={styles.detailBody}><AnalysisCoverageNotice coverage={session.coverage} /><Text style={styles.provenance}>마지막 점검 {new Date(session.analyzedAt).toLocaleString("ko-KR")}</Text></View> : null}
      <DisclosureRow label="날짜별 상세" meta={`${session.dayMetrics.length}일`} open={openSections.has("days")} onPress={() => toggleSection("days")} />
      {openSections.has("days") ? <View style={styles.detailBody}>{session.dayMetrics.map((metric) => <View key={metric.date} style={styles.dayRow}><View style={styles.sectionHeading}><Text style={styles.rowTitle}>{metric.date}</Text><Text style={styles.dayCount}>일정 {metric.itemCount}개</Text></View><Text style={styles.rowDetail}>체류 {metric.scheduledMinutes}분 · 충돌 {metric.conflictCount}건</Text><Text style={styles.rowDetail}>이동 제외 여유 {metric.routeAdjustedIdleMinutes}분 · 실제 경로 {metric.analyzedRouteLegCount}/{metric.requiredRouteLegCount}구간 확인</Text></View>)}</View> : null}
      <DisclosureRow label="성향 상세" meta={`${session.groupInsights.length}개 요약`} open={openSections.has("preferences")} onPress={() => toggleSection("preferences")} />
      {openSections.has("preferences") ? <View style={styles.detailBody}><Text style={styles.detailIntro}>직접 응답과 일정 반영 상태만 사용하며, 다수결로 소수 의견을 지우지 않아요.</Text>{session.groupInsights.map((insight) => <GroupPreferenceInsightCard key={insight.id} insight={insight} />)}{preferenceIssues.length ? <View style={styles.detailBody}><Text style={styles.rowTitle}>성향 관련 점검</Text>{preferenceIssues.map((issue) => <AnalysisIssueCard key={issue.id} issue={issue} affectedEntityLabels={affectedEntityLabelsByIssueId[issue.id]} hasGeneratedSuggestion={suggestionIssueIds.has(issue.id)} onOpenTechnicalDetails={onOpenTechnicalDetails ? () => onOpenTechnicalDetails(issue.id) : undefined} />)}</View> : null}</View> : null}
    </View>

    <View style={styles.finalActions}>
      {onOpenTechnicalDetails ? <SecondaryButton label="자세한 판단 기준 보기" onPress={() => onOpenTechnicalDetails()} /> : null}
      <SecondaryButton label="현재 일정 다시 점검" disabled={!canAnalyze || analysisStatus === "loading"} loading={analysisStatus === "loading"} onPress={onReanalyze} />
    </View>
  </View>;
}

function DisclosureRow({ label, meta, open, onPress }: { label: string; meta: string; open: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}>
    <View style={styles.flex}><Text style={styles.disclosureLabel}>{label}</Text><Text style={styles.disclosureMeta}>{meta}</Text></View><Text style={styles.chevron}>{open ? "⌃" : "›"}</Text>
  </Pressable>;
}

function toneSoftStyle(tone: "blue" | "lavender" | "mint" | "peach") {
  if (tone === "lavender") return styles.lavenderSoft;
  if (tone === "mint") return styles.mintSoft;
  if (tone === "peach") return styles.peachSoft;
  return styles.blueSoft;
}

function toneTextStyle(tone: "blue" | "lavender" | "mint" | "peach") {
  if (tone === "lavender") return styles.lavenderText;
  if (tone === "mint") return styles.mintText;
  if (tone === "peach") return styles.peachText;
  return styles.blueText;
}

const styles = StyleSheet.create({
  report: { gap: spacing.lg },
  flex: { flex: 1 },
  summary: { minHeight: 184, flexDirection: "row", alignItems: "flex-end", overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#D9D5FF", backgroundColor: "#F3F1FF", paddingTop: spacing.lg, paddingLeft: spacing.lg, paddingRight: spacing.sm, ...shadows.card },
  summaryCopy: { flex: 1, alignSelf: "stretch", gap: spacing.xs, paddingBottom: spacing.lg, zIndex: 1 },
  eyebrow: { ...typography.caption, color: "#735BC4", fontWeight: "800" },
  summaryHeadline: { fontSize: 19, lineHeight: 25, fontWeight: "900", color: "#17265F" },
  leadingIssue: { fontSize: 16, lineHeight: 22, fontWeight: "900", color: "#6F55D8" },
  summaryText: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: "#60719B" },
  stats: { flexDirection: "row", gap: 6 },
  stat: { flex: 1, minWidth: 0, minHeight: 82, alignItems: "center", justifyContent: "center", gap: spacing.xxs, borderRadius: radius.md, paddingHorizontal: 4, borderWidth: 1, borderColor: "rgba(220, 231, 247, 0.75)" },
  statValue: { fontSize: 20, lineHeight: 25, fontWeight: "900" },
  statLabel: { fontSize: 10, lineHeight: 14, fontWeight: "800", color: "#60719B", textAlign: "center" },
  section: { gap: spacing.sm },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "900", color: "#17265F" },
  sectionCount: { ...typography.caption, color: colors.textMuted },
  groupCard: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface },
  compactRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE7F7" },
  rowIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: "#17265F" },
  rowDetail: { fontSize: 11, lineHeight: 17, fontWeight: "600", color: "#60719B" },
  moreHint: { ...typography.caption, color: colors.textMuted, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  emptyCompact: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  suggestionCta: { gap: spacing.sm, overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#D9D5FF", backgroundColor: "#F3F1FF", padding: spacing.lg },
  suggestionCopy: { gap: spacing.xs },
  suggestionEyebrow: { ...typography.caption, color: "#735BC4", fontWeight: "900" },
  suggestionTitle: { ...typography.subtitle, color: "#17265F", fontWeight: "900" },
  suggestionText: { ...typography.caption, color: "#60719B" },
  autoFillSection: { gap: spacing.sm },
  inlineError: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.sm },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { flexBasis: "47%", flexGrow: 1, minWidth: 140, minHeight: 98, gap: 2, borderRadius: radius.md, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface, padding: spacing.sm },
  metricIcon: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  metricLabel: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: "#60719B" },
  metricValue: { fontSize: 18, lineHeight: 23, fontWeight: "900" },
  metricDetail: { fontSize: 10, lineHeight: 15, fontWeight: "600", color: "#8290AE" },
  detailList: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface },
  finalActions: { gap: spacing.sm },
  disclosure: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#DCE7F7", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  disclosureLabel: { ...typography.bodyStrong, color: "#17265F" },
  disclosureMeta: { ...typography.caption, color: "#8290AE" },
  chevron: { width: 24, fontSize: 26, lineHeight: 30, color: "#60719B", textAlign: "center" },
  detailBody: { gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  detailIntro: { ...typography.caption, color: colors.textSecondary },
  dayRow: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  dayCount: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  provenance: { ...typography.caption, color: colors.textMuted },
  loadingBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.md },
  loadingTitle: { ...typography.bodyStrong, color: colors.primary },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  retryBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: "#F2D3AA", backgroundColor: colors.warningSoft, padding: spacing.md },
  retryTitle: { ...typography.bodyStrong, color: colors.warning },
  retryText: { ...typography.caption, color: colors.textSecondary },
  retryAction: { minHeight: sizes.touch, justifyContent: "center", paddingHorizontal: spacing.sm },
  retryActionText: { ...typography.caption, color: colors.primary },
  pressed: { opacity: 0.72 },
  lavenderSoft: { backgroundColor: "#F0EDFF" },
  lavenderText: { color: "#735BC4" },
  mintSoft: { backgroundColor: "#EAF7EE" },
  mintText: { color: "#2E9B66" },
  peachSoft: { backgroundColor: "#FFF0E2" },
  peachText: { color: "#D67B24" },
  blueSoft: { backgroundColor: "#F2F8FF" },
  blueText: { color: colors.primary },
});
