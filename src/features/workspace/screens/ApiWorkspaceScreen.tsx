import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader, Screen } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import type { ItineraryItem, TripRoom } from "../../../domain";
import { queryClient } from "../../../query/queryClient";
import { queryKeys } from "../../../query/keys";
import { ApiError, apiClient } from "../../../services/apiClient";
import type {
  ItineraryMutationResult,
  TripPlanningFactsMutationResult,
  UpdateTripPlanningFactsInput,
} from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { DuriAnalysisEntryCard } from "../../duri/components/DuriAnalysisEntryCard";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { saveApiTripLocalFacts } from "../../trip-creation/services/apiTripFactsStorage";
import { fetchApiTripDetail, type ApiTripDetailData } from "../../trips/tripRoomApi";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import { CandidateBoard } from "../components/CandidateBoard";
import { ApiScheduleTicketManager } from "../components/ApiScheduleTicketManager";
import { WorkspaceBoardSheet } from "../components/WorkspaceBoardSheet";
import { WorkspaceDateTabs } from "../components/WorkspaceDateTabs";
import { WorkspaceDayPager } from "../components/WorkspaceDayPager";
import {
  ConfirmationModal,
  ScheduleEditorModal,
  SelectCandidateModal,
  WorkspaceFeedbackBanner,
  WorkspaceTripFactsModal,
  type ScheduleEditorValue,
  type WorkspaceTripFactsDraft,
} from "../components/WorkspaceEditorModals";
import { WorkspaceScheduleGrid } from "../components/WorkspaceScheduleGrid";
import { canRemoveCandidate } from "../logic/workspaceCapabilities";
import { WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX } from "../logic/workspaceBoardLayout";
import {
  prepareApiWorkspaceScheduleAddition,
  prepareApiWorkspaceScheduleRemoval,
  prepareApiWorkspaceScheduleUpdate,
  type ApiWorkspaceScheduleDraft,
} from "../logic/apiWorkspaceScheduleState";
import { getDefaultScheduleRange, getItineraryEndTime } from "../logic/workspaceDateTime";
import { analyzeTripEndCondition, buildTripEndConditionTimelineEntry } from "../logic/tripEndCondition";
import { resolveWorkspaceBackAction } from "../logic/workspaceNavigation";
import {
  buildCandidatePlaceViewModels,
  buildItineraryItemViewModels,
  buildWorkspaceViewModel,
  filterCandidatePlaceViewModels,
  type WorkspaceSelectorState,
} from "../selectors/workspaceSelectors";
import { saveApiWorkspaceOverlays } from "../services/apiWorkspaceOverlayStorage";
import { deleteScheduleTicket, pickAndUploadScheduleTicket } from "../services/workspaceScheduleTicketApi";
import {
  ScheduleTicketPlaceReplacementUnsupportedError,
  ScheduleTicketRemovalConfirmationRequiredError,
  WorkspaceScheduleVersionConflictError,
  workspaceScheduleApiGateway,
} from "../services/workspaceScheduleApi";
import type { BackendScheduleTicket, WorkspaceScheduleSnapshot } from "../services/workspaceScheduleContract";
import type { CandidateBoardFilter, CandidatePlaceViewModel, WorkspaceFeedback } from "../types";

type EditorState =
  | { mode: "add"; placeId: string; initialValue: ScheduleEditorValue }
  | { mode: "edit"; itemId: string; initialValue: ScheduleEditorValue };

type PendingTicketRemoval = {
  itemId: string;
  placeName: string;
  ticketCount: number;
  draft: ApiWorkspaceScheduleDraft;
};

function mutationMessage(result: string) {
  if (result === "trip-not-editable") return "완료된 여행방은 수정할 수 없어요.";
  if (result === "not-member") return "이 여행방의 일정을 수정할 권한이 없어요.";
  if (result === "overlap") return "다른 일정과 시간이 겹쳐 저장하지 않았어요.";
  if (result === "invalid-date") return "여행 기간 안의 날짜를 선택해 주세요.";
  if (result === "invalid-time") return "서버 일정은 00:00부터 23:59 사이의 1분 단위 시간만 저장할 수 있어요.";
  if (result === "end-condition") return "복귀 조건을 지킬 수 없는 시간이어서 저장하지 않았어요.";
  if (result === "scheduled") return "일정에 배치된 후보예요. 먼저 모든 일정에서 제거해 주세요.";
  if (result === "boundary") return "이 방향으로는 더 이동할 수 없어요.";
  return "요청을 처리하지 못했어요. 최신 일정을 다시 확인해 주세요.";
}

