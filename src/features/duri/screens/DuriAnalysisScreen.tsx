import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, SecondaryButton } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { queryClient } from "../../../query/queryClient";
import { queryKeys } from "../../../query/keys";
import { ApiError } from "../../../services/apiClient";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { workspaceScheduleService } from "../../workspace/services/workspaceDataPolicy";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { fetchApiTripDetail, type ApiTripDetailData } from "../../trips/tripRoomApi";
import { ensureTripDocumentStoreHydrated, useTripDocumentHydrationState, useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { syncDuriIssueTodos } from "../../trip-todos/services/tripTodoAutomationService";
import { syncApiDuriIssueTodos } from "../../trip-todos/services/apiDuriTodoAutomationService";
import { getDuriTodoResolvableDedupePrefixes } from "../../trip-todos/logic/todoAutomation";
import { DuriTechnicalDetailsModal } from "../components/DuriTechnicalDetailsModal";
import { PreferenceAutoFillCard } from "../components/PreferenceAutoFillCard";
import { DuriAnalysisIntro } from "../components/DuriAnalysisIntro";
import { DuriAnalysisReport } from "../components/DuriAnalysisReport";
import { DuriScrollPage } from "../components/DuriPageShell";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../logic/analysisSnapshot";
import { buildApiDuriAnalysisInput } from "../logic/apiAnalysisInput";
import { buildDuriAnalysisInputWithDocuments, isDuriAnalysisCompletionCurrent } from "../logic/analysisInput";
import {
  buildPreferenceAutoFillSuggestionEnvelope,
  planPreferenceAutoFill,
  type PreferenceAutoFillRequest,
} from "../logic/preferenceAutoFill";
import { duriAnalysisService } from "../services/duriAnalysisService";
import { enrichPreferenceAutoFillCandidateEvidence } from "../services/duriEvidenceService";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];
const itineraryTypeLabel: Record<string, string> = {
  place: "장소 일정",
  meal: "식사",
  rest: "휴식",
  transport: "이동",
  reservation: "예약 일정",
};

type TechnicalDetailsTarget = { kind: "overview" } | { kind: "issue"; issueId: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "두리 요청을 처리하지 못했어요. 기존 일정은 변경되지 않았어요.";
}

function supplementalAutoFillEvidence(data: ApiTripDetailData | undefined) {
  return Object.fromEntries((data?.room.members ?? [])
    .filter((member) => member.travelTypeTags.length > 0)
    .map((member) => [member.userId, { source: "travel-type-snapshot" as const, tags: member.travelTypeTags }]));
}

