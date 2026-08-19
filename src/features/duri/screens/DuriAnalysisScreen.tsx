import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { workspaceScheduleService } from "../../workspace/services/workspaceDataPolicy";
import { useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { syncDuriIssueTodos } from "../../trip-todos/services/tripTodoAutomationService";
import { getDuriTodoResolvableDedupePrefixes } from "../../trip-todos/logic/todoAutomation";
import { AnalysisCoverageNotice } from "../components/AnalysisCoverageNotice";
import { AnalysisIssueCard } from "../components/AnalysisIssueCard";
import { AnalysisSummaryCard } from "../components/AnalysisSummaryCard";
import { DuriIssueFilterBar, type DuriIssueFilter } from "../components/DuriIssueFilterBar";
import { DuriReportSectionTabs, type DuriReportSection } from "../components/DuriReportSectionTabs";
import { GroupPreferenceInsightCard } from "../components/GroupPreferenceInsightCard";
import { SuggestionCard } from "../components/SuggestionCard";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../logic/analysisSnapshot";
import { buildDuriAnalysisInputWithDocuments, isDuriAnalysisCompletionCurrent } from "../logic/analysisInput";
import { duriAnalysisService } from "../services/duriAnalysisService";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];
const itineraryTypeLabel: Record<string, string> = {
  place: "장소 일정",
  meal: "식사",
  rest: "휴식",
  transport: "이동",
  reservation: "예약 일정",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "두리 요청을 처리하지 못했어요. 기존 일정은 변경되지 않았어요.";
}

