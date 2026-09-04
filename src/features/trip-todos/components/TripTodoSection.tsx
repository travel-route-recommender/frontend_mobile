import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, SecondaryButton } from "../../../components/common";
import type { ItineraryItem, Place } from "../../../domain";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useTripDocumentHydrationState, useTripDocumentStore } from "../../trip-documents";
import { plainDuriUserText } from "../../duri/presentation/plainDuriUserText";
import { getTravelDocumentKindLabel, type TravelDocument } from "../../trip-documents/types";
import { useTripTodoHydration } from "../hooks/useTripTodoHydration";
import { createEmptyTripTodoDraft, getTripTodoDueState, localDateString, tripTodoToDraft } from "../logic/tripTodoState";
import { useTripTodoStore } from "../store/useTripTodoStore";
import type { TripTodo, TripTodoDraft, TripTodoPriority, TripTodoSourceKind, TripTodoStatus } from "../types";
import { TripTodoEditorModal, type TripTodoEditorOption } from "./TripTodoEditorModal";

const EMPTY_TODOS: TripTodo[] = [];
const EMPTY_DOCUMENTS: TravelDocument[] = [];
type Filter = "active" | "completed" | "archived" | "all";

const filterOptions: readonly { value: Filter; label: string }[] = [
  { value: "active", label: "할 일" }, { value: "completed", label: "완료" }, { value: "archived", label: "보관" }, { value: "all", label: "전체" },
];
const statusLabel: Record<TripTodoStatus, string> = { open: "할 일", "in-progress": "진행 중", blocked: "확인 필요", completed: "완료", archived: "보관" };
const priorityLabel: Record<TripTodoPriority, string> = { urgent: "긴급", high: "높음", normal: "보통", low: "낮음" };
const sourceLabel: Record<TripTodoSourceKind, string> = { manual: "직접 추가", duri: "두리 점검", "document-ocr": "문서 확인", "schedule-impact": "일정 변경" };
const dueStateLabel = { overdue: "기한 지남", "due-today": "오늘까지", reminder: "곧 마감", upcoming: "예정", none: "", completed: "" } as const;

