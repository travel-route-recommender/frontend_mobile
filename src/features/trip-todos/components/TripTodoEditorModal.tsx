import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton, SecondaryButton, TextField } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { createUniqueEntityId } from "../../../utils/ids";
import { createEmptyTripTodoDraft, validateTripTodoDraft } from "../logic/tripTodoState";
import type { TripTodo, TripTodoDraft, TripTodoPriority, TripTodoStatus, TripTodoValidationErrors } from "../types";

export type TripTodoEditorOption = { id: string; label: string; description?: string };

type Props = {
  visible: boolean;
  initialTodo?: TripTodo;
  initialDraft?: TripTodoDraft;
  members: readonly TripTodoEditorOption[];
  itineraryOptions: readonly TripTodoEditorOption[];
  documentOptions: readonly TripTodoEditorOption[];
  suggestedDates: readonly TripTodoEditorOption[];
  onClose(): void;
  onSave(draft: TripTodoDraft): { ok: true } | { ok: false; errors: TripTodoValidationErrors; message: string };
};

const priorityOptions: readonly { value: TripTodoPriority; label: string }[] = [
  { value: "urgent", label: "긴급" }, { value: "high", label: "높음" }, { value: "normal", label: "보통" }, { value: "low", label: "낮음" },
];
const statusOptions: readonly { value: Exclude<TripTodoStatus, "archived">; label: string }[] = [
  { value: "open", label: "할 일" }, { value: "in-progress", label: "진행 중" }, { value: "blocked", label: "확인 필요" }, { value: "completed", label: "완료" },
];
const reminderOptions: readonly { value?: number; label: string }[] = [
  { value: undefined, label: "알림 없음" }, { value: 0, label: "마감 시각" }, { value: 60, label: "1시간 전" }, { value: 24 * 60, label: "1일 전" }, { value: 48 * 60, label: "2일 전" },
];

const cloneDraft = (draft: TripTodoDraft): TripTodoDraft => ({
  ...draft,
  assigneeUserIds: [...draft.assigneeUserIds],
  checklist: draft.checklist.map((entry) => ({ ...entry })),
  tags: [...draft.tags],
  links: {
    itineraryItemIds: [...draft.links.itineraryItemIds],
    documentIds: [...draft.links.documentIds],
    duriIssueIds: [...draft.links.duriIssueIds],
    placeIds: [...draft.links.placeIds],
  },
});

