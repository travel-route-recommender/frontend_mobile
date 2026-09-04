import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { BackHandler, Platform, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, PrimaryButton, SecondaryButton } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { environment } from "../../../config/environment";
import { queryClient } from "../../../query/queryClient";
import { queryKeys } from "../../../query/keys";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getTripDates } from "../../../utils/schedule";
import { DuriScrollPage, DuriStickyPage } from "../components/DuriPageShell";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { SuggestionApplyConfirmModal } from "../components/SuggestionApplyConfirmModal";
import { DuriSuggestionPreviewContent } from "../components/DuriSuggestionPreviewContent";
import { buildDuriAnalysisInputWithDocuments } from "../logic/analysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../logic/analysisSnapshot";
import { createDuriSuggestionPreview } from "../logic/suggestionPreview";
import { buildApiProposalMetadata } from "../logic/apiProposalMetadata";
import { apiScheduleMatchesProposal, restoreProposalLocalOverlays } from "../logic/apiApplyReconciliation";
import { createAbortableRequestGate, isSameDuriRequestScope } from "../logic/abortableRequestGate";
import { resolveDuriBackAction } from "../logic/duriNavigation";
import { getSuggestionIssueTitles } from "../presentation/duriPresentation";
import { plainDuriUserText } from "../presentation/plainDuriUserText";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";
import { useTripDocumentHydrationState, useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { buildConfirmedScheduleConstraintsFromDocuments, buildDuriDocumentReferencesFromDocuments } from "../../trip-documents";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { fetchApiTripDetail, type ApiTripDetailData } from "../../trips/tripRoomApi";
import { buildApiDuriAnalysisInput } from "../logic/apiAnalysisInput";
import {
  ScheduleReservationPlaceReplacementUnsupportedError,
  ScheduleTicketPlaceReplacementUnsupportedError,
  ScheduleTicketRemovalConfirmationRequiredError,
  WorkspaceFactsVersionConflictError,
  WorkspaceScheduleIdentityError,
  WorkspaceScheduleProtectedItemError,
  WorkspaceScheduleScopeMismatchError,
  WorkspaceScheduleVersionConflictError,
  workspaceScheduleApiGateway,
} from "../../workspace/services/workspaceScheduleApi";
import { WorkspaceScheduleContractError } from "../../workspace/services/workspaceScheduleContract";
import { saveApiWorkspaceOverlays } from "../../workspace/services/apiWorkspaceOverlayStorage";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];
const EMPTY_API_PLACES: ApiTripDetailData["placesById"] = {};
const EMPTY_API_CANDIDATES: ApiTripDetailData["candidates"] = [];

