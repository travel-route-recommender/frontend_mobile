import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { environment } from "../../../config/environment";
import { queryClient } from "../../../query/queryClient";
import { queryKeys } from "../../../query/keys";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getTripDates } from "../../../utils/schedule";
import { ScheduleDiffView } from "../components/ScheduleDiffView";
import { ScheduleSnapshot } from "../components/ScheduleSnapshot";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { SuggestionApplyConfirmModal } from "../components/SuggestionApplyConfirmModal";
import { SuggestionChangeCard } from "../components/SuggestionChangeCard";
import { buildDuriAnalysisInputWithDocuments } from "../logic/analysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../logic/analysisSnapshot";
import { createDuriSuggestionPreview } from "../logic/suggestionPreview";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";
import { useTripDocumentHydrationState, useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { buildConfirmedScheduleConstraintsFromDocuments, buildDuriDocumentReferencesFromDocuments } from "../../trip-documents";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { fetchApiTripDetail, type ApiTripDetailData } from "../../trips/tripRoomApi";
import { buildApiDuriAnalysisInput } from "../logic/apiAnalysisInput";
import {
  WorkspaceFactsVersionConflictError,
  WorkspaceScheduleVersionConflictError,
  workspaceScheduleApiGateway,
} from "../../workspace/services/workspaceScheduleApi";
import {
  createWorkspaceScheduleItemMetadataFromPlace,
  type WorkspaceScheduleItemMetadata,
  type WorkspaceScheduleSnapshot,
} from "../../workspace/services/workspaceScheduleContract";
import { saveApiWorkspaceOverlays } from "../../workspace/services/apiWorkspaceOverlayStorage";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];
const EMPTY_API_PLACES: ApiTripDetailData["placesById"] = {};
const EMPTY_API_CANDIDATES: ApiTripDetailData["candidates"] = [];

function buildApiProposalMetadata(
  snapshot: WorkspaceScheduleSnapshot,
  nextItinerary: ReturnType<typeof createDuriSuggestionPreview>["after"],
  placesById: ApiTripDetailData["placesById"],
) {
  const beforeById = new Map(snapshot.itinerary.map((item) => [item.id, item]));
  return Object.fromEntries(nextItinerary.map((item): [string, WorkspaceScheduleItemMetadata] => {
    const previous = beforeById.get(item.id);
    const metadata = snapshot.metadataByItemId[item.id];
    if (previous && metadata) {
      if (previous.placeId !== item.placeId) {
        throw new Error("같은 일정 ID에서 장소를 바꾸는 제안은 예약·티켓 오연결을 막기 위해 적용하지 않아요.");
      }
      return [item.id, {
        ...metadata,
        reason: item.note?.trim() ?? "",
        tags: [...metadata.tags],
        tickets: metadata.tickets.map((ticket) => ({ ...ticket })),
        ...(metadata.reservation ? {
          reservation: {
            ...metadata.reservation,
            documentTicketIds: [...metadata.reservation.documentTicketIds],
          },
        } : {}),
      }];
    }
    if (!item.placeId) throw new Error("서버에 새로 추가할 제안 일정에 장소 ID가 없어요.");
    const place = placesById[item.placeId];
    if (!place) throw new Error("서버에 새로 추가할 제안 장소 정보를 찾지 못했어요.");
    return [item.id, createWorkspaceScheduleItemMetadataFromPlace({
      itemId: item.id,
      place,
      reason: item.note,
      priority: "optional",
    })];
  }));
}