export function TripTodoEditorModal({ visible, initialTodo, initialDraft, members, itineraryOptions, documentOptions, suggestedDates, onClose, onSave }: Props) {
  const fallbackDraft = useMemo(() => createEmptyTripTodoDraft(), []);
  const [draft, setDraft] = useState<TripTodoDraft>(cloneDraft(initialDraft ?? fallbackDraft));
  const [tagText, setTagText] = useState((initialDraft ?? fallbackDraft).tags.join(", "));
  const [checklistTitle, setChecklistTitle] = useState("");
  const [errors, setErrors] = useState<TripTodoValidationErrors>({});
  const [message, setMessage] = useState("");

  const update = <K extends keyof TripTodoDraft>(key: K, value: TripTodoDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage("");
  };
  const toggleIn = (key: "assigneeUserIds", id: string) => update(key, draft[key].includes(id) ? draft[key].filter((entry) => entry !== id) : [...draft[key], id]);
  const toggleLink = (key: "itineraryItemIds" | "documentIds", id: string) => setDraft((current) => ({
    ...current,
    links: { ...current.links, [key]: current.links[key].includes(id) ? current.links[key].filter((entry) => entry !== id) : [...current.links[key], id] },
  }));
  const addChecklist = () => {
    const title = checklistTitle.trim();
    if (!title) return;
    const id = createUniqueEntityId("todo-check", draft.checklist.map((entry) => entry.id));
    update("checklist", [...draft.checklist, { id, title, completed: false }]);
    setChecklistTitle("");
  };
  const submit = () => {
    const normalized = { ...draft, tags: [...new Set(tagText.split(",").map((tag) => tag.trim()).filter(Boolean))] };
    const validation = validateTripTodoDraft(normalized);
    if (Object.keys(validation).length) { setErrors(validation); setMessage(Object.values(validation)[0] ?? "입력 내용을 확인해 주세요."); return; }
    const result = onSave(normalized);
    if (!result.ok) { setErrors(result.errors); setMessage(result.message); return; }
    onClose();
  };

  return <Modal visible={visible} transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.overlay}>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <Pressable accessibilityRole="button" accessibilityLabel="TODO 편집 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{initialTodo ? "TODO 수정" : "TODO 추가"}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            {initialTodo?.source.kind !== "manual" ? <View style={styles.generatedNotice}><Text style={styles.generatedTitle}>자동 생성된 TODO</Text><Text style={styles.generatedText}>두리 분석이나 문서·일정 변경을 계기로 만들었지만 내용, 담당자와 마감은 자유롭게 수정할 수 있어요.</Text></View> : null}
            <TextField label="제목 *" value={draft.title} onChangeText={(value) => update("title", value)} placeholder="예: KTX 승차권 시간 다시 확인" maxLength={80} error={errors.title} />
            <TextField label="내용" value={draft.description} onChangeText={(value) => update("description", value)} placeholder="해야 할 일, 예약 번호, 확인할 사항 등을 적어 주세요." multiline maxLength={2000} error={errors.description} />

            <FieldGroup label="상태"><ChoiceRow>{statusOptions.map((option) => <Choice key={option.value} label={option.label} selected={draft.status === option.value} onPress={() => update("status", option.value)} />)}</ChoiceRow></FieldGroup>
            <FieldGroup label="우선순위"><ChoiceRow>{priorityOptions.map((option) => <Choice key={option.value} label={option.label} selected={draft.priority === option.value} onPress={() => update("priority", option.value)} />)}</ChoiceRow></FieldGroup>

            <View style={styles.twoFields}>
              <View style={styles.fieldFlex}><TextField label="마감 날짜" value={draft.dueDate} onChangeText={(value) => update("dueDate", value)} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.dueDate} /></View>
              <View style={styles.fieldFlex}><TextField label="마감 시간" value={draft.dueTime} onChangeText={(value) => update("dueTime", value)} placeholder="HH:mm (선택)" keyboardType="numbers-and-punctuation" maxLength={5} error={errors.dueTime} /></View>
            </View>
            {suggestedDates.length ? <FieldGroup label="빠른 날짜 선택"><ChoiceRow>{suggestedDates.map((option) => <Choice key={option.id} label={option.label} selected={draft.dueDate === option.id} onPress={() => update("dueDate", option.id)} />)}<Choice label="날짜 없음" selected={!draft.dueDate} onPress={() => { update("dueDate", ""); update("dueTime", ""); update("reminderMinutesBefore", undefined); }} /></ChoiceRow></FieldGroup> : null}
            <FieldGroup label="미리 알림 (인앱)"><ChoiceRow>{reminderOptions.map((option) => <Choice key={option.label} label={option.label} selected={draft.reminderMinutesBefore === option.value} onPress={() => update("reminderMinutesBefore", option.value)} />)}</ChoiceRow>{errors.reminder ? <Text style={styles.error}>{errors.reminder}</Text> : <Text style={styles.helper}>현재는 여행방을 열었을 때 강조해 줍니다. OS 푸시 알림은 서버·알림 권한 연동이 필요해요.</Text>}</FieldGroup>

            {members.length ? <FieldGroup label="담당자"><OptionList options={members} selectedIds={draft.assigneeUserIds} onToggle={(id) => toggleIn("assigneeUserIds", id)} /></FieldGroup> : null}

            <FieldGroup label={`체크리스트 ${draft.checklist.filter((entry) => entry.completed).length}/${draft.checklist.length}`}>
              <View style={styles.inlineInput}><View style={styles.fieldFlex}><TextField label="새 체크 항목" value={checklistTitle} onChangeText={setChecklistTitle} placeholder="확인할 단계를 입력" maxLength={160} /></View><Pressable accessibilityRole="button" onPress={addChecklist} style={({ pressed }) => [styles.addSmall, pressed && styles.pressed]}><Text style={styles.addSmallText}>추가</Text></Pressable></View>
              {draft.checklist.map((entry) => <View key={entry.id} style={styles.checkItem}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: entry.completed }} onPress={() => update("checklist", draft.checklist.map((item) => item.id === entry.id ? { ...item, completed: !item.completed } : item))} style={styles.checkToggle}><Text style={styles.checkToggleText}>{entry.completed ? "✓" : "○"}</Text></Pressable><Text style={[styles.checkText, entry.completed && styles.completedText]}>{entry.title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${entry.title} 삭제`} onPress={() => update("checklist", draft.checklist.filter((item) => item.id !== entry.id))}><Text style={styles.removeText}>삭제</Text></Pressable></View>)}
              {errors.checklist ? <Text style={styles.error}>{errors.checklist}</Text> : null}
            </FieldGroup>

            <TextField label="태그" value={tagText} onChangeText={(value) => { setTagText(value); setErrors((current) => ({ ...current, tags: undefined })); }} placeholder="예약, 교통, 준비물 (쉼표로 구분)" maxLength={380} error={errors.tags} />

            {itineraryOptions.length ? <FieldGroup label="관련 일정"><OptionList options={itineraryOptions} selectedIds={draft.links.itineraryItemIds} onToggle={(id) => toggleLink("itineraryItemIds", id)} /></FieldGroup> : null}
            {documentOptions.length ? <FieldGroup label="관련 예약·티켓 문서"><OptionList options={documentOptions} selectedIds={draft.links.documentIds} onToggle={(id) => toggleLink("documentIds", id)} /></FieldGroup> : null}

            {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
            <PrimaryButton label={initialTodo ? "수정 내용 저장" : "TODO 추가"} onPress={submit} />
            <SecondaryButton label="취소" onPress={onClose} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.group}><Text style={styles.label}>{label}</Text>{children}</View>; }
function ChoiceRow({ children }: { children: React.ReactNode }) { return <View style={styles.choiceRow}>{children}</View>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function OptionList({ options, selectedIds, onToggle }: { options: readonly TripTodoEditorOption[]; selectedIds: readonly string[]; onToggle(id: string): void }) { return <View style={styles.optionList}>{options.map((option) => { const selected = selectedIds.includes(option.id); return <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => onToggle(option.id)} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}><Text style={[styles.optionCheck, selected && styles.choiceTextSelected]}>{selected ? "✓" : "○"}</Text><View style={styles.optionCopy}><Text style={styles.optionLabel}>{option.label}</Text>{option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}</View></Pressable>; })}</View>; }

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay }, safeArea: { flex: 1, width: "100%", justifyContent: "flex-end" }, sheet: { width: "100%", maxWidth: 680, maxHeight: "94%", alignSelf: "center", overflow: "hidden", gap: spacing.sm, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg }, handle: { width: 44, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong }, title: { ...typography.title, color: colors.text }, scroll: { minHeight: 0 }, content: { gap: spacing.lg, paddingBottom: spacing.sm },
  generatedNotice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm }, generatedTitle: { ...typography.bodyStrong, color: colors.primary }, generatedText: { ...typography.caption, color: colors.textSecondary },
  group: { gap: spacing.xs }, label: { ...typography.bodyStrong, color: colors.text }, choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, choice: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm, backgroundColor: colors.surface }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, choiceText: { ...typography.caption, color: colors.textSecondary }, choiceTextSelected: { color: colors.primary },
  twoFields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, fieldFlex: { flex: 1, minWidth: 150 }, helper: { ...typography.caption, color: colors.textSecondary }, error: { ...typography.caption, color: colors.danger },
  inlineInput: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs }, addSmall: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md }, addSmallText: { ...typography.bodyStrong, color: colors.primary },
  checkItem: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm }, checkToggle: { width: 32, height: 32, alignItems: "center", justifyContent: "center" }, checkToggleText: { ...typography.subtitle, color: colors.primary }, checkText: { ...typography.body, color: colors.text, flex: 1 }, completedText: { color: colors.textMuted, textDecorationLine: "line-through" }, removeText: { ...typography.caption, color: colors.danger },
  optionList: { gap: spacing.xs }, option: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }, optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, optionCheck: { ...typography.subtitle, color: colors.textMuted }, optionCopy: { flex: 1, minWidth: 0 }, optionLabel: { ...typography.bodyStrong, color: colors.text }, optionDescription: { ...typography.caption, color: colors.textSecondary },
  message: { ...typography.caption, color: colors.danger, borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.sm }, pressed: { opacity: 0.8 },
});