export function DuriAnalysisScreen() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<DuriReportSection>("overview");
  const [issueFilter, setIssueFilter] = useState<DuriIssueFilter>("all");
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
  const tripDocuments = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS);
  const input = useMemo(() => buildDuriAnalysisInputWithDocuments(source, tripId, tripDocuments), [source, tripDocuments, tripId]);
  const currentFingerprint = useMemo(() => input ? createDuriInputFingerprint(createDuriAnalysisSnapshot(input)) : "", [input]);
  const sessionStale = Boolean(feature.session && feature.session.inputFingerprint !== currentFingerprint);
  const engineAvailable = duriAnalysisService.available && workspaceScheduleService.available;
  const availability = useMemo(() => getDuriAnalysisAvailability({ input, engineAvailable }), [engineAvailable, input]);
  const trip = source.tripsById[tripId];
  const filteredIssues = useMemo(() => (feature.session?.issues ?? []).filter((issue) => (
    issueFilter === "all" || issue.constraintType === issueFilter
  )), [feature.session, issueFilter]);
  const preferenceIssues = useMemo(() => (feature.session?.issues ?? []).filter((issue) => issue.category === "preference"), [feature.session]);
  const affectedEntityLabelsByIssueId = useMemo(() => {
    const session = feature.session;
    if (!session) return {} as Record<string, string[]>;
    const itemById = new Map(session.snapshot.itinerary.map((item) => [item.id, item] as const));
    const memberById = new Map(session.snapshot.members.map((member) => [member.id, member] as const));
    return Object.fromEntries(session.issues.map((issue) => {
      const representedPlaceIds = new Set<string>();
      const itemLabels = issue.affectedItemIds.flatMap((itemId) => {
        const item = itemById.get(itemId);
        if (!item) return [];
        if (item.placeId) representedPlaceIds.add(item.placeId);
        const placeName = item.placeId ? session.snapshot.placesById[item.placeId]?.name : undefined;
        const name = placeName ?? item.note?.trim() ?? itineraryTypeLabel[item.itemType] ?? "일정";
        return [`일정 · ${item.date} ${item.startTime} ${name}`];
      });
      const placeLabels = issue.affectedPlaceIds.flatMap((placeId) => {
        if (representedPlaceIds.has(placeId)) return [];
        const place = session.snapshot.placesById[placeId];
        return place ? [`장소 · ${place.name}`] : [];
      });
      const memberLabels = issue.affectedMemberIds.flatMap((memberId) => {
        const member = memberById.get(memberId);
        return member ? [`동행자 · ${member.name}`] : [];
      });
      return [issue.id, [...new Set([...itemLabels, ...placeLabels, ...memberLabels])]];
    }));
  }, [feature.session]);

  const runAnalysis = async () => {
    if (!input || !availability.canAnalyze || !useDuriAnalysisStore.getState().beginAnalysis(tripId)) return;
    const requestedFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(input));
    const requestedByUserId = source.currentUserId;
    try {
      const session = await duriAnalysisService.analyze(input);
      const latestSource = useDuriStore.getState();
      const latestInput = buildDuriAnalysisInputWithDocuments(
        latestSource,
        tripId,
        useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS,
      );
      if (latestSource.currentUserId !== requestedByUserId || !isDuriAnalysisCompletionCurrent({
        requestedFingerprint,
        sessionFingerprint: session.inputFingerprint,
        latestInput,
      })) {
        useDuriAnalysisStore.getState().failAnalysis(tripId, "분석하는 동안 일정이나 첨부 문서가 변경되어 이전 결과를 저장하지 않았어요. 다시 분석해 주세요.");
        return;
      }
      useDuriAnalysisStore.getState().completeAnalysis(session);
      const actionableIssues = session.issues.filter((issue) => issue.constraintType !== "informational" && issue.severity !== "info");
      // TODO 저장 실패는 분석 결과나 워크스페이스를 되돌리지 않는다.
      void syncDuriIssueTodos({
        tripId,
        issues: actionableIssues,
        createdByUserId: requestedByUserId,
        resolvableDedupePrefixes: getDuriTodoResolvableDedupePrefixes(session.coverage),
        isCurrent: () => {
          if (useDuriAnalysisStore.getState().sessionsByTripId[tripId] !== session) return false;
          const currentSource = useDuriStore.getState();
          if (currentSource.currentUserId !== requestedByUserId) return false;
          const currentInput = buildDuriAnalysisInputWithDocuments(
            currentSource,
            tripId,
            useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS,
          );
          return isDuriAnalysisCompletionCurrent({
            requestedFingerprint,
            sessionFingerprint: session.inputFingerprint,
            latestInput: currentInput,
          });
        },
      }).catch(() => undefined);
    } catch (error) {
      useDuriAnalysisStore.getState().failAnalysis(tripId, errorMessage(error));
    }
  };

  const generateSuggestions = async () => {
    const session = useDuriAnalysisStore.getState().sessionsByTripId[tripId];
    if (!session || session.inputFingerprint !== currentFingerprint || !useDuriAnalysisStore.getState().beginSuggestionGeneration(tripId)) return;
    try {
      const suggestions = await duriAnalysisService.generateSuggestions(session);
      const latestInput = buildDuriAnalysisInputWithDocuments(
        useDuriStore.getState(),
        tripId,
        useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS,
      );
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
      {!sessionStale ? <DuriReportSectionTabs value={activeSection} issueCount={feature.session.issues.length} onChange={setActiveSection} /> : null}

      {!sessionStale && activeSection === "overview" ? <View style={styles.section}>
        <AnalysisSummaryCard session={feature.session} />
        <Card style={styles.candidate}><Text style={styles.sectionTitle}>후보 활용 상태</Text><Text style={styles.sectionText}>후보 {feature.session.candidateUsage.candidateCount}개 중 일정 배치 {feature.session.candidateUsage.scheduledCandidateCount}개, 미배치 {feature.session.candidateUsage.unscheduledCandidateCount}개예요.</Text><Text style={styles.sectionText}>여러 동행자가 담은 미배치 후보 {feature.session.candidateUsage.unscheduledSharedCandidateIds.length}개 · 넣어야 한다는 의미로 해석하지 않아요.</Text></Card>
        {feature.session.issues.length ? <SecondaryButton label={`점검 항목 ${feature.session.issues.length}개 보기`} onPress={() => setActiveSection("checks")} /> : <View style={styles.empty}><Text style={styles.emptyTitle}>현재 근거에서 확인할 문제가 없어요</Text><Text style={styles.sectionText}>근거가 없어서 판단하지 못한 항목은 근거·한계 메뉴에서 따로 확인할 수 있어요.</Text></View>}
      </View> : null}

      {!sessionStale && activeSection === "checks" ? <View style={styles.section}><View style={styles.sectionHeader}><View style={styles.sectionHeaderCopy}><Text style={styles.sectionTitle}>전체 점검 항목</Text><Text style={styles.sectionText}>Hard는 확인된 사실 위반, Soft는 조율 제안이며 어떤 항목도 자동 수정하지 않아요.</Text></View></View><DuriIssueFilterBar issues={feature.session.issues} value={issueFilter} onChange={setIssueFilter} />{filteredIssues.length ? filteredIssues.map((issue) => <AnalysisIssueCard key={issue.id} issue={issue} affectedEntityLabels={affectedEntityLabelsByIssueId[issue.id]} hasGeneratedSuggestion={suggestionIssueIds.has(issue.id)} />) : <View style={styles.empty}><Text style={styles.emptyTitle}>이 유형의 점검 항목이 없어요</Text></View>}</View> : null}

      {!sessionStale && activeSection === "days" ? <View style={styles.section}><Text style={styles.sectionTitle}>날짜별 일정 균형</Text><Text style={styles.sectionText}>이동 제외 여유는 실제 조회에 성공한 구간만 빼고 계산해요.</Text>{feature.session.dayMetrics.map((metric) => <View key={metric.date} style={styles.metricRow}><View style={styles.metricHeading}><Text style={styles.metricDate}>{metric.date}</Text><Text style={styles.metricCount}>일정 {metric.itemCount}개</Text></View><Text style={styles.metricText}>체류 {metric.scheduledMinutes}분 · 충돌 {metric.conflictCount}건</Text><Text style={styles.metricText}>이동 제외 여유 {metric.routeAdjustedIdleMinutes}분 · 실제 경로 {metric.analyzedRouteLegCount}/{metric.requiredRouteLegCount}구간 확인</Text></View>)}</View> : null}

      {!sessionStale && activeSection === "preferences" ? <View style={styles.section}><Text style={styles.sectionTitle}>그룹 성향 조율</Text><Text style={styles.sectionText}>직접 응답과 일정 반영 상태를 사용하며 다수결로 소수 의견을 지우지 않아요. 최소최대 후회 조율은 모든 참여자를 같은 가중치로 보고 응답 단계 간 거리가 같다고 가정해요.</Text>{feature.session.groupInsights.map((insight) => <GroupPreferenceInsightCard key={insight.id} insight={insight} />)}{preferenceIssues.length ? <View style={styles.nestedSection}><Text style={styles.sectionTitle}>성향 관련 점검</Text>{preferenceIssues.map((issue) => <AnalysisIssueCard key={issue.id} issue={issue} affectedEntityLabels={affectedEntityLabelsByIssueId[issue.id]} hasGeneratedSuggestion={suggestionIssueIds.has(issue.id)} />)}</View> : null}</View> : null}

      {!sessionStale && activeSection === "evidence" ? <View style={styles.section}><AnalysisCoverageNotice coverage={feature.session.coverage} /></View> : null}

      {!sessionStale && activeSection === "suggestions" ? <View style={styles.section}><Text style={styles.sectionTitle}>두리 제안</Text><Text style={styles.sectionText}>제안 생성과 미리보기는 현재 일정을 수정하지 않아요. 잠금·확정예약·티켓 일정은 변경 후보에서 제외해요.</Text>{feature.suggestionError ? <Text accessibilityRole="alert" style={styles.error}>{feature.suggestionError}</Text> : null}{feature.suggestions ? feature.suggestions.length ? feature.suggestions.map((envelope) => {
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
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  sectionHeaderCopy: { flex: 1, gap: spacing.xxs },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  sectionText: { ...typography.caption, color: colors.textSecondary },
  nestedSection: { gap: spacing.sm, marginTop: spacing.sm },
  metricRow: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  metricHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  metricDate: { ...typography.bodyStrong, color: colors.primary },
  metricCount: { ...typography.caption, color: colors.text, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  metricText: { ...typography.caption, color: colors.textSecondary },
  candidate: { gap: spacing.xs },
  empty: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: spacing.lg, alignItems: "center" },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
});