export function DuriSuggestionPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; suggestionId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const suggestionId = Array.isArray(params.suggestionId) ? params.suggestionId[0] : params.suggestionId ?? "";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  const reanalyze = () => router.replace({ pathname: "/trips/[tripId]/analysis", params: { tripId } });

  const apply = async () => {
    if (!envelope || !preview?.validation.valid || stale || feature.receipt || applying) return;
    if (!apiMode && !useTripDocumentHydrationState.getState().isHydrated) {
      setApplyError("첨부 문서와 예약 잠금 상태를 확인하지 못해 제안을 적용하지 않았어요.");
      return;
    }
    setApplying(true);
    setApplyError("");
    try {
      const latestDocuments = useTripDocumentHydrationState.getState().isHydrated
        ? useTripDocumentStore.getState().documentsByTripId[tripId] ?? []
        : [];
      if (apiMode) {
        const refreshed = await apiQuery.refetch();
        const latest = refreshed.data;
        if (refreshed.isError || !latest?.scheduleSnapshot || !latest.room.startDate || !latest.room.endDate) {
          throw new Error("최신 서버 일정과 분석 사실을 확인하지 못해 제안을 적용하지 않았어요.");
        }
        if (useAuthSessionStore.getState().currentSessionUserId !== authenticatedUserId) {
          throw new Error("적용 중 로그인 사용자가 바뀌어 제안을 적용하지 않았어요.");
        }
        const latestInput = buildApiDuriAnalysisInput(latest, authenticatedUserId, latestDocuments, "loaded");
        const latestFingerprint = latestInput
          ? createDuriInputFingerprint(createDuriAnalysisSnapshot(latestInput))
          : "";
        if (!latestInput || latestFingerprint !== envelope.baseFingerprint) {
          throw new Error("분석 이후 일정·예약·성향 사실이 변경됐어요. 최신 일정으로 다시 분석해 주세요.");
        }
        const nextItinerary = preview.after.map(({ order: _order, ...item }) => ({
          ...item,
          preferredByUserIds: [...item.preferredByUserIds],
        }));
        const metadataByItemId = buildApiProposalMetadata(latest.scheduleSnapshot, preview.after, latest.placesById);
        const saved = await workspaceScheduleApiGateway.applyProposal({
          roomId: tripId,
          tripId,
          startDate: latest.room.startDate,
          endDate: latest.room.endDate,
          snapshot: latest.scheduleSnapshot,
          itinerary: nextItinerary,
          metadataByItemId,
          expectedFactsVersion: latest.room.factsVersion,
        });
        try {
          await saveApiWorkspaceOverlays(authenticatedUserId, tripId, saved);
        } catch {
          // 서버의 원자 적용은 이미 성공했다. 기기 표시 보조정보 실패로 되돌리지 않는다.
        }
        queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, authenticatedUserId), {
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
          suggestionId: envelope.suggestion.id,
          tripId,
          appliedByUserId: authenticatedUserId,
          appliedAt: new Date().toISOString(),
          beforeFingerprint: envelope.baseFingerprint,
          afterFingerprint: `api-schedule:${tripId}:${saved.scheduleVersion}:facts:${latest.room.factsVersion}`,
          changedItemIds: preview.diff.filter((item) => item.kind !== "unchanged").map((item) => item.itemId),
          affectedDates: [...preview.affectedDates],
        });
        setConfirmOpen(false);
        router.replace({ pathname: "/trips/[tripId]/workspace", params: { tripId, duriApplied: "1", affectedDate: preview.affectedDates[0] ?? "" } });
        return;
      }
      const confirmedScheduleConstraints = buildConfirmedScheduleConstraintsFromDocuments(latestDocuments).constraints;
      const result = useDuriStore.getState().applyDuriSuggestionAtomically({
        tripId,
        envelope,
        expectedFingerprint: envelope.baseFingerprint,
        appliedByUserId: source.currentUserId,
        documentReferences: buildDuriDocumentReferencesFromDocuments(latestDocuments),
        confirmedScheduleConstraints,
      });
      if (!result.ok) {
        setApplyError(result.message);
        setConfirmOpen(false);
        return;
      }
      useDuriAnalysisStore.getState().recordReceipt(result.receipt);
      setConfirmOpen(false);
      router.replace({ pathname: "/trips/[tripId]/workspace", params: { tripId, duriApplied: "1", affectedDate: result.receipt.affectedDates[0] ?? "" } });
    } catch (error) {
      setConfirmOpen(false);
      setApplyError(error instanceof WorkspaceFactsVersionConflictError
        ? error.message
        : error instanceof WorkspaceScheduleVersionConflictError
          ? "다른 동행자가 일정을 먼저 수정했어요. 최신 일정으로 다시 분석해 주세요."
          : error instanceof Error
            ? error.message
            : "제안 적용 결과를 확인하지 못했어요. 최신 서버 일정을 확인해 주세요.");
    } finally {
      setApplying(false);
    }
  };

  if (apiMode && !authenticatedUserId) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (apiMode && apiQuery.isLoading) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><LoadingState label="최신 서버 일정과 분석 사실을 불러오고 있어요." /></Screen>;
  if (apiMode && (apiQuery.error || !apiQuery.data)) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message={apiQuery.error instanceof Error ? apiQuery.error.message : "서버 여행방을 불러오지 못했어요."} onRetry={() => void apiQuery.refetch()} /></Screen>;
  if (!apiMode && !documentsHydrated && !documentHydrationError) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><LoadingState label="첨부 문서와 예약 잠금 상태를 확인하고 있어요." /></Screen>;
  if (!apiMode && documentHydrationError) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message="첨부 문서와 예약 잠금 상태를 불러오지 못해 제안을 안전하게 적용할 수 없어요." onRetry={reanalyze} /></Screen>;
  if (!trip || !envelope || !feature.session || !preview) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message="이 제안은 현재 분석 세션에서 찾을 수 없어요. 분석 리포트에서 다시 생성해 주세요." onRetry={reanalyze} /></Screen>;
  const actingUserId = apiMode ? authenticatedUserId : source.currentUserId;
  if (!trip.members.some((member) => member.userId === actingUserId)) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message="이 여행방의 제안을 볼 권한이 없어요." /></Screen>;

  const canEdit = trip.status !== "completed" && trip.members.some((member) => member.userId === actingUserId);
  const disabledReason = feature.receipt
    ? "이미 적용한 제안이에요."
    : stale
      ? "현재 일정과 제안 fingerprint가 달라요."
      : !envelope.suggestion.canApply
        ? envelope.suggestion.unavailableReason ?? "검토 전용 제안이라 자동 적용할 수 없어요."
      : !preview.validation.valid
        ? preview.validation.message
        : !canEdit
          ? "이 여행방을 편집할 권한이 없어요."
          : "";

  return <Screen testID="duri-suggestion-preview-screen">
    <AppHeader title="제안 미리보기" subtitle="적용 전 변경 내용을 확인하세요" onBack={() => router.back()} />
    <Card style={styles.hero}><Text style={styles.eyebrow}>DURI SUGGESTION</Text><Text style={styles.title}>{envelope.suggestion.title}</Text><Text style={styles.summary}>{envelope.suggestion.summary}</Text><Text style={styles.reason}>{envelope.suggestion.reason}</Text></Card>

    {stale || feature.receipt ? <StaleSuggestionNotice onReanalyze={reanalyze} /> : null}
    {applyError ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>제안을 적용하지 않았어요</Text><Text style={styles.errorText}>{applyError}</Text></View> : null}
    {!preview.validation.valid ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>미리보기를 만들 수 없어요</Text><Text style={styles.errorText}>{preview.validation.message}</Text></View> : null}

    <View style={styles.section}><Text style={styles.sectionTitle}>변경 요약</Text>{envelope.suggestion.changes.map((change, index) => <SuggestionChangeCard key={`${change.itemId ?? "change"}-${index}`} change={change} placesById={feature.session?.snapshot.placesById ?? placesById} />)}</View>

    <ScheduleSnapshot label="변경 전 일정" items={preview.before} placesById={feature.session.snapshot.placesById} startDate={trip.startDate} endDate={trip.endDate} />
    <ScheduleSnapshot label="변경 후 예상 일정" items={preview.after} placesById={feature.session.snapshot.placesById} startDate={trip.startDate} endDate={trip.endDate} />
    <ScheduleDiffView diff={preview.diff} />

    <View style={styles.section}><Text style={styles.sectionTitle}>계산 가능한 기대 효과</Text>{preview.impact.metrics.length ? preview.impact.metrics.map((metric) => <View key={metric.id} style={styles.impact}><Text style={styles.impactLabel}>{metric.label}</Text><Text style={styles.impactValue}>{metric.before}{metric.unit} → {metric.after}{metric.unit}</Text></View>) : <Text style={styles.noImpact}>시간 충돌·날짜별 개수·공동 후보 배치에서 달라지는 수치가 없어요. 계산하지 않은 만족도나 이동시간 효과는 표시하지 않아요.</Text>}</View>

    <View style={styles.notice}><Text style={styles.noticeTitle}>적용 전 확인</Text><Text style={styles.noticeText}>{apiMode ? "현재 서버 일정·factsVersion·잠금·확정 예약을 다시 대조하고, 검증이 성공할 때만 schedule/apply로 원자 저장해요." : "현재 분석 입력·일정·잠금·사용자 확정 사실을 다시 대조하고, 전체 validation이 성공한 경우에만 일정 Store를 한 번 갱신해요."} 분석 당시의 외부 경로·운영정보를 다시 조회한다는 의미는 아니며, 사용자 잠금·확정 예약·연결 문서는 자동으로 해제하지 않아요.</Text></View>
    {disabledReason ? <Text accessibilityRole="alert" style={styles.disabledReason}>적용 불가 · {disabledReason}</Text> : null}
    <PrimaryButton label="제안 적용 확인" disabled={Boolean(disabledReason)} onPress={() => setConfirmOpen(true)} />
    <SecondaryButton label="취소하고 리포트로" onPress={() => router.back()} />

    <SuggestionApplyConfirmModal visible={confirmOpen} title={envelope.suggestion.title} affectedDates={preview.affectedDates} loading={applying} onCancel={() => { if (!applying) setConfirmOpen(false); }} onConfirm={apply} />
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs, backgroundColor: "#F8FBFF" },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.title, color: colors.text },
  summary: { ...typography.body, color: colors.textSecondary },
  reason: { ...typography.caption, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  impact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  impactLabel: { flex: 1, ...typography.bodyStrong, color: colors.text },
  impactValue: { ...typography.bodyStrong, color: colors.primary },
  noImpact: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  notice: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: spacing.md },
  noticeTitle: { ...typography.bodyStrong, color: colors.primary },
  noticeText: { ...typography.caption, color: colors.textSecondary },
  error: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorTitle: { ...typography.bodyStrong, color: colors.danger },
  errorText: { ...typography.caption, color: colors.textSecondary },
  disabledReason: { ...typography.caption, color: colors.warning, textAlign: "center" },
});
