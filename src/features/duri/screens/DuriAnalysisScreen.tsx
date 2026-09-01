import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { workspaceScheduleService } from "../../workspace/services/workspaceDataPolicy";
import { useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { syncDuriIssueTodos } from "../../trip-todos/services/tripTodoAutomationService";
import { getDuriTodoResolvableDedupePrefixes } from "../../trip-todos/logic/todoAutomation";
import { DuriAnalysisIntro } from "../components/DuriAnalysisIntro";
import { DuriAnalysisReport } from "../components/DuriAnalysisReport";
import { DuriScrollPage } from "../components/DuriPageShell";
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

  if (!trip || !input) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message="여행방 또는 점검할 일정을 찾을 수 없어요." /></DuriScrollPage>;
  if (!trip.members.some((member) => member.userId === source.currentUserId)) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message="이 여행방의 점검 결과를 볼 권한이 없어요." /></DuriScrollPage>;

  const sourceMessage = !workspaceScheduleService.available ? workspaceScheduleService.message : undefined;
  const engineMessage = !duriAnalysisService.available ? duriAnalysisService.unavailableMessage : undefined;
  return <DuriScrollPage testID="duri-analysis-screen">
    <AppHeader title="DURI 일정 점검" subtitle={`${trip.title} · ${formatTripDateRange(trip.startDate, trip.endDate)}`} onBack={() => router.back()} />
    {!engineAvailable ? <View accessibilityRole="alert" style={styles.unavailable}><Text style={styles.unavailableTitle}>{sourceMessage ? "일정 데이터 계약을 확인해 주세요" : "두리 엔진을 사용할 수 없어요"}</Text><Text style={styles.unavailableText}>{sourceMessage ?? engineMessage ?? availability.message}</Text></View> : null}

    {!feature.session ? <DuriAnalysisIntro
      title={availability.status === "no-itinerary" ? "일정을 추가하면 두리가 점검해드려요" : "현재 일정을 두리와 함께 점검해보세요"}
      message={availability.message}
      error={feature.analysisError}
      loading={feature.analysisStatus === "loading"}
      disabled={!availability.canAnalyze}
      onAnalyze={runAnalysis}
      onWorkspace={() => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })}
    /> : null}

    {feature.session && sessionStale ? <View style={styles.staleWrap}>
      {feature.analysisStatus === "error" && feature.analysisError ? <View accessibilityRole="alert" style={styles.retainedError}><Text style={styles.retainedErrorTitle}>다시 점검하지 못했어요</Text><Text style={styles.retainedErrorText}>이전 결과는 보관하고 있어요. {feature.analysisError}</Text></View> : null}
      <StaleSuggestionNotice variant="analysis" onReanalyze={runAnalysis} />
    </View> : null}

    {feature.session && !sessionStale ? <DuriAnalysisReport
      session={feature.session}
      suggestions={feature.suggestions}
      analysisStatus={feature.analysisStatus}
      analysisError={feature.analysisError}
      suggestionStatus={feature.suggestionStatus}
      suggestionError={feature.suggestionError}
      canAnalyze={availability.canAnalyze}
      affectedEntityLabelsByIssueId={affectedEntityLabelsByIssueId}
      onReanalyze={runAnalysis}
      onGenerateSuggestions={generateSuggestions}
      onPreviewSuggestion={(envelope) => router.push({ pathname: "/trips/[tripId]/suggestions/[suggestionId]", params: { tripId, suggestionId: envelope.suggestion.id } })}
    /> : null}
  </DuriScrollPage>;
}

const styles = StyleSheet.create({
  unavailable: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.warningSoft, padding: spacing.md },
  unavailableTitle: { ...typography.bodyStrong, color: colors.warning },
  unavailableText: { ...typography.caption, color: colors.textSecondary },
  staleWrap: { gap: spacing.sm },
  retainedError: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#F2D3AA", backgroundColor: colors.warningSoft, padding: spacing.md },
  retainedErrorTitle: { ...typography.bodyStrong, color: colors.warning },
  retainedErrorText: { ...typography.caption, color: colors.textSecondary },
});