export function TripTodoSection({
  tripId,
  currentUserId,
  members,
  itinerary,
  placesById,
  tripStartDate,
  tripEndDate,
  readOnly = false,
  compact = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  tripId: string;
  currentUserId: string;
  members: readonly { userId: string; name: string }[];
  itinerary: readonly ItineraryItem[];
  placesById: Readonly<Record<string, Place>>;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  readOnly?: boolean;
  compact?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const hydration = useTripTodoHydration();
  const documentsHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const todos = useTripTodoStore((state) => state.todosByTripId[tripId] ?? EMPTY_TODOS);
  const documents = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_DOCUMENTS);
  const createTodo = useTripTodoStore((state) => state.createTodo);
  const updateTodo = useTripTodoStore((state) => state.updateTodo);
  const setStatus = useTripTodoStore((state) => state.setStatus);
  const archiveTodo = useTripTodoStore((state) => state.archiveTodo);
  const deleteTodo = useTripTodoStore((state) => state.deleteTodo);
  const toggleChecklistItem = useTripTodoStore((state) => state.toggleChecklistItem);
  const snoozeTodo = useTripTodoStore((state) => state.snoozeTodo);
  const reconcileLinks = useTripTodoStore((state) => state.reconcileLinks);
  const [filter, setFilter] = useState<Filter>("active");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TripTodo>();
  const [editorDraft, setEditorDraft] = useState<TripTodoDraft>();
  const [pendingDelete, setPendingDelete] = useState<TripTodo>();
  const [internalExpanded, setInternalExpanded] = useState(false);

  const filtered = useMemo(() => todos.filter((todo) => {
    if (filter === "active") return todo.status !== "completed" && todo.status !== "archived";
    if (filter === "completed") return todo.status === "completed";
    if (filter === "archived") return todo.status === "archived";
    return true;
  }), [filter, todos]);
  const activeCount = todos.filter((todo) => todo.status !== "completed" && todo.status !== "archived").length;
  const overdueCount = todos.filter((todo) => getTripTodoDueState(todo) === "overdue").length;
  const memberOptions: TripTodoEditorOption[] = members.map((member) => ({ id: member.userId, label: member.name }));
  const itineraryOptions: TripTodoEditorOption[] = itinerary.map((item) => ({
    id: item.id,
    label: placesById[item.placeId ?? ""]?.name ?? item.note?.trim() ?? (item.itemType === "meal" ? "식사" : item.itemType === "rest" ? "휴식" : item.itemType === "transport" ? "이동" : item.itemType === "reservation" ? "예약 일정" : "장소 일정"),
    description: `${item.date} ${item.startTime} · ${item.durationMinutes}분`,
  }));
  const documentOptions: TripTodoEditorOption[] = documents.map((document) => ({ id: document.id, label: document.displayName, description: getTravelDocumentKindLabel(document.kind) }));
  const itineraryItemIdKey = useMemo(() => itinerary.map((item) => item.id).sort().join("\u0000"), [itinerary]);
  const documentIdKey = useMemo(() => documents.map((document) => document.id).sort().join("\u0000"), [documents]);
  useEffect(() => {
    if (!hydration.isHydrated) return;
    reconcileLinks(tripId, {
      itineraryItemIds: itineraryItemIdKey ? itineraryItemIdKey.split("\u0000") : [],
      // 문서 저장소가 실패했을 때 빈 목록으로 오인해 유효한 문서 연결을 지우지 않는다.
      // 일정 연결은 문서 기능과 독립적으로 언제나 정리한다.
      ...(documentsHydrated ? { documentIds: documentIdKey ? documentIdKey.split("\u0000") : [] } : {}),
    });
  }, [documentIdKey, documentsHydrated, hydration.isHydrated, itineraryItemIdKey, reconcileLinks, tripId]);
  const suggestedDates = useMemo(() => {
    const today = localDateString();
    const entries = [
      { id: today, label: "오늘" },
      ...(tripStartDate ? [{ id: tripStartDate, label: "여행 첫날" }] : []),
      ...(tripEndDate && tripEndDate !== tripStartDate ? [{ id: tripEndDate, label: "여행 마지막날" }] : []),
    ];
    return entries.filter((entry, index) => entries.findIndex((candidate) => candidate.id === entry.id) === index);
  }, [tripEndDate, tripStartDate]);

  const openCreate = () => {
    setEditingTodo(undefined);
    setEditorDraft(createEmptyTripTodoDraft({ assigneeUserIds: currentUserId ? [currentUserId] : [] }));
    setEditorOpen(true);
  };
  const openEdit = (todo: TripTodo) => {
    const draft = tripTodoToDraft(todo);
    setEditingTodo(todo);
    setEditorDraft(todo.source.kind === "duri" && !todo.userEditedAt
      ? { ...draft, title: plainDuriUserText(draft.title), description: plainDuriUserText(draft.description) }
      : draft);
    setEditorOpen(true);
  };
  const closeEditor = () => { setEditorOpen(false); setEditingTodo(undefined); setEditorDraft(undefined); };
  const save = (draft: TripTodoDraft) => {
    const result = editingTodo
      ? updateTodo(tripId, editingTodo.id, draft)
      : createTodo(tripId, currentUserId, draft);
    return result.ok ? { ok: true as const } : result;
  };

  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  const Container = compact ? View : Card;
  return <Container style={[styles.card, compact && styles.compactRoot]}>
    {compact ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`여행 준비 TODO ${activeCount}개 남음, ${expanded ? "상세 접기" : "상세 보기"}`} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.compactRow, pressed && styles.pressed]}>
      <View style={styles.compactIcon}><Text style={styles.compactIconText}>✓</Text></View>
      <View style={styles.compactCopy}><Text style={styles.compactTitle}>여행 준비 TODO</Text><Text style={styles.compactMeta}>{!hydration.isHydrated ? "불러오는 중" : overdueCount ? `기한 지난 항목 ${overdueCount}개` : activeCount ? `${activeCount}개 남음` : "남은 TODO 없음"}</Text></View>
      <Text style={styles.compactCount}>{activeCount}개</Text><Text style={styles.compactChevron}>{expanded ? "⌃" : "›"}</Text>
    </Pressable> : <View style={styles.heading}>
      <View style={styles.headingCopy}><Text style={styles.eyebrow}>TRIP TODO</Text><Text style={styles.title}>여행 준비 TODO</Text><Text style={styles.description}>담당자, 마감, 체크리스트와 관련 일정·문서를 한곳에서 관리하세요.</Text></View>
      <View style={styles.count}><Text style={styles.countValue}>{activeCount}</Text><Text style={styles.countLabel}>남음</Text></View>
    </View>}
    {!compact || expanded ? <View style={compact ? styles.expandedBody : undefined}>
    {overdueCount ? <View style={styles.overdueNotice}><Text style={styles.overdueNoticeText}>기한이 지난 TODO가 {overdueCount}개 있어요.</Text></View> : null}
    <View style={styles.filters}>{filterOptions.map((option) => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: filter === option.value }} onPress={() => setFilter(option.value)} style={({ pressed }) => [styles.filter, filter === option.value && styles.filterSelected, pressed && styles.pressed]}><Text style={[styles.filterText, filter === option.value && styles.filterTextSelected]}>{option.label}</Text></Pressable>)}</View>

    {!hydration.isHydrated ? <View style={styles.empty}><Text style={styles.emptyTitle}>{hydration.error ? "TODO를 불러오지 못했어요" : "TODO를 불러오는 중이에요"}</Text>{hydration.error ? <SecondaryButton label="다시 불러오기" onPress={hydration.retry} /> : null}</View>
      : filtered.length ? <View style={styles.list}>{filtered.map((todo) => <TodoCard
        key={todo.id}
        todo={todo}
        memberNames={Object.fromEntries(members.map((member) => [member.userId, member.name]))}
        readOnly={readOnly}
        onEdit={() => openEdit(todo)}
        onToggleComplete={() => setStatus(tripId, todo.id, todo.status === "completed" ? "open" : "completed")}
        onArchive={() => archiveTodo(tripId, todo.id)}
        onDelete={() => setPendingDelete(todo)}
        onToggleChecklist={(checklistItemId) => toggleChecklistItem(tripId, todo.id, checklistItemId)}
        onSnooze={() => snoozeTodo(tripId, todo.id, new Date(Date.now() + 60 * 60_000).toISOString())}
      />)}</View>
      : <View style={styles.empty}><Text style={styles.emptyTitle}>{filter === "active" ? "남은 TODO가 없어요" : "이 목록은 비어 있어요"}</Text><Text style={styles.emptyText}>{filter === "active" ? "예약 확인, 준비물, 일정 조율을 TODO로 남겨 보세요." : "다른 상태를 선택하거나 새 TODO를 추가해 보세요."}</Text></View>}
    {documentsHydrated ? null : <Text style={styles.helper}>문서 연결 목록을 불러오는 중이에요.</Text>}
    <SecondaryButton label={readOnly ? "완료된 여행에서는 수정할 수 없어요" : "TODO 추가"} disabled={readOnly || !hydration.isHydrated} onPress={openCreate} />
    </View> : null}

    {editorDraft ? <TripTodoEditorModal visible={editorOpen} initialTodo={editingTodo} initialDraft={editorDraft} members={memberOptions} itineraryOptions={itineraryOptions} documentOptions={documentOptions} suggestedDates={suggestedDates} onClose={closeEditor} onSave={save} /> : null}
    <Modal visible={Boolean(pendingDelete)} transparent animationType="fade" onRequestClose={() => setPendingDelete(undefined)}>
      <View style={styles.confirmOverlay}><Pressable accessibilityRole="button" accessibilityLabel="TODO 삭제 취소" onPress={() => setPendingDelete(undefined)} style={StyleSheet.absoluteFill} /><SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.confirmSafeArea}><View accessibilityViewIsModal style={styles.confirmCard}><Text style={styles.confirmTitle}>TODO를 삭제할까요?</Text><Text style={styles.confirmText}>{pendingDelete?.source.kind === "manual" ? "삭제한 TODO는 복구할 수 없어요." : "삭제하면 같은 분석 결과가 반복되어도 이 자동 TODO를 다시 만들지 않아요."}</Text><Pressable accessibilityRole="button" onPress={() => { if (pendingDelete) deleteTodo(tripId, pendingDelete.id); setPendingDelete(undefined); }} style={({ pressed }) => [styles.deleteConfirm, pressed && styles.pressed]}><Text style={styles.deleteConfirmText}>삭제</Text></Pressable><SecondaryButton label="취소" onPress={() => setPendingDelete(undefined)} /></View></SafeAreaView></View>
    </Modal>
  </Container>;
}

