import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ItineraryItem } from "../../../domain";
import { PrimaryButton, SecondaryButton, TextField } from "../../../components/common";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import { findNextAvailableSlot } from "../../../utils/schedule";
import type { ItineraryMutationResult } from "../../../store/useDuriStore";
import { normalizeSearchKeyword } from "../../places/logic/placeSearch";
import {
  addMinutesToTime,
  findConflictingItems,
  validateTimeRange,
} from "../logic/workspaceDateTime";
import type { CandidatePlaceViewModel, WorkspaceDate } from "../types";
import { WorkspaceTimeField } from "./WorkspaceTimeField";

export type ScheduleEditorValue = {
  date: string;
  startTime: string;
  endTime: string;
  note: string;
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
  overlap: "다른 일정과 시간이 겹쳐 저장하지 않았어요.",
  boundary: "더 이상 이동할 수 없어요.",
};

function ModalFrame({ visible, title, subtitle, onClose, children }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} 닫기`} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.modalHeader}><View style={styles.modalCopy}><Text style={styles.modalTitle}>{title}</Text>{subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel={`${title} 닫기`} onPress={onClose} style={styles.close}><Text style={styles.closeText}>닫기</Text></Pressable></View>
        {children}
      </View>
    </View>
  </Modal>;
}

export function ScheduleEditorModal({
  visible,
  editorKey,
  mode,
  title,
  dates,
  itinerary,
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
  dates: readonly WorkspaceDate[];
  itinerary: readonly ItineraryItem[];
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
    dates={dates}
    itinerary={itinerary}
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
  dates,
  itinerary,
  editingItemId,
  initialValue,
  onClose,
  onSubmit,
  onRequestDelete,
}: {
  mode: "add" | "edit";
  title: string;
  dates: readonly WorkspaceDate[];
  itinerary: readonly ItineraryItem[];
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
    if (conflicts.length) { setSubmitError(`기존 일정 ${conflicts.map((item) => `${item.startTime}~${addMinutesToTime(item.startTime, item.durationMinutes) ?? "--:--"}`).join(", ")}과 시간이 겹쳐요.`); return; }
    const result = onSubmit(value, timeValidation.durationMinutes);
    if (result !== "success") setSubmitError(resultMessages[result] ?? "일정을 저장하지 못했어요.");
  };

  return <ModalFrame visible title={mode === "add" ? "일정에 추가" : "일정 편집"} subtitle={title} onClose={onClose}>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorContent}>
      <Text style={styles.fieldTitle}>날짜</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateOptions} accessibilityRole="tablist">
        {dates.map((date) => <Pressable key={date.date} accessibilityRole="tab" accessibilityState={{ selected: value.date === date.date }} onPress={() => setValue((current) => ({ ...current, date: date.date }))} style={({ pressed }) => [styles.dateOption, value.date === date.date && styles.dateOptionSelected, pressed && styles.pressed]}><Text style={[styles.dateDay, value.date === date.date && styles.dateTextSelected]}>{date.dayLabel}</Text><Text style={[styles.dateLabel, value.date === date.date && styles.dateTextSelected]}>{date.monthDayLabel} {date.weekdayLabel}</Text><Text style={[styles.dateCount, value.date === date.date && styles.dateCountSelected]}>{date.itineraryCount}개</Text></Pressable>)}
      </ScrollView>
      <View style={styles.timeFields}><View style={styles.timeField}><WorkspaceTimeField label="시작 시간" value={value.startTime} onChange={(startTime) => setValue((current) => ({ ...current, startTime }))} error={!timeValidation.valid ? timeValidation.message : undefined} /></View><View style={styles.timeField}><WorkspaceTimeField label="종료 시간" value={value.endTime} onChange={(endTime) => setValue((current) => ({ ...current, endTime }))} /></View></View>
      <View><Text style={styles.fieldTitle}>빠른 체류 시간</Text><View style={styles.durationOptions}>{[30, 60, 90, 120].map((minutes) => <Pressable key={minutes} accessibilityRole="button" accessibilityLabel={`체류 ${minutes}분`} onPress={() => setDuration(minutes)} style={({ pressed }) => [styles.duration, pressed && styles.pressed]}><Text style={styles.durationText}>{minutes}분</Text></Pressable>)}</View></View>
      <TextField label="메모" value={value.note} onChangeText={(note) => setValue((current) => ({ ...current, note }))} placeholder="동행자와 공유할 메모" maxLength={120} multiline />
      <View style={styles.existing}><Text style={styles.fieldTitle}>이 날짜의 기존 일정</Text>{itinerary.filter((item) => item.date === value.date && item.id !== editingItemId).length ? itinerary.filter((item) => item.date === value.date && item.id !== editingItemId).map((item) => <Text key={item.id} style={styles.existingText}>• {item.startTime}–{addMinutesToTime(item.startTime, item.durationMinutes) ?? "--:--"} · {item.note ?? "장소 일정"}</Text>) : <Text style={styles.existingText}>아직 일정이 없어요.</Text>}</View>
      {conflicts.length ? <View accessibilityRole="alert" style={styles.conflictBox}><Text style={styles.conflictTitle}>시간이 겹치는 일정이 있어요</Text><Text style={styles.conflictText}>겹침을 무시하고 저장하지 않습니다. 시간을 조정해 주세요.</Text>{suggestedTime ? <Pressable accessibilityRole="button" onPress={() => setValue((current) => ({ ...current, startTime: suggestedTime, endTime: addMinutesToTime(suggestedTime, timeValidation.valid ? timeValidation.durationMinutes : 60) ?? current.endTime }))} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestedTime} 빈 시간 적용</Text></Pressable> : null}</View> : null}
      {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{submitError}</Text> : null}
      <View style={styles.editorActions}><PrimaryButton label={mode === "add" ? "일정에 추가" : "변경 저장"} onPress={submit} />{mode === "edit" && onRequestDelete ? <SecondaryButton label="일정에서 삭제" onPress={onRequestDelete} /> : null}<SecondaryButton label="취소" onPress={onClose} /></View>
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
  return <ModalFrame visible title="후보에서 일정 추가" subtitle="미배치 후보를 선택하세요" onClose={onClose}>
    <View style={styles.selectContent}>
      <TextField label="후보 검색" value={keyword} onChangeText={setKeyword} placeholder="장소명 또는 카테고리" returnKeyType="search" />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.candidateRows}>
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
  sheet: { maxHeight: "92%", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  handle: { width: 48, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginBottom: spacing.sm },
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
  selectContent: { minHeight: 360, maxHeight: 650, gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  candidateRows: { gap: spacing.xs, paddingBottom: spacing.md },
  candidateRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  candidateRowCopy: { flex: 1, minWidth: 0 },
  candidateName: { ...typography.bodyStrong, color: colors.text },
  candidateMeta: { ...typography.caption, color: colors.textSecondary },
  choose: { ...typography.caption, color: colors.primary },
  disabled: { opacity: 0.48 },
  selectEmpty: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  confirmContent: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  confirmMessage: { ...typography.body, color: colors.textSecondary },
  feedback: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.successSoft, padding: spacing.md },
  feedbackText: { ...typography.bodyStrong, color: colors.success, flex: 1 },
  feedbackClose: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
  feedbackCloseText: { ...typography.caption, color: colors.success },
  pressed: { opacity: 0.82 },
});