export function DuriAnalysisScreen() {
  const router = useRouter();
  const [technicalDetailsTarget, setTechnicalDetailsTarget] = useState<TechnicalDetailsTarget>();
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const apiMode = environment.dataSource === "api";
  const authenticatedUserId = useAuthSessionStore((state) => state.currentSessionUserId) ?? "";
  const apiQuery = useQuery({
    queryKey: queryKeys.trips.detail(tripId, authenticatedUserId),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, authenticatedUserId, signal),
    enabled: apiMode && Boolean(tripId && authenticatedUserId),
  });
  const localSource = useDuriStore(useShallow((state) => ({
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
  const documentsHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const documentHydrationError = useTripDocumentHydrationState((state) => state.hydrationError);
  const documentCollectionStatus = documentsHydrated ? "loaded" as const : documentHydrationError ? "unavailable" as const : undefined;
  const input = useMemo(() => apiMode
    ? buildApiDuriAnalysisInput(
        apiQuery.data,
        authenticatedUserId,
        documentsHydrated ? tripDocuments : EMPTY_TRAVEL_DOCUMENTS,
        documentCollectionStatus ?? "unavailable",
      )
    : !documentCollectionStatus
      ? undefined
      : buildDuriAnalysisInputWithDocuments(localSource, tripId, tripDocuments, [], documentCollectionStatus),
  [apiMode, apiQuery.data, authenticatedUserId, documentCollectionStatus, documentsHydrated, localSource, tripDocuments, tripId]);
  const currentFingerprint = useMemo(() => input ? createDuriInputFingerprint(createDuriAnalysisSnapshot(input)) : "", [input]);
  const sessionStale = Boolean(feature.session && feature.session.inputFingerprint !== currentFingerprint);
  const apiAccessRevoked = apiMode && apiQuery.error instanceof ApiError
    && (apiQuery.error.status === 401 || apiQuery.error.status === 403);
  const apiRefreshFailed = apiMode && Boolean(apiQuery.error && apiQuery.data);
  const scheduleSourceAvailable = apiMode ? Boolean(apiQuery.data?.scheduleSnapshot) && !apiRefreshFailed : workspaceScheduleService.available;
  const engineAvailable = duriAnalysisService.available && scheduleSourceAvailable;
  const availability = useMemo(() => getDuriAnalysisAvailability({ input, engineAvailable }), [engineAvailable, input]);
  const trip = input?.trip;
  const analysisUserId = apiMode ? authenticatedUserId : localSource.currentUserId;
  const autoFillSupplementalEvidence = useMemo(() => supplementalAutoFillEvidence(apiQuery.data), [apiQuery.data]);
  const autoFillSupplementalFingerprint = useMemo(() => JSON.stringify(Object.entries(autoFillSupplementalEvidence)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([memberId, evidence]) => [memberId, [...evidence.tags].sort()])), [autoFillSupplementalEvidence]);
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

  const readLatestAnalysisInput = () => {
    const documents = useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS;
    const documentHydration = useTripDocumentHydrationState.getState();
    const collectionStatus = documentHydration.isHydrated ? "loaded" as const : documentHydration.hydrationError ? "unavailable" as const : undefined;
    if (apiMode) {
      const userId = useAuthSessionStore.getState().currentSessionUserId ?? "";
      return buildApiDuriAnalysisInput(
        queryClient.getQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, userId)),
        userId,
        documentHydration.isHydrated ? documents : EMPTY_TRAVEL_DOCUMENTS,
        collectionStatus ?? "unavailable",
      );
    }
    if (!collectionStatus) return undefined;
    return buildDuriAnalysisInputWithDocuments(useDuriStore.getState(), tripId, documents, [], collectionStatus);
  };

  const readLatestAnalysisUserId = () => apiMode
    ? useAuthSessionStore.getState().currentSessionUserId ?? ""
    : useDuriStore.getState().currentUserId;

  const runAnalysis = async () => {
    if (!input || !availability.canAnalyze || !useDuriAnalysisStore.getState().beginAnalysis(tripId)) return;
    const requestedByUserId = analysisUserId;
    try {
      let requestedInput = input;
      if (apiMode) {
        // 분석 버튼을 누른 시점의 서버 scheduleVersion을 다시 확인한다. 화면 focus 시점의
        // cache만 사용하면 다른 동행자의 변경을 구 버전으로 분석할 수 있다.
        const refreshed = await apiQuery.refetch();
        if (refreshed.isError || !refreshed.data?.scheduleSnapshot) {
          throw new Error("최신 서버 일정을 확인하지 못해 분석을 시작하지 않았어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        }
        const documentHydration = useTripDocumentHydrationState.getState();
        const collectionStatus = documentHydration.isHydrated ? "loaded" as const : "unavailable" as const;
        const userId = useAuthSessionStore.getState().currentSessionUserId ?? "";
        if (userId !== requestedByUserId) throw new Error("분석 중 로그인 사용자가 변경되어 결과를 저장하지 않았어요.");
        requestedInput = buildApiDuriAnalysisInput(
          refreshed.data,
          userId,
          documentHydration.isHydrated
            ? useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS
            : EMPTY_TRAVEL_DOCUMENTS,
          collectionStatus,
        ) as typeof input;
        if (!requestedInput) throw new Error("최신 서버 일정으로 분석 입력을 구성하지 못했어요.");
        const refreshedAvailability = getDuriAnalysisAvailability({ input: requestedInput, engineAvailable: duriAnalysisService.available });
        if (!refreshedAvailability.canAnalyze) throw new Error(refreshedAvailability.message);
      }
      const requestedFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(requestedInput));
      const session = await duriAnalysisService.analyze(requestedInput);
      const latestInput = readLatestAnalysisInput();
      if (readLatestAnalysisUserId() !== requestedByUserId || !isDuriAnalysisCompletionCurrent({
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
      if (session.snapshot.trip.status !== "completed" && apiMode) void syncApiDuriIssueTodos({
        roomId: tripId,
        issues: actionableIssues,
        baseRevision: session.inputFingerprint,
        timezone: apiQuery.data?.scheduleSnapshot?.planning?.timezone ?? "Asia/Seoul",
      }).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.trips.todos(tripId, requestedByUserId) })).catch(() => undefined);
      if (session.snapshot.trip.status !== "completed" && !apiMode) void syncDuriIssueTodos({
        tripId,
        issues: actionableIssues,
        createdByUserId: requestedByUserId,
        resolvableDedupePrefixes: getDuriTodoResolvableDedupePrefixes(session.coverage),
        isCurrent: () => {
          if (useDuriAnalysisStore.getState().sessionsByTripId[tripId] !== session) return false;
          if (readLatestAnalysisUserId() !== requestedByUserId) return false;
          const currentInput = readLatestAnalysisInput();
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
      const latestInput = readLatestAnalysisInput();
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

  const generatePreferenceAutoFill = async (request: PreferenceAutoFillRequest) => {
    const session = useDuriAnalysisStore.getState().sessionsByTripId[tripId] ?? feature.session;
    const displayedFingerprint = session?.inputFingerprint ?? currentFingerprint;
    const requestedByUserId = readLatestAnalysisUserId();
    let planningInput = readLatestAnalysisInput();
    let supplementalEvidence = autoFillSupplementalEvidence;
    if (apiMode) {
      const refreshed = await apiQuery.refetch();
      if (refreshed.isError || !refreshed.data?.scheduleSnapshot) {
        throw new Error("최신 서버 일정을 확인하지 못해 초안을 만들지 않았어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
      }
      const documentHydration = useTripDocumentHydrationState.getState();
      const collectionStatus = documentHydration.isHydrated ? "loaded" as const : "unavailable" as const;
      const latestUserId = readLatestAnalysisUserId();
      if (!latestUserId || latestUserId !== requestedByUserId) {
        throw new Error("초안을 계산하는 동안 로그인 사용자가 변경되어 결과를 표시하지 않았어요.");
      }
      planningInput = buildApiDuriAnalysisInput(
        refreshed.data,
        latestUserId,
        documentHydration.isHydrated
          ? useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS
          : EMPTY_TRAVEL_DOCUMENTS,
        collectionStatus,
      );
      supplementalEvidence = supplementalAutoFillEvidence(refreshed.data);
    }
    if (!planningInput || readLatestAnalysisUserId() !== requestedByUserId) {
      throw new Error("최신 일정 또는 사용자 정보를 확인하지 못해 초안을 만들지 않았어요.");
    }
    const latestFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(planningInput));
    if (!displayedFingerprint || displayedFingerprint !== latestFingerprint) {
      throw new Error("서버 일정·예약·문서 상태가 화면을 연 뒤 변경되었어요. 갱신된 화면에서 다시 초안을 만들어 주세요.");
    }
    const autoFillPlanningInput = apiMode
      ? await enrichPreferenceAutoFillCandidateEvidence(planningInput).catch(() => planningInput)
      : planningInput;
    if (readLatestAnalysisUserId() !== requestedByUserId) {
      throw new Error("후보 장소 정보를 확인하는 동안 로그인 사용자가 변경되어 결과를 표시하지 않았어요.");
    }
    const plan = planPreferenceAutoFill(autoFillPlanningInput, {
      ...request,
      ...(Object.keys(supplementalEvidence).length ? {
        supplementalPreferenceEvidenceByMemberId: supplementalEvidence,
      } : {}),
    });
    // 새 장소의 경로·운영시간 Hard 근거가 부족한 자동 채우기는 API/local 모두
    // preview-only로 유지한다. 검증 가능한 제안만 별도의 apply 계약으로 적용한다.
    if (session && plan.status === "preview-only") {
      if (latestFingerprint === session.inputFingerprint) {
        const envelope = buildPreferenceAutoFillSuggestionEnvelope(session, plan, new Date().toISOString());
        if (envelope) {
          const previous = useDuriAnalysisStore.getState().suggestionsByTripId[tripId] ?? [];
          const retained = previous.filter((entry) => !entry.suggestion.title.startsWith("성향 기반 일정 초안 "));
          useDuriAnalysisStore.getState().completeSuggestionGeneration(
            tripId,
            session.inputFingerprint,
            [...retained, envelope],
          );
        }
      }
    }
    return plan;
  };

  if (apiMode && !authenticatedUserId) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></DuriScrollPage>;
  if (apiMode && apiQuery.isLoading) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><LoadingState label="서버의 최신 일정을 불러오고 있어요." /></DuriScrollPage>;
  if (apiAccessRevoked) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message="이 여행방의 최신 접근 권한을 확인할 수 없어 저장된 리포트를 표시하지 않아요." onRetry={() => void apiQuery.refetch()} /></DuriScrollPage>;
  if (apiMode && !apiQuery.data) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message={apiQuery.error instanceof Error ? apiQuery.error.message : "서버 여행방을 불러오지 못했어요."} onRetry={() => void apiQuery.refetch()} /></DuriScrollPage>;
  if (!apiMode && !documentsHydrated && !documentHydrationError) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><LoadingState label="첨부 문서 확인 상태를 불러오고 있어요." /></DuriScrollPage>;
  if (!trip || !input) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message="여행방 또는 분석 입력을 찾을 수 없어요." /></DuriScrollPage>;
  if (!trip.members.some((member) => member.userId === analysisUserId)) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={() => router.back()} /><ErrorState message="이 여행방의 분석 리포트를 볼 권한이 없어요." /></DuriScrollPage>;

  const sourceMessage = apiRefreshFailed
    ? "최신 서버 일정 확인에 실패해 보이는 리포트는 마지막으로 확인한 사본 기준이에요. 다시 불러오기 전에는 새 분석을 실행하지 않아요."
    : !apiMode && !workspaceScheduleService.available
      ? workspaceScheduleService.message
      : undefined;
  const engineMessage = !duriAnalysisService.available ? duriAnalysisService.unavailableMessage : undefined;
  const autoFillInputInvalid = availability.status === "invalid-itinerary" || availability.status === "invalid-trip-dates";
  const autoFillDisabled = feature.analysisStatus === "loading" || apiRefreshFailed || trip.status === "completed" || autoFillInputInvalid;
  const autoFillDisabledReason = trip.status === "completed"
    ? "완료된 여행방에서는 초안을 만들지 않아요."
    : apiRefreshFailed
      ? "최신 서버 일정을 다시 불러온 뒤 생성해 주세요."
      : autoFillInputInvalid
        ? availability.message
        : undefined;

  return <DuriScrollPage testID="duri-analysis-screen">
    <AppHeader title="DURI 일정 점검" subtitle={`${trip.title} · ${formatTripDateRange(trip.startDate, trip.endDate)}`} onBack={() => router.back()} />
    {!engineAvailable ? <View accessibilityRole="alert" style={styles.unavailable}><Text style={styles.unavailableTitle}>{apiRefreshFailed ? "최신 서버 일정 확인이 필요해요" : sourceMessage ? "일정 데이터 계약을 확인해 주세요" : "두리 엔진을 사용할 수 없어요"}</Text><Text style={styles.unavailableText}>{sourceMessage ?? engineMessage ?? availability.message}</Text>{apiRefreshFailed ? <SecondaryButton label="서버 일정 다시 불러오기" onPress={() => { void apiQuery.refetch(); }} /> : null}</View> : null}
    {documentHydrationError ? <View accessibilityRole="alert" style={styles.unavailable}><Text style={styles.unavailableTitle}>기기 문서함을 확인하지 못했어요</Text><Text style={styles.unavailableText}>문서·예약 기반 검사는 제외하고 나머지 일정은 점검할 수 있어요. 문서 기반 검사를 복구하려면 다시 불러와 주세요.</Text><SecondaryButton label="문서 다시 불러오기" onPress={() => { void ensureTripDocumentStoreHydrated().catch(() => undefined); }} /></View> : null}

    {!feature.session ? <View style={styles.introStack}>
      <DuriAnalysisIntro
        title={availability.status === "no-itinerary" ? "일정이 비어 있어도 두리가 초안을 만들 수 있어요" : "현재 일정을 두리와 함께 점검해보세요"}
        message={availability.message}
        error={feature.analysisError}
        loading={feature.analysisStatus === "loading"}
        disabled={!availability.canAnalyze}
        onAnalyze={runAnalysis}
        onWorkspace={() => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })}
      />
      <PreferenceAutoFillCard key={`intro:${currentFingerprint}:${apiMode ? "api" : "local"}:${autoFillSupplementalFingerprint}:${autoFillDisabled ? "disabled" : "enabled"}`} input={input} disabled={autoFillDisabled} disabledReason={autoFillDisabledReason} onGenerate={generatePreferenceAutoFill} />
    </View> : null}

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
      preferenceAutoFillContent={<PreferenceAutoFillCard key={`${feature.session.inputFingerprint}:${apiMode ? "api" : "local"}:${autoFillSupplementalFingerprint}:${autoFillDisabled ? "disabled" : "enabled"}`} input={feature.session.snapshot} disabled={autoFillDisabled} disabledReason={autoFillDisabledReason} onGenerate={generatePreferenceAutoFill} />}
      onReanalyze={runAnalysis}
      onGenerateSuggestions={generateSuggestions}
      onPreviewSuggestion={(envelope) => router.push({ pathname: "/trips/[tripId]/suggestions/[suggestionId]", params: { tripId, suggestionId: envelope.suggestion.id } })}
      onOpenTechnicalDetails={(issueId) => setTechnicalDetailsTarget(issueId ? { kind: "issue", issueId } : { kind: "overview" })}
    /> : null}
    {feature.session && technicalDetailsTarget ? <DuriTechnicalDetailsModal
      visible
      session={feature.session}
      issue={technicalDetailsTarget.kind === "issue" ? feature.session.issues.find((issue) => issue.id === technicalDetailsTarget.issueId) : undefined}
      onClose={() => setTechnicalDetailsTarget(undefined)}
    /> : null}
  </DuriScrollPage>;
}

const styles = StyleSheet.create({
  unavailable: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.warningSoft, padding: spacing.md },
  unavailableTitle: { ...typography.bodyStrong, color: colors.warning },
  unavailableText: { ...typography.caption, color: colors.textSecondary },
  introStack: { gap: spacing.lg },
  staleWrap: { gap: spacing.sm },
  retainedError: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#F2D3AA", backgroundColor: colors.warningSoft, padding: spacing.md },
  retainedErrorTitle: { ...typography.bodyStrong, color: colors.warning },
  retainedErrorText: { ...typography.caption, color: colors.textSecondary },
});