function buildDomainTrip(data: ApiTripDetailData, localFacts: ApiTripDetailData["localFacts"]): TripRoom {
  return {
    id: data.room.id,
    title: data.room.title,
    regionId: data.region.id,
    startDate: data.room.startDate,
    endDate: data.room.endDate,
    dateUndecided: !data.room.startDate || !data.room.endDate,
    status: data.room.status,
    transport: localFacts?.transport ?? "public",
    accommodationLocation: localFacts?.accommodationLocation ?? null,
    endCondition: localFacts?.endCondition ?? null,
    companionType: localFacts?.companionType ?? null,
    expectedMemberCount: localFacts?.expectedMemberCount ?? null,
    members: data.room.members.map((member) => ({ userId: member.userId, role: member.role })),
  };
}

function cloneSnapshot(snapshot: WorkspaceScheduleSnapshot, draft: ApiWorkspaceScheduleDraft): WorkspaceScheduleSnapshot {
  return {
    ...snapshot,
    itinerary: draft.itinerary.map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] })),
    metadataByItemId: Object.fromEntries(Object.entries(draft.metadataByItemId).map(([itemId, metadata]) => [itemId, {
      ...metadata,
      tags: [...metadata.tags],
      tickets: metadata.tickets.map((ticket) => ({ ...ticket })),
    }])),
  };
}