export function DuriSuggestionPreviewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ tripId?: string | string[]; suggestionId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const suggestionId = Array.isArray(params.suggestionId) ? params.suggestionId[0] : params.suggestionId ?? "";
  const applyRequestGate = useMemo(() => createAbortableRequestGate(), []);
  const mountedRef = useRef(false);
  const focusedRef = useRef(false);
  const returnFromDuri = useCallback(() => {
    if (applyRequestGate.isActive()) return;
    const action = resolveDuriBackAction(router.canGoBack(), tripId);
    if (action.type === "back") router.back();
    else router.replace(action.href);
  }, [applyRequestGate, router, tripId]);

  const apiMode = environment.dataSource === "api";
  const authenticatedUserId = useAuthSessionStore((state) => state.currentSessionUserId) ?? "";
  const apiQuery = useQuery({
    queryKey: queryKeys.trips.detail(tripId, authenticatedUserId),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, authenticatedUserId, signal),
    enabled: apiMode && Boolean(tripId && authenticatedUserId),
  });
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
    receipt: state.receiptsBySuggestionId[suggestionId],
  })));
  const envelope = feature.suggestions?.find((entry) => entry.suggestion.id === suggestionId);
  const tripDocuments = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS);
  const documentsHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const documentHydrationError = useTripDocumentHydrationState((state) => state.hydrationError);
  const currentInput = useMemo(() => apiMode
    ? buildApiDuriAnalysisInput(
        apiQuery.data,
        authenticatedUserId,
        documentsHydrated ? tripDocuments : EMPTY_TRAVEL_DOCUMENTS,
        documentsHydrated ? "loaded" : "unavailable",
      )
    : documentsHydrated
      ? buildDuriAnalysisInputWithDocuments(source, tripId, tripDocuments, [], "loaded")
      : undefined,
  [apiMode, apiQuery.data, authenticatedUserId, documentsHydrated, source, tripDocuments, tripId]);
  const trip = apiMode ? currentInput?.trip : source.tripsById[tripId];
  const placesById = useMemo(
    () => apiMode ? apiQuery.data?.placesById ?? EMPTY_API_PLACES : source.placesById,
    [apiMode, apiQuery.data?.placesById, source.placesById],
  );
  const candidates = useMemo(
    () => apiMode ? apiQuery.data?.candidates ?? EMPTY_API_CANDIDATES : source.candidatesByTripId[tripId] ?? EMPTY_API_CANDIDATES,
    [apiMode, apiQuery.data?.candidates, source.candidatesByTripId, tripId],
  );
  const currentFingerprint = useMemo(() => currentInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(currentInput)) : "", [currentInput]);
  const stale = Boolean(envelope && envelope.baseFingerprint !== currentFingerprint);
  const preview = useMemo(() => envelope && trip ? createDuriSuggestionPreview({
    envelope,
    tripDates: getTripDates(trip.startDate, trip.endDate),
    placesById: feature.session?.snapshot.placesById ?? placesById,
    candidates: feature.session?.snapshot.candidates ?? candidates,
    trip,
    protectionInput: currentInput,
  }) : undefined, [candidates, currentInput, envelope, feature.session, placesById, trip]);
  const applyUserId = apiMode ? authenticatedUserId : source.currentUserId;
  const applyScopeKey = `${tripId}:${applyUserId}`;
  const applyScopeRef = useRef({ tripId, userId: applyUserId });
  const [confirmScopeKey, setConfirmScopeKey] = useState("");
  const [applyingScopeKey, setApplyingScopeKey] = useState("");
  const [applyFailure, setApplyFailure] = useState<{ scopeKey: string; message: string }>();
  const [verificationRequiredScopeKey, setVerificationRequiredScopeKey] = useState("");
  const confirmOpen = confirmScopeKey === applyScopeKey;
  const applying = applyingScopeKey === applyScopeKey;
  const applyError = applyFailure?.scopeKey === applyScopeKey ? applyFailure.message : "";
  const verificationRequired = verificationRequiredScopeKey === applyScopeKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      applyRequestGate.cancel();
    };
  }, [applyRequestGate]);

  useLayoutEffect(() => {
    // 같은 화면 인스턴스가 다른 방이나 사용자로 바뀌면 이전 응답은 더 이상
    // 캐시·영수증·내비게이션을 갱신할 수 없다.
    applyScopeRef.current = { tripId, userId: applyUserId };
    applyRequestGate.cancel();
    return () => applyRequestGate.cancel();
  }, [applyRequestGate, applyUserId, tripId]);

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (!applyRequestGate.isActive()) return;
    if (apiMode && useAuthSessionStore.getState().currentSessionUserId !== applyScopeRef.current.userId) {
      applyRequestGate.cancel();
      return;
    }
    event.preventDefault();
  }), [apiMode, applyRequestGate, navigation]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    const subscription = Platform.OS === "android"
      ? BackHandler.addEventListener("hardwareBackPress", () => {
          returnFromDuri();
          return true;
        })
      : undefined;
    return () => {
      focusedRef.current = false;
      subscription?.remove();
    };
  }, [returnFromDuri]));

  const reanalyze = () => router.replace({ pathname: "/trips/[tripId]/analysis", params: { tripId } });

  const apply = async () => {
    if (!envelope || !preview?.validation.valid || stale || feature.receipt) return;
    if (!apiMode && !useTripDocumentHydrationState.getState().isHydrated) {
      setApplyFailure({ scopeKey: applyScopeKey, message: "첨부 문서와 예약 잠금 상태를 확인하지 못해 제안을 적용하지 않았어요." });
      return;
    }
    const controller = applyRequestGate.begin();
    if (!controller) return;
    const requestedScope = { ...applyScopeRef.current };
    const requestedScopeKey = `${requestedScope.tripId}:${requestedScope.userId}`;
    const requestedEnvelope = envelope;
    const requestedPreview = preview;
    const requestIsCurrent = () => applyRequestGate.isCurrent(controller)
      && mountedRef.current
      && isSameDuriRequestScope(applyScopeRef.current, requestedScope)
      && (!apiMode || useAuthSessionStore.getState().currentSessionUserId === requestedScope.userId);
    const unsubscribeAuth = apiMode
      ? useAuthSessionStore.subscribe((state) => {
          if (state.currentSessionUserId !== requestedScope.userId) controller.abort();
        })
      : undefined;
    setApplyingScopeKey(requestedScopeKey);
    setApplyFailure(undefined);
    setVerificationRequiredScopeKey("");
    let attemptedApiApply: {
      latest: ApiTripDetailData;
      itinerary: NonNullable<ApiTripDetailData["scheduleSnapshot"]>["itinerary"];
      metadataByItemId: NonNullable<ApiTripDetailData["scheduleSnapshot"]>["metadataByItemId"];
    } | undefined;

    const finishAndOpenWorkspace = (affectedDate: string) => {
      if (!requestIsCurrent()) return false;
      setConfirmScopeKey("");
      const owned = applyRequestGate.finish(controller);
      if (!owned) return false;
      if (mountedRef.current && isSameDuriRequestScope(applyScopeRef.current, requestedScope)) {
        setApplyingScopeKey("");
      }
      if (focusedRef.current) {
        router.replace({
          pathname: "/trips/[tripId]/workspace",
          params: { tripId: requestedScope.tripId, duriApplied: "1", affectedDate },
        });
      }
      return true;
    };

    const publishApiApply = async (latest: ApiTripDetailData, saved: NonNullable<ApiTripDetailData["scheduleSnapshot"]>) => {
      if (!requestIsCurrent()) return false;
      try {
        await saveApiWorkspaceOverlays(requestedScope.userId, requestedScope.tripId, saved);
      } catch {
        // 서버의 원자 적용은 이미 성공했다. 기기 표시 보조정보 실패로 되돌리지 않는다.
      }
      if (!requestIsCurrent()) return false;
      queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(requestedScope.tripId, requestedScope.userId), {
        ...latest,
        itinerary: saved.itinerary,
        scheduleSnapshot: saved,
        room: {
          ...latest.room,
          scheduleVersion: saved.scheduleVersion,
          scheduleItemCount: saved.itinerary.length,
        },
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      useDuriAnalysisStore.getState().recordReceipt({
        suggestionId: requestedEnvelope.suggestion.id,
        tripId: requestedScope.tripId,
        appliedByUserId: requestedScope.userId,
        appliedAt: new Date().toISOString(),
        beforeFingerprint: requestedEnvelope.baseFingerprint,
        afterFingerprint: `api-schedule:${requestedScope.tripId}:${saved.scheduleVersion}:facts:${latest.room.factsVersion}`,
        changedItemIds: requestedPreview.diff.filter((item) => item.kind !== "unchanged").map((item) => item.itemId),
        affectedDates: [...requestedPreview.affectedDates],
      });
      setVerificationRequiredScopeKey("");
      return finishAndOpenWorkspace(requestedPreview.affectedDates[0] ?? "");
    };

    try {
      if (apiMode) {
        const latest = await fetchApiTripDetail(requestedScope.tripId, requestedScope.userId, controller.signal);
        if (!requestIsCurrent()) return;
        if (!latest.scheduleSnapshot || !latest.room.startDate || !latest.room.endDate) {
          throw new Error("최신 일정과 분석 근거를 확인하지 못해 제안을 적용하지 않았어요.");
        }
        const documentHydration = useTripDocumentHydrationState.getState();
        const latestDocuments = documentHydration.isHydrated
          ? useTripDocumentStore.getState().documentsByTripId[requestedScope.tripId] ?? []
          : [];
        const latestInput = buildApiDuriAnalysisInput(
          latest,
          requestedScope.userId,
          latestDocuments,
          documentHydration.isHydrated ? "loaded" : "unavailable",
        );
        const latestFingerprint = latestInput
          ? createDuriInputFingerprint(createDuriAnalysisSnapshot(latestInput))
          : "";
        if (!latestInput || latestFingerprint !== requestedEnvelope.baseFingerprint) {
          throw new Error("분석 이후 일정·예약·성향 사실이 변경됐어요. 최신 일정으로 다시 분석해 주세요.");
        }
        const nextItinerary = requestedPreview.after.map(({ order: _order, ...item }) => ({
          ...item,
          preferredByUserIds: [...item.preferredByUserIds],
        }));
        const metadataByItemId = buildApiProposalMetadata(latest.scheduleSnapshot, requestedPreview.after, latest.placesById);
        attemptedApiApply = { latest, itinerary: nextItinerary, metadataByItemId };
        if (!requestIsCurrent()) return;
        const saved = await workspaceScheduleApiGateway.applyProposal({
          roomId: requestedScope.tripId,
          tripId: requestedScope.tripId,
          startDate: latest.room.startDate,
          endDate: latest.room.endDate,
          snapshot: latest.scheduleSnapshot,
          itinerary: nextItinerary,
          metadataByItemId,
          expectedFactsVersion: latest.room.factsVersion,
          signal: controller.signal,
        });
        await publishApiApply(latest, saved);
        return;
      }
      if (!requestIsCurrent()) return;
      const latestDocuments = useTripDocumentStore.getState().documentsByTripId[requestedScope.tripId] ?? [];
      const confirmedScheduleConstraints = buildConfirmedScheduleConstraintsFromDocuments(latestDocuments).constraints;
      const result = useDuriStore.getState().applyDuriSuggestionAtomically({
        tripId: requestedScope.tripId,
        envelope: requestedEnvelope,
        expectedFingerprint: requestedEnvelope.baseFingerprint,
        appliedByUserId: requestedScope.userId,
        documentReferences: buildDuriDocumentReferencesFromDocuments(latestDocuments),
        confirmedScheduleConstraints,
      });
      if (!result.ok) {
        setApplyFailure({ scopeKey: requestedScopeKey, message: result.message });
        setConfirmScopeKey("");
        return;
      }
      useDuriAnalysisStore.getState().recordReceipt(result.receipt);
      finishAndOpenWorkspace(result.receipt.affectedDates[0] ?? "");
    } catch (error) {
      if (controller.signal.aborted || !requestIsCurrent()) return;
      setConfirmScopeKey("");
      const deterministicMessage = error instanceof WorkspaceFactsVersionConflictError
        ? error.message
        : error instanceof WorkspaceScheduleProtectedItemError
          ? "잠금·예약·티켓으로 보호된 일정이 변경되어 제안을 적용하지 않았어요. 최신 일정으로 다시 분석해 주세요."
        : error instanceof WorkspaceScheduleVersionConflictError
          ? "다른 동행자가 일정을 먼저 수정했어요. 최신 일정으로 다시 분석해 주세요."
        : error instanceof ScheduleTicketRemovalConfirmationRequiredError
          || error instanceof ScheduleTicketPlaceReplacementUnsupportedError
          || error instanceof ScheduleReservationPlaceReplacementUnsupportedError
          || error instanceof WorkspaceScheduleScopeMismatchError
          || error instanceof WorkspaceScheduleIdentityError
          ? error.message
        : error instanceof WorkspaceScheduleContractError
          ? "일정 형식을 안전하게 저장할 수 없어 변경하지 않았어요. 최신 일정을 확인한 뒤 다시 시도해 주세요."
          : undefined;
      if (deterministicMessage) {
        setApplyFailure({ scopeKey: requestedScopeKey, message: deterministicMessage });
        return;
      }
      if (apiMode && attemptedApiApply) {
        try {
          const refreshed = await fetchApiTripDetail(requestedScope.tripId, requestedScope.userId, controller.signal);
          if (!requestIsCurrent()) return;
          if (refreshed.scheduleSnapshot && apiScheduleMatchesProposal(refreshed.scheduleSnapshot, attemptedApiApply)) {
            const recovered = restoreProposalLocalOverlays(refreshed.scheduleSnapshot, attemptedApiApply.itinerary);
            await publishApiApply(refreshed, recovered);
            return;
          }
          queryClient.setQueryData<ApiTripDetailData>(
            queryKeys.trips.detail(requestedScope.tripId, requestedScope.userId),
            refreshed,
          );
          void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
        } catch {
          if (controller.signal.aborted || !requestIsCurrent()) return;
        }
        setVerificationRequiredScopeKey(requestedScopeKey);
        setApplyFailure({
          scopeKey: requestedScopeKey,
          message: "일정 저장 결과를 확정하지 못했어요. 중복 변경을 막기 위해 최신 일정으로 다시 점검한 뒤 적용해 주세요.",
        });
        return;
      }
      setApplyFailure({
        scopeKey: requestedScopeKey,
        message: plainDuriUserText(toUserFacingApiErrorMessage(
          error,
          "제안을 적용하지 못했어요. 잠시 후 다시 시도해 주세요.",
        )),
      });
    } finally {
      unsubscribeAuth?.();
      const shouldUpdate = mountedRef.current
        && isSameDuriRequestScope(applyScopeRef.current, requestedScope);
      const owned = applyRequestGate.finish(controller);
      if (owned && shouldUpdate) setApplyingScopeKey("");
    }
  };

  if (apiMode && !authenticatedUserId) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></DuriScrollPage>;
  if (apiMode && apiQuery.isLoading) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><LoadingState label="최신 일정과 예약 상태를 불러오고 있어요." /></DuriScrollPage>;
  if (apiMode && (apiQuery.error || !apiQuery.data)) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><ErrorState message={toUserFacingApiErrorMessage(apiQuery.error, "여행방을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")} onRetry={() => void apiQuery.refetch()} /></DuriScrollPage>;
  if (!apiMode && !documentsHydrated && !documentHydrationError) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><LoadingState label="첨부 문서와 예약 잠금 상태를 확인하고 있어요." /></DuriScrollPage>;
  if (!apiMode && documentHydrationError) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><ErrorState message="첨부 문서와 예약 잠금 상태를 불러오지 못해 제안을 안전하게 적용할 수 없어요." onRetry={reanalyze} /></DuriScrollPage>;
  if (!trip || !envelope || !feature.session || !preview) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><ErrorState message="이 제안은 현재 점검 결과에서 찾을 수 없어요. DURI 일정 점검에서 다시 만들어 주세요." onRetry={reanalyze} /></DuriScrollPage>;
  const actingUserId = apiMode ? authenticatedUserId : source.currentUserId;
  if (!trip.members.some((member) => member.userId === actingUserId)) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={returnFromDuri} /><ErrorState message="이 여행방의 제안을 볼 권한이 없어요." /></DuriScrollPage>;

  const canEdit = trip.status !== "completed" && trip.members.some((member) => member.userId === actingUserId);
  const disabledReason = feature.receipt
    ? "이미 적용한 제안이에요."
    : verificationRequired
      ? "최신 일정으로 다시 점검한 뒤 적용해 주세요."
    : stale
      ? "일정이 변경되어 제안을 다시 확인해야 해요."
      : !envelope.suggestion.canApply
        ? envelope.suggestion.unavailableReason ?? "검토 전용 제안이라 자동 적용할 수 없어요."
      : !preview.validation.valid
        ? preview.validation.message
        : !canEdit
          ? "완료된 여행에서는 제안을 볼 수 있지만 적용할 수 없어요."
          : "";
  const suggestionIndex = Math.max((feature.suggestions?.findIndex((entry) => entry.suggestion.id === suggestionId) ?? 0) + 1, 1);
  const suggestionCount = feature.suggestions?.length ?? 1;
  const sourceIssueTitles = getSuggestionIssueTitles(feature.session, envelope.suggestion.sourceIssueIds);
  const footer = <>
    {disabledReason ? <Text accessibilityRole="alert" style={styles.disabledReason}>적용 불가 · {disabledReason}</Text> : <Text style={styles.footerScope}>{envelope.suggestion.changes.length > 1 ? `${envelope.suggestion.changes.length}개 변경을 모두 한 번에 적용해요.` : "확인한 변경 1개를 일정에 적용해요."}</Text>}
    <View style={styles.footerActions}><View style={styles.footerButton}><SecondaryButton label="적용하지 않기" disabled={applying} onPress={returnFromDuri} /></View><View style={styles.footerButton}><PrimaryButton label="일정에 적용" loading={applying} disabled={Boolean(disabledReason)} onPress={() => setConfirmScopeKey(applyScopeKey)} /></View></View>
  </>;

  return <DuriStickyPage testID="duri-suggestion-preview-screen" footer={footer}>
    <AppHeader title="개선 제안 미리보기" subtitle={`제안 ${suggestionIndex}/${suggestionCount}`} onBack={returnFromDuri} />

    {stale ? <StaleSuggestionNotice onReanalyze={reanalyze} /> : null}
    {feature.receipt ? <View accessibilityRole="alert" style={styles.applied}><Text style={styles.appliedTitle}>이미 일정에 적용한 제안이에요</Text><Text style={styles.appliedText}>현재 일정에서 최신 결과를 다시 점검해 주세요.</Text></View> : null}
    {applyError ? <View accessibilityRole="alert" style={styles.error}>
      <Text style={styles.errorTitle}>{verificationRequired ? "최신 일정 확인이 필요해요" : "제안을 적용하지 않았어요"}</Text>
      <Text style={styles.errorText}>{applyError}</Text>
      {verificationRequired ? <SecondaryButton label="최신 일정으로 다시 점검" onPress={reanalyze} /> : null}
    </View> : null}
    {!preview.validation.valid ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>현재 일정에는 적용할 수 없어요</Text><Text style={styles.errorText}>{preview.validation.message}</Text></View> : null}

    <DuriSuggestionPreviewContent suggestion={envelope.suggestion} preview={preview} session={feature.session} trip={trip} placesById={feature.session.snapshot.placesById ?? placesById} sourceIssueTitles={sourceIssueTitles} />

    <SuggestionApplyConfirmModal visible={confirmOpen} title={envelope.suggestion.title} affectedDates={preview.affectedDates} changeCount={envelope.suggestion.changes.length} reviewWarnings={envelope.suggestion.reviewWarnings} loading={applying} onCancel={() => { if (!applying) setConfirmScopeKey(""); }} onConfirm={apply} />
  </DuriStickyPage>;
}

const styles = StyleSheet.create({
  error: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorTitle: { ...typography.bodyStrong, color: colors.danger },
  errorText: { ...typography.caption, color: colors.textSecondary },
  applied: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.successSoft, padding: spacing.md },
  appliedTitle: { ...typography.bodyStrong, color: colors.success },
  appliedText: { ...typography.caption, color: colors.textSecondary },
  footerScope: { fontSize: 10, lineHeight: 15, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  disabledReason: { ...typography.caption, color: colors.warning, textAlign: "center" },
  footerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerButton: { flex: 1, minWidth: 0 },
});
