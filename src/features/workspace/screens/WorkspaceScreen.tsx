import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Screen } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import { formatTripDateRange } from "../../../utils/formatters";
import { CandidateBoard } from "../components/CandidateBoard";
import { WorkspaceBoardSheet, type WorkspaceBoardSheetSnap, type WorkspaceBoardTab } from "../components/WorkspaceBoardSheet";
import { WorkspaceDateTabs } from "../components/WorkspaceDateTabs";
import { WorkspaceDayCanvas } from "../components/WorkspaceDayCanvas";
import { WorkspaceDayPager } from "../components/WorkspaceDayPager";
import { WorkspaceItinerary } from "../components/WorkspaceItinerary";
import {
  ConfirmationModal,
  ScheduleEditorModal,
  SelectCandidateModal,
  WorkspaceFeedbackBanner,
  type ScheduleEditorValue,
} from "../components/WorkspaceEditorModals";
import { canRemoveCandidate } from "../logic/workspaceCapabilities";
import { getDefaultScheduleRange, getItineraryEndTime } from "../logic/workspaceDateTime";
import {
  buildCandidatePlaceViewModels,
  buildItineraryItemViewModels,
  buildWorkspaceViewModel,
  filterCandidatePlaceViewModels,
} from "../selectors/workspaceSelectors";
import { workspaceScheduleService } from "../services/workspaceDataPolicy";
import type { CandidateBoardFilter, CandidatePlaceViewModel, WorkspaceFeedback } from "../types";
import { DuriAnalysisEntryCard } from "../../duri/components/DuriAnalysisEntryCard";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../../duri/logic/analysisSnapshot";
import { buildDuriAnalysisInputFromState } from "../../duri/selectors/duriSelectors";
import { duriAnalysisService } from "../../duri/services/duriAnalysisService";
import { useDuriAnalysisStore } from "../../duri/store/useDuriAnalysisStore";

type EditorState =
  | { mode: "add"; placeId: string; initialValue: ScheduleEditorValue }
  | { mode: "edit"; itemId: string; initialValue: ScheduleEditorValue };

function mutationMessage(result: string) {
  if (result === "trip-not-editable") return "완료된 여행방은 수정할 수 없어요.";
  if (result === "not-member") return "이 여행방의 일정을 수정할 권한이 없어요.";
  if (result === "overlap") return "다른 일정과 시간이 겹쳐 변경하지 않았어요.";
  if (result === "duplicate-place") return "이미 여행 일정에 배치된 장소예요.";
  if (result === "boundary") return "이 방향으로는 더 이동할 수 없어요.";
  if (result === "invalid-date") return "여행 날짜를 확인해 주세요.";
  if (result === "scheduled") return "일정에 배치된 후보예요. 먼저 모든 일정에서 제거해 주세요.";
  return "요청을 처리하지 못했어요. 데이터를 다시 확인해 주세요.";
}

