import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderHandlers,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORKSPACE_START_MINUTES } from "../../../data/workspaceSchedule";
import type { ItineraryItem, TripEndConditionType, TripTransport } from "../../../domain";
import { PrimaryButton, SecondaryButton, TextField } from "../../../components/common";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import { findNextAvailableSlot } from "../../../utils/schedule";
import type {
  ItineraryMutationResult,
  TripDateMutationResult,
  TripPlanningFactsMutationResult,
  UpdateTripPlanningFactsInput,
} from "../../../store/useDuriStore";
import { normalizeSearchKeyword } from "../../places/logic/placeSearch";
import { TripDateRangeCalendar } from "../../trip-creation/components/TripDateRangeCalendar";
import {
  addMinutesToTime,
  buildTripDateRange,
  findConflictingItems,
  formatMinutesToTime,
  parseTimeToMinutes,
  remapScheduleToTripDateRange,
  validateTimeRange,
} from "../logic/workspaceDateTime";
import type { TripEndConditionTimelineEntry } from "../logic/tripEndCondition";
import {
  clampWorkspaceModalHeight,
  getInitialWorkspaceModalHeight,
  getWorkspaceModalHeightBounds,
  resizeWorkspaceModalHeight,
  stepWorkspaceModalHeight,
} from "../logic/workspaceModalLayout";
import type { CandidatePlaceViewModel, WorkspaceDate } from "../types";
import { WorkspaceTimeField } from "./WorkspaceTimeField";
import { ItineraryAttachmentPicker } from "../../trip-documents";
import type { CreateTripEndConditionDraft } from "../../trip-creation/types";
import { validateEndConditionDraft } from "../../trip-creation/validation/validateCreateTripDraft";

export type ScheduleEditorValue = {
  date: string;
  startTime: string;
  endTime: string;
  note: string;
  attachmentDocumentIds?: string[];
};

export type WorkspaceTripFactsDraft = {
  transport: TripTransport;
  accommodationLocation: string;
  endCondition: CreateTripEndConditionDraft | null;
};

const resultMessages: Partial<Record<ItineraryMutationResult, string>> = {
  "invalid-trip": "여행방 정보를 찾을 수 없어요.",
  "trip-not-editable": "완료된 여행방은 수정할 수 없어요.",
  "not-member": "이 여행방의 일정을 수정할 권한이 없어요.",
  "invalid-item": "일정 항목을 찾을 수 없어요.",
  "invalid-place": "장소 정보를 찾을 수 없어요.",
  "invalid-candidate": "후보 장소를 찾을 수 없어요.",
  "duplicate-place": "이미 이 여행 일정에 배치된 장소예요.",
  "invalid-date": "여행 기간 안의 날짜를 선택해 주세요.",
  "invalid-time": "시간 범위를 다시 확인해 주세요.",
  "invalid-attachment": "선택한 문서가 문서함에서 변경됐어요. 첨부를 다시 확인해 주세요.",
  overlap: "다른 일정과 시간이 겹쳐 저장하지 않았어요.",
  boundary: "더 이상 이동할 수 없어요.",
  "end-condition": "종료 지점 이동과 준비시간을 고려한 마지막 일정 종료 시각을 넘겨 저장할 수 없어요. 더 이른 시간을 선택해 주세요.",
};

function formatEndConditionCutoff(entry: TripEndConditionTimelineEntry) {
  if (entry.cutoffMinutes < WORKSPACE_START_MINUTES) return "08:00 이전";
  return formatMinutesToTime(entry.cutoffMinutes) ?? "--:--";
}

