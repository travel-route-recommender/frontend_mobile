import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
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
import { buildApiDuriAnalysisInput } from "../../duri/logic/apiAnalysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../../duri/logic/analysisSnapshot";
import { resolveDuriWorkspaceAction } from "../../duri/logic/duriWorkspaceAction";
import { roomPreferenceApiGateway, type UpdateRoomCandidateSignalInput } from "../../duri/services/roomPreferenceApi";
import { duriAnalysisService } from "../../duri/services/duriAnalysisService";
import { useDuriAnalysisStore } from "../../duri/store/useDuriAnalysisStore";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { clearApiTripLocalFacts } from "../../trip-creation/services/apiTripFactsStorage";
import { syncApiWorkspaceScheduleImpactTodos } from "../../trip-todos/services/apiDuriTodoAutomationService";
import { fetchApiTripDetail, type ApiTripDetailData } from "../../trips/tripRoomApi";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import { CandidateBoard } from "../components/CandidateBoard";
import { ApiCandidateSignalControl } from "../components/ApiCandidateSignalControl";
import { ApiScheduleReservationEditor } from "../components/ApiScheduleReservationEditor";
import { ApiScheduleTicketManager } from "../components/ApiScheduleTicketManager";
import { WorkspaceBoardSheet } from "../components/WorkspaceBoardSheet";
import { WorkspaceDateTabs } from "../components/WorkspaceDateTabs";
import { WorkspaceDayPager } from "../components/WorkspaceDayPager";
import {
  ConfirmationModal,
  ScheduleEditorModal,
  SelectCandidateModal,
  WorkspaceDateRangeModal,
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
  getApiWorkspaceUserLockedItemIds,
  type ApiWorkspaceScheduleDraft,
} from "../logic/apiWorkspaceScheduleState";
import {
  describeApiWorkspaceScheduleReservationImpacts,
  findApiWorkspaceScheduleReservationImpacts,
  hasApiWorkspaceScheduleRelevantChanges,
  ticketRemovalItemIdsFromImpacts,
} from "../logic/apiWorkspaceScheduleImpact";
import {
  addDaysToDate,
  getDefaultScheduleRange,
  getItineraryEndTime,
  moveTripDayScheduleToIndex,
  remapScheduleToTripDateRange,
  removeTripDayFromSchedule,
  type TripDayScheduleResult,
} from "../logic/workspaceDateTime";
import { analyzeTripEndCondition, buildTripEndConditionTimelineEntry } from "../logic/tripEndCondition";
import { resolveWorkspaceBackAction } from "../logic/workspaceNavigation";
import {
  buildCandidatePlaceViewModels,
  buildItineraryItemViewModels,
  buildWorkspaceViewModel,
  filterCandidatePlaceViewModels,
  type WorkspaceSelectorState,
} from "../selectors/workspaceSelectors";
import { clearApiWorkspaceOverlays, saveApiWorkspaceOverlays } from "../services/apiWorkspaceOverlayStorage";
import { workspacePlanningApiGateway } from "../services/workspacePlanningApi";
import {
  createWorkspaceTripDateMutationId,
  WorkspaceTripDateDeletionConfirmationRequiredError,
  WorkspaceTripDateProtectedItemError,
  workspaceTripDatesApiGateway,
  type WorkspaceTripDateDeletionImpact,
} from "../services/workspaceTripDatesApi";
import {
  deleteScheduleTicket,
  getSignedScheduleTicketUrl,
  pickAndUploadScheduleTicket,
} from "../services/workspaceScheduleTicketApi";
import {
  ScheduleReservationPlaceReplacementUnsupportedError,
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
  baseScheduleVersion: number;
  itemId: string;
  placeName: string;
  ticketCount: number;
  draft: ApiWorkspaceScheduleDraft;
};

type PendingReservationImpact = {
  baseScheduleVersion: number;
  draft: ApiWorkspaceScheduleDraft;
  successMessage: string;
  message: string;
  confirmedTicketRemovalItemIds: string[];
};

function serverScheduleTodoReferences(snapshot: WorkspaceScheduleSnapshot) {
  return Object.fromEntries(Object.entries(snapshot.metadataByItemId).flatMap(([itemId, metadata]) => {
    const references = [
      ...metadata.tickets.map((ticket, index) => ({
      id: ticket.id,
      label: (ticket.originalName?.trim() || ticket.note?.trim() || `티켓 ${index + 1}`).slice(0, 120),
      sourceLabel: "서버 티켓",
        linkType: "ticket" as const,
      })),
      ...(metadata.reservation ? [{
        id: metadata.reservation.id,
        label: (metadata.reservation.note?.trim() || metadata.reservation.confirmationCode?.trim() || `${metadata.placeName} 예약`).slice(0, 120),
        sourceLabel: "서버 예약",
        linkType: "reservation" as const,
      }] : []),
    ];
    return references.length ? [[itemId, references] as const] : [];
  }));
}

function schedulePlaceNamesByItemId(snapshot: WorkspaceScheduleSnapshot) {
  return Object.fromEntries(Object.entries(snapshot.metadataByItemId).map(([itemId, metadata]) => [itemId, metadata.placeName]));
}

function mutationMessage(result: string) {
  if (result === "trip-not-editable") return "완료된 여행방은 수정할 수 없어요.";
  if (result === "not-member") return "이 여행방의 일정을 수정할 권한이 없어요.";
  if (result === "overlap") return "다른 일정과 시간이 겹쳐 저장하지 않았어요.";
  if (result === "invalid-date") return "여행 기간 안의 날짜를 선택해 주세요.";
  if (result === "invalid-time") return "서버 일정은 00:00부터 23:59 사이의 1분 단위 시간만 저장할 수 있어요.";
  if (result === "end-condition") return "복귀 조건을 지킬 수 없는 시간이어서 저장하지 않았어요.";
  if (result === "protected-item") return "서버에서 필수로 지정한 일정은 삭제하거나 다른 날짜로 옮길 수 없어요.";
  if (result === "scheduled") return "일정에 배치된 후보예요. 먼저 모든 일정에서 제거해 주세요.";
  if (result === "boundary") return "이 방향으로는 더 이동할 수 없어요.";
  return "요청을 처리하지 못했어요. 최신 일정을 다시 확인해 주세요.";
}

function buildDomainTrip(
  data: ApiTripDetailData,
  snapshot: WorkspaceScheduleSnapshot,
  localFacts: ApiTripDetailData["localFacts"],
): TripRoom {
  const planning = snapshot.planning;
  const returnPoint = planning?.returnPoint;
  const returnDeadline = planning?.returnDeadline?.value;
  const hasCompleteReturnCondition = Boolean(
    returnPoint
    && planning?.returnDeadline?.confirmedAt
    && planning.travelBufferMinutes?.confirmedAt
    && planning.prepBufferMinutes?.confirmedAt,
  );
  return {
    id: data.room.id,
    title: data.room.title,
    regionId: data.region.id,
    startDate: data.room.startDate,
    endDate: data.room.endDate,
    dateUndecided: !data.room.startDate || !data.room.endDate,
    status: data.room.status,
    transport: planning?.transportMode?.value === "car" ? "car" : "public",
    accommodationLocation: planning?.lodging ? { name: planning.lodging.name } : null,
    endCondition: hasCompleteReturnCondition ? {
      type: "other",
      location: { name: returnPoint!.name },
      deadline: returnDeadline!,
      // Backend의 travelBuffer는 실제 경로 ETA가 아니라 사용자가 확보한 시간이다.
      // 이 값을 외부 경로 측정치로 표시하지 않는다.
      travelMinutes: planning!.travelBufferMinutes!.value,
      serviceBufferMinutes: planning!.prepBufferMinutes!.value,
      note: "서버 planning에 저장된 이동 확보시간과 준비시간",
    } : null,
    companionType: localFacts?.companionType ?? null,
    expectedMemberCount: localFacts?.expectedMemberCount ?? null,
    members: data.room.members.map((member) => ({ userId: member.userId, role: member.role })),
  };
}

