import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Screen } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import type { ItineraryItem } from "../../../domain";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import { formatTripDateRange } from "../../../utils/formatters";
import { CandidateBoard } from "../components/CandidateBoard";
import { WorkspaceBoardSheet } from "../components/WorkspaceBoardSheet";
import { WorkspaceDateTabs } from "../components/WorkspaceDateTabs";
import { WorkspaceDayPager } from "../components/WorkspaceDayPager";
import { WorkspaceScheduleGrid } from "../components/WorkspaceScheduleGrid";
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
import { canRemoveCandidate } from "../logic/workspaceCapabilities";
import { WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX } from "../logic/workspaceBoardLayout";
import { getDefaultScheduleRange, getItineraryEndTime } from "../logic/workspaceDateTime";
import { resolveWorkspaceBackAction } from "../logic/workspaceNavigation";
import { buildTripEndConditionTimelineEntry } from "../logic/tripEndCondition";
import {
  buildCandidatePlaceViewModels,
  buildItineraryItemViewModels,
  buildWorkspaceViewModel,
  filterCandidatePlaceViewModels,
} from "../selectors/workspaceSelectors";
import { workspaceScheduleService } from "../services/workspaceDataPolicy";
import type { CandidateBoardFilter, CandidatePlaceViewModel, WorkspaceFeedback } from "../types";
import { DuriAnalysisEntryCard } from "../../duri/components/DuriAnalysisEntryCard";
import { buildDuriAnalysisInputWithDocuments } from "../../duri/logic/analysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../../duri/logic/analysisSnapshot";
import { duriAnalysisService } from "../../duri/services/duriAnalysisService";
import { useDuriAnalysisStore } from "../../duri/store/useDuriAnalysisStore";
import { useTripDocumentHydrationState, useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { isSuccessfulWorkspaceMutation, runWorkspaceTodoPostCommit } from "../../trip-todos/logic/todoAutomation";
import { syncDocumentOcrConfirmationTodo, syncWorkspaceScheduleImpactTodos } from "../../trip-todos/services/tripTodoAutomationService";
import { resolveScheduleDocumentLinkMutation } from "../validation/workspaceValidation";
import { ApiWorkspaceScreen } from "./ApiWorkspaceScreen";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];
const AUTOMATIC_SHIFT_LOCKING_DOCUMENT_KINDS = new Set(["accommodation", "admission", "train", "bus", "rental-car"]);

type EditorState =
  | { mode: "add"; placeId: string; initialValue: ScheduleEditorValue; documentLinksLoadedAtOpen: boolean }
  | { mode: "edit"; itemId: string; initialValue: ScheduleEditorValue; documentLinksLoadedAtOpen: boolean };

function mutationMessage(result: string) {
  if (result === "trip-not-editable") return "완료된 여행방은 수정할 수 없어요.";
  if (result === "not-member") return "이 여행방의 일정을 수정할 권한이 없어요.";
  if (result === "overlap") return "다른 일정과 시간이 겹쳐 변경하지 않았어요.";
  if (result === "duplicate-place") return "이미 여행 일정에 배치된 장소예요.";
  if (result === "boundary") return "이 방향으로는 더 이동할 수 없어요.";
  if (result === "invalid-date") return "여행 날짜를 확인해 주세요.";
  if (result === "invalid-itinerary") return "여행 기간 밖의 일정이 있어 변경하지 않았어요. 데이터 상태를 확인해 주세요.";
  if (result === "scheduled") return "일정에 배치된 후보예요. 먼저 모든 일정에서 제거해 주세요.";
  if (result === "end-condition") return "종료 지점 이동과 준비시간을 고려한 마지막 일정 종료 시각을 넘겨 저장할 수 없어요. 더 이른 시간을 선택하거나 마지막 일정을 줄여 주세요.";
  if (result === "invalid-attachment") return "선택한 문서가 문서함에서 변경되어 일정과 첨부를 함께 저장하지 않았어요.";
  return "요청을 처리하지 못했어요. 데이터를 다시 확인해 주세요.";
}

export function WorkspaceScreen() {
  return environment.dataSource === "api" ? <ApiWorkspaceScreen /> : <LocalWorkspaceScreen />;
}

function LocalWorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; duriApplied?: string | string[]; affectedDate?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const duriApplied = Array.isArray(params.duriApplied) ? params.duriApplied[0] : params.duriApplied;
  const affectedDate = Array.isArray(params.affectedDate) ? params.affectedDate[0] : params.affectedDate ?? "";
  const returnFromWorkspace = useCallback(() => {
    const action = resolveWorkspaceBackAction(router.canGoBack(), tripId);
    if (action.type === "back") {
      router.back();
      return;
    }
    router.replace(action.href);
  }, [router, tripId]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      returnFromWorkspace();
      return true;
    });
    return () => subscription.remove();
  }, [returnFromWorkspace]));

  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const hydrationError = useDuriHydrationState((state) => state.hydrationError);
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    usersById: state.usersById,
    regionsById: state.regionsById,
    placesById: state.placesById,
    tripsById: state.tripsById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
  })));
  const analysisState = useDuriAnalysisStore(useShallow((state) => ({
    session: state.sessionsByTripId[tripId],
    status: state.analysisStatusByTripId[tripId] ?? "idle",
  })));
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const addPlaceToItineraryWithId = useDuriStore((state) => state.addPlaceToItineraryWithId);
  const updateItineraryItem = useDuriStore((state) => state.updateItineraryItem);
  const extendTripByOneDay = useDuriStore((state) => state.extendTripByOneDay);
  const removeTripDay = useDuriStore((state) => state.removeTripDay);
  const moveTripDayToIndex = useDuriStore((state) => state.moveTripDayToIndex);
  const updateTripDateRange = useDuriStore((state) => state.updateTripDateRange);
  const updateTripPlanningFacts = useDuriStore((state) => state.updateTripPlanningFacts);
  const removeItineraryItem = useDuriStore((state) => state.removeItineraryItem);
  const removeCandidatePlace = useDuriStore((state) => state.removeCandidatePlace);
  const startTripExplore = useExploreSearchStore((state) => state.startTripExplore);
  const tripDocuments = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS);
  const documentsHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const documentHydrationError = useTripDocumentHydrationState((state) => state.hydrationError);
  const setLinksForItinerary = useTripDocumentStore((state) => state.setLinksForItinerary);
  const reconcileTripLinks = useTripDocumentStore((state) => state.reconcileTripLinks);

  const [requestedDate, setRequestedDate] = useState(affectedDate);
  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [candidateFilter, setCandidateFilter] = useState<CandidateBoardFilter>("all");
  const [selectCandidateOpen, setSelectCandidateOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [removeItemId, setRemoveItemId] = useState<string>();
  const [removeCandidateId, setRemoveCandidateId] = useState<string>();
  const [removeDayDate, setRemoveDayDate] = useState<string>();
  const [addDayConfirmationOpen, setAddDayConfirmationOpen] = useState(false);
  const [dateRangeEditorOpen, setDateRangeEditorOpen] = useState(false);
  const [tripFactsEditorOpen, setTripFactsEditorOpen] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string>();
  const [feedback, setFeedback] = useState<WorkspaceFeedback>(() => duriApplied === "1"
    ? { message: "두리의 제안을 일정에 반영했어요. 현재 일정으로 다시 분석할 수 있어요.", ...(affectedDate ? { targetDate: affectedDate } : {}) }
    : { message: "" });

  const today = dateToDateOnly(new Date());
  const workspace = useMemo(
    () => buildWorkspaceViewModel(source, tripId, requestedDate, sessionKind, today),
    [requestedDate, sessionKind, source, today, tripId],
  );
  const trip = source.tripsById[tripId];
  const endConditionTimeline = useMemo(
    () => trip ? buildTripEndConditionTimelineEntry(trip) : undefined,
    [trip],
  );
  const tripFactsDraft = useMemo<WorkspaceTripFactsDraft>(() => ({
    transport: trip?.transport ?? "public",
    accommodationLocation: trip?.accommodationLocation?.name ?? "",
    endCondition: trip?.endCondition
      ? {
          type: trip.endCondition.type,
          location: trip.endCondition.location.name,
          deadline: trip.endCondition.deadline,
          travelMinutes: String(trip.endCondition.travelMinutes),
          serviceBufferMinutes: String(trip.endCondition.serviceBufferMinutes),
          note: trip.endCondition.note ?? "",
        }
      : null,
  }), [trip]);
  const selectedDate = workspace?.selectedDate ?? "";
  const candidateViews = useMemo(
    () => workspace ? buildCandidatePlaceViewModels(source, tripId, selectedDate) : [],
    [selectedDate, source, tripId, workspace],
  );
  const filteredCandidates = useMemo(
    () => filterCandidatePlaceViewModels(candidateViews, candidateKeyword, candidateFilter, source.currentUserId),
    [candidateFilter, candidateKeyword, candidateViews, source.currentUserId],
  );
  const itineraryViews = useMemo(
    () => workspace ? buildItineraryItemViewModels(source, tripId, selectedDate, workspace.dates.map((date) => date.date)) : [],
    [selectedDate, source, tripId, workspace],
  );
  const selectedDateView = workspace?.dates.find((date) => date.date === selectedDate);
  const selectedDayIndex = workspace?.dates.findIndex((date) => date.date === selectedDate) ?? -1;
  const rawItinerary = useMemo(
    () => source.itineraryByTripId[tripId] ?? [],
    [source.itineraryByTripId, tripId],
  );
  const itineraryItemIdKey = useMemo(() => JSON.stringify(rawItinerary.map((item) => item.id).sort()), [rawItinerary]);
  const documentCollectionStatus = documentsHydrated ? "loaded" as const : documentHydrationError ? "unavailable" as const : undefined;
  const analysisInput = useMemo(
    () => documentCollectionStatus
      ? buildDuriAnalysisInputWithDocuments(source, tripId, tripDocuments, [], documentCollectionStatus)
      : undefined,
    [documentCollectionStatus, source, tripDocuments, tripId],
  );
  const automaticShiftProtectedItemIds = useMemo(() => {
    if (!analysisInput) return [];
    const protectedIds = new Set<string>();
    analysisInput.documentReferences.forEach((reference) => {
      if (!AUTOMATIC_SHIFT_LOCKING_DOCUMENT_KINDS.has(reference.kind)) return;
      reference.itineraryItemIds.forEach((itemId) => protectedIds.add(itemId));
    });
    analysisInput.confirmedScheduleConstraints.forEach((constraint) => {
      if (constraint.itineraryItemId) {
        protectedIds.add(constraint.itineraryItemId);
        return;
      }
      if (!constraint.placeId) return;
      rawItinerary
        .filter((item) => item.placeId === constraint.placeId && item.date === constraint.date)
        .forEach((item) => protectedIds.add(item.id));
    });
    return [...protectedIds];
  }, [analysisInput, rawItinerary]);
  const currentAnalysisFingerprint = useMemo(() => analysisInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(analysisInput)) : "", [analysisInput]);
  const analysisStale = Boolean(analysisState.session && analysisState.session.inputFingerprint !== currentAnalysisFingerprint);

  useEffect(() => {
    if (trip && trip.members.some((member) => member.userId === source.currentUserId)) setActiveTrip(trip.id);
  }, [setActiveTrip, source.currentUserId, trip]);

  useEffect(() => {
    if (!documentsHydrated || !tripId) return;
    reconcileTripLinks(tripId, JSON.parse(itineraryItemIdKey) as string[]);
  }, [documentsHydrated, itineraryItemIdKey, reconcileTripLinks, tripId]);

  useEffect(() => {
    if (!documentsHydrated || !tripId || !source.currentUserId) return;
    tripDocuments.forEach((document) => {
      if (!document.extraction) return;
      void syncDocumentOcrConfirmationTodo({
        tripId,
        document,
        createdByUserId: source.currentUserId,
      }).catch(() => undefined);
    });
  }, [documentsHydrated, source.currentUserId, tripDocuments, tripId]);

  if (!workspaceScheduleService.available) return <Screen><AppHeader title="여행 워크스페이스" onBack={returnFromWorkspace} /><ErrorState message={workspaceScheduleService.message ?? "워크스페이스 데이터 계약을 확인하고 있어요."} /></Screen>;
  if (hydrationError) return <Screen><AppHeader title="여행 워크스페이스" onBack={returnFromWorkspace} /><ErrorState message={hydrationError} /></Screen>;
  const canView = Boolean(trip && (sessionKind === "member" || sessionKind === "guest") && trip.members.some((member) => member.userId === source.currentUserId));
  if (!trip || !workspace || !canView) return <Screen><AppHeader title="여행 워크스페이스" onBack={returnFromWorkspace} /><ErrorState message={!trip ? "여행 정보를 찾을 수 없어요." : trip.dateUndecided ? "날짜 미정 여행방은 Day 1 초기 상태로 준비되어 있어요. 실제 날짜를 정하면 일정 편집 보드가 열립니다." : sessionKind === "anonymous" ? "로그인하거나 초대받은 여행방에 참여한 뒤 워크스페이스를 볼 수 있어요." : "여행 기간이 잘못되었거나 이 여행방의 참여 권한이 없어요."} /></Screen>;

  const explore = () => {
    setActiveTrip(trip.id);
    startTripExplore(trip.regionId);
    router.push(buildTripExploreHref({ tripId: trip.id, origin: "workspace" }));
  };

  const showFeedback = (message: string, targetDate?: string) => setFeedback({ message, ...(targetDate ? { targetDate } : {}) });

  const captureScheduleMutation = () => ({
    itinerary: (useDuriStore.getState().itineraryByTripId[tripId] ?? []).map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] })),
    documents: (useTripDocumentStore.getState().documentsByTripId[tripId] ?? []).map((document) => ({
      ...document,
      itineraryItemIds: [...document.itineraryItemIds],
    })),
  });

  const notifyScheduleImpacts = (mutationStatus: string, before: { itinerary: ItineraryItem[]; documents: TravelDocument[] }) => {
    void runWorkspaceTodoPostCommit(mutationStatus, async () => {
      const afterItinerary = useDuriStore.getState().itineraryByTripId[tripId] ?? [];
      const afterDocuments = useTripDocumentStore.getState().documentsByTripId[tripId] ?? [];
      const mergedDocumentsById = new Map(before.documents.map((document) => [document.id, document]));
      afterDocuments.forEach((document) => {
        const previous = mergedDocumentsById.get(document.id);
        mergedDocumentsById.set(document.id, previous
          ? { ...document, itineraryItemIds: [...new Set([...previous.itineraryItemIds, ...document.itineraryItemIds])] }
          : document);
      });
      const placeNameById = Object.fromEntries(Object.values(useDuriStore.getState().placesById).map((place) => [place.id, place.name]));
      await syncWorkspaceScheduleImpactTodos({
        beforeItinerary: before.itinerary,
        afterItinerary,
        documents: [...mergedDocumentsById.values()],
        createdByUserId: useDuriStore.getState().currentUserId,
        placeNameById,
      });
    });
  };

  const openAddEditor = (candidate: CandidatePlaceViewModel, allowRepeat = false) => {
    if (!workspace.canEdit) { showFeedback(workspace.readOnlyReason ?? "일정을 수정할 수 없어요."); return; }
    if (candidate.placeMissing) { showFeedback("장소 정보가 누락되어 일정에 추가할 수 없어요."); return; }
    if (!allowRepeat && candidate.scheduleState !== "unscheduled") {
      const targetDate = candidate.scheduleState === "scheduled-on-selected-date" ? selectedDate : candidate.scheduledDates[0];
      if (targetDate) setRequestedDate(targetDate);
      showFeedback("이미 일정에 배치된 장소예요.", targetDate);
      return;
    }
    const range = getDefaultScheduleRange(rawItinerary, selectedDate);
    setEditor({ mode: "add", placeId: candidate.placeId, documentLinksLoadedAtOpen: documentsHydrated, initialValue: { date: selectedDate, ...range, note: "", lockedForDuri: false, attachmentDocumentIds: [] } });
  };

  const openEditEditor = (itemId: string) => {
    const item = rawItinerary.find((entry) => entry.id === itemId);
    if (!item) { showFeedback("일정 항목을 찾을 수 없어요."); return; }
    if (!workspace.canEdit) { showFeedback(workspace.readOnlyReason ?? "일정을 수정할 수 없어요."); return; }
    setEditor({
      mode: "edit",
      itemId,
      documentLinksLoadedAtOpen: documentsHydrated,
      initialValue: {
        date: item.date,
        startTime: item.startTime,
        endTime: getItineraryEndTime(item),
        note: item.note ?? "",
        lockedForDuri: Boolean(item.lockedForDuri),
        attachmentDocumentIds: documentsHydrated
          ? tripDocuments.filter((document) => document.itineraryItemIds.includes(item.id)).map((document) => document.id)
          : [],
      },
    });
  };

  const submitEditor = (value: ScheduleEditorValue, durationMinutes: number) => {
    if (!editor) return "invalid-item" as const;
    const attachmentDocumentIds = [...new Set(value.attachmentDocumentIds ?? [])];
    const currentDocuments = useTripDocumentStore.getState().documentsByTripId[tripId] ?? [];
    const documentLinkMutation = resolveScheduleDocumentLinkMutation({
      documentsHydrated,
      requestedDocumentIds: attachmentDocumentIds,
      availableDocumentIds: new Set(currentDocuments.map((document) => document.id)),
      preserveExistingLinksWhenEmpty: editor.mode === "edit" && !editor.documentLinksLoadedAtOpen,
    });
    if (documentLinkMutation === "invalid") {
      return "invalid-attachment" as const;
    }
    const mutationSnapshot = captureScheduleMutation();
    const beforeItinerary = mutationSnapshot.itinerary;
    const rollbackItinerary = () => useDuriStore.setState((state) => ({
      itineraryByTripId: { ...state.itineraryByTripId, [tripId]: beforeItinerary },
    }));
    if (editor.mode === "add") {
      const candidate = candidateViews.find((view) => view.placeId === editor.placeId);
      const result = addPlaceToItineraryWithId({
        tripId,
        placeId: editor.placeId,
        date: value.date,
        startTime: value.startTime,
        durationMinutes,
        preferredByUserIds: candidate?.addedByUserIds,
        note: value.note,
        lockedForDuri: value.lockedForDuri,
      });
      if (result.status === "success") {
        if (documentLinkMutation === "apply" && !setLinksForItinerary(tripId, result.itemId, attachmentDocumentIds)) {
          rollbackItinerary();
          return "invalid-attachment" as const;
        }
        setRequestedDate(value.date);
        setEditor(undefined);
        showFeedback(`${candidate?.name ?? "후보 장소"}을 일정에 추가했어요. 후보 보드에는 그대로 남아 있어요.`);
      }
      return result.status;
    }
    const result = updateItineraryItem(tripId, editor.itemId, {
      date: value.date,
      startTime: value.startTime,
      durationMinutes,
      note: value.note.trim() || undefined,
      lockedForDuri: value.lockedForDuri,
    }, automaticShiftProtectedItemIds);
    if (isSuccessfulWorkspaceMutation(result)) {
      if (documentLinkMutation === "apply" && !setLinksForItinerary(tripId, editor.itemId, attachmentDocumentIds)) {
        rollbackItinerary();
        return "invalid-attachment" as const;
      }
      setRequestedDate(value.date);
      setEditor(undefined);
      showFeedback(result === "success-adjusted" ? "일정 변경을 저장했고, 두리가 종료 조건을 지키도록 마지막 날 전체 일정의 이동·대기 간격을 보존해 앞당겼어요." : "일정 변경을 저장했어요.", value.date);
      notifyScheduleImpacts(result, mutationSnapshot);
    }
    return result;
  };

  const moveGridItem = (itemId: string, startTime: string) => {
    const item = rawItinerary.find((entry) => entry.id === itemId);
    if (!item || item.startTime === startTime) return;
    const mutationSnapshot = captureScheduleMutation();
    const result = updateItineraryItem(tripId, itemId, { startTime }, automaticShiftProtectedItemIds);
    notifyScheduleImpacts(result, mutationSnapshot);
    showFeedback(isSuccessfulWorkspaceMutation(result)
      ? result === "success-adjusted" ? `두리가 종료 조건을 지키도록 마지막 날 일정 전체를 앞당겼어요.` : `일정을 ${startTime}로 옮겼어요.`
      : result === "overlap"
        ? "다른 일정과 시간이 겹쳐 원래 위치로 돌아왔어요."
        : mutationMessage(result));
  };

  const resizeGridItem = (itemId: string, durationMinutes: number) => {
    const item = rawItinerary.find((entry) => entry.id === itemId);
    if (!item || item.durationMinutes === durationMinutes) return;
    const mutationSnapshot = captureScheduleMutation();
    const result = updateItineraryItem(tripId, itemId, { durationMinutes }, automaticShiftProtectedItemIds);
    notifyScheduleImpacts(result, mutationSnapshot);
    showFeedback(isSuccessfulWorkspaceMutation(result)
      ? result === "success-adjusted" ? `체류시간을 바꾸고, 두리가 종료 조건을 지키도록 마지막 날 일정 전체를 앞당겼어요.` : `체류시간을 ${durationMinutes}분으로 변경했어요.`
      : result === "overlap"
        ? "늘린 시간이 다른 일정과 겹쳐 원래 길이로 돌아왔어요."
        : mutationMessage(result));
  };

  const performAddDay = () => {
    setAddDayConfirmationOpen(false);
    if (!workspace.canEdit) {
      showFeedback(workspace.readOnlyReason ?? "여행 날짜를 수정할 수 없어요.");
      return;
    }
    const result = extendTripByOneDay(tripId);
    if (result.status !== "success") {
      showFeedback(mutationMessage(result.status));
      return;
    }
    setRequestedDate(result.endDate);
    showFeedback(`DAY ${workspace.dates.length + 1}을 추가했어요.${trip.endCondition ? " 저장된 종료 조건이 새 마지막 날에 적용됩니다. 예약 날짜와 시간을 다시 확인해 주세요." : ""}`, result.endDate);
  };

  const addDay = () => {
    if (trip.endCondition) {
      setAddDayConfirmationOpen(true);
      return;
    }
    performAddDay();
  };

  const confirmDayRemoval = () => {
    if (!removeDayDate) return;
    const removedDay = workspace.dates.find((date) => date.date === removeDayDate);
    const mutationSnapshot = captureScheduleMutation();
    const result = removeTripDay(tripId, removeDayDate, automaticShiftProtectedItemIds);
    setRemoveDayDate(undefined);
    if (result.status !== "success") {
      showFeedback(mutationMessage(result.status));
      return;
    }
    setRequestedDate(result.selectedDate);
    notifyScheduleImpacts(result.status, mutationSnapshot);
    showFeedback(`${removedDay?.dayLabel ?? "DAY"}를 삭제했어요.${result.removedItineraryCount ? ` 해당 날짜의 일정 ${result.removedItineraryCount}개도 함께 삭제했어요.` : ""}${result.endConditionAdjusted ? " 두리가 종료 조건에 맞게 새 마지막 날 일정을 앞당겼어요." : ""}`, result.selectedDate);
  };

  const moveDay = (date: string, targetIndex: number) => {
    const sourceIndex = workspace.dates.findIndex((entry) => entry.date === date);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= workspace.dates.length) {
      showFeedback("이동할 DAY 위치를 확인해 주세요.");
      return false;
    }
    if (sourceIndex === targetIndex) {
      setRequestedDate(date);
      return true;
    }
    const movedItineraryCount = workspace.dates[sourceIndex]?.itineraryCount ?? 0;
    const mutationSnapshot = captureScheduleMutation();
    const result = moveTripDayToIndex(tripId, date, targetIndex, automaticShiftProtectedItemIds);
    if (result.status !== "success") {
      showFeedback(mutationMessage(result.status));
      return false;
    }
    setRequestedDate(result.selectedDate);
    notifyScheduleImpacts(result.status, mutationSnapshot);
    showFeedback(`DAY ${sourceIndex + 1}의 일정 ${movedItineraryCount}개를 DAY ${targetIndex + 1} 위치로 옮겼어요. 실제 여행 날짜 순서는 유지됩니다.${result.endConditionAdjusted ? " 두리가 종료 조건에 맞게 마지막 날 일정을 앞당겼어요." : ""}`, result.selectedDate);
    return true;
  };

  const submitTripDateRange = (startDate: string, endDate: string) => {
    const mutationSnapshot = captureScheduleMutation();
    const result = updateTripDateRange(tripId, startDate, endDate, selectedDate, automaticShiftProtectedItemIds);
    if (result.status === "success") {
      setRequestedDate(result.selectedDate);
      setDateRangeEditorOpen(false);
      notifyScheduleImpacts(result.status, mutationSnapshot);
      showFeedback(`여행 날짜를 ${formatTripDateRange(result.startDate, result.endDate)}로 변경했어요.${result.removedItineraryCount ? ` 일정 ${result.removedItineraryCount}개를 삭제했어요.` : ""}${result.endConditionAdjusted ? " 두리가 종료 조건에 맞게 마지막 날 일정을 앞당겼어요." : ""}${trip.endCondition ? " 종료 조건이 새 마지막 날에도 맞는지 예약 정보를 다시 확인해 주세요." : ""}`, result.selectedDate);
    }
    return result;
  };

  const submitTripPlanningFacts = (value: Parameters<typeof updateTripPlanningFacts>[1]) => {
    const mutationSnapshot = captureScheduleMutation();
    const existingAccommodation = trip.accommodationLocation;
    const existingEndLocation = trip.endCondition?.location;
    const result = updateTripPlanningFacts(tripId, {
      ...value,
      accommodationLocation: value.accommodationLocation
        ? {
            ...(existingAccommodation?.name === value.accommodationLocation.name ? existingAccommodation : {}),
            ...value.accommodationLocation,
          }
        : null,
      endCondition: value.endCondition
        ? {
            ...value.endCondition,
            location: {
              ...(existingEndLocation?.name === value.endCondition.location.name ? existingEndLocation : {}),
              ...value.endCondition.location,
            },
          }
        : null,
    }, automaticShiftProtectedItemIds);
    if (result === "success" || result === "success-adjusted") {
      notifyScheduleImpacts(result, mutationSnapshot);
      showFeedback(result === "success-adjusted"
        ? "여행 사실을 저장했고, 두리가 새 종료 조건에 맞게 마지막 날 전체 일정의 간격을 보존해 앞당겼어요."
        : "이동 방식·숙소·종료 조건을 저장했어요.");
    }
    return result;
  };

  const requestCandidateRemoval = (candidateView: CandidatePlaceViewModel) => {
    const candidate = (source.candidatesByTripId[tripId] ?? []).find((item) => item.placeId === candidateView.placeId);
    const decision = canRemoveCandidate({ sessionKind, currentUserId: source.currentUserId, trip, candidate, itinerary: rawItinerary });
    if (!decision.allowed) { showFeedback(decision.reason); return; }
    setRemoveCandidateId(candidateView.placeId);
  };

  const confirmItemRemoval = () => {
    if (!removeItemId) return;
    const item = rawItinerary.find((entry) => entry.id === removeItemId);
    const mutationSnapshot = captureScheduleMutation();
    const result = removeItineraryItem(tripId, removeItemId);
    setRemoveItemId(undefined);
    notifyScheduleImpacts(result, mutationSnapshot);
    showFeedback(result === "success" ? `${item?.placeId ? source.placesById[item.placeId]?.name ?? "장소" : "일정"}을 일정에서만 제거했어요. 후보는 그대로 남아 있어요.` : mutationMessage(result));
  };

  const confirmCandidateRemoval = () => {
    if (!removeCandidateId) return;
    const name = source.placesById[removeCandidateId]?.name ?? "후보 장소";
    const result = removeCandidatePlace(tripId, removeCandidateId);
    setRemoveCandidateId(undefined);
    showFeedback(result === "removed-contribution"
      ? `${name}에서 내 담기만 취소했어요. 다른 동행자가 담은 후보는 유지됩니다.`
      : result === "removed-candidate"
        ? `${name}을 후보 보드에서 제거했어요. 개인 저장에는 영향이 없어요.`
        : mutationMessage(result));
  };

  const editorTitle = editor?.mode === "add"
    ? candidateViews.find((candidate) => candidate.placeId === editor.placeId)?.name ?? "후보 장소"
    : editor
      ? rawItinerary.find((item) => item.id === editor.itemId)?.placeId
        ? source.placesById[rawItinerary.find((item) => item.id === editor.itemId)?.placeId ?? ""]?.name ?? "일정 편집"
        : "일정 편집"
      : "일정 편집";

  const candidateBoard = <CandidateBoard
    candidates={filteredCandidates}
    totalCount={workspace.candidateCount}
    unscheduledCount={workspace.unscheduledCandidateCount}
    keyword={candidateKeyword}
    filter={candidateFilter}
    canEdit={workspace.canEdit}
    onKeywordChange={setCandidateKeyword}
    onFilterChange={setCandidateFilter}
    onExplore={explore}
    onOpenCandidate={(placeId) => source.placesById[placeId] ? router.push({ pathname: "/places/[placeId]", params: { placeId } }) : showFeedback("장소 정보가 누락되어 상세 화면을 열 수 없어요.")}
    onCandidateAction={openAddEditor}
    onRemoveCandidate={requestCandidateRemoval}
  />;

  return <Screen scroll={false} padded={false} keyboardAware testID="workspace-editor-screen">
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
        {!workspace.canEdit ? <View style={styles.readOnly}><Text style={styles.readOnlyTitle}>읽기 전용 워크스페이스</Text><Text style={styles.readOnlyText}>{workspace.readOnlyReason}</Text></View> : null}
        <WorkspaceFeedbackBanner message={feedback.message} onClose={() => setFeedback({ message: "" })} />
        <View style={styles.section}>
          <Text style={styles.eyebrow}>TRIP DATES</Text>
          <View style={styles.sectionHeadingRow}><View style={styles.sectionHeadingCopy}><Text style={styles.sectionTitle}>여행 날짜</Text><Text numberOfLines={2} style={styles.factSummary}>{trip.transport === "car" ? "자차" : "대중교통 & 도보"} · 숙소 {trip.accommodationLocation?.name ?? "미입력"} · {trip.endCondition ? `${trip.endCondition.location.name} ${trip.endCondition.deadline}까지` : "종료 조건 없음"}</Text></View>{workspace.canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="이동 방식 숙소 종료 조건 수정" onPress={() => setTripFactsEditorOpen(true)} style={({ pressed }) => [styles.factEditButton, pressed && styles.pressed]}><Text style={styles.factEditText}>여행 사실 수정</Text></Pressable> : null}</View>
          <WorkspaceDateTabs dates={workspace.dates} selectedDate={selectedDate} onSelect={setRequestedDate} onAddDay={addDay} onDeleteDay={setRemoveDayDate} onEditDateRange={() => setDateRangeEditorOpen(true)} onMoveDay={moveDay} addDisabled={!workspace.canEdit} />
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
            canEdit={workspace.canEdit}
            interactionItemId={draggingItemId}
            onAdd={() => setSelectCandidateOpen(true)}
            onEdit={openEditEditor}
            onMove={moveGridItem}
            onResize={resizeGridItem}
            onInteractionStateChange={setDraggingItemId}
          /></WorkspaceDayPager> : null}
        <DuriAnalysisEntryCard
          itineraryCount={workspace.itineraryCount}
          session={analysisState.session}
          stale={analysisStale}
          loading={analysisState.status === "loading"}
          engineAvailable={duriAnalysisService.available && workspaceScheduleService.available && Boolean(documentCollectionStatus)}
          engineMessage={!workspaceScheduleService.available
            ? workspaceScheduleService.message
            : !documentCollectionStatus
              ? "첨부 문서 확인 상태를 불러온 뒤 분석할 수 있어요."
              : duriAnalysisService.unavailableMessage}
          onOpen={() => router.push({ pathname: "/trips/[tripId]/analysis", params: { tripId } })}
        />
      </ScrollView>
      {selectedDateView ? <WorkspaceBoardSheet
        candidateBoard={candidateBoard}
        unscheduledCandidateCount={workspace.unscheduledCandidateCount}
        contentScrollEnabled={!draggingItemId}
      /> : null}
    </View>

    <SelectCandidateModal visible={selectCandidateOpen} candidates={candidateViews} onClose={() => setSelectCandidateOpen(false)} onSelect={(candidate) => { setSelectCandidateOpen(false); openAddEditor(candidate, true); }} onExplore={() => { setSelectCandidateOpen(false); explore(); }} />
    <ScheduleEditorModal
      visible={Boolean(editor)}
      editorKey={editor ? `${editor.mode}-${editor.mode === "add" ? editor.placeId : editor.itemId}` : "closed"}
      mode={editor?.mode ?? "add"}
      title={editorTitle}
      tripId={tripId}
      currentUserId={source.currentUserId}
      dates={workspace.dates}
      itinerary={rawItinerary}
      endCondition={endConditionTimeline}
      editingItemId={editor?.mode === "edit" ? editor.itemId : undefined}
      initialValue={editor?.initialValue ?? { date: selectedDate, startTime: "08:00", endTime: "09:00", note: "", lockedForDuri: false, attachmentDocumentIds: [] }}
      onClose={() => setEditor(undefined)}
      onSubmit={submitEditor}
      onRequestDelete={editor?.mode === "edit" ? () => { setRemoveItemId(editor.itemId); setEditor(undefined); } : undefined}
    />
    <WorkspaceDateRangeModal visible={dateRangeEditorOpen} currentStartDate={workspace.startDate} currentEndDate={workspace.endDate} selectedDate={selectedDate} itinerary={rawItinerary} endConditionSummary={trip.endCondition ? `${trip.endCondition.location.name} · ${trip.endCondition.deadline}` : undefined} onClose={() => setDateRangeEditorOpen(false)} onSubmit={submitTripDateRange} />
    <WorkspaceTripFactsModal visible={tripFactsEditorOpen} editorKey={`${trip.id}-${trip.transport}-${trip.endCondition?.deadline ?? "none"}`} initialValue={tripFactsDraft} onClose={() => setTripFactsEditorOpen(false)} onSubmit={submitTripPlanningFacts} />
    <ConfirmationModal visible={addDayConfirmationOpen} title="마지막 DAY를 추가할까요?" message={`종료 조건 “${trip.endCondition?.location.name ?? ""} · ${trip.endCondition?.deadline ?? ""}”도 새 마지막 날로 이동합니다. 기차·버스·렌터카 예약 날짜를 확인한 뒤 추가해 주세요.`} confirmLabel="확인하고 DAY 추가" onClose={() => setAddDayConfirmationOpen(false)} onConfirm={performAddDay} />
    <ConfirmationModal visible={Boolean(removeDayDate)} title={`${workspace.dates.find((date) => date.date === removeDayDate)?.dayLabel ?? "DAY"}를 삭제할까요?`} message={`선택한 날짜의 일정 ${workspace.dates.find((date) => date.date === removeDayDate)?.itineraryCount ?? 0}개도 함께 삭제됩니다. 뒤쪽 DAY는 빈 날짜 없이 연속되도록 번호와 일정 날짜가 자동 조정됩니다.${trip.endCondition ? ` 종료 조건 “${trip.endCondition.location.name} · ${trip.endCondition.deadline}”도 새 마지막 날로 이동하므로 예약 날짜를 다시 확인해야 합니다.` : ""}`} confirmLabel="DAY 삭제" onClose={() => setRemoveDayDate(undefined)} onConfirm={confirmDayRemoval} />
    <ConfirmationModal visible={Boolean(removeItemId)} title="일정에서 제거할까요?" message="일정 항목만 제거됩니다. 후보 장소는 그대로 남아 있어 다시 배치할 수 있어요." confirmLabel="일정에서 제거" onClose={() => setRemoveItemId(undefined)} onConfirm={confirmItemRemoval} />
    <ConfirmationModal visible={Boolean(removeCandidateId)} title="후보에서 제거할까요?" message="내가 담은 관계만 제거합니다. 다른 동행자가 함께 담았다면 후보 장소는 보드에 유지돼요. 개인 저장에도 영향이 없습니다." confirmLabel="후보에서 제거" onClose={() => setRemoveCandidateId(undefined)} onConfirm={confirmCandidateRemoval} />
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