function ModalFrame({ visible, title, subtitle, resizable = false, onClose, children }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  resizable?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bounds = useMemo(
    () => getWorkspaceModalHeightBounds(windowHeight, insets.top, insets.bottom),
    [insets.bottom, insets.top, windowHeight],
  );
  const boundsRef = useRef(bounds);
  const [sheetHeight, setSheetHeight] = useState(() => getInitialWorkspaceModalHeight(windowHeight, bounds));
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers>({});
  const heightRef = useRef(sheetHeight);
  const dragStartRef = useRef(sheetHeight);

  const updateHeight = useCallback((height: number) => {
    const next = clampWorkspaceModalHeight(height, boundsRef.current);
    heightRef.current = next;
    setSheetHeight(next);
  }, []);

  useEffect(() => {
    boundsRef.current = bounds;
    updateHeight(heightRef.current);
  }, [bounds, updateHeight]);

  useEffect(() => {
    if (!resizable) return;
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        dragStartRef.current = heightRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        updateHeight(resizeWorkspaceModalHeight(dragStartRef.current, gesture.dy, boundsRef.current));
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
    setPanHandlers(responder.panHandlers);
  }, [resizable, updateHeight]);

  const adjustHeight = (direction: -1 | 1) => {
    updateHeight(stepWorkspaceModalHeight(heightRef.current, direction, boundsRef.current));
  };

  return <Modal visible={visible} transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} 닫기`} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.sheet, resizable && styles.resizableSheet, resizable && { height: sheetHeight }, { paddingBottom: (resizable ? spacing.sm : spacing.xl) + insets.bottom, marginLeft: insets.left, marginRight: insets.right }]}>
        {resizable ? <View
          {...panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${title} 창 높이 조절`}
          accessibilityHint="위로 끌어 늘리고 아래로 끌어 줄이거나 접근성 조절 동작을 사용하세요"
          accessibilityValue={{
            min: Math.round(bounds.minHeight),
            max: Math.round(bounds.maxHeight),
            now: Math.round(sheetHeight),
            text: `${Math.round(sheetHeight)}픽셀`,
          }}
          accessibilityActions={[
            { name: "increment", label: "창 높이 20픽셀 늘리기" },
            { name: "decrement", label: "창 높이 20픽셀 줄이기" },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") adjustHeight(1);
            if (event.nativeEvent.actionName === "decrement") adjustHeight(-1);
          }}
          style={styles.resizeHandleZone}
          testID="workspace-modal-resize-handle"
        ><View style={styles.handle} /></View> : <View style={styles.passiveHandleZone}><View style={styles.handle} /></View>}
        <View style={styles.modalHeader}><View style={styles.modalCopy}><Text style={styles.modalTitle}>{title}</Text>{subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel={`${title} 닫기`} onPress={onClose} style={styles.close}><Text style={styles.closeText}>닫기</Text></Pressable></View>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function ScheduleEditorModal({
  visible,
  editorKey,
  mode,
  title,
  tripId,
  currentUserId,
  dates,
  itinerary,
  endCondition,
  editingItemId,
  initialValue,
  onClose,
  onSubmit,
  onRequestDelete,
}: {
  visible: boolean;
  editorKey: string;
  mode: "add" | "edit";
  title: string;
  tripId: string;
  currentUserId: string;
  dates: readonly WorkspaceDate[];
  itinerary: readonly ItineraryItem[];
  endCondition?: TripEndConditionTimelineEntry;
  editingItemId?: string;
  initialValue: ScheduleEditorValue;
  onClose: () => void;
  onSubmit: (value: ScheduleEditorValue, durationMinutes: number) => ItineraryMutationResult;
  onRequestDelete?: () => void;
}) {
  if (!visible) return null;
  return <ScheduleEditorModalContent
    key={editorKey}
    mode={mode}
    title={title}
    tripId={tripId}
    currentUserId={currentUserId}
    dates={dates}
    itinerary={itinerary}
    endCondition={endCondition}
    editingItemId={editingItemId}
    initialValue={initialValue}
    onClose={onClose}
    onSubmit={onSubmit}
    onRequestDelete={onRequestDelete}
  />;
}

function ScheduleEditorModalContent({
  mode,
  title,
  tripId,
  currentUserId,
  dates,
  itinerary,
  endCondition,
  editingItemId,
  initialValue,
  onClose,
  onSubmit,
  onRequestDelete,
}: {
  mode: "add" | "edit";
  title: string;
  tripId: string;
  currentUserId: string;
  dates: readonly WorkspaceDate[];
  itinerary: readonly ItineraryItem[];
  endCondition?: TripEndConditionTimelineEntry;
  editingItemId?: string;
  initialValue: ScheduleEditorValue;
  onClose: () => void;
  onSubmit: (value: ScheduleEditorValue, durationMinutes: number) => ItineraryMutationResult;
  onRequestDelete?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitError, setSubmitError] = useState("");

  const timeValidation = validateTimeRange(value.startTime, value.endTime);
  const dateValid = dates.some((date) => date.date === value.date);
  const activeEndCondition = endCondition?.date === value.date ? endCondition : undefined;
  const proposedEndMinutes = timeValidation.valid ? parseTimeToMinutes(value.endTime) : null;
  const endConditionConflict = Boolean(
    mode === "add"
      && activeEndCondition
      && proposedEndMinutes !== null
      && proposedEndMinutes > activeEndCondition.cutoffMinutes,
  );
  const conflicts = timeValidation.valid && dateValid
    ? findConflictingItems(itinerary, value, editingItemId)
    : [];
  const suggestedTime = timeValidation.valid && conflicts.length
    ? findNextAvailableSlot({
        items: [...itinerary],
        date: value.date,
        durationMinutes: timeValidation.durationMinutes,
        excludeItemId: editingItemId,
      })
    : undefined;

  const setDuration = (durationMinutes: number) => {
    const endTime = addMinutesToTime(value.startTime, durationMinutes);
    if (endTime) setValue((current) => ({ ...current, endTime }));
  };

  const submit = () => {
    setSubmitError("");
    if (!dateValid) { setSubmitError("여행 기간 안의 날짜를 선택해 주세요."); return; }
    if (!timeValidation.valid) { setSubmitError(timeValidation.message); return; }
    if (endConditionConflict && activeEndCondition) {
      setSubmitError(`종료 지점 이동과 준비시간을 고려하면 마지막 일정은 ${formatEndConditionCutoff(activeEndCondition)}까지 끝나야 해요. 선택한 시간에는 추가할 수 없습니다.`);
      return;
    }
    if (conflicts.length) { setSubmitError(`기존 일정 ${conflicts.map((item) => `${item.startTime}~${addMinutesToTime(item.startTime, item.durationMinutes) ?? "--:--"}`).join(", ")}과 시간이 겹쳐요.`); return; }
    const result = onSubmit(value, timeValidation.durationMinutes);
    if (result !== "success" && result !== "success-adjusted") setSubmitError(resultMessages[result] ?? "일정을 저장하지 못했어요.");
  };

  return <ModalFrame visible title={mode === "add" ? "일정에 추가" : "일정 편집"} subtitle={title} onClose={onClose}>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
      <Text style={styles.fieldTitle}>날짜</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateOptions} accessibilityRole="tablist">
        {dates.map((date) => <Pressable key={date.date} accessibilityRole="tab" accessibilityState={{ selected: value.date === date.date }} onPress={() => setValue((current) => ({ ...current, date: date.date }))} style={({ pressed }) => [styles.dateOption, value.date === date.date && styles.dateOptionSelected, pressed && styles.pressed]}><Text style={[styles.dateDay, value.date === date.date && styles.dateTextSelected]}>{date.dayLabel}</Text><Text style={[styles.dateLabel, value.date === date.date && styles.dateTextSelected]}>{date.monthDayLabel} {date.weekdayLabel}</Text><Text style={[styles.dateCount, value.date === date.date && styles.dateCountSelected]}>{date.itineraryCount}개</Text></Pressable>)}
      </ScrollView>
      {activeEndCondition ? <View accessibilityRole={endConditionConflict ? "alert" : undefined} style={[styles.endConditionNotice, endConditionConflict && styles.endConditionNoticeConflict]}>
        <Text style={styles.endConditionNoticeTitle}>마지막 날 복귀 조건</Text>
        <Text style={styles.endConditionNoticeText}>마지막 일정은 {formatEndConditionCutoff(activeEndCondition)}까지 끝나야 {activeEndCondition.locationName}에 {activeEndCondition.deadline}까지 도착할 수 있어요.</Text>
        <Text style={styles.endConditionNoticeMeta}>예상 이동 {activeEndCondition.travelMinutes}분 + 준비 {activeEndCondition.serviceBufferMinutes}분</Text>
      </View> : null}
      <View style={styles.timeFields}><View style={styles.timeField}><WorkspaceTimeField label="시작 시간" value={value.startTime} onChange={(startTime) => setValue((current) => ({ ...current, startTime }))} error={!timeValidation.valid ? timeValidation.message : undefined} /></View><View style={styles.timeField}><WorkspaceTimeField label="종료 시간" value={value.endTime} onChange={(endTime) => setValue((current) => ({ ...current, endTime }))} allowEndOfDay /></View></View>
      <View><Text style={styles.fieldTitle}>빠른 체류 시간</Text><View style={styles.durationOptions}>{[15, 30, 60, 90, 120].map((minutes) => <Pressable key={minutes} accessibilityRole="button" accessibilityLabel={`체류 ${minutes}분`} onPress={() => setDuration(minutes)} style={({ pressed }) => [styles.duration, pressed && styles.pressed]}><Text style={styles.durationText}>{minutes}분</Text></Pressable>)}</View></View>
      <TextField label="메모" value={value.note} onChangeText={(note) => setValue((current) => ({ ...current, note }))} placeholder="동행자와 공유할 메모" maxLength={120} multiline />
      <ItineraryAttachmentPicker
        tripId={tripId}
        currentUserId={currentUserId}
        selectedDocumentIds={value.attachmentDocumentIds ?? []}
        onChange={(attachmentDocumentIds) => setValue((current) => ({ ...current, attachmentDocumentIds }))}
      />
      <View style={styles.existing}><Text style={styles.fieldTitle}>이 날짜의 기존 일정</Text>{itinerary.filter((item) => item.date === value.date && item.id !== editingItemId).length ? itinerary.filter((item) => item.date === value.date && item.id !== editingItemId).map((item) => <Text key={item.id} style={styles.existingText}>• {item.startTime}–{addMinutesToTime(item.startTime, item.durationMinutes) ?? "--:--"} · {item.note ?? "장소 일정"}</Text>) : <Text style={styles.existingText}>아직 일정이 없어요.</Text>}</View>
      {conflicts.length ? <View accessibilityRole="alert" style={styles.conflictBox}><Text style={styles.conflictTitle}>시간이 겹치는 일정이 있어요</Text><Text style={styles.conflictText}>겹침을 무시하고 저장하지 않습니다. 시간을 조정해 주세요.</Text>{suggestedTime ? <Pressable accessibilityRole="button" onPress={() => setValue((current) => ({ ...current, startTime: suggestedTime, endTime: addMinutesToTime(suggestedTime, timeValidation.valid ? timeValidation.durationMinutes : 60) ?? current.endTime }))} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestedTime} 빈 시간 적용</Text></Pressable> : null}</View> : null}
      {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{submitError}</Text> : null}
      <View style={styles.editorActions}><PrimaryButton label={mode === "add" ? "일정에 추가" : "변경 저장"} disabled={endConditionConflict} onPress={submit} />{mode === "edit" && onRequestDelete ? <SecondaryButton label="일정에서 삭제" onPress={onRequestDelete} /> : null}<SecondaryButton label="취소" onPress={onClose} /></View>
    </ScrollView>
  </ModalFrame>;
}