function cloneSnapshot(snapshot: WorkspaceScheduleSnapshot, draft: ApiWorkspaceScheduleDraft): WorkspaceScheduleSnapshot {
  const userLockedItemIds = new Set(draft.userLockedItemIds);
  const priorityProtectionsByItemId = Object.fromEntries(Object.entries(snapshot.priorityProtectionsByItemId).map(([itemId, protection]) => [itemId, {
    ...protection,
    userLockAlsoPresent: userLockedItemIds.has(itemId),
  }]));
  return {
    ...snapshot,
    itinerary: draft.itinerary.map((item) => {
      const { lockedForDuri: _effectiveLock, ...unlocked } = item;
      return {
        ...unlocked,
        preferredByUserIds: [...item.preferredByUserIds],
        ...(userLockedItemIds.has(item.id) || priorityProtectionsByItemId[item.id]
          ? { lockedForDuri: true }
          : {}),
      };
    }),
    metadataByItemId: Object.fromEntries(Object.entries(draft.metadataByItemId).map(([itemId, metadata]) => [itemId, {
      ...metadata,
      tags: [...metadata.tags],
      tickets: metadata.tickets.map((ticket) => ({ ...ticket })),
    }])),
    priorityProtectionsByItemId,
  };
}

export function ApiWorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; affectedDate?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const affectedDate = Array.isArray(params.affectedDate) ? params.affectedDate[0] : params.affectedDate ?? "";
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const currentUserId = useAuthSessionStore((state) => state.currentSessionUserId) ?? "";
  const analysisState = useDuriAnalysisStore(useShallow((state) => ({
    session: state.sessionsByTripId[tripId],
    status: state.analysisStatusByTripId[tripId] ?? "idle",
  })));
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
    queryKey: queryKeys.trips.detail(tripId, currentUserId),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, currentUserId, signal),
    enabled: Boolean(tripId && currentUserId),
  });
  const refetchTripOnFocus = query.refetch;
  useFocusEffect(useCallback(() => {
    if (tripId && currentUserId) void refetchTripOnFocus();
  }, [currentUserId, refetchTripOnFocus, tripId]));
  const [snapshot, setSnapshot] = useState<WorkspaceScheduleSnapshot>();
  const [localFactsOverride, setLocalFactsOverride] = useState<{
    tripId: string;
    userId: string;
    value: ApiTripDetailData["localFacts"];
  }>();
  const [requestedDate, setRequestedDate] = useState(affectedDate);
  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [candidateFilter, setCandidateFilter] = useState<CandidateBoardFilter>("all");
  const [selectCandidateOpen, setSelectCandidateOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [removeItemId, setRemoveItemId] = useState<string>();
  const [removeCandidateId, setRemoveCandidateId] = useState<string>();
  const [signalSavingPlaceId, setSignalSavingPlaceId] = useState<string>();
  const [pendingTicketRemoval, setPendingTicketRemoval] = useState<PendingTicketRemoval>();
  const [pendingReservationImpact, setPendingReservationImpact] = useState<PendingReservationImpact>();
  const [tripFactsEditorOpen, setTripFactsEditorOpen] = useState(false);
  const [dateRangeEditorOpen, setDateRangeEditorOpen] = useState(false);
  const [addDayConfirmationOpen, setAddDayConfirmationOpen] = useState(false);
  const [removeDayDate, setRemoveDayDate] = useState<string>();
  const [pendingTripDateChange, setPendingTripDateChange] = useState<{
    result: TripDayScheduleResult;
    impacts: WorkspaceTripDateDeletionImpact[];
    successMessage: string;
  }>();
  const [draggingItemId, setDraggingItemId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [factsSaving, setFactsSaving] = useState(false);
  const [localDataResetPending, setLocalDataResetPending] = useState(false);
  const [localDataResetting, setLocalDataResetting] = useState(false);
  const [scheduleRefreshRequired, setScheduleRefreshRequired] = useState(false);
  const savingRef = useRef(false);
  const factsSavingRef = useRef(false);
  const factsSaveSequenceRef = useRef(0);
  const [feedback, setFeedback] = useState<WorkspaceFeedback>({ message: "" });
  const accessRevoked = query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 403);

  if (!currentUserId) return <Screen><AppHeader title="여행 일정" onBack={returnFromWorkspace} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (query.isLoading) return <Screen><AppHeader title="여행 일정" onBack={returnFromWorkspace} /><LoadingState label="서버 후보와 일정을 불러오고 있어요." /></Screen>;
  if (accessRevoked) return <Screen><AppHeader title="여행 일정" onBack={returnFromWorkspace} /><ErrorState message="이 여행방의 최신 접근 권한을 확인할 수 없어요. 다시 로그인하거나 여행방 참여 상태를 확인해 주세요." onRetry={() => void query.refetch()} /></Screen>;
  if (!query.data) return <Screen><AppHeader title="여행 일정" onBack={returnFromWorkspace} /><ErrorState message={query.error instanceof Error ? query.error.message : "서버 워크스페이스를 불러오지 못했어요."} onRetry={() => { void query.refetch().then((result) => {
    if (!result.isError && result.data?.scheduleSnapshot) {
      setSnapshot(undefined);
      setScheduleRefreshRequired(false);
    }
  }); }} /></Screen>;
  if (scheduleRefreshRequired) return <Screen><AppHeader title="여행 일정" onBack={returnFromWorkspace} /><ErrorState
    message="서버가 변경을 받았는지 확인할 수 없어 편집과 분석을 잠시 중지했어요. 최신 일정을 다시 불러온 뒤 반영 여부를 확인해 주세요."
    onRetry={() => { void query.refetch().then((result) => {
      if (!result.isError && result.data?.scheduleSnapshot) {
        setSnapshot(undefined);
        setScheduleRefreshRequired(false);
      }
    }); }}
  /></Screen>;
  const data = query.data;
  const backgroundRefreshFailed = Boolean(query.error);
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

  const localFacts = localFactsOverride?.tripId === tripId && localFactsOverride.userId === currentUserId
    ? localFactsOverride.value
    : data.localFacts;
  const trip = buildDomainTrip(data, activeSnapshot, localFacts);
  const localDataUnavailable = false;
  const analysisInput = !backgroundRefreshFailed ? buildApiDuriAnalysisInput({
      ...data,
      scheduleSnapshot: activeSnapshot,
      localFacts,
    }, currentUserId) : undefined;
  const currentAnalysisFingerprint = analysisInput
    ? createDuriInputFingerprint(createDuriAnalysisSnapshot(analysisInput))
    : "";
  const analysisStale = Boolean(analysisState.session && analysisState.session.inputFingerprint !== currentAnalysisFingerprint);
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
  const independentServerEditable = workspace.canEdit && !saving && !backgroundRefreshFailed;
  const editable = independentServerEditable && !factsSaving;
  const isOwner = data.room.members.some((member) => member.userId === currentUserId && member.role === "owner");
  const factsEditable = workspace.canEdit
    && isOwner
    && !saving
    && !factsSaving
    && !backgroundRefreshFailed;
  const dateManagementEditable = factsEditable;
  const planning = activeSnapshot.planning;
  const duriAction = resolveDuriWorkspaceAction({
    itineraryCount: workspace.itineraryCount,
    hasAnalysis: Boolean(analysisState.session),
    stale: analysisStale,
    canCreateSchedule: workspace.permissions.canAddSchedule && !saving && !factsSaving && !backgroundRefreshFailed,
    canUseAnalysis: duriAnalysisService.available && Boolean(analysisInput) && !saving && !factsSaving && !backgroundRefreshFailed,
  });
  const tripFactsDraft: WorkspaceTripFactsDraft = {
    transport: planning?.transportMode?.value === "car" ? "car" : "public",
    accommodationLocation: planning?.lodging?.name ?? "",
    endCondition: planning?.returnPoint ? {
      type: "other",
      location: planning.returnPoint.name,
      deadline: planning.returnDeadline?.value ?? "",
      travelMinutes: planning.travelBufferMinutes ? String(planning.travelBufferMinutes.value) : "",
      serviceBufferMinutes: planning.prepBufferMinutes ? String(planning.prepBufferMinutes.value) : "",
      note: "",
    } : null,
  };
  const returnConditionSummary = trip.endCondition
    ? `${trip.endCondition.location.name} ${trip.endCondition.deadline}까지`
    : planning?.returnPoint
      ? `${planning.returnPoint.name} · 마감/확보시간 미확정`
      : "종료 조건 없음";
  const transportSummary = planning?.transportMode?.confirmedAt
    ? trip.transport === "car" ? "자차" : "도보·대중교통"
    : planning?.transportMode ? "이동수단 확인 필요" : "이동수단 미설정";
  const localFactsSummary = `${transportSummary} · 숙소 ${trip.accommodationLocation?.name ?? "미입력"} · ${returnConditionSummary}`;
  const unavailableLocalDataLabels = [
    data.localFactsStatus === "unavailable" ? "여행 사실" : "",
    data.workspaceOverlayStatus === "unavailable" ? "일정 잠금·메모" : "",
  ].filter(Boolean).join(" 및 ");

  const showFeedback = (message: string, targetDate?: string) => setFeedback({ message, ...(targetDate ? { targetDate } : {}) });
  const resetUnavailableLocalData = async () => {
    setLocalDataResetPending(false);
    // 확인 모달이 열린 사이 background refetch로 복구됐더라도 모달부터 닫아 stale 상태를 남기지 않는다.
    if (!localDataUnavailable || localDataResetting || saving || factsSaving) return;
    setLocalDataResetting(true);
    const resetFacts = data.localFactsStatus === "unavailable";
    const resetOverlays = data.workspaceOverlayStatus === "unavailable";
    try {
      const [factsCleared, overlaysCleared] = await Promise.all([
        resetFacts
          ? clearApiTripLocalFacts(currentUserId, tripId, {
              startDate: data.room.startDate,
              endDate: data.room.endDate,
            }).then(() => true, () => false)
          : Promise.resolve(undefined),
        resetOverlays
          ? clearApiWorkspaceOverlays(currentUserId, tripId).then(() => true, () => false)
          : Promise.resolve(undefined),
      ]);
      if (useAuthSessionStore.getState().currentSessionUserId !== currentUserId) return;
      if (factsCleared) {
        setLocalFactsOverride((current) => current?.tripId === tripId && current.userId === currentUserId
          ? undefined
          : current);
      }
      const failedLabels = [
        factsCleared === false ? "여행 사실" : "",
        overlaysCleared === false ? "일정 잠금·메모" : "",
      ].filter(Boolean);
      const refreshed = await query.refetch();
      if (useAuthSessionStore.getState().currentSessionUserId !== currentUserId) return;
      if (refreshed.isError) {
        showFeedback(`${failedLabels.length ? `${failedLabels.join(" 및 ")} 초기화에 실패했고, ` : ""}기기 정보 초기화 뒤 서버 일정을 다시 불러오지 못했어요.`);
        return;
      }
      const stillUnavailable = refreshed.data?.localFactsStatus === "unavailable"
        || refreshed.data?.workspaceOverlayStatus === "unavailable";
      if (failedLabels.length || stillUnavailable) {
        showFeedback(`${failedLabels.length ? `${failedLabels.join(" 및 ")} 초기화에 실패했어요. ` : ""}기기 저장소 접근이 계속 실패하면 앱·브라우저 저장 권한을 확인한 뒤 다시 시도해 주세요.`);
        return;
      }
      showFeedback("손상된 기기 보조 정보만 초기화했어요. 서버 일정과 티켓은 변경하지 않았습니다.");
    } finally {
      setLocalDataResetting(false);
    }
  };
  const blockMutation = (allowed: boolean, fallback: string) => {
    if (allowed) return false;
    showFeedback(workspace.readOnlyReason ?? fallback);
    return true;
  };
  const openScheduleAddFlow = () => {
    if (savingRef.current) { showFeedback("이전 변경을 저장하고 있어요."); return; }
    if (blockMutation(workspace.permissions.canAddSchedule, "새 일정을 추가할 수 없어요.")) return;
    setSelectCandidateOpen(true);
  };
  const updateCachedSchedule = (saved: WorkspaceScheduleSnapshot) => {
    queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, currentUserId), (current) => current ? {
      ...current,
      itinerary: saved.itinerary,
      scheduleSnapshot: saved,
      room: {
        ...current.room,
        scheduleVersion: saved.scheduleVersion,
        scheduleItemCount: saved.itinerary.length,
      },
    } : current);
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
  };

  const commitSchedule = async (
    draft: ApiWorkspaceScheduleDraft,
    successMessage: string,
    confirmedTicketRemovalItemIds: readonly string[] = [],
    reservationImpactConfirmed = false,
  ) => {
    if (localDataUnavailable) {
      showFeedback("기기에 저장된 여행 사실과 일정 보조 정보를 다시 읽기 전에는 서버 일정을 편집할 수 없어요.");
      return false;
    }
    if (backgroundRefreshFailed || scheduleRefreshRequired) {
      showFeedback("최신 서버 일정을 확인할 때까지 편집할 수 없어요. 다시 불러온 뒤 시도해 주세요.");
      return false;
    }
    if (factsSavingRef.current) {
      showFeedback("여행 사실 저장이 끝난 뒤 일정을 편집해 주세요.");
      return false;
    }
    if (blockMutation(workspace.permissions.canEditSchedule, "서버 일정을 수정할 수 없어요.")) return false;
    const base = activeSnapshot;
    if (savingRef.current) {
      showFeedback("이전 변경을 저장하고 있어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    const reservationImpacts = findApiWorkspaceScheduleReservationImpacts({
      snapshot: base,
      draft,
      localDocuments: [],
    });
    const localDocumentCoverageUnavailable = false;
    if (!reservationImpactConfirmed
      && (reservationImpacts.length > 0
        || (localDocumentCoverageUnavailable && hasApiWorkspaceScheduleRelevantChanges({ snapshot: base, draft })))) {
      const impactMessage = describeApiWorkspaceScheduleReservationImpacts(reservationImpacts);
      setPendingReservationImpact({
        baseScheduleVersion: base.scheduleVersion,
        draft,
        successMessage,
        message: [
          impactMessage,
          localDocumentCoverageUnavailable
            ? "이 기기의 문서 목록을 완전히 확인하지 못해 로컬 예약 문서 영향은 누락될 수 있습니다. 저장 후 연결 문서를 직접 확인해 주세요."
            : "",
        ].filter(Boolean).join("\n\n"),
        confirmedTicketRemovalItemIds: ticketRemovalItemIdsFromImpacts(reservationImpacts),
      });
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
        userLockedItemIds: draft.userLockedItemIds,
        confirmedTicketRemovalItemIds,
      });
      setSnapshot(saved);
      updateCachedSchedule(saved);
      const localWarnings: string[] = [];
      try {
        await saveApiWorkspaceOverlays(currentUserId, tripId, saved);
        queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, currentUserId), (current) => current
          ? { ...current, workspaceOverlayStatus: "loaded" }
          : current);
      } catch {
        localWarnings.push("잠금·일정 종류의 기기 보관 실패");
        queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, currentUserId), (current) => current
          ? { ...current, workspaceOverlayStatus: "unavailable" }
          : current);
      }
      showFeedback(`${successMessage} · 서버 일정 v${saved.scheduleVersion}${localWarnings.length ? ` · ${localWarnings.join(" · ")}; 기기 저장 상태를 다시 확인해 주세요.` : ""}`);
      void syncApiWorkspaceScheduleImpactTodos({
          roomId: tripId,
          beforeItinerary: base.itinerary,
          afterItinerary: saved.itinerary,
          externalReferencesByItemId: serverScheduleTodoReferences(base),
          placeNameByItemId: schedulePlaceNamesByItemId(base),
          timezone: saved.planning?.timezone ?? "Asia/Seoul",
        }).then((todoResult) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.todos(tripId, currentUserId) });
        if (todoResult.failed > 0) {
          showFeedback(`서버 일정 v${saved.scheduleVersion} 저장은 완료됐지만 공유 예약 확인 TODO ${todoResult.failed}건은 기록하지 못했어요. TODO에서 직접 확인 작업을 추가해 주세요.`);
        }
      }).catch(() => showFeedback(`서버 일정 v${saved.scheduleVersion} 저장은 완료됐지만 공유 예약 확인 TODO를 동기화하지 못했어요.`));
      return true;
    } catch (error) {
      setSnapshot(base);
      if (error instanceof ScheduleTicketRemovalConfirmationRequiredError) {
        const impact = error.impacts[0];
        if (impact) setPendingTicketRemoval({
          baseScheduleVersion: base.scheduleVersion,
          itemId: impact.itemId,
          placeName: impact.placeName,
          ticketCount: impact.tickets.length,
          draft,
        });
        return false;
      }
      if (error instanceof WorkspaceScheduleVersionConflictError) {
        setSnapshot(undefined);
        setScheduleRefreshRequired(true);
        const refreshed = await query.refetch();
        if (!refreshed.isError && refreshed.data?.scheduleSnapshot) setScheduleRefreshRequired(false);
        showFeedback(!refreshed.isError && refreshed.data?.scheduleSnapshot
          ? "다른 동행자가 먼저 일정을 수정했어요. 최신 서버 일정으로 다시 불러왔습니다."
          : "다른 동행자가 먼저 일정을 수정했지만 최신 일정을 불러오지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        return false;
      }
      if (error instanceof ScheduleTicketPlaceReplacementUnsupportedError) {
        showFeedback(error.message);
        return false;
      }
      if (error instanceof ScheduleReservationPlaceReplacementUnsupportedError) {
        showFeedback(error.message);
        return false;
      }
      // PUT 응답이 유실되면 서버 commit 여부가 모호하므로 로컬 base를 현재 상태로 단정하지 않는다.
      setSnapshot(undefined);
      setScheduleRefreshRequired(true);
      const refreshed = await query.refetch();
      if (!refreshed.isError && refreshed.data?.scheduleSnapshot) {
        setScheduleRefreshRequired(false);
        showFeedback("저장 응답을 확인하지 못해 최신 서버 일정을 다시 불러왔어요. 변경 반영 여부를 확인해 주세요.");
      } else {
        showFeedback(error instanceof ApiError || error instanceof Error ? error.message : "서버 일정 저장 결과를 확인하지 못했어요.");
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const commitTripDateChange = async (
    result: TripDayScheduleResult,
    successMessage: string,
    confirmedDeletionItemIds: readonly string[] = [],
  ) => {
    if (result.status !== "success") {
      showFeedback(mutationMessage(result.status));
      return false;
    }
    if (!dateManagementEditable || savingRef.current) {
      showFeedback(isOwner ? "다른 서버 변경이 끝난 뒤 날짜를 수정해 주세요." : "여행 날짜는 방장만 수정할 수 있어요.");
      return false;
    }
    const base = activeSnapshot;
    const sameRange = result.startDate === base.scope.startDate && result.endDate === base.scope.endDate;
    savingRef.current = true;
    setSaving(true);
    if (sameRange) setSnapshot({ ...base, itinerary: result.items });
    try {
      const saved = await workspaceTripDatesApiGateway.update({
        roomId: tripId,
        tripId,
        snapshot: base,
        result,
        clientMutationId: createWorkspaceTripDateMutationId(),
        confirmedDeletionItemIds,
      });
      setSnapshot(saved.schedule);
      setRequestedDate(result.selectedDate);
      queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, currentUserId), (current) => current ? {
        ...current,
        itinerary: saved.schedule.itinerary,
        scheduleSnapshot: saved.schedule,
        room: {
          ...current.room,
          startDate: saved.startDate,
          endDate: saved.endDate,
          scheduleVersion: saved.schedule.scheduleVersion,
          scheduleItemCount: saved.schedule.itinerary.length,
        },
      } : current);
      try {
        await saveApiWorkspaceOverlays(currentUserId, tripId, saved.schedule);
      } catch {
        // 날짜와 일정의 서버 원자 변경은 이미 완료됐다. 기기 보조정보 실패로 되돌리지 않는다.
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.todos(tripId, currentUserId) });
      showFeedback(`${successMessage} · 서버 일정 v${saved.schedule.scheduleVersion}${saved.todoLinkImpacts.length ? ` · 삭제 일정의 TODO 연결 ${saved.todoLinkImpacts.length}건을 정리했어요.` : ""}`, result.selectedDate);
      return true;
    } catch (error) {
      setSnapshot(base);
      if (error instanceof WorkspaceTripDateDeletionConfirmationRequiredError) {
        setPendingTripDateChange({ result, impacts: error.impacts, successMessage });
        return false;
      }
      if (error instanceof WorkspaceTripDateProtectedItemError) {
        showFeedback(error.message);
        return false;
      }
      if (error instanceof WorkspaceScheduleVersionConflictError) {
        setSnapshot(undefined);
        const refreshed = await query.refetch();
        showFeedback(refreshed.isError
          ? "다른 동행자의 변경과 충돌했고 최신 여행 날짜를 불러오지 못했어요. 다시 시도해 주세요."
          : "다른 동행자가 먼저 수정해 최신 여행 날짜와 일정을 다시 불러왔어요.");
        return false;
      }
      // 응답 유실 시 날짜 변경 commit 여부를 추정하지 않고 서버를 다시 읽는다.
      setSnapshot(undefined);
      const refreshed = await query.refetch();
      showFeedback(refreshed.isError
        ? "날짜 변경 결과를 확인하지 못했어요. 네트워크를 확인한 뒤 최신 여행방을 다시 불러오세요."
        : "날짜 변경 응답을 확인하지 못해 최신 서버 여행방을 다시 불러왔어요. 반영 여부를 확인해 주세요.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submitTripDateRange = (startDate: string, endDate: string) => {
    const result = remapScheduleToTripDateRange(
      activeSnapshot.itinerary,
      data.room.startDate,
      data.room.endDate,
      startDate,
      endDate,
      selectedDate,
    );
    if (result.status === "success") {
      setDateRangeEditorOpen(false);
      void commitTripDateChange(result, `여행 날짜를 ${formatTripDateRange(startDate, endDate)}로 변경했어요.`);
      return {
        status: "success" as const,
        startDate: result.startDate,
        endDate: result.endDate,
        selectedDate: result.selectedDate,
        removedItineraryCount: result.removedItineraryCount,
        endConditionAdjusted: false,
      };
    }
    return { status: result.status };
  };

  const performAddDay = () => {
    setAddDayConfirmationOpen(false);
    const nextEndDate = addDaysToDate(data.room.endDate, 1);
    if (!nextEndDate) { showFeedback("새 마지막 날짜를 계산하지 못했어요."); return; }
    const result = remapScheduleToTripDateRange(
      activeSnapshot.itinerary,
      data.room.startDate,
      data.room.endDate,
      data.room.startDate,
      nextEndDate,
      selectedDate,
    );
    void commitTripDateChange(result, `DAY ${workspace.dates.length + 1}을 추가했어요.`);
  };

  const addDay = () => {
    if (!dateManagementEditable) { showFeedback("여행 날짜는 방장만 수정할 수 있어요."); return; }
    if (trip.endCondition) { setAddDayConfirmationOpen(true); return; }
    performAddDay();
  };

  const confirmDayRemoval = () => {
    if (!removeDayDate) return;
    const removedDate = removeDayDate;
    const removedLabel = workspace.dates.find((date) => date.date === removedDate)?.dayLabel ?? "DAY";
    setRemoveDayDate(undefined);
    const result = removeTripDayFromSchedule(
      activeSnapshot.itinerary,
      data.room.startDate,
      data.room.endDate,
      removedDate,
    );
    const remainingIds = new Set(result.status === "success" ? result.items.map((item) => item.id) : []);
    const confirmedDeletionIds = activeSnapshot.itinerary
      .filter((item) => !remainingIds.has(item.id))
      .map((item) => item.id);
    void commitTripDateChange(result, `${removedLabel}와 해당 날짜의 일정을 삭제했어요.`, confirmedDeletionIds);
  };

  const moveDay = (date: string, targetIndex: number) => {
    const result = moveTripDayScheduleToIndex(
      activeSnapshot.itinerary,
      data.room.startDate,
      data.room.endDate,
      date,
      targetIndex,
    );
    if (result.status !== "success") { showFeedback(mutationMessage(result.status)); return false; }
    if (result.selectedDate === date) { setRequestedDate(date); return true; }
    setRequestedDate(result.selectedDate);
    void commitTripDateChange(result, `선택한 DAY의 일정을 DAY ${targetIndex + 1} 위치로 옮겼어요.`);
    return true;
  };

  const openAddEditor = (candidate: CandidatePlaceViewModel) => {
    if (!editable) { showFeedback(localDataUnavailable ? "기기 보조 정보를 다시 읽기 전에는 새 일정을 추가할 수 없어요." : workspace.readOnlyReason ?? "저장 중에는 새 일정을 추가할 수 없어요."); return; }
    if (blockMutation(workspace.permissions.canAddSchedule, "새 일정을 추가할 수 없어요.")) return;
    if (candidate.placeMissing) { showFeedback("장소 정보가 누락되어 일정에 추가할 수 없어요."); return; }
    const range = getDefaultScheduleRange(activeSnapshot.itinerary, selectedDate);
    setEditor({ mode: "add", placeId: candidate.placeId, initialValue: { date: selectedDate, ...range, note: "", lockedForDuri: false, attachmentDocumentIds: [] } });
  };

  const openCandidateSchedule = (candidate: CandidatePlaceViewModel) => {
    if (candidate.scheduleState === "unscheduled") {
      openAddEditor(candidate);
      return;
    }
    const targetDate = candidate.scheduleState === "scheduled-on-selected-date" ? selectedDate : candidate.scheduledDates[0];
    if (targetDate) setRequestedDate(targetDate);
    showFeedback(`${candidate.scheduledCount}개 일정이 배치된 날짜를 열었어요.`, targetDate);
  };

  const openEditEditor = (itemId: string) => {
    if (!editable) { showFeedback(localDataUnavailable ? "기기 보조 정보를 다시 읽기 전에는 일정을 편집할 수 없어요." : workspace.readOnlyReason ?? "저장 중에는 일정을 편집할 수 없어요."); return; }
    if (blockMutation(workspace.permissions.canEditSchedule, "일정 상세를 편집할 수 없어요.")) return;
    const item = activeSnapshot.itinerary.find((entry) => entry.id === itemId);
    if (!item) { showFeedback("일정 항목을 찾을 수 없어요."); return; }
    const userLockedItemIds = new Set(getApiWorkspaceUserLockedItemIds(activeSnapshot));
    setEditor({
      mode: "edit",
      itemId,
      initialValue: {
        date: item.date,
        startTime: item.startTime,
        endTime: getItineraryEndTime(item),
        note: item.note ?? "",
        lockedForDuri: userLockedItemIds.has(item.id),
        attachmentDocumentIds: [],
      },
    });
  };

  const submitEditor = (value: ScheduleEditorValue, durationMinutes: number): ItineraryMutationResult => {
    if (!workspace.permissions.canEditSchedule) return "trip-not-editable";
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
    if (blockMutation(workspace.permissions.canEditSchedule, "일정 시간을 수정할 수 없어요.")) return;
    if (savingRef.current) { showFeedback("이전 변경을 저장하고 있어요."); return; }
    const item = activeSnapshot.itinerary.find((entry) => entry.id === itemId);
    if (!item) { showFeedback("일정 항목을 찾을 수 없어요."); return; }
    const userLockedItemIds = new Set(getApiWorkspaceUserLockedItemIds(activeSnapshot));
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
        lockedForDuri: userLockedItemIds.has(item.id),
      },
    });
    if (!result.ok) { showFeedback(mutationMessage(result.status)); return; }
    void commitSchedule(result.draft, "일정 시간을 저장했어요.");
  };

  const confirmItemRemoval = () => {
    if (!removeItemId) return;
    if (blockMutation(workspace.permissions.canDeleteSchedule, "일정을 삭제할 수 없어요.")) { setRemoveItemId(undefined); return; }
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
      // DELETE 응답이 유실된 경우 실제 서버 반영 여부를 로컬에서 단정하지 않는다.
      const refreshed = await query.refetch();
      if (!refreshed.isError && refreshed.data?.scheduleSnapshot) {
        setSnapshot(undefined);
        showFeedback("후보 삭제 응답을 확인하지 못해 최신 서버 상태를 다시 불러왔어요. 반영 여부를 확인해 주세요.");
      } else {
        setSnapshot(undefined);
        setScheduleRefreshRequired(true);
        showFeedback(error instanceof Error ? error.message : "후보 장소 삭제 결과를 확인하지 못했어요.");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const updateCandidateSignal = async (placeId: string, patch: UpdateRoomCandidateSignalInput) => {
    if (signalSavingPlaceId || savingRef.current || backgroundRefreshFailed) {
      showFeedback("최신 여행방 변경을 확인한 뒤 후보 의견을 저장해 주세요.");
      return;
    }
    setSignalSavingPlaceId(placeId);
    try {
      const result = await roomPreferenceApiGateway.updateCandidateSignal(tripId, placeId, patch, {
        userId: currentUserId,
      });
      const refreshed = await query.refetch();
      showFeedback(refreshed.isError
        ? `후보 의견은 서버 facts v${result.factsVersion}에 저장됐지만 최신 성향을 다시 불러오지 못했어요.`
        : "내 후보 의견을 여행방에 공유했어요. 두리 분석과 자동 초안에 반영됩니다.");
    } catch (error) {
      // PUT 응답 유실 시 실제 반영 여부를 추정하지 않고 서버 facts를 다시 읽는다.
      const refreshed = await query.refetch();
      showFeedback(refreshed.isError
        ? (error instanceof Error ? error.message : "후보 의견 저장 결과를 확인하지 못했어요.")
        : "저장 응답을 확인하지 못해 최신 후보 의견을 다시 불러왔어요. 반영 여부를 확인해 주세요.");
    } finally {
      setSignalSavingPlaceId(undefined);
    }
  };

  const submitTripFacts = (value: UpdateTripPlanningFactsInput): TripPlanningFactsMutationResult | "saving" => {
    if (factsSavingRef.current) return "saving";
    if (!workspace.permissions.canEditTripStructure) return "trip-not-editable";
    if (trip.status === "completed") return "trip-not-editable";
    if (!isOwner) return "not-member";
    const nextTrip = { ...trip, ...value };
    const endAssessment = analyzeTripEndCondition(nextTrip, activeSnapshot.itinerary);
    if (endAssessment.status === "infeasible" || endAssessment.status === "invalid") return "end-condition";
    const requestSequence = factsSaveSequenceRef.current + 1;
    factsSaveSequenceRef.current = requestSequence;
    factsSavingRef.current = true;
    setFactsSaving(true);
    const previousTransportMode = activeSnapshot.planning?.transportMode?.value;
    const nextTransportMode = value.transport === "car"
      ? "car"
      : previousTransportMode === "walk" || previousTransportMode === "mixed"
        ? previousTransportMode
        : "transit";
    void workspacePlanningApiGateway.update(tripId, {
      timezone: activeSnapshot.planning?.timezone ?? "Asia/Seoul",
      lodging: value.accommodationLocation
        ? { name: value.accommodationLocation.name, source: "manual" }
        : null,
      returnPoint: value.endCondition
        ? { name: value.endCondition.location.name, source: "manual" }
        : null,
      // 현재 화면은 '자차 / 대중교통·도보' 두 범주만 표현한다. 서버에 더
      // 정밀하게 저장된 walk/mixed를 사용자가 바꾸지 않은 저장으로 덮지 않는다.
      transportMode: nextTransportMode,
      ...(value.endCondition ? {
        returnDeadline: value.endCondition.deadline,
        travelBufferMinutes: value.endCondition.travelMinutes,
        prepBufferMinutes: value.endCondition.serviceBufferMinutes,
      } : {}),
      confirm: true,
    }).then((savedPlanning) => {
      if (factsSaveSequenceRef.current !== requestSequence
        || useAuthSessionStore.getState().currentSessionUserId !== currentUserId) return;
      const savedSnapshot = { ...activeSnapshot, planning: savedPlanning };
      setSnapshot(savedSnapshot);
      queryClient.setQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, currentUserId), (current) => {
        if (!current) return current;
        return { ...current, scheduleSnapshot: { ...(current.scheduleSnapshot ?? savedSnapshot), planning: savedPlanning } };
      });
      showFeedback("이동 방식·숙소·복귀 조건을 여행방에 공유 저장했어요.");
    }).catch((error) => {
      if (factsSaveSequenceRef.current !== requestSequence
        || useAuthSessionStore.getState().currentSessionUserId !== currentUserId) return;
      showFeedback(error instanceof Error ? error.message : "여행방 planning 저장 결과를 확인하지 못했어요.");
    }).finally(() => {
      if (factsSaveSequenceRef.current !== requestSequence) return;
      factsSavingRef.current = false;
      setFactsSaving(false);
    });
    return "success";
  };

  const uploadServerTicket = async (itemId: string, note: string) => {
    if (blockMutation(workspace.permissions.canEditSchedule, "읽기 전용 일정에는 티켓을 추가할 수 없어요.")) return false;
    if (savingRef.current) { showFeedback("다른 서버 변경을 저장하고 있어요."); return false; }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await pickAndUploadScheduleTicket({
        roomId: tripId,
        itemId,
        expectedVersion: activeSnapshot.scheduleVersion,
        note,
      });
      if (result.status === "cancelled") return false;
      if (result.status === "rejected") { showFeedback(result.message); return false; }
      setSnapshot(undefined);
      const refreshed = await query.refetch();
      setScheduleRefreshRequired(refreshed.isError || !refreshed.data?.scheduleSnapshot);
      showFeedback(!refreshed.isError
        ? "티켓 이미지를 서버 일정에 추가했어요."
        : "티켓 이미지는 서버에 추가됐지만 최신 목록을 다시 불러오지 못했어요.");
      return true;
    } catch (error) {
      // 업로드 요청이 서버에 도달한 뒤 응답만 유실됐을 수 있으므로 최신 snapshot으로 확인한다.
      setSnapshot(undefined);
      setScheduleRefreshRequired(true);
      const refreshed = await query.refetch();
      if (!refreshed.isError && refreshed.data?.scheduleSnapshot) {
        setScheduleRefreshRequired(false);
        showFeedback("업로드 응답을 확인하지 못해 최신 서버 티켓 목록을 다시 불러왔어요. 반영 여부를 확인해 주세요.");
      } else {
        showFeedback(error instanceof Error ? error.message : "티켓 이미지 업로드 결과를 확인하지 못했어요.");
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteServerTicket = async (itemId: string, ticket: BackendScheduleTicket) => {
    if (blockMutation(workspace.permissions.canEditSchedule, "읽기 전용 일정의 티켓을 삭제할 수 없어요.")) return false;
    if (savingRef.current) { showFeedback("다른 서버 변경을 저장하고 있어요."); return false; }
    savingRef.current = true;
    setSaving(true);
    try {
      await deleteScheduleTicket(tripId, itemId, ticket.id, activeSnapshot.scheduleVersion);
      setSnapshot(undefined);
      const refreshed = await query.refetch();
      setScheduleRefreshRequired(refreshed.isError || !refreshed.data?.scheduleSnapshot);
      showFeedback(!refreshed.isError
        ? "티켓 이미지를 서버 일정에서 삭제했어요."
        : "티켓 이미지는 삭제됐지만 최신 목록을 다시 불러오지 못했어요.");
      return true;
    } catch (error) {
      // DELETE 응답이 유실된 경우 티켓을 남아 있거나 삭제됐다고 임의로 확정하지 않는다.
      setSnapshot(undefined);
      setScheduleRefreshRequired(true);
      const refreshed = await query.refetch();
      if (!refreshed.isError && refreshed.data?.scheduleSnapshot) {
        setScheduleRefreshRequired(false);
        showFeedback("삭제 응답을 확인하지 못해 최신 서버 티켓 목록을 다시 불러왔어요. 반영 여부를 확인해 주세요.");
      } else {
        showFeedback(error instanceof Error ? error.message : "티켓 이미지 삭제 결과를 확인하지 못했어요.");
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const openServerTicket = (ticket: BackendScheduleTicket) => {
    void getSignedScheduleTicketUrl(tripId, ticket)
      .then((url) => Linking.openURL(url))
      .catch(() => showFeedback("티켓 이미지를 열지 못했어요. 권한과 네트워크를 확인해 주세요."));
  };

  const setReservationMutationBusy = (busy: boolean) => {
    savingRef.current = busy;
    setSaving(busy);
  };

  const refreshAfterReservationMutation = async (message: string) => {
    setSnapshot(undefined);
    const refreshed = await query.refetch();
    const available = !refreshed.isError && Boolean(refreshed.data?.scheduleSnapshot);
    setScheduleRefreshRequired(!available);
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.todos(tripId, currentUserId) });
    showFeedback(available
      ? message
      : "예약 정보는 서버에서 변경됐지만 최신 일정과 자동 TODO를 다시 불러오지 못했어요. 새로고침해 반영 상태를 확인해 주세요.");
  };

  const refreshAfterReservationConflict = async () => {
    setSnapshot(undefined);
    const refreshed = await query.refetch();
    const available = !refreshed.isError && Boolean(refreshed.data?.scheduleSnapshot);
    setScheduleRefreshRequired(!available);
    showFeedback(available
      ? "다른 동행자의 최신 일정을 불러왔어요. 예약 정보를 다시 확인해 주세요."
      : "일정 버전 충돌 뒤 최신 서버 일정을 불러오지 못했어요. 새로고침이 필요합니다.");
  };

  const explore = () => {
    startTripExplore(data.region.id);
    syncActiveTripRegion(tripId, data.region.id);
    router.push(buildTripExploreHref({ tripId, origin: "workspace" }));
  };
  const editorPlaceId = editor?.mode === "add"
    ? editor.placeId
    : editor
      ? activeSnapshot.itinerary.find((item) => item.id === editor.itemId)?.placeId
      : undefined;
  const editorPlace = editorPlaceId ? data.placesById[editorPlaceId] : undefined;
  const editorCandidate = editorPlaceId ? candidateViews.find((candidate) => candidate.placeId === editorPlaceId) : undefined;
  const editorItemView = editor?.mode === "edit" ? itineraryViews.find((item) => item.id === editor.itemId) : undefined;
  const editorTitle = editor?.mode === "add"
    ? data.placesById[editor.placeId]?.name ?? "후보 장소"
    : editor
      ? activeSnapshot.metadataByItemId[editor.itemId]?.placeName ?? "일정 편집"
      : "일정 편집";
  const editingServerItem = editor?.mode === "edit"
    ? activeSnapshot.itinerary.find((entry) => entry.id === editor.itemId)
    : undefined;
  const editingServerMetadata = editingServerItem
    ? activeSnapshot.metadataByItemId[editingServerItem.id]
    : undefined;
  const reservationEvidenceOptions = editingServerMetadata ? [
    ...editingServerMetadata.tickets.map((ticket) => ({
      id: ticket.id,
      label: ticket.originalName?.trim() || ticket.note?.trim() || "일정 티켓",
      kind: "ticket" as const,
    })),
    ...data.sharedDocuments.map((document) => ({
      id: document.id,
      label: document.originalName?.trim() || document.note?.trim() || "공유 문서",
      kind: "document" as const,
    })),
  ] : [];
  const serverAttachmentContent = editingServerItem && editingServerMetadata ? <>
    <ApiScheduleTicketManager
      itemId={editingServerItem.id}
      tickets={editingServerMetadata.tickets}
      disabled={!independentServerEditable}
      onUpload={uploadServerTicket}
      onOpen={openServerTicket}
      onDelete={deleteServerTicket}
    />
    <ApiScheduleReservationEditor
      roomId={tripId}
      itemId={editingServerItem.id}
      scheduleVersion={activeSnapshot.scheduleVersion}
      reservation={editingServerMetadata.reservation}
      defaultDate={editingServerItem.date}
      defaultStartTime={editingServerItem.startTime}
      defaultEndTime={getItineraryEndTime(editingServerItem)}
      defaultTimezone={activeSnapshot.planning?.timezone ?? "Asia/Seoul"}
      placeId={editingServerItem.placeId}
      evidenceOptions={reservationEvidenceOptions}
      disabled={!independentServerEditable}
      onMutationStateChange={setReservationMutationBusy}
      onCommitted={(commit) => refreshAfterReservationMutation(commit.kind === "upsert"
        ? "예약 정보를 여행방에 저장하고 최신 자동 TODO를 불러왔어요."
        : "예약 정보를 여행방에서 삭제하고 최신 일정을 불러왔어요.")}
      onVersionConflict={() => refreshAfterReservationConflict()}
    />
  </> : undefined;
  const candidateBoard = <CandidateBoard
    candidates={filteredCandidates}
    totalCount={workspace.candidateCount}
    unscheduledCount={workspace.unscheduledCandidateCount}
    keyword={candidateKeyword}
    filter={candidateFilter}
    canEdit={independentServerEditable}
    onKeywordChange={setCandidateKeyword}
    onFilterChange={setCandidateFilter}
    onExplore={explore}
    onOpenCandidate={(placeId) => data.placesById[placeId]
      ? router.push({ pathname: "/places/[placeId]", params: { placeId } })
      : showFeedback("장소 정보를 불러오지 못했어요.")}
    onCandidateAction={openCandidateSchedule}
    onAddAnotherSchedule={openAddEditor}
    onRemoveCandidate={requestCandidateRemoval}
    renderCandidateExtra={data.sharedPreferenceEvidenceStatus === "loaded"
      ? (candidate) => <ApiCandidateSignalControl
          signal={data.sharedPreferenceEvidence?.candidateSignals
            .find((entry) => entry.placeId === candidate.placeId)?.signals
            .find((entry) => entry.userId === currentUserId)}
          disabled={!independentServerEditable || Boolean(signalSavingPlaceId)}
          onChange={(patch) => { void updateCandidateSignal(candidate.placeId, patch); }}
        />
      : undefined}
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
        <AppHeader title="여행 일정" subtitle={`${workspace.regionName} ${Math.max(workspace.dates.length - 1, 0)}박 ${workspace.dates.length}일 · ${formatTripDateRange(workspace.startDate, workspace.endDate)}`} onBack={returnFromWorkspace} />
        {backgroundRefreshFailed ? <View accessibilityRole="alert" style={styles.readOnly}><Text style={styles.readOnlyTitle}>최신 서버 일정을 확인하지 못했어요</Text><Text style={styles.readOnlyText}>보이는 일정은 마지막으로 확인한 사본입니다. 새 분석과 편집은 다시 불러오기 전까지 중지했어요.</Text><Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }} style={({ pressed }) => [styles.factEditButton, pressed && styles.pressed]}><Text style={styles.factEditText}>다시 불러오기</Text></Pressable></View> : null}
        {localDataUnavailable ? <View accessibilityRole="alert" style={styles.readOnly}><Text style={styles.readOnlyTitle}>기기 보조 정보를 불러오지 못했어요</Text><Text style={styles.readOnlyText}>서버 일정은 그대로 표시하지만 {unavailableLocalDataLabels} 정보를 미설정으로 추측하지 않습니다. 다시 읽기 전까지 일정 편집을 중지하고, 해당 정보가 필요한 분석만 제외합니다. 후보 관계와 서버 티켓은 계속 관리할 수 있어요.</Text><Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }} style={({ pressed }) => [styles.factEditButton, pressed && styles.pressed]}><Text style={styles.factEditText}>기기 정보 다시 읽기</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="손상된 기기 보조 정보 초기화" disabled={localDataResetting || saving || factsSaving} onPress={() => setLocalDataResetPending(true)} style={({ pressed }) => [styles.factEditButton, pressed && styles.pressed]}><Text style={styles.factEditText}>{localDataResetting ? "초기화 중…" : "손상된 기기 정보 초기화"}</Text></Pressable></View> : null}
        {!workspace.canEdit ? <View style={styles.readOnly}><Text style={styles.readOnlyTitle}>읽기 전용 워크스페이스</Text><Text style={styles.readOnlyText}>{workspace.readOnlyReason}</Text></View> : null}
        <WorkspaceFeedbackBanner message={feedback.message} onClose={() => setFeedback({ message: "" })} />
        <View style={styles.section}>
          <Text style={styles.eyebrow}>여행 날짜</Text>
          <WorkspaceDateTabs
            dates={workspace.dates}
            selectedDate={selectedDate}
            onSelect={setRequestedDate}
            onAddDay={addDay}
            onDeleteDay={setRemoveDayDate}
            onEditDateRange={() => setDateRangeEditorOpen(true)}
            onMoveDay={moveDay}
            addDisabled={!dateManagementEditable}
            managementDisabledReason={!isOwner ? "여행 날짜와 DAY 순서는 방장만 변경할 수 있어요." : undefined}
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
          canEdit={workspace.permissions.canEditSchedule && !saving}
          interactionItemId={draggingItemId}
          onAdd={openScheduleAddFlow}
          onEdit={openEditEditor}
          onMove={(itemId, startTime) => updateGridItem(itemId, { startTime })}
          onResize={(itemId, durationMinutes) => updateGridItem(itemId, { durationMinutes })}
          onInteractionStateChange={setDraggingItemId}
        /></WorkspaceDayPager> : null}
        <View style={styles.factRow}><View style={styles.factRowCopy}><Text style={styles.factRowTitle}>여행 설정</Text><Text numberOfLines={2} style={styles.factSummary}>{localFactsSummary}</Text></View>{factsEditable ? <Pressable accessibilityRole="button" accessibilityLabel="이동 방식 숙소 종료 조건 수정" onPress={() => setTripFactsEditorOpen(true)} style={({ pressed }) => [styles.factEditButton, pressed && styles.pressed]}><Text style={styles.factEditText}>설정</Text></Pressable> : null}</View>
        <View style={styles.serverNotice}><Text style={styles.serverNoticeTitle}>{saving ? "서버에 일정을 저장하고 있어요" : `서버 일정 v${activeSnapshot.scheduleVersion}`}</Text><Text style={styles.serverNoticeText}>변경은 성공 응답 후 확정되며, 다른 동행자의 변경과 충돌하면 최신 일정을 다시 불러옵니다.</Text></View>
      </ScrollView>
      <View style={styles.duriDock}><DuriAnalysisEntryCard
        itineraryCount={workspace.itineraryCount}
        session={analysisState.session}
        stale={analysisStale}
        loading={analysisState.status === "loading" || saving || factsSaving}
        engineAvailable={duriAnalysisService.available && Boolean(analysisInput) && !saving && !factsSaving && !backgroundRefreshFailed}
        engineMessage={localDataUnavailable
          ? "기기 보조 정보는 미설정으로 추측하지 않고 제외하며, 현재 서버 일정에서 확인 가능한 항목만 제한적으로 분석해요."
          : backgroundRefreshFailed
            ? "최신 서버 일정을 다시 불러온 뒤 분석할 수 있어요."
            : saving || factsSaving
              ? "일정과 여행 설정 저장이 끝난 뒤 확정된 현재 버전으로 분석할 수 있어요."
              : analysisInput
                ? duriAnalysisService.unavailableMessage
                : "현재 서버 일정을 분석 입력으로 구성하지 못했어요."}
        action={duriAction}
        onAction={() => {
          if (duriAction.destination === "schedule-add-flow") openScheduleAddFlow();
          else router.push({ pathname: "/trips/[tripId]/analysis", params: { tripId } });
        }}
      /></View>
      {selectedDateView ? <WorkspaceBoardSheet candidateBoard={candidateBoard} unscheduledCandidateCount={workspace.unscheduledCandidateCount} contentScrollEnabled={!draggingItemId} /> : null}
    </View>

    <SelectCandidateModal visible={selectCandidateOpen} candidates={candidateViews} onClose={() => setSelectCandidateOpen(false)} onSelect={(candidate) => { setSelectCandidateOpen(false); openAddEditor(candidate); }} onExplore={() => { setSelectCandidateOpen(false); explore(); }} />
    <ScheduleEditorModal
      visible={Boolean(editor)}
      editorKey={editor ? `${editor.mode}-${editor.mode === "add" ? editor.placeId : editor.itemId}` : "closed"}
      mode={editor?.mode ?? "add"}
      title={editorTitle}
      placeImageUrl={editorCandidate?.imageUrl ?? editorItemView?.imageUrl}
      placeAddress={editorCandidate?.address ?? editorPlace?.address}
      placeCategoryLabel={editorCandidate?.categoryLabel ?? editorItemView?.categoryLabel}
      tripId={tripId}
      currentUserId={currentUserId}
      dates={workspace.dates}
      itinerary={activeSnapshot.itinerary}
      endCondition={endConditionTimeline}
      editingItemId={editor?.mode === "edit" ? editor.itemId : undefined}
      initialValue={editor?.initialValue ?? { date: selectedDate, startTime: "08:00", endTime: "09:00", note: "", lockedForDuri: false, attachmentDocumentIds: [] }}
      attachmentsAvailable={false}
      attachmentsUnavailableMessage="공유 문서는 여행방 문서함에서 관리해요. 현재 일반 문서를 일정 항목에 직접 연결하는 API는 없으며, 이 일정의 입장권 이미지는 아래 서버 티켓에서 연결할 수 있어요."
      serverAttachmentContent={serverAttachmentContent}
      onClose={() => setEditor(undefined)}
      onSubmit={submitEditor}
      readOnly={!workspace.permissions.canEditSchedule}
      onRequestDelete={editor?.mode === "edit" && workspace.permissions.canDeleteSchedule ? () => { setRemoveItemId(editor.itemId); setEditor(undefined); } : undefined}
    />
    <WorkspaceDateRangeModal visible={dateRangeEditorOpen && dateManagementEditable} currentStartDate={workspace.startDate} currentEndDate={workspace.endDate} selectedDate={selectedDate} itinerary={activeSnapshot.itinerary} endConditionSummary={trip.endCondition ? `${trip.endCondition.location.name} · ${trip.endCondition.deadline}` : undefined} onClose={() => setDateRangeEditorOpen(false)} onSubmit={submitTripDateRange} />
    <WorkspaceTripFactsModal visible={tripFactsEditorOpen && factsEditable && !factsSaving} editorKey={`${trip.id}-${trip.transport}-${trip.endCondition?.deadline ?? "none"}`} initialValue={tripFactsDraft} onClose={() => setTripFactsEditorOpen(false)} onSubmit={submitTripFacts} />
    <ConfirmationModal visible={addDayConfirmationOpen} title="마지막 DAY를 추가할까요?" message={`복귀 조건 “${trip.endCondition?.location.name ?? ""} · ${trip.endCondition?.deadline ?? ""}”도 새 마지막 날에 적용됩니다. 예약 날짜를 확인해 주세요.`} confirmLabel="확인하고 DAY 추가" onClose={() => setAddDayConfirmationOpen(false)} onConfirm={performAddDay} />
    <ConfirmationModal
      visible={Boolean(removeDayDate)}
      title={`${workspace.dates.find((date) => date.date === removeDayDate)?.dayLabel ?? "DAY"}를 삭제할까요?`}
      message={`선택한 날짜의 일정 ${workspace.dates.find((date) => date.date === removeDayDate)?.itineraryCount ?? 0}개가 서버에서 함께 삭제되고, 뒤 DAY는 빈 날짜 없이 이동합니다. 티켓·예약이 있거나 잠긴 일정은 보호 검사를 다시 수행하며, 연결된 공유 TODO는 삭제하지 않고 일정 링크만 해제합니다.`}
      confirmLabel="영향 확인 후 DAY 삭제"
      onClose={() => setRemoveDayDate(undefined)}
      onConfirm={confirmDayRemoval}
    />
    <ConfirmationModal
      visible={Boolean(pendingTripDateChange)}
      title="날짜 변경으로 삭제되는 일정을 확인할까요?"
      message={(pendingTripDateChange?.impacts ?? []).map((impact) => `${impact.date} · ${impact.placeName}${impact.tickets.length ? ` · 티켓 ${impact.tickets.length}개` : ""}${impact.reservation ? ` · 예약 ${impact.reservation.status}` : ""}`).join("\n") || "삭제되는 일정을 확인해 주세요."}
      confirmLabel="삭제 영향 확인 후 날짜 변경"
      onClose={() => setPendingTripDateChange(undefined)}
      onConfirm={() => {
        const pending = pendingTripDateChange;
        setPendingTripDateChange(undefined);
        if (!pending) return;
        void commitTripDateChange(pending.result, pending.successMessage, pending.impacts.map((impact) => impact.itemId));
      }}
    />
    <ConfirmationModal visible={Boolean(removeItemId)} title="일정에서 제거할까요?" message="서버 일정 항목만 제거합니다. 후보 장소는 그대로 유지됩니다." confirmLabel="일정에서 제거" onClose={() => setRemoveItemId(undefined)} onConfirm={confirmItemRemoval} />
    <ConfirmationModal visible={Boolean(removeCandidateId)} title="후보에서 제거할까요?" message="내가 담은 관계만 서버에서 제거합니다. 다른 동행자가 담은 후보는 유지됩니다." confirmLabel="내 후보 선택 취소" onClose={() => setRemoveCandidateId(undefined)} onConfirm={() => void confirmCandidateRemoval()} />
    <ConfirmationModal
      visible={Boolean(pendingReservationImpact)}
      title="연결된 예약·티켓을 다시 확인할까요?"
      message={pendingReservationImpact?.message ?? ""}
      confirmLabel="영향 확인 후 저장"
      onClose={() => setPendingReservationImpact(undefined)}
      onConfirm={() => {
        const pending = pendingReservationImpact;
        setPendingReservationImpact(undefined);
        if (!pending) return;
        if (pending.baseScheduleVersion !== activeSnapshot.scheduleVersion) {
          showFeedback("확인하는 동안 서버 일정이 바뀌었어요. 최신 일정에서 변경을 다시 시도해 주세요.");
          return;
        }
        void commitSchedule(
          pending.draft,
          pending.successMessage,
          pending.confirmedTicketRemovalItemIds,
          true,
        );
      }}
    />
    <ConfirmationModal
      visible={Boolean(pendingTicketRemoval)}
      title="첨부 티켓이 있는 일정을 제거할까요?"
      message={`${pendingTicketRemoval?.placeName ?? "일정"}에 서버 티켓 ${pendingTicketRemoval?.ticketCount ?? 0}개가 연결되어 있어요. 일정 삭제 시 티켓 접근도 함께 사라질 수 있습니다.`}
      confirmLabel="티켓 영향 확인 후 제거"
      onClose={() => setPendingTicketRemoval(undefined)}
      onConfirm={() => {
        const pending = pendingTicketRemoval;
        setPendingTicketRemoval(undefined);
        if (!pending) return;
        if (pending.baseScheduleVersion !== activeSnapshot.scheduleVersion) {
          showFeedback("확인하는 동안 서버 일정이 바뀌었어요. 최신 일정에서 삭제를 다시 시도해 주세요.");
          return;
        }
        void commitSchedule(pending.draft, `${pending.placeName}을 일정에서 제거했어요.`, [pending.itemId], true);
      }}
    />
    <ConfirmationModal
      visible={localDataResetPending}
      title="손상된 기기 정보를 초기화할까요?"
      message={`서버 일정과 서버 티켓은 지우지 않습니다. 하지만 이 기기에만 저장된 ${data.localFactsStatus === "unavailable" ? "이동 방식·숙소·종료 조건" : ""}${data.localFactsStatus === "unavailable" && data.workspaceOverlayStatus === "unavailable" ? " 및 " : ""}${data.workspaceOverlayStatus === "unavailable" ? "일정 잠금·메모·종류·선호 표시" : ""}는 복구할 수 없게 지워질 수 있어요. 저장소 읽기 자체의 일시적 실패일 수도 있으니, 다시 읽기를 먼저 시도한 뒤 초기화하세요.`}
      confirmLabel="기기 정보 초기화"
      onClose={() => setLocalDataResetPending(false)}
      onConfirm={() => { void resetUnavailableLocalData(); }}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  canvasScroll: { flex: 1 },
  canvasContent: { width: "100%", paddingHorizontal: spacing.lg, paddingBottom: WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX + 94 },
  duriDock: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX + spacing.xs, zIndex: 30 },
  serverNotice: { gap: spacing.xxs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, padding: spacing.md, marginBottom: spacing.md },
  serverNoticeTitle: { ...typography.bodyStrong, color: colors.primary },
  serverNoticeText: { ...typography.caption, color: colors.textSecondary },
  readOnly: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md, marginBottom: spacing.md },
  readOnlyTitle: { ...typography.bodyStrong, color: colors.warning },
  readOnlyText: { ...typography.caption, color: colors.textSecondary },
  section: { gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.md },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  factSummary: { ...typography.caption, color: colors.textSecondary },
  factRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: spacing.md, marginTop: spacing.sm },
  factRowCopy: { flex: 1, minWidth: 0 },
  factRowTitle: { ...typography.bodyStrong, color: colors.text },
  factEditButton: { minHeight: 44, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md },
  factEditText: { ...typography.caption, color: colors.primary },
  eyebrow: { ...typography.caption, color: colors.primary },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  pressed: { opacity: 0.82 },
});