export function WorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; duriApplied?: string | string[]; affectedDate?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const duriApplied = Array.isArray(params.duriApplied) ? params.duriApplied[0] : params.duriApplied;
  const affectedDate = Array.isArray(params.affectedDate) ? params.affectedDate[0] : params.affectedDate ?? "";
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    usersById: state.usersById,
    regionsById: state.regionsById,
    placesById: state.placesById,
    tripsById: state.tripsById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
    hydrationError: state.hydrationError,
  })));
  const analysisState = useDuriAnalysisStore(useShallow((state) => ({
    session: state.sessionsByTripId[tripId],
    status: state.analysisStatusByTripId[tripId] ?? "idle",
  })));
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const addPlaceToItinerary = useDuriStore((state) => state.addPlaceToItinerary);
  const updateItineraryItem = useDuriStore((state) => state.updateItineraryItem);
  const moveItineraryItem = useDuriStore((state) => state.moveItineraryItem);
  const moveItineraryItemToIndex = useDuriStore((state) => state.moveItineraryItemToIndex);
  const extendTripByOneDay = useDuriStore((state) => state.extendTripByOneDay);
  const removeItineraryItem = useDuriStore((state) => state.removeItineraryItem);
  const removeCandidatePlace = useDuriStore((state) => state.removeCandidatePlace);
  const startTripExplore = useExploreSearchStore((state) => state.startTripExplore);

  const [requestedDate, setRequestedDate] = useState(affectedDate);
  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [candidateFilter, setCandidateFilter] = useState<CandidateBoardFilter>("all");
  const [activeBoard, setActiveBoard] = useState<WorkspaceBoardTab>("itinerary");
  const [boardSnap, setBoardSnap] = useState<WorkspaceBoardSheetSnap>("mid");
  const [selectCandidateOpen, setSelectCandidateOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>();
  const [removeItemId, setRemoveItemId] = useState<string>();
  const [removeCandidateId, setRemoveCandidateId] = useState<string>();
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
  const rawItinerary = source.itineraryByTripId[tripId] ?? [];
  const analysisInput = useMemo(() => buildDuriAnalysisInputFromState(source, tripId), [source, tripId]);
  const currentAnalysisFingerprint = useMemo(() => analysisInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(analysisInput)) : "", [analysisInput]);
  const analysisStale = Boolean(analysisState.session && analysisState.session.inputFingerprint !== currentAnalysisFingerprint);

  useEffect(() => {
    if (trip && trip.members.some((member) => member.userId === source.currentUserId)) setActiveTrip(trip.id);
  }, [setActiveTrip, source.currentUserId, trip]);

  if (!workspaceScheduleService.available) return <Screen><AppHeader title="여행 워크스페이스" onBack={() => router.back()} /><ErrorState message={workspaceScheduleService.message ?? "워크스페이스 데이터 계약을 확인하고 있어요."} /></Screen>;
  if (source.hydrationError) return <Screen><AppHeader title="여행 워크스페이스" onBack={() => router.back()} /><ErrorState message={source.hydrationError} /></Screen>;
  const canView = Boolean(trip && (sessionKind === "member" || sessionKind === "guest") && trip.members.some((member) => member.userId === source.currentUserId));
  if (!trip || !workspace || !canView) return <Screen><AppHeader title="여행 워크스페이스" onBack={() => router.back()} /><ErrorState message={!trip ? "여행 정보를 찾을 수 없어요." : sessionKind === "anonymous" ? "로그인하거나 초대받은 여행방에 참여한 뒤 워크스페이스를 볼 수 있어요." : "여행 기간이 잘못되었거나 이 여행방의 참여 권한이 없어요."} /></Screen>;

  const explore = () => {
    setActiveTrip(trip.id);
    startTripExplore(trip.regionId);
    router.push("/(tabs)/explore");
  };

  const showFeedback = (message: string, targetDate?: string) => setFeedback({ message, ...(targetDate ? { targetDate } : {}) });

  const openAddEditor = (candidate: CandidatePlaceViewModel) => {
    if (!workspace.canEdit) { showFeedback(workspace.readOnlyReason ?? "일정을 수정할 수 없어요."); return; }
    if (candidate.placeMissing) { showFeedback("장소 정보가 누락되어 일정에 추가할 수 없어요."); return; }
    if (candidate.scheduleState !== "unscheduled") {
      const targetDate = candidate.scheduleState === "scheduled-on-selected-date" ? selectedDate : candidate.scheduledDates[0];
      if (targetDate) setRequestedDate(targetDate);
      showFeedback("이미 일정에 배치된 장소예요.", targetDate);
      return;
    }
    const range = getDefaultScheduleRange(rawItinerary, selectedDate);
    setEditor({ mode: "add", placeId: candidate.placeId, initialValue: { date: selectedDate, ...range, note: "" } });
  };

  const openEditEditor = (itemId: string) => {
    const item = rawItinerary.find((entry) => entry.id === itemId);
    if (!item) { showFeedback("일정 항목을 찾을 수 없어요."); return; }
    if (!workspace.canEdit) { showFeedback(workspace.readOnlyReason ?? "일정을 수정할 수 없어요."); return; }
    setEditor({
      mode: "edit",
      itemId,
      initialValue: { date: item.date, startTime: item.startTime, endTime: getItineraryEndTime(item), note: item.note ?? "" },
    });
  };

  const submitEditor = (value: ScheduleEditorValue, durationMinutes: number) => {
    if (!editor) return "invalid-item" as const;
    if (editor.mode === "add") {
      const candidate = candidateViews.find((view) => view.placeId === editor.placeId);
      const result = addPlaceToItinerary({
        tripId,
        placeId: editor.placeId,
        date: value.date,
        startTime: value.startTime,
        durationMinutes,
        preferredByUserIds: candidate?.addedByUserIds,
        note: value.note,
      });
      if (result === "success") {
        setRequestedDate(value.date);
        setEditor(undefined);
        showFeedback(`${candidate?.name ?? "후보 장소"}을 일정에 추가했어요. 후보 보드에는 그대로 남아 있어요.`);
      }
      return result;
    }
    const result = updateItineraryItem(tripId, editor.itemId, {
      date: value.date,
      startTime: value.startTime,
      durationMinutes,
      note: value.note.trim() || undefined,
    });
    if (result === "success") {
      setRequestedDate(value.date);
      setEditor(undefined);
      showFeedback("일정 변경을 저장했어요.", value.date);
    }
    return result;
  };

  const moveItem = (itemId: string, direction: "up" | "down") => {
    const result = moveItineraryItem(tripId, itemId, direction);
    showFeedback(result === "success" ? `일정을 ${direction === "up" ? "위" : "아래"}로 이동하고 시간을 다시 배치했어요.` : mutationMessage(result));
  };

  const moveItemToIndex = (itemId: string, targetIndex: number) => {
    const currentIndex = itineraryViews.findIndex((item) => item.id === itemId);
    if (currentIndex === targetIndex) return;
    const result = moveItineraryItemToIndex(tripId, itemId, targetIndex);
    showFeedback(result === "success" ? "일정 순서를 변경하고 시간을 다시 배치했어요." : mutationMessage(result));
  };

  const addDay = () => {
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
    showFeedback(`DAY ${workspace.dates.length + 1}을 추가했어요.`, result.endDate);
  };

  const openBoard = (tab: WorkspaceBoardTab, snap: WorkspaceBoardSheetSnap = "expanded") => {
    setActiveBoard(tab);
    setBoardSnap(snap);
  };

  const changeBoard = (tab: WorkspaceBoardTab) => {
    setActiveBoard(tab);
    if (boardSnap === "collapsed") setBoardSnap("mid");
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
    const result = removeItineraryItem(tripId, removeItemId);
    setRemoveItemId(undefined);
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

  const itineraryBoard = selectedDateView ? <WorkspaceItinerary
    date={selectedDateView}
    items={itineraryViews}
    unscheduledCandidateCount={workspace.unscheduledCandidateCount}
    canEdit={workspace.canEdit}
    onAdd={() => setSelectCandidateOpen(true)}
    onExplore={explore}
    onMoveUp={(itemId) => moveItem(itemId, "up")}
    onMoveDown={(itemId) => moveItem(itemId, "down")}
    onMoveToIndex={moveItemToIndex}
    onEdit={openEditEditor}
    onRemove={setRemoveItemId}
    onDragStateChange={setDraggingItemId}
  /> : null;

  const candidateBoard = <CandidateBoard
    candidates={filteredCandidates}
    totalCount={workspace.candidateCount}
    unscheduledCount={workspace.unscheduledCandidateCount}
    keyword={candidateKeyword}
    filter={candidateFilter}
    canEdit={workspace.canEdit}
    onKeywordChange={setCandidateKeyword}
    onFilterChange={setCandidateFilter}
    onSearchFocus={() => setBoardSnap("expanded")}
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
        scrollEnabled={!draggingItemId}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title={workspace.title} subtitle={`${workspace.regionName} · ${formatTripDateRange(workspace.startDate, workspace.endDate)}`} onBack={() => router.back()} />
        <View style={styles.metrics}><Metric value={workspace.candidateCount} label="후보" /><Metric value={workspace.unscheduledCandidateCount} label="미배치" /><Metric value={workspace.itineraryCount} label="일정" /><Metric value={workspace.memberCount} label="동행자" /></View>
        {!workspace.canEdit ? <View style={styles.readOnly}><Text style={styles.readOnlyTitle}>읽기 전용 워크스페이스</Text><Text style={styles.readOnlyText}>{workspace.readOnlyReason}</Text></View> : null}
        <WorkspaceFeedbackBanner message={feedback.message} onClose={() => setFeedback({ message: "" })} />
        <View style={styles.section}><Text style={styles.eyebrow}>TRIP DATES</Text><Text style={styles.sectionTitle}>여행 날짜</Text><WorkspaceDateTabs dates={workspace.dates} selectedDate={selectedDate} onSelect={setRequestedDate} onAddDay={addDay} addDisabled={!workspace.canEdit} /></View>
        {selectedDateView ? <WorkspaceDayPager
          selectedIndex={Math.max(selectedDayIndex, 0)}
          dayCount={workspace.dates.length}
          disabled={Boolean(draggingItemId)}
          onSelectIndex={(index) => {
            const nextDate = workspace.dates[index]?.date;
            if (nextDate) setRequestedDate(nextDate);
          }}
        ><WorkspaceDayCanvas
            date={selectedDateView}
            items={itineraryViews}
            onOpenItinerary={() => openBoard("itinerary")}
            onOpenCandidates={() => openBoard("candidates")}
          /></WorkspaceDayPager> : null}
        <DuriAnalysisEntryCard
          itineraryCount={workspace.itineraryCount}
          session={analysisState.session}
          stale={analysisStale}
          loading={analysisState.status === "loading"}
          engineAvailable={duriAnalysisService.available && workspaceScheduleService.available}
          engineMessage={!workspaceScheduleService.available ? workspaceScheduleService.message : duriAnalysisService.unavailableMessage}
          onOpen={() => router.push({ pathname: "/trips/[tripId]/analysis", params: { tripId } })}
        />
      </ScrollView>
      {selectedDateView ? <WorkspaceBoardSheet
        activeTab={activeBoard}
        snap={boardSnap}
        dayLabel={selectedDateView.dayLabel}
        dateLabel={`${selectedDateView.monthDayLabel} ${selectedDateView.weekdayLabel}`}
        itineraryCount={itineraryViews.length}
        candidateCount={workspace.candidateCount}
        itineraryBoard={itineraryBoard}
        candidateBoard={candidateBoard}
        contentScrollEnabled={!draggingItemId}
        onTabChange={changeBoard}
        onSnapChange={setBoardSnap}
      /> : null}
    </View>

    <SelectCandidateModal visible={selectCandidateOpen} candidates={candidateViews} onClose={() => setSelectCandidateOpen(false)} onSelect={(candidate) => { setSelectCandidateOpen(false); openAddEditor(candidate); }} onExplore={() => { setSelectCandidateOpen(false); explore(); }} />
    <ScheduleEditorModal
      visible={Boolean(editor)}
      editorKey={editor ? `${editor.mode}-${editor.mode === "add" ? editor.placeId : editor.itemId}` : "closed"}
      mode={editor?.mode ?? "add"}
      title={editorTitle}
      dates={workspace.dates}
      itinerary={rawItinerary}
      editingItemId={editor?.mode === "edit" ? editor.itemId : undefined}
      initialValue={editor?.initialValue ?? { date: selectedDate, startTime: "08:00", endTime: "09:00", note: "" }}
      onClose={() => setEditor(undefined)}
      onSubmit={submitEditor}
      onRequestDelete={editor?.mode === "edit" ? () => { setRemoveItemId(editor.itemId); setEditor(undefined); } : undefined}
    />
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
  canvasContent: { width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: spacing.lg, paddingBottom: 260 },
  metrics: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  metric: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  metricValue: { ...typography.subtitle, color: colors.primary },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  readOnly: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md, marginBottom: spacing.md },
  readOnlyTitle: { ...typography.bodyStrong, color: colors.warning },
  readOnlyText: { ...typography.caption, color: colors.textSecondary },
  section: { gap: spacing.sm, marginVertical: spacing.lg },
  eyebrow: { ...typography.caption, color: colors.primary },
  sectionTitle: { ...typography.subtitle, color: colors.text },
});