export function SelectCandidateModal({
  visible,
  candidates,
  onClose,
  onSelect,
  onExplore,
}: {
  visible: boolean;
  candidates: readonly CandidatePlaceViewModel[];
  onClose: () => void;
  onSelect: (candidate: CandidatePlaceViewModel) => void;
  onExplore: () => void;
}) {
  if (!visible) return null;
  return <SelectCandidateModalContent candidates={candidates} onClose={onClose} onSelect={onSelect} onExplore={onExplore} />;
}

function SelectCandidateModalContent({
  candidates,
  onClose,
  onSelect,
  onExplore,
}: {
  candidates: readonly CandidatePlaceViewModel[];
  onClose: () => void;
  onSelect: (candidate: CandidatePlaceViewModel) => void;
  onExplore: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const filtered = useMemo(() => {
    const normalized = normalizeSearchKeyword(keyword);
    return [...candidates].sort((left, right) => Number(left.scheduleState !== "unscheduled") - Number(right.scheduleState !== "unscheduled")).filter((candidate) => !normalized || normalizeSearchKeyword([candidate.name, candidate.categoryLabel, candidate.address, ...candidate.tags].join(" ")).includes(normalized));
  }, [candidates, keyword]);
  return <ModalFrame visible resizable title="후보에서 일정 추가" subtitle="상단 손잡이로 창 높이를 자유롭게 조절하세요" onClose={onClose}>
    <View style={styles.selectContent}>
      <TextField label="후보 검색" value={keyword} onChangeText={setKeyword} placeholder="장소명 또는 카테고리" returnKeyType="search" />
      <ScrollView style={styles.candidateList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.candidateRows}>
        {filtered.map((candidate) => {
          const disabled = candidate.scheduleState !== "unscheduled" || candidate.placeMissing;
          return <Pressable key={candidate.placeId} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => onSelect(candidate)} style={({ pressed }) => [styles.candidateRow, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><View style={styles.candidateRowCopy}><Text style={styles.candidateName}>{candidate.name}</Text><Text style={styles.candidateMeta}>{candidate.categoryLabel} · {candidate.scheduleState === "unscheduled" ? "미배치" : "이미 일정에 배치됨"}</Text></View><Text style={styles.choose}>{disabled ? "선택 불가" : "선택"}</Text></Pressable>;
        })}
        {!filtered.length ? <View style={styles.selectEmpty}><Text style={styles.candidateName}>선택할 후보가 없어요</Text><Text style={styles.modalSubtitle}>검색어를 바꾸거나 새 장소를 후보에 담아보세요.</Text></View> : null}
      </ScrollView>
      <SecondaryButton label="장소 찾아보기" onPress={onExplore} />
    </View>
  </ModalFrame>;
}

export function WorkspaceDateRangeModal({
  visible,
  currentStartDate,
  currentEndDate,
  selectedDate,
  itinerary,
  endConditionSummary,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  currentStartDate: string;
  currentEndDate: string;
  selectedDate: string;
  itinerary: readonly ItineraryItem[];
  endConditionSummary?: string;
  onClose: () => void;
  onSubmit: (startDate: string, endDate: string) => TripDateMutationResult;
}) {
  if (!visible) return null;
  return <WorkspaceDateRangeModalContent
    key={`${currentStartDate}-${currentEndDate}`}
    currentStartDate={currentStartDate}
    currentEndDate={currentEndDate}
    selectedDate={selectedDate}
    itinerary={itinerary}
    endConditionSummary={endConditionSummary}
    onClose={onClose}
    onSubmit={onSubmit}
  />;
}

function WorkspaceDateRangeModalContent({
  currentStartDate,
  currentEndDate,
  selectedDate,
  itinerary,
  endConditionSummary,
  onClose,
  onSubmit,
}: {
  currentStartDate: string;
  currentEndDate: string;
  selectedDate: string;
  itinerary: readonly ItineraryItem[];
  endConditionSummary?: string;
  onClose: () => void;
  onSubmit: (startDate: string, endDate: string) => TripDateMutationResult;
}) {
  const [startDate, setStartDate] = useState<string | null>(currentStartDate);
  const [endDate, setEndDate] = useState<string | null>(currentEndDate);
  const [confirmingShorterRange, setConfirmingShorterRange] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const currentDayCount = buildTripDateRange(currentStartDate, currentEndDate).length;
  const nextDayCount = buildTripDateRange(startDate, endDate).length;
  const preview = remapScheduleToTripDateRange(
    itinerary,
    currentStartDate,
    currentEndDate,
    startDate,
    endDate,
    selectedDate,
  );
  const removedDayCount = Math.max(currentDayCount - nextDayCount, 0);
  const removedItineraryCount = preview.status === "success" ? preview.removedItineraryCount : 0;
  const valid = preview.status === "success" && Boolean(startDate && endDate);
  const endConditionDateChanged = Boolean(endConditionSummary && endDate && endDate !== currentEndDate);

  const changeRange = (nextStartDate: string | null, nextEndDate: string | null) => {
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setConfirmingShorterRange(false);
    setSubmitError("");
  };

  const submit = () => {
    setSubmitError("");
    if (!valid || !startDate || !endDate) {
      setSubmitError(preview.status === "invalid-itinerary" ? "여행 기간 밖의 일정이 있어 날짜를 변경할 수 없어요. 먼저 데이터 상태를 확인해 주세요." : "시작일과 종료일을 올바르게 선택해 주세요.");
      return;
    }
    if ((removedDayCount > 0 || endConditionDateChanged) && !confirmingShorterRange) {
      setConfirmingShorterRange(true);
      return;
    }
    const result = onSubmit(startDate, endDate);
    if (result.status !== "success") {
      setSubmitError(result.status === "invalid-itinerary" ? "여행 기간 밖의 일정이 있어 변경하지 않았어요." : "여행 날짜를 변경하지 못했어요. 현재 데이터를 다시 확인해 주세요.");
    }
  };

  return <ModalFrame visible title="여행 날짜 변경" subtitle={`${currentStartDate} ~ ${currentEndDate}`} onClose={onClose}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
      <TripDateRangeCalendar startDate={startDate} endDate={endDate} onChange={changeRange} />
      {valid ? <View style={[styles.dateChangeNotice, (removedDayCount > 0 || endConditionDateChanged) && styles.dateChangeWarning]}>
        <Text style={styles.dateChangeTitle}>{nextDayCount}일 여행으로 변경</Text>
        <Text style={styles.dateChangeText}>기존 일정은 DAY 번호를 기준으로 새 날짜에 함께 이동합니다.</Text>
        {removedDayCount > 0 ? <Text style={styles.dateChangeDanger}>뒤쪽 DAY {removedDayCount}개{removedItineraryCount ? `와 일정 ${removedItineraryCount}개` : ""}가 삭제됩니다.</Text> : null}
        {endConditionDateChanged ? <Text style={styles.dateChangeDanger}>종료 조건 “{endConditionSummary}”도 새 마지막 날에 적용됩니다. 기차·버스·반납 예약 날짜를 반드시 다시 확인해 주세요.</Text> : null}
      </View> : null}
      {confirmingShorterRange ? <View accessibilityRole="alert" style={styles.conflictBox}><Text style={styles.conflictTitle}>{removedDayCount > 0 ? "여행 기간을 줄일까요?" : "종료 조건 날짜도 바꿀까요?"}</Text><Text style={styles.conflictText}>{removedDayCount > 0 ? "삭제되는 뒤쪽 DAY는 복구할 수 없습니다. " : ""}{endConditionDateChanged ? "저장된 종료 조건이 새 마지막 날 기준으로 이동합니다. " : ""}한 번 더 눌러 변경을 확정해 주세요.</Text></View> : null}
      {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{submitError}</Text> : null}
      <PrimaryButton label={confirmingShorterRange ? "확인하고 날짜 변경" : "날짜 변경 저장"} disabled={!valid} onPress={submit} />
      <SecondaryButton label="취소" onPress={onClose} />
    </ScrollView>
  </ModalFrame>;
}

const factTransportOptions: readonly { value: TripTransport; label: string; description: string }[] = [
  { value: "public", label: "대중교통 & 도보", description: "기차·버스·지하철과 도보 이동을 기준으로 기록해요." },
  { value: "car", label: "자차", description: "자가용 또는 렌터카 이동을 기준으로 기록해요." },
];

const factEndConditionOptions: readonly { value: TripEndConditionType | "none"; label: string }[] = [
  { value: "none", label: "종료 조건 없음" },
  { value: "train", label: "기차역 복귀" },
  { value: "intercity-bus", label: "버스 터미널 복귀" },
  { value: "rental-car-return", label: "렌터카 반납" },
  { value: "other", label: "기타 종료 지점" },
];

const tripFactResultMessages: Record<Exclude<TripPlanningFactsMutationResult, "success" | "success-adjusted">, string> = {
  "invalid-trip": "여행방 정보를 찾을 수 없어요.",
  "trip-not-editable": "완료된 여행방의 사실 정보는 수정할 수 없어요.",
  "not-member": "이 여행방의 사실 정보를 수정할 권한이 없어요.",
  "invalid-facts": "이동 방식·숙소·종료 조건 입력값을 다시 확인해 주세요.",
  "end-condition": "현재 일정의 순서·체류시간·이동 및 대기 간격을 유지하면 새 종료 조건을 맞출 수 없어요. 마지막 일정을 줄이거나 제외한 뒤 다시 저장해 주세요.",
};

export function WorkspaceTripFactsModal({
  visible,
  editorKey,
  initialValue,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  editorKey: string;
  initialValue: WorkspaceTripFactsDraft;
  onClose(): void;
  onSubmit(value: UpdateTripPlanningFactsInput): TripPlanningFactsMutationResult;
}) {
  if (!visible) return null;
  return <WorkspaceTripFactsModalContent
    key={editorKey}
    initialValue={initialValue}
    onClose={onClose}
    onSubmit={onSubmit}
  />;
}

function WorkspaceTripFactsModalContent({
  initialValue,
  onClose,
  onSubmit,
}: {
  initialValue: WorkspaceTripFactsDraft;
  onClose(): void;
  onSubmit(value: UpdateTripPlanningFactsInput): TripPlanningFactsMutationResult;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitError, setSubmitError] = useState("");
  const endConditionError = value.endCondition ? validateEndConditionDraft(value.endCondition) : undefined;
  const validationError = value.accommodationLocation.trim().length > 100
    ? "숙소 위치는 100자 이하로 입력해 주세요."
    : endConditionError;

  const selectEndCondition = (type: TripEndConditionType | "none") => {
    setSubmitError("");
    setValue((current) => ({
      ...current,
      endCondition: type === "none"
        ? null
        : current.endCondition?.type === type
          ? current.endCondition
          : {
              type,
              location: "",
              deadline: "18:00",
              travelMinutes: "30",
              serviceBufferMinutes: "30",
              note: "",
            },
    }));
  };

  const updateEndCondition = (patch: Partial<CreateTripEndConditionDraft>) => {
    setSubmitError("");
    setValue((current) => current.endCondition
      ? { ...current, endCondition: { ...current.endCondition, ...patch } }
      : current);
  };

  const submit = () => {
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    const endCondition = value.endCondition;
    const result = onSubmit({
      transport: value.transport,
      accommodationLocation: value.accommodationLocation.trim()
        ? { name: value.accommodationLocation.trim() }
        : null,
      endCondition: endCondition
        ? {
            type: endCondition.type,
            location: { name: endCondition.location.trim() },
            deadline: endCondition.deadline,
            travelMinutes: Number(endCondition.travelMinutes),
            serviceBufferMinutes: Number(endCondition.serviceBufferMinutes),
            ...(endCondition.note.trim() ? { note: endCondition.note.trim() } : {}),
          }
        : null,
    });
    if (result === "success" || result === "success-adjusted") {
      onClose();
      return;
    }
    setSubmitError(tripFactResultMessages[result]);
  };

  return <ModalFrame
    visible
    title="여행 사실 수정"
    subtitle="개인 성향이 아닌 이동·숙소·예약 종료 조건만 기록해요."
    onClose={onClose}
  >
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
      <View style={styles.factNotice}><Text style={styles.factNoticeTitle}>실제 예약 정보를 기준으로 입력해 주세요.</Text><Text style={styles.factNoticeText}>현재 앱은 경로 API를 사용하지 않으므로 마지막 일정에서 종료 지점까지의 예상 이동시간은 직접 확인한 값입니다.</Text></View>
      <View style={styles.dateOptions}><Text style={styles.fieldTitle}>이동 방식</Text>{factTransportOptions.map((option) => <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityState={{ checked: value.transport === option.value }}
        onPress={() => { setSubmitError(""); setValue((current) => ({ ...current, transport: option.value })); }}
        style={({ pressed }) => [styles.factOption, value.transport === option.value && styles.factOptionSelected, pressed && styles.pressed]}
      ><View style={styles.candidateRowCopy}><Text style={styles.candidateName}>{option.label}</Text><Text style={styles.candidateMeta}>{option.description}</Text></View><Text style={styles.factCheck}>{value.transport === option.value ? "✓" : "○"}</Text></Pressable>)}</View>
      <TextField label="숙소 위치 (선택)" value={value.accommodationLocation} onChangeText={(accommodationLocation) => { setSubmitError(""); setValue((current) => ({ ...current, accommodationLocation })); }} placeholder="예: 부산역 근처 호텔" maxLength={100} />
      <View style={styles.dateOptions}><Text style={styles.fieldTitle}>마지막 날 종료 조건</Text><View style={styles.factChoiceWrap}>{factEndConditionOptions.map((option) => {
        const selected = (value.endCondition?.type ?? "none") === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => selectEndCondition(option.value)} style={({ pressed }) => [styles.factChoice, selected && styles.factChoiceSelected, pressed && styles.pressed]}><Text style={[styles.factChoiceText, selected && styles.factChoiceTextSelected]}>{option.label}</Text></Pressable>;
      })}</View></View>
      {value.endCondition ? <View style={styles.endConditionFields}>
        <TextField label="종료 지점" value={value.endCondition.location} onChangeText={(location) => updateEndCondition({ location })} placeholder="예: 부산역, 렌터카 반납 지점" maxLength={100} />
        <WorkspaceTimeField label="도착 또는 반납 마감 시각" value={value.endCondition.deadline} onChange={(deadline) => updateEndCondition({ deadline })} error={endConditionError?.includes("종료 시각") ? endConditionError : undefined} />
        <TextField label="마지막 일정에서 종료 지점까지 예상 이동시간 (분)" value={value.endCondition.travelMinutes} onChangeText={(travelMinutes) => updateEndCondition({ travelMinutes: travelMinutes.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={4} />
        <TextField label="승차 준비 또는 반납에 필요한 시간 (분)" value={value.endCondition.serviceBufferMinutes} onChangeText={(serviceBufferMinutes) => updateEndCondition({ serviceBufferMinutes: serviceBufferMinutes.replace(/\D/g, "") })} keyboardType="number-pad" maxLength={3} />
        <TextField label="종료 조건 메모 (선택)" value={value.endCondition.note} onChangeText={(note) => updateEndCondition({ note })} maxLength={300} multiline />
      </View> : null}
      {submitError || validationError ? <Text accessibilityRole={submitError ? "alert" : undefined} style={styles.submitError}>{submitError || validationError}</Text> : null}
      <PrimaryButton label="여행 사실 저장" disabled={Boolean(validationError)} onPress={submit} />
      <SecondaryButton label="취소" onPress={onClose} />
    </ScrollView>
  </ModalFrame>;
}

export function ConfirmationModal({
  visible,
  title,
  message,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return <ModalFrame visible={visible} title={title} onClose={onClose}>
    <View style={styles.confirmContent}><Text style={styles.confirmMessage}>{message}</Text><PrimaryButton label={confirmLabel} onPress={onConfirm} /><SecondaryButton label="취소" onPress={onClose} /></View>
  </ModalFrame>;
}

export function WorkspaceFeedbackBanner({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return <View accessibilityRole="alert" style={styles.feedback}><Text style={styles.feedbackText}>{message}</Text><Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" onPress={onClose} style={styles.feedbackClose}><Text style={styles.feedbackCloseText}>닫기</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: { maxHeight: "92%", overflow: "hidden", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, paddingBottom: spacing.xl },
  resizableSheet: { maxHeight: "100%" },
  passiveHandleZone: { height: 32, alignItems: "center", justifyContent: "center" },
  resizeHandleZone: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  handle: { width: 48, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  modalCopy: { flex: 1, gap: 2 },
  modalTitle: { ...typography.title, color: colors.text },
  modalSubtitle: { ...typography.caption, color: colors.textSecondary },
  close: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  closeText: { ...typography.caption, color: colors.primary },
  editorContent: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  fieldTitle: { ...typography.bodyStrong, color: colors.text, marginBottom: spacing.xs },
  dateOptions: { gap: spacing.xs },
  dateOption: { minWidth: 96, minHeight: 68, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm },
  dateOptionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateDay: { ...typography.caption, color: colors.primary },
  dateLabel: { ...typography.bodyStrong, color: colors.text },
  dateCount: { ...typography.caption, color: colors.textMuted },
  dateCountSelected: { color: colors.primarySoft },
  dateTextSelected: { color: colors.white },
  timeFields: { flexDirection: "row", gap: spacing.sm },
  timeField: { flex: 1 },
  endConditionNotice: { gap: spacing.xxs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, padding: spacing.md },
  endConditionNoticeConflict: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  endConditionNoticeTitle: { ...typography.bodyStrong, color: colors.warning },
  endConditionNoticeText: { ...typography.caption, color: colors.text },
  endConditionNoticeMeta: { ...typography.caption, color: colors.textSecondary },
  durationOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  duration: { minHeight: sizes.touch, minWidth: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  durationText: { ...typography.caption, color: colors.primary },
  existing: { borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  existingText: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  conflictBox: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md },
  conflictTitle: { ...typography.bodyStrong, color: colors.warning },
  conflictText: { ...typography.caption, color: colors.textSecondary },
  suggestion: { minHeight: sizes.touch, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface },
  suggestionText: { ...typography.bodyStrong, color: colors.primary },
  submitError: { ...typography.caption, color: colors.danger },
  editorActions: { gap: spacing.sm },
  selectContent: { flex: 1, minHeight: 0, gap: spacing.md, paddingHorizontal: spacing.lg },
  candidateList: { flex: 1, minHeight: 0 },
  candidateRows: { gap: spacing.xs, paddingBottom: spacing.md },
  candidateRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  candidateRowCopy: { flex: 1, minWidth: 0 },
  candidateName: { ...typography.bodyStrong, color: colors.text },
  candidateMeta: { ...typography.caption, color: colors.textSecondary },
  choose: { ...typography.caption, color: colors.primary },
  disabled: { opacity: 0.48 },
  selectEmpty: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  dateChangeNotice: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.md },
  dateChangeWarning: { backgroundColor: colors.dangerSoft },
  dateChangeTitle: { ...typography.bodyStrong, color: colors.text },
  dateChangeText: { ...typography.caption, color: colors.textSecondary },
  dateChangeDanger: { ...typography.caption, color: colors.danger },
  factNotice: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md },
  factNoticeTitle: { ...typography.bodyStrong, color: colors.warning },
  factNoticeText: { ...typography.caption, color: colors.textSecondary },
  factOption: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  factOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  factCheck: { ...typography.subtitle, color: colors.primary },
  factChoiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  factChoice: { minHeight: sizes.touch, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  factChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  factChoiceText: { ...typography.caption, color: colors.textSecondary },
  factChoiceTextSelected: { color: colors.primary },
  endConditionFields: { gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  confirmContent: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  confirmMessage: { ...typography.body, color: colors.textSecondary },
  feedback: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.successSoft, padding: spacing.md },
  feedbackText: { ...typography.bodyStrong, color: colors.success, flex: 1 },
  feedbackClose: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
  feedbackCloseText: { ...typography.caption, color: colors.success },
  pressed: { opacity: 0.82 },
});