function TodoCard({ todo, memberNames, readOnly, onEdit, onToggleComplete, onArchive, onDelete, onToggleChecklist, onSnooze }: {
  todo: TripTodo; memberNames: Readonly<Record<string, string>>; readOnly: boolean; onEdit(): void; onToggleComplete(): void; onArchive(): void; onDelete(): void; onToggleChecklist(id: string): void; onSnooze(): void;
}) {
  const dueState = getTripTodoDueState(todo);
  const checklistDone = todo.checklist.filter((entry) => entry.completed).length;
  const linkedCount = todo.links.itineraryItemIds.length + todo.links.documentIds.length + todo.links.duriIssueIds.length;
  const systemGenerated = todo.source.kind === "duri" && !todo.userEditedAt;
  const title = systemGenerated ? plainDuriUserText(todo.title) : todo.title;
  const description = systemGenerated ? plainDuriUserText(todo.description) : todo.description;
  return <View style={[styles.todo, dueState === "overdue" && styles.todoOverdue, todo.status === "completed" && styles.todoCompleted]}>
    <View style={styles.todoHeading}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: todo.status === "completed" }} disabled={readOnly || todo.status === "archived"} onPress={onToggleComplete} style={({ pressed }) => [styles.complete, todo.status === "completed" && styles.completeSelected, pressed && styles.pressed]}><Text style={[styles.completeText, todo.status === "completed" && styles.completeTextSelected]}>{todo.status === "completed" ? "✓" : "○"}</Text></Pressable>
      <View style={styles.todoCopy}><Text numberOfLines={2} style={[styles.todoTitle, todo.status === "completed" && styles.completedText]}>{title}</Text><View style={styles.metaRow}><Text style={[styles.priority, (todo.priority === "urgent" || todo.priority === "high") && styles.priorityHigh]}>{priorityLabel[todo.priority]}</Text><Text style={styles.meta}>{statusLabel[todo.status]}</Text><Text style={styles.meta}>{sourceLabel[todo.source.kind]}</Text></View></View>
    </View>
    {description ? <Text numberOfLines={4} style={styles.todoDescription}>{description}</Text> : null}
    {todo.due ? <View style={[styles.due, dueState === "overdue" && styles.dueOverdue]}><Text style={[styles.dueText, dueState === "overdue" && styles.dueTextOverdue]}>{dueStateLabel[dueState]} · {todo.due.date}{todo.due.time ? ` ${todo.due.time}` : ""}{todo.due.snoozedUntil ? " · 알림 미룸" : ""}</Text>{(dueState === "overdue" || dueState === "due-today" || dueState === "reminder") && !readOnly ? <Pressable accessibilityRole="button" onPress={onSnooze}><Text style={styles.snooze}>1시간 미루기</Text></Pressable> : null}</View> : null}
    {todo.assigneeUserIds.length ? <Text style={styles.detail}>담당 · {todo.assigneeUserIds.map((id) => memberNames[id] ?? "알 수 없는 멤버").join(", ")}</Text> : null}
    {todo.checklist.length ? <View style={styles.checklist}><Text style={styles.detail}>체크리스트 {checklistDone}/{todo.checklist.length}</Text>{todo.checklist.slice(0, 5).map((entry) => <Pressable key={entry.id} accessibilityRole="checkbox" accessibilityState={{ checked: entry.completed }} disabled={readOnly || todo.status === "archived"} onPress={() => onToggleChecklist(entry.id)} style={({ pressed }) => [styles.cardCheck, pressed && styles.pressed]}><Text style={styles.cardCheckIcon}>{entry.completed ? "✓" : "○"}</Text><Text numberOfLines={2} style={[styles.cardCheckText, entry.completed && styles.completedText]}>{entry.title}</Text></Pressable>)}{todo.checklist.length > 5 ? <Text style={styles.meta}>그 외 {todo.checklist.length - 5}개</Text> : null}</View> : null}
    <View style={styles.tagRow}>{todo.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>)}{linkedCount ? <View style={styles.linked}><Text style={styles.linkedText}>연결 {linkedCount}개</Text></View> : null}</View>
    {!readOnly ? <View style={styles.actions}><Pressable accessibilityRole="button" onPress={onEdit} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionText}>수정</Text></Pressable>{todo.status !== "archived" ? <Pressable accessibilityRole="button" onPress={onArchive} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionText}>보관</Text></Pressable> : null}<Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.deleteText}>삭제</Text></Pressable></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md }, compactRoot: { gap: 0 }, compactRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }, compactIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: "#EAF7EE" }, compactIconText: { color: "#2E9B66", fontSize: 17, fontWeight: "900" }, compactCopy: { flex: 1, minWidth: 0, gap: 2 }, compactTitle: { color: "#17265F", fontSize: 13, lineHeight: 18, fontWeight: "800" }, compactMeta: { color: "#60719B", fontSize: 10, lineHeight: 15, fontWeight: "600" }, compactCount: { color: "#4388FF", fontSize: 11, lineHeight: 16, fontWeight: "800" }, compactChevron: { color: "#8290AE", fontSize: 18, fontWeight: "700" }, expandedBody: { gap: spacing.md, borderTopWidth: 1, borderTopColor: "#DCE7F7", paddingTop: spacing.md }, heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, headingCopy: { flex: 1, gap: spacing.xxs }, eyebrow: { ...typography.caption, color: colors.primary }, title: { ...typography.subtitle, color: colors.text }, description: { ...typography.body, color: colors.textSecondary }, count: { minWidth: 54, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft }, countValue: { ...typography.subtitle, color: colors.primary }, countLabel: { ...typography.caption, color: colors.primary },
  overdueNotice: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.sm }, overdueNoticeText: { ...typography.bodyStrong, color: colors.danger }, filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, filter: { minHeight: 38, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm }, filterSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, filterText: { ...typography.caption, color: colors.textSecondary }, filterTextSelected: { color: colors.primary }, list: { gap: spacing.sm },
  todo: { gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.sm }, todoOverdue: { borderColor: colors.danger }, todoCompleted: { opacity: 0.76 }, todoHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }, complete: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, completeSelected: { borderColor: colors.success, backgroundColor: colors.successSoft }, completeText: { ...typography.subtitle, color: colors.textMuted }, completeTextSelected: { color: colors.success }, todoCopy: { flex: 1, minWidth: 0, gap: spacing.xxs }, todoTitle: { ...typography.bodyStrong, color: colors.text }, todoDescription: { ...typography.body, color: colors.textSecondary }, completedText: { color: colors.textMuted, textDecorationLine: "line-through" }, metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, priority: { ...typography.caption, color: colors.textSecondary }, priorityHigh: { color: colors.warning }, meta: { ...typography.caption, color: colors.textMuted },
  due: { minHeight: 38, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm }, dueOverdue: { backgroundColor: colors.dangerSoft }, dueText: { ...typography.caption, color: colors.primary }, dueTextOverdue: { color: colors.danger }, snooze: { ...typography.caption, color: colors.primary }, detail: { ...typography.caption, color: colors.textSecondary }, checklist: { gap: spacing.xxs }, cardCheck: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: spacing.xs }, cardCheckIcon: { ...typography.bodyStrong, color: colors.primary }, cardCheckText: { ...typography.caption, color: colors.text, flex: 1 }, tagRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }, tag: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs }, tagText: { ...typography.caption, color: colors.primary }, linked: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs }, linkedText: { ...typography.caption, color: colors.textSecondary }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.md }, action: { minHeight: 34, justifyContent: "center" }, actionText: { ...typography.caption, color: colors.primary }, deleteText: { ...typography.caption, color: colors.danger },
  empty: { gap: spacing.xs, alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, padding: spacing.lg }, emptyTitle: { ...typography.bodyStrong, color: colors.text }, emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: "center" }, helper: { ...typography.caption, color: colors.textMuted }, pressed: { opacity: 0.78 },
  confirmOverlay: { flex: 1, justifyContent: "center", backgroundColor: colors.overlay, padding: spacing.lg }, confirmSafeArea: { width: "100%" }, confirmCard: { width: "100%", maxWidth: 440, alignSelf: "center", gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg }, confirmTitle: { ...typography.subtitle, color: colors.text }, confirmText: { ...typography.body, color: colors.textSecondary }, deleteConfirm: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.danger }, deleteConfirmText: { ...typography.button, color: colors.white },
});