export function ApiWorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; affectedDate?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const affectedDate = Array.isArray(params.affectedDate) ? params.affectedDate[0] : params.affectedDate ?? "";
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const currentUserId = useAuthSessionStore((state) => state.currentSessionUserId) ?? "";
  const startTripExplore = useExploreSearchStore((state) => state.startTripExplore);
  const syncActiveTripRegion = useExploreSearchStore((state) => state.syncActiveTripRegion);
  const returnFromWorkspace = useCallback(() => {
    const action = resolveWorkspaceBackAction(router.canGoBack(), tripId);
    if (action.type === "back") router.back();
    else router.replace(action.href);
  }, [router, tripId]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      returnFromWorkspace();
      return true;
    });
    return () => subscription.remove();
  }, [returnFromWorkspace]));

  const query = useQuery({
    queryKey: queryKeys.trips.detail(tripId),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, currentUserId, signal),
    enabled: Boolean(tripId && currentUserId),
  });
  const [snapshot, setSnapshot] = useState<WorkspaceScheduleSnapshot>();
  const [localFactsOverride, setLocalFactsOverride] = useState<{
    tripId: string;
    value: ApiTripDetailData["localFacts"];
  }>();
  const [requestedDate, setRequestedDate] = useState(affectedDate);
  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [candidateFilter, setCandidateFilter] = useState<CandidateBoardFilter>("all");
  const [selectCandidateOpen, setSelectCandidateOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [removeItemId, setRemoveItemId] = useState<string>();
  const [removeCandidateId, setRemoveCandidateId] = useState<string>();
  const [pendingTicketRemoval, setPendingTicketRemoval] = useState<PendingTicketRemoval>();
  const [tripFactsEditorOpen, setTripFactsEditorOpen] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [feedback, setFeedback] = useState<WorkspaceFeedback>({ message: "" });

  if (!currentUserId) return <Screen><AppHeader title="여행 워크스페이스" onBack={returnFromWorkspace} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (query.isLoading) return <Screen><AppHeader title="여행 워크스페이스" onBack={returnFromWorkspace} /><LoadingState label="서버 후보와 일정을 불러오고 있어요." /></Screen>;
  if (query.error || !query.data) return <Screen><AppHeader title="여행 워크스페이스" onBack={returnFromWorkspace} /><ErrorState message={query.error instanceof Error ? query.error.message : "서버 워크스페이스를 불러오지 못했어요."} onRetry={() => void query.refetch()} /></Screen>;
  const data = query.data;
  const activeSnapshot = snapshot?.scope.roomId === tripId
    && snapshot.scope.tripId === tripId
    && snapshot.scope.startDate === data.room.startDate
    && snapshot.scope.endDate === data.room.endDate
    && (saving || snapshot.scheduleVersion > (data.scheduleSnapshot?.scheduleVersion ?? -1))
    ? snapshot
    : data.scheduleSnapshot;
  if (!data.room.startDate || !data.room.endDate || !activeSnapshot) {
    return <Screen><AppHeader title={data.room.title} onBack={returnFromWorkspace} /><ErrorState message="여행 날짜를 먼저 확정해야 서버 일정표를 편집할 수 있어요." onRetry={() => void query.refetch()} /></Screen>;
  }

  const localFacts = localFactsOverride?.tripId === tripId
    ? localFactsOverride.value
    : data.localFacts;
  const trip = buildDomainTrip(data, localFacts);
  const source: WorkspaceSelectorState = {
    currentUserId,
    usersById: data.usersById,
    regionsById: { [data.region.id]: data.region },
    placesById: data.placesById,
    tripsById: { [trip.id]: trip },
    candidatesByTripId: { [trip.id]: data.candidates },
    itineraryByTripId: { [trip.id]: activeSnapshot.itinerary },
  };
  const workspace = buildWorkspaceViewModel(source, tripId, requestedDate, sessionKind, dateToDateOnly(new Date()));
  if (!workspace) return <Screen><AppHeader title={data.room.title} onBack={returnFromWorkspace} /><ErrorState message="여행 날짜와 일정 범위를 구성하지 못했어요." /></Screen>;
  const selectedDate = workspace.selectedDate;
  const selectedDateView = workspace.dates.find((date) => date.date === selectedDate);
  const selectedDayIndex = workspace.dates.findIndex((date) => date.date === selectedDate);
  const candidateViews = buildCandidatePlaceViewModels(source, tripId, selectedDate);
  const filteredCandidates = filterCandidatePlaceViewModels(candidateViews, candidateKeyword, candidateFilter, currentUserId);
  const itineraryViews = buildItineraryItemViewModels(source, tripId, selectedDate, workspace.dates.map((date) => date.date));
  const endConditionTimeline = buildTripEndConditionTimelineEntry(trip);
  const editable = workspace.canEdit && !saving;
  const tripFactsDraft: WorkspaceTripFactsDraft = {
    transport: localFacts?.transport ?? "public",
    accommodationLocation: localFacts?.accommodationLocation?.name ?? "",
    endCondition: localFacts?.endCondition ? {
      type: localFacts.endCondition.type,
      location: localFacts.endCondition.location.name,
      deadline: localFacts.endCondition.deadline,
      travelMinutes: String(localFacts.endCondition.travelMinutes),
      serviceBufferMinutes: String(localFacts.endCondition.serviceBufferMinutes),
      note: localFacts.endCondition.note ?? "",
    } : null,
  };

  const showFeedback = (message: string, targetDate?: string) => setFeedback({ message, ...(targetDate ? { targetDate } : {}) });
  const updateCachedSchedule = (saved: WorkspaceScheduleSnapshot) => {
    queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId), (current) => current ? {
      ...current,
      itinerary: saved.itinerary,
      scheduleSnapshot: saved,
      room: {
        ...current.room,
        scheduleVersion: saved.scheduleVersion,
        scheduleItemCount: saved.itinerary.length,
      },
    } : current);
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all, exact: true });
  };

  const commitSchedule = async (
    draft: ApiWorkspaceScheduleDraft,
    successMessage: string,
    confirmedTicketRemovalItemIds: readonly string[] = [],
  ) => {
    const base = activeSnapshot;
    if (savingRef.current) {
      showFeedback("이전 변경을 저장하고 있어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    const optimistic = cloneSnapshot(base, draft);
    savingRef.current = true;
    setSaving(true);
    setSnapshot(optimistic);
    try {
      const saved = await workspaceScheduleApiGateway.save({
        roomId: tripId,
        tripId,
        startDate: data.room.startDate as string,
        endDate: data.room.endDate as string,
        snapshot: base,
        itinerary: draft.itinerary,
        metadataByItemId: draft.metadataByItemId,
        confirmedTicketRemovalItemIds,
      });
      setSnapshot(saved);
      updateCachedSchedule(saved);
      try {
        await saveApiWorkspaceOverlays(currentUserId, tripId, saved.itinerary);
        showFeedback(`${successMessage} · 서버 일정 v${saved.scheduleVersion}`);
      } catch {
        showFeedback(`${successMessage} 잠금·일정 종류의 기기 보관에는 실패했으므로 다시 확인해 주세요.`);
      }
      return true;
    } catch (error) {
      setSnapshot(base);
      if (error instanceof ScheduleTicketRemovalConfirmationRequiredError) {
        const impact = error.impacts[0];
        if (impact) setPendingTicketRemoval({
          itemId: impact.itemId,
          placeName: impact.placeName,
          ticketCount: impact.tickets.length,
          draft,
        });
        return false;
      }
      if (error instanceof WorkspaceScheduleVersionConflictError) {
        setSnapshot(undefined);
        const refreshed = await query.refetch();
        showFeedback(!refreshed.isError && refreshed.data?.scheduleSnapshot
          ? "다른 동행자가 먼저 일정을 수정했어요. 최신 서버 일정으로 다시 불러왔습니다."
          : "다른 동행자가 먼저 일정을 수정했지만 최신 일정을 불러오지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        return false;
      }
      if (error instanceof ScheduleTicketPlaceReplacementUnsupportedError) {
        showFeedback(error.message);
        return false;
      }
      showFeedback(error instanceof ApiError || error instanceof Error ? error.message : "서버 일정 저장에 실패했어요.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const openAddEditor = (candidate: CandidatePlaceViewModel, allowRepeat = false) => {
    if (!editable) { showFeedback(workspace.readOnlyReason ?? "저장 중에는 새 일정을 추가할 수 없어요."); return; }
    if (candidate.placeMissing) { showFeedback("장소 정보가 누락되어 일정에 추가할 수 없어요."); return; }
    if (!allowRepeat && candidate.scheduleState !== "unscheduled") {
      const targetDate = candidate.scheduleState === "scheduled-on-selected-date" ? selectedDate : candidate.scheduledDates[0];
      if (targetDate) setRequestedDate(targetDate);
      showFeedback("이미 일정에 배치된 장소예요.", targetDate);
      return;
    }
    const range = getDefaultScheduleRange(activeSnapshot.itinerary, selectedDate);
    setEditor({ mode: "add", placeId: candidate.placeId, initialValue: { date: selectedDate, ...range, note: "", lockedForDuri: false, attachmentDocumentIds: [] } });
  };

  const openEditEditor = (itemId: string) => {
    if (!editable) { showFeedback(workspace.readOnlyReason ?? "저장 중에는 일정을 편집할 수 없어요."); return; }
    const item = activeSnapshot.itinerary.find((entry) => entry.id === itemId);
    if (!item) { showFeedback("일정 항목을 찾을 수 없어요."); return; }
    setEditor({
      mode: "edit",
      itemId,
      initialValue: {
        date: item.date,
        startTime: item.startTime,
        endTime: getItineraryEndTime(item),
        note: item.note ?? "",
        lockedForDuri: Boolean(item.lockedForDuri),
        attachmentDocumentIds: [],
      },
    });
  };

  const submitEditor = (value: ScheduleEditorValue, durationMinutes: number): ItineraryMutationResult => {
    if (!editor || savingRef.current) return "boundary";
    const result = editor.mode === "add"
      ? prepareApiWorkspaceScheduleAddition({
          trip,
          currentUserId,
          snapshot: activeSnapshot,
          candidate: data.candidates.find((candidate) => candidate.placeId === editor.placeId),
          place: data.placesById[editor.placeId],
          value: { ...value, durationMinutes },
        })
      : prepareApiWorkspaceScheduleUpdate({
          trip,
          currentUserId,
          snapshot: activeSnapshot,
          itemId: editor.itemId,
          value: { ...value, durationMinutes },
        });
    if (!result.ok) return result.status;
    const itemName = editor.mode === "add"
      ? data.placesById[editor.placeId]?.name ?? "장소"
      : activeSnapshot.metadataByItemId[editor.itemId]?.placeName ?? "일정";
    setEditor(undefined);
    void commitSchedule(result.draft, `${itemName} 일정을 저장했어요.`);
    return "success";
  };

  const updateGridItem = (itemId: string, patch: Partial<Pick<ItineraryItem, "startTime" | "durationMinutes">>) => {
    if (savingRef.current) { showFeedback("이전 변경을 저장하고 있어요."); return; }
    const item = activeSnapshot.itinerary.find((entry) => entry.id === itemId);
    if (!item) { showFeedback("일정 항목을 찾을 수 없어요."); return; }
    const result = prepareApiWorkspaceScheduleUpdate({
      trip,
      currentUserId,
      snapshot: activeSnapshot,
      itemId,
      value: {
        date: item.date,
        startTime: patch.startTime ?? item.startTime,
        durationMinutes: patch.durationMinutes ?? item.durationMinutes,
        note: item.note ?? "",
        lockedForDuri: Boolean(item.lockedForDuri),
      },
    });
    if (!result.ok) { showFeedback(mutationMessage(result.status)); return; }
    void commitSchedule(result.draft, "일정 시간을 저장했어요.");
  };

  const confirmItemRemoval = () => {
    if (!removeItemId) return;
    const itemId = removeItemId;
    setRemoveItemId(undefined);
    const result = prepareApiWorkspaceScheduleRemoval({ trip, currentUserId, snapshot: activeSnapshot, itemId });
    if (!result.ok) { showFeedback(mutationMessage(result.status)); return; }
    const name = activeSnapshot.metadataByItemId[itemId]?.placeName ?? "일정";
    void commitSchedule(result.draft, `${name}을 일정에서 제거했어요.`);
  };

  const requestCandidateRemoval = (candidateView: CandidatePlaceViewModel) => {
    const candidate = data.candidates.find((item) => item.placeId === candidateView.placeId);
    const decision = canRemoveCandidate({ sessionKind, currentUserId, trip, candidate, itinerary: activeSnapshot.itinerary });
    if (!decision.allowed) { showFeedback(decision.reason); return; }
    setRemoveCandidateId(candidateView.placeId);
  };

  const confirmCandidateRemoval = async () => {
    if (!removeCandidateId || savingRef.current) return;
    const placeId = removeCandidateId;
    const name = data.placesById[placeId]?.name ?? "후보 장소";
    setRemoveCandidateId(undefined);
    savingRef.current = true;
    setSaving(true);
    try {
      await apiClient.request({
        path: `/rooms/${encodeURIComponent(tripId)}/candidates/${encodeURIComponent(placeId)}`,
        method: "DELETE",
        auth: true,
      });
      setSnapshot(undefined);
      await query.refetch();
      showFeedback(`${name}에서 내 후보 선택을 취소했어요. 다른 동행자의 선택은 유지됩니다.`);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "후보 장소를 제거하지 못했어요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submitTripFacts = (value: UpdateTripPlanningFactsInput): TripPlanningFactsMutationResult => {
    if (trip.status === "completed") return "trip-not-editable";
    if (!trip.members.some((member) => member.userId === currentUserId)) return "not-member";
    const nextTrip = { ...trip, ...value };
    const endAssessment = analyzeTripEndCondition(nextTrip, activeSnapshot.itinerary);
    if (endAssessment.status === "infeasible" || endAssessment.status === "invalid") return "end-condition";
    const previousOverride = localFactsOverride;
    const nextFacts = {
      transport: value.transport,
      accommodationLocation: value.accommodationLocation,
      endCondition: value.endCondition,
      companionType: localFacts?.companionType ?? null,
      expectedMemberCount: localFacts?.expectedMemberCount ?? null,
      savedAt: new Date().toISOString(),
    };
    setLocalFactsOverride({ tripId, value: nextFacts });
    void saveApiTripLocalFacts(currentUserId, tripId, nextFacts).then(() => {
      queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId), (current) => current ? { ...current, localFacts: nextFacts } : current);
      showFeedback("여행 사실을 이 계정의 현재 기기에 저장했어요.");
    }).catch(() => {
      setLocalFactsOverride(previousOverride);
      showFeedback("여행 사실을 기기에 저장하지 못했어요. 일정 서버 데이터는 변경하지 않았습니다.");
    });
    return "success";
  };

  const uploadServerTicket = async (itemId: string, note: string) => {
    if (savingRef.current) { showFeedback("다른 서버 변경을 저장하고 있어요."); return false; }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await pickAndUploadScheduleTicket({ roomId: tripId, itemId, note });
      if (result.status === "cancelled") return false;
      if (result.status === "rejected") { showFeedback(result.message); return false; }
      setSnapshot(undefined);
      const refreshed = await query.refetch();
      showFeedback(!refreshed.isError
        ? "티켓 이미지를 서버 일정에 추가했어요."
        : "티켓 이미지는 서버에 추가됐지만 최신 목록을 다시 불러오지 못했어요.");
      return true;
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "티켓 이미지를 업로드하지 못했어요.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteServerTicket = async (itemId: string, ticket: BackendScheduleTicket) => {
    if (savingRef.current) { showFeedback("다른 서버 변경을 저장하고 있어요."); return false; }
    savingRef.current = true;
    setSaving(true);
    try {
      await deleteScheduleTicket(tripId, itemId, ticket.id);
      setSnapshot(undefined);
      const refreshed = await query.refetch();
      showFeedback(!refreshed.isError
        ? "티켓 이미지를 서버 일정에서 삭제했어요."
        : "티켓 이미지는 삭제됐지만 최신 목록을 다시 불러오지 못했어요.");
      return true;
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "티켓 이미지를 삭제하지 못했어요.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const openServerTicket = (ticket: BackendScheduleTicket) => {
    if (!ticket.resolvedImageUrl) { showFeedback("이 티켓 이미지 주소를 열 수 없어요."); return; }
    void Linking.openURL(ticket.resolvedImageUrl).catch(() => showFeedback("티켓 이미지를 열지 못했어요. 서버 주소와 네트워크를 확인해 주세요."));
  };

  const explore = () => {
    startTripExplore(data.region.id);
    syncActiveTripRegion(tripId, data.region.id);
    router.push(buildTripExploreHref({ tripId, origin: "workspace" }));
  };
  const editorTitle = editor?.mode === "add"
    ? data.placesById[editor.placeId]?.name ?? "후보 장소"
    : editor
      ? activeSnapshot.metadataByItemId[editor.itemId]?.placeName ?? "일정 편집"
      : "일정 편집";
  const candidateBoard = <CandidateBoard
    candidates={filteredCandidates}
    totalCount={workspace.candidateCount}
    unscheduledCount={workspace.unscheduledCandidateCount}
    keyword={candidateKeyword}
    filter={candidateFilter}
    canEdit={editable}
    onKeywordChange={setCandidateKeyword}
    onFilterChange={setCandidateFilter}
    onExplore={explore}
    onOpenCandidate={(placeId) => data.placesById[placeId]
      ? router.push({ pathname: "/places/[placeId]", params: { placeId } })
      : showFeedback("장소 정보를 불러오지 못했어요.")}
    onCandidateAction={openAddEditor}
    onRemoveCandidate={requestCandidateRemoval}
  />;

  return <Screen scroll={false} padded={false} keyboardAware testID="api-workspace-editor-screen">
    <View style={styles.root}>
      <ScrollView
        style={styles.canvasScroll}
        contentContainerStyle={styles.canvasContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled={!draggingItemId}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title={workspace.title} subtitle={`${workspace.regionName} · ${formatTripDateRange(workspace.startDate, workspace.endDate)}`} onBack={returnFromWorkspace} />
        <View style={styles.metrics}><Metric value={workspace.candidateCount} label="후보" /><Metric value={workspace.unscheduledCandidateCount} label="미배치" /><Metric value={workspace.itineraryCount} label="일정" /><Metric value={workspace.memberCount} label="동행자" /></View>
        <View style={styles.serverNotice}><Text style={styles.serverNoticeTitle}>{saving ? "서버에 일정을 저장하고 있어요" : `서버 일정 v${activeSnapshot.scheduleVersion}`}</Text><Text style={styles.serverNoticeText}>변경은 성공 응답 후 확정되며, 다른 동행자의 변경과 충돌하면 최신 일정을 다시 불러옵니다.</Text></View>
        {!workspace.canEdit ? <View style={styles.readOnly}><Text style={styles.readOnlyTitle}>읽기 전용 워크스페이스</Text><Text style={styles.readOnlyText}>{workspace.readOnlyReason}</Text></View> : null}
        <WorkspaceFeedbackBanner message={feedback.message} onClose={() => setFeedback({ message: "" })} />
        <View style={styles.section}>
          <Text style={styles.eyebrow}>TRIP DATES</Text>
          <View style={styles.sectionHeadingRow}><View style={styles.sectionHeadingCopy}><Text style={styles.sectionTitle}>여행 날짜</Text><Text numberOfLines={2} style={styles.factSummary}>{localFacts ? `${trip.transport === "car" ? "자차" : "대중교통 & 도보"} · 숙소 ${trip.accommodationLocation?.name ?? "미입력"} · ${trip.endCondition ? `${trip.endCondition.location.name} ${trip.endCondition.deadline}까지` : "종료 조건 없음"}` : "이동·숙소·종료 조건은 서버 필드가 없어 아직 이 기기에 설정되지 않았어요."}</Text></View>{workspace.canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="이동 방식 숙소 종료 조건 수정" onPress={() => setTripFactsEditorOpen(true)} style={({ pressed }) => [styles.factEditButton, pressed && styles.pressed]}><Text style={styles.factEditText}>기기 사실 수정</Text></Pressable> : null}</View>
          <WorkspaceDateTabs
            dates={workspace.dates}
            selectedDate={selectedDate}
            onSelect={setRequestedDate}
            onAddDay={() => undefined}
            onDeleteDay={() => undefined}
            onEditDateRange={() => undefined}
            onMoveDay={() => false}
            addDisabled
            managementDisabledReason="날짜·DAY 변경은 서버에서 날짜와 일정을 한 번에 저장할 수 없어 현재 비활성화했어요."
          />
        </View>
        {selectedDateView ? <WorkspaceDayPager
          selectedIndex={Math.max(selectedDayIndex, 0)}
          dayCount={workspace.dates.length}
          disabled={Boolean(draggingItemId)}
          onSelectIndex={(index) => {
            const nextDate = workspace.dates[index]?.date;
            if (nextDate) setRequestedDate(nextDate);
          }}
        ><WorkspaceScheduleGrid
          date={selectedDateView}
          items={itineraryViews}
          endCondition={endConditionTimeline?.date === selectedDateView.date ? endConditionTimeline : undefined}
          canEdit={editable}
          interactionItemId={draggingItemId}
          onAdd={() => setSelectCandidateOpen(true)}
          onEdit={openEditEditor}
          onMove={(itemId, startTime) => updateGridItem(itemId, { startTime })}
          onResize={(itemId, durationMinutes) => updateGridItem(itemId, { durationMinutes })}
          onInteractionStateChange={setDraggingItemId}
        /></WorkspaceDayPager> : null}
        <DuriAnalysisEntryCard
          itineraryCount={workspace.itineraryCount}
          stale={false}
          loading={false}
          engineAvailable={false}
          engineMessage="서버 일정은 편집할 수 있지만 두리 분석 Store와 서버 일정의 단일 원본 연결은 아직 분리되어 있어요."
          onOpen={() => undefined}
        />
      </ScrollView>
      {selectedDateView ? <WorkspaceBoardSheet candidateBoard={candidateBoard} unscheduledCandidateCount={workspace.unscheduledCandidateCount} contentScrollEnabled={!draggingItemId} /> : null}
    </View>

    <SelectCandidateModal visible={selectCandidateOpen} candidates={candidateViews} onClose={() => setSelectCandidateOpen(false)} onSelect={(candidate) => { setSelectCandidateOpen(false); openAddEditor(candidate, true); }} onExplore={() => { setSelectCandidateOpen(false); explore(); }} />
    <ScheduleEditorModal
      visible={Boolean(editor)}
      editorKey={editor ? `${editor.mode}-${editor.mode === "add" ? editor.placeId : editor.itemId}` : "closed"}
      mode={editor?.mode ?? "add"}
      title={editorTitle}
      tripId={tripId}
      currentUserId={currentUserId}
      dates={workspace.dates}
      itinerary={activeSnapshot.itinerary}
      endCondition={endConditionTimeline}
      editingItemId={editor?.mode === "edit" ? editor.itemId : undefined}
      initialValue={editor?.initialValue ?? { date: selectedDate, startTime: "08:00", endTime: "09:00", note: "", lockedForDuri: false, attachmentDocumentIds: [] }}
      attachmentsAvailable={false}
      attachmentsUnavailableMessage="서버 티켓 이미지는 위에서 관리할 수 있지만, 문서함·OCR 사실·로컬 문서 ID를 동행자와 동기화하는 계약은 아직 제공되지 않습니다."
      serverAttachmentContent={editor?.mode === "edit" ? <ApiScheduleTicketManager
        tickets={activeSnapshot.metadataByItemId[editor.itemId]?.tickets ?? []}
        disabled={saving}
        onUpload={(note) => uploadServerTicket(editor.itemId, note)}
        onOpen={openServerTicket}
        onDelete={(ticket) => deleteServerTicket(editor.itemId, ticket)}
      /> : undefined}
      onClose={() => setEditor(undefined)}
      onSubmit={submitEditor}
      onRequestDelete={editor?.mode === "edit" ? () => { setRemoveItemId(editor.itemId); setEditor(undefined); } : undefined}
    />
    <WorkspaceTripFactsModal visible={tripFactsEditorOpen} editorKey={`${trip.id}-${trip.transport}-${trip.endCondition?.deadline ?? "none"}`} initialValue={tripFactsDraft} onClose={() => setTripFactsEditorOpen(false)} onSubmit={submitTripFacts} />
    <ConfirmationModal visible={Boolean(removeItemId)} title="일정에서 제거할까요?" message="서버 일정 항목만 제거합니다. 후보 장소는 그대로 유지됩니다." confirmLabel="일정에서 제거" onClose={() => setRemoveItemId(undefined)} onConfirm={confirmItemRemoval} />
    <ConfirmationModal visible={Boolean(removeCandidateId)} title="후보에서 제거할까요?" message="내가 담은 관계만 서버에서 제거합니다. 다른 동행자가 담은 후보는 유지됩니다." confirmLabel="내 후보 선택 취소" onClose={() => setRemoveCandidateId(undefined)} onConfirm={() => void confirmCandidateRemoval()} />
    <ConfirmationModal
      visible={Boolean(pendingTicketRemoval)}
      title="첨부 티켓이 있는 일정을 제거할까요?"
      message={`${pendingTicketRemoval?.placeName ?? "일정"}에 서버 티켓 ${pendingTicketRemoval?.ticketCount ?? 0}개가 연결되어 있어요. 일정 삭제 시 티켓 접근도 함께 사라질 수 있습니다.`}
      confirmLabel="티켓 영향 확인 후 제거"
      onClose={() => setPendingTicketRemoval(undefined)}
      onConfirm={() => {
        const pending = pendingTicketRemoval;
        setPendingTicketRemoval(undefined);
        if (pending) void commitSchedule(pending.draft, `${pending.placeName}을 일정에서 제거했어요.`, [pending.itemId]);
      }}
    />
  </Screen>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  canvasScroll: { flex: 1 },
  canvasContent: { width: "100%", paddingHorizontal: spacing.lg, paddingBottom: WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX + spacing.xxl },
  metrics: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  metric: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  metricValue: { ...typography.subtitle, color: colors.primary },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  serverNotice: { gap: spacing.xxs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, padding: spacing.md, marginBottom: spacing.md },
  serverNoticeTitle: { ...typography.bodyStrong, color: colors.primary },
  serverNoticeText: { ...typography.caption, color: colors.textSecondary },
  readOnly: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md, marginBottom: spacing.md },
  readOnlyTitle: { ...typography.bodyStrong, color: colors.warning },
  readOnlyText: { ...typography.caption, color: colors.textSecondary },
  section: { gap: spacing.sm, marginVertical: spacing.lg },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  factSummary: { ...typography.caption, color: colors.textSecondary },
  factEditButton: { minHeight: 44, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md },
  factEditText: { ...typography.caption, color: colors.primary },
  eyebrow: { ...typography.caption, color: colors.primary },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  pressed: { opacity: 0.82 },
});
