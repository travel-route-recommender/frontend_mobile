import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { workspaceScheduleService } from "../../workspace/services/workspaceDataPolicy";
import { AnalysisCoverageNotice } from "../components/AnalysisCoverageNotice";
import { AnalysisIssueCard } from "../components/AnalysisIssueCard";
import { AnalysisSummaryCard } from "../components/AnalysisSummaryCard";
import { GroupPreferenceInsightCard } from "../components/GroupPreferenceInsightCard";
import { SuggestionCard } from "../components/SuggestionCard";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../logic/analysisSnapshot";
import { buildDuriAnalysisInputFromState } from "../selectors/duriSelectors";
import { duriAnalysisService } from "../services/duriAnalysisService";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "두리 요청을 처리하지 못했어요. 기존 일정은 변경되지 않았어요.";
}

export function DuriAnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    usersById: state.usersById,
    placesById: state.placesById,
    tripsById: state.tripsById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
  })));
  const feature = useDuriAnalysisStore(useShallow((state) => ({
    session: state.sessionsByTripId[tripId],
    suggestions: state.suggestionsByTripId[tripId],
    analysisStatus: state.analysisStatusByTripId[tripId] ?? "idle",
    suggestionStatus: state.suggestionStatusByTripId[tripId] ?? "idle",
    analysisError: state.analysisErrorByTripId[tripId],
    suggestionError: state.suggestionErrorByTripId[tripId],
  })));
  const input = useMemo(() => buildDuriAnalysisInputFromState(source, tripId), [source, tripId]);
  const currentFingerprint = useMemo(() => input ? createDuriInputFingerprint(createDuriAnalysisSnapshot(input)) : "", [input]);
  const sessionStale = Boolean(feature.session && feature.session.inputFingerprint !== currentFingerprint);
  const engineAvailable = duriAnalysisService.available && workspaceScheduleService.available;
  const availability = useMemo(() => getDuriAnalysisAvailability({ input, engineAvailable }), [engineAvailable, input]);
  const trip = source.tripsById[tripId];

  const runAnalysis = async () => {
    if (!input || !availability.canAnalyze || !useDuriAnalysisStore.getState().beginAnalysis(tripId)) return;
    try {
      const session = await duriAnalysisService.analyze(input);
      useDuriAnalysisStore.getState().completeAnalysis(session);
    } catch (error) {
      useDuriAnalysisStore.getState().failAnalysis(tripId, errorMessage(error));
    }
  };

  const generateSuggestions = async () => {
    const session = useDuriAnalysisStore.getState().sessionsByTripId[tripId];
    if (!session || session.inputFingerprint !== currentFingerprint || !useDuriAnalysisStore.getState().beginSuggestionGeneration(tripId)) return;
    try {
      const suggestions = await duriAnalysisService.generateSuggestions(session);
      const latestInput = buildDuriAnalysisInputFromState(useDuriStore.getState(), tripId);
      const latestFingerprint = latestInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(latestInput)) : "";
      if (latestFingerprint !== session.inputFingerprint) {
        useDuriAnalysisStore.getState().failSuggestionGeneration(tripId, "제안을 계산하는 동안 일정이 변경되었어요. 다시 분석해 주세요.");
        return;
      }
      useDuriAnalysisStore.getState().completeSuggestionGeneration(tripId, session.inputFingerprint, suggestions);
    } catch (error) {
      useDuriAnalysisStore.getState().failSuggestionGeneration(tripId, errorMessage(error));
    }
  };

  if (!trip || !input) return <Screen><AppHeader title="두리 분석" onBack={() => router.back()} /><ErrorState message="여행방 또는 분석 입력을 찾을 수 없어요." /></Screen>;
  if (!trip.members.some((member) => member.userId === source.currentUserId)) return <Screen><AppHeader title="두리 분석" onBack={() => router.back()} /><ErrorState message="이 여행방의 분석 리포트를 볼 권한이 없어요." /></Screen>;

  const sourceMessage = !workspaceScheduleService.available ? workspaceScheduleService.message : undefined;
  const engineMessage = !duriAnalysisService.available ? duriAnalysisService.unavailableMessage : undefined;
  const suggestionIssueIds = new Set((feature.suggestions ?? []).flatMap((entry) => entry.suggestion.sourceIssueIds));

  return <Screen testID="duri-analysis-screen">
    <AppHeader title="두리 분석 리포트" subtitle={trip.title} onBack={() => router.back()} />
    {!engineAvailable ? <View accessibilityRole="alert" style={styles.unavailable}><Text style={styles.unavailableTitle}>{sourceMessage ? "일정 데이터 계약을 확인해 주세요" : "두리 엔진을 사용할 수 없어요"}</Text><Text style={styles.unavailableText}>{sourceMessage ?? engineMessage ?? availability.message}</Text></View> : null}

    {!feature.session ? <Card style={styles.intro}><Text style={styles.star}>✦</Text><Text style={styles.introTitle}>{availability.status === "no-itinerary" ? "일정을 추가하면 두리가 분석해드려요" : "현재 일정을 두리와 점검해보세요"}</Text><Text style={styles.introText}>{availability.message}</Text>{feature.analysisError ? <Text accessibilityRole="alert" style={styles.error}>{feature.analysisError}</Text> : null}<PrimaryButton label={feature.analysisStatus === "loading" ? "분석 중" : "분석하기"} loading={feature.analysisStatus === "loading"} disabled={!availability.canAnalyze} onPress={runAnalysis} /><SecondaryButton label="워크스페이스로 돌아가기" onPress={() => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} /></Card> : null}

    {feature.analysisStatus === "loading" && feature.session ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>현재 일정 snapshot으로 다시 분석하고 있어요.</Text></View> : null}

    {feature.session ? <View style={styles.content}>
      {sessionStale ? <StaleSuggestionNotice onReanalyze={runAnalysis} /> : null}
      {!sessionStale ? <><AnalysisCoverageNotice coverage={feature.session.coverage} /><AnalysisSummaryCard session={feature.session} /></> : null}

      {!sessionStale ? <View style={styles.section}><Text style={styles.sectionTitle}>주요 분석 항목</Text><Text style={styles.sectionText}>심각도, 날짜, category, 안정적 ID 순서로 표시해요.</Text>{feature.session.issues.map((issue) => <AnalysisIssueCard key={issue.id} issue={issue} hasGeneratedSuggestion={suggestionIssueIds.has(issue.id)} />)}</View> : null}

      {!sessionStale ? <View style={styles.section}><Text style={styles.sectionTitle}>날짜별 일정 균형</Text>{feature.session.dayMetrics.map((metric) => <View key={metric.date} style={styles.metricRow}><Text style={styles.metricDate}>{metric.date}</Text><Text style={styles.metricText}>일정 {metric.itemCount}개 · {metric.scheduledMinutes}분 · 충돌 {metric.conflictCount}건 · 긴 공백 {metric.longGapMinutes}분</Text></View>)}</View> : null}

      {!sessionStale ? <View style={styles.section}><Text style={styles.sectionTitle}>그룹 성향 반영</Text>{feature.session.groupInsights.map((insight) => <GroupPreferenceInsightCard key={insight.id} insight={insight} />)}</View> : null}

      {!sessionStale ? <Card style={styles.candidate}><Text style={styles.sectionTitle}>후보 활용 상태</Text><Text style={styles.sectionText}>후보 {feature.session.candidateUsage.candidateCount}개 중 일정 배치 {feature.session.candidateUsage.scheduledCandidateCount}개, 미배치 {feature.session.candidateUsage.unscheduledCandidateCount}개예요.</Text><Text style={styles.sectionText}>여러 동행자가 담은 미배치 후보 {feature.session.candidateUsage.unscheduledSharedCandidateIds.length}개 · 넣어야 한다는 의미로 해석하지 않아요.</Text></Card> : null}

      {!sessionStale ? <View style={styles.section}><Text style={styles.sectionTitle}>두리 제안</Text><Text style={styles.sectionText}>제안 생성과 미리보기는 현재 일정을 수정하지 않아요.</Text>{feature.suggestionError ? <Text accessibilityRole="alert" style={styles.error}>{feature.suggestionError}</Text> : null}{feature.suggestions ? feature.suggestions.length ? feature.suggestions.map((envelope) => {
        const affectedDates = [...new Set(envelope.suggestion.changes.flatMap((change) => [change.before?.date, change.after?.date].filter((date): date is string => Boolean(date))))].sort();
        const issueTitles = envelope.suggestion.sourceIssueIds.flatMap((issueId) => feature.session?.issues.find((issue) => issue.id === issueId)?.title ?? []);
        return <SuggestionCard key={envelope.suggestion.id} envelope={envelope} issueTitles={issueTitles} affectedDates={affectedDates} onPreview={() => router.push({ pathname: "/trips/[tripId]/suggestions/[suggestionId]", params: { tripId, suggestionId: envelope.suggestion.id } })} />;
      }) : <View style={styles.empty}><Text style={styles.emptyTitle}>지금 바로 적용할 새 제안이 없어요</Text><Text style={styles.sectionText}>근거와 유효한 빈 시간을 확인할 수 있는 변경만 만들어요.</Text></View> : <PrimaryButton label={feature.suggestionStatus === "loading" ? "제안 생성 중" : "일정 개선 제안 생성"} loading={feature.suggestionStatus === "loading"} onPress={generateSuggestions} />}</View> : null}

      <SecondaryButton label="현재 일정 다시 분석" disabled={!availability.canAnalyze || feature.analysisStatus === "loading"} loading={feature.analysisStatus === "loading"} onPress={runAnalysis} />
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  unavailable: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.warningSoft, padding: spacing.md, marginBottom: spacing.md },
  unavailableTitle: { ...typography.bodyStrong, color: colors.warning },
  unavailableText: { ...typography.caption, color: colors.textSecondary },
  intro: { alignItems: "stretch", gap: spacing.md },
  star: { textAlign: "center", fontSize: 32, color: colors.primary },
  introTitle: { ...typography.title, textAlign: "center", color: colors.text },
  introText: { ...typography.body, textAlign: "center", color: colors.textSecondary },
  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.md, marginBottom: spacing.md },
  loadingText: { flex: 1, ...typography.caption, color: colors.primary },
  content: { gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  sectionText: { ...typography.caption, color: colors.textSecondary },
  metricRow: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  metricDate: { ...typography.bodyStrong, color: colors.primary },
  metricText: { ...typography.caption, color: colors.textSecondary },
  candidate: { gap: spacing.xs },
  empty: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: spacing.lg, alignItems: "center" },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
});
