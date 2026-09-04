import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, PrimaryButton, SecondaryButton, TextField } from "../../../components/common";
import type { ItineraryItem, Place } from "../../../domain";
import { queryClient } from "../../../query/queryClient";
import { queryKeys } from "../../../query/keys";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { plainDuriUserText } from "../../duri/presentation/plainDuriUserText";
import {
  apiRoomTodoToDraft,
  createApiRoomTodo,
  createApiTodoMutationId,
  deleteApiRoomTodo,
  fetchApiRoomTodos,
  parseApiRoomTodoRevisionConflict,
  toApiTodoUiPriority,
  toApiTodoUiStatus,
  updateApiRoomTodo,
  type ApiRoomTodo,
  type ApiRoomTodoDraft,
  type ApiTodoUiPriority,
  type ApiTodoUiStatus,
} from "../services/tripTodoApi";

type Filter = "active" | "completed" | "archived" | "all";
type EditorOption = { id: string; label: string; description?: string };
type EditorState = {
  todo?: ApiRoomTodo;
  draft: ApiRoomTodoDraft;
  mutationId: string;
  instanceKey: string;
};
type PendingDelete = { todo: ApiRoomTodo; mutationId: string };

function automaticDuriText(todo: ApiRoomTodo, value: string) {
  return todo.source.kind === "duriAnalysis" && !todo.source.userEdited ? plainDuriUserText(value) : value;
}

const filterOptions: readonly { value: Filter; label: string }[] = [
  { value: "active", label: "할 일" },
  { value: "completed", label: "완료" },
  { value: "archived", label: "보관" },
  { value: "all", label: "전체" },
];
const statusLabel: Record<ApiTodoUiStatus, string> = {
  open: "할 일",
  "in-progress": "진행 중",
  completed: "완료",
  cancelled: "취소",
};
const priorityLabel: Record<ApiTodoUiPriority, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};
const sourceLabel = {
  manual: "직접 추가",
  duriAnalysis: "두리 점검",
  ocrConfirm: "문서 확인",
  scheduleChange: "일정 변경",
} as const;
const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

function emptyDraft(currentUserId: string, timezone: string): ApiRoomTodoDraft {
  return {
    title: "",
    description: "",
    status: "open",
    priority: "normal",
    dueDate: "",
    dueTime: "",
    timezone,
    assigneeId: currentUserId || null,
    checklist: [],
    links: [],
  };
}

function sortTodos(todos: readonly ApiRoomTodo[]) {
  const stateRank = (todo: ApiRoomTodo) => todo.archived ? 3 : todo.status === "done" ? 2 : todo.status === "cancelled" ? 1 : 0;
  return [...todos].sort((left, right) => {
    const state = stateRank(left) - stateRank(right);
    if (state) return state;
    const leftDue = left.dueDate ? `${left.dueDate}T${left.dueTime ?? "23:59"}` : "9999-12-31T23:59";
    const rightDue = right.dueDate ? `${right.dueDate}T${right.dueTime ?? "23:59"}` : "9999-12-31T23:59";
    return leftDue.localeCompare(rightDue)
      || priorityRank[left.priority] - priorityRank[right.priority]
      || right.updatedAt.localeCompare(left.updatedAt);
  });
}

function replaceTodo(todos: readonly ApiRoomTodo[], todo: ApiRoomTodo) {
  return sortTodos(todos.some((entry) => entry.id === todo.id)
    ? todos.map((entry) => entry.id === todo.id ? todo : entry)
    : [...todos, todo]);
}

function dateLabel(todo: ApiRoomTodo) {
  if (!todo.dueDate) return "마감 없음";
  return `${todo.dueDate}${todo.dueTime ? ` ${todo.dueTime}` : ""} · ${todo.timezone}`;
}

function todoVisibleForFilter(todo: ApiRoomTodo, filter: Filter) {
  if (filter === "archived") return todo.archived;
  if (filter === "completed") return !todo.archived && todo.status === "done";
  if (filter === "active") return !todo.archived && todo.status !== "done" && todo.status !== "cancelled";
  return true;
}

export function ApiTripTodoSection({
  tripId,
  currentUserId,
  members,
  itinerary,
  placesById,
  tripStartDate,
  tripEndDate,
  timezone = "Asia/Seoul",
  documentOptions = [],
  readOnly = false,
  isOwner = false,
}: {
  tripId: string;
  currentUserId: string;
  members: readonly { userId: string; name: string }[];
  itinerary: readonly ItineraryItem[];
  placesById: Readonly<Record<string, Place>>;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  timezone?: string;
  documentOptions?: readonly EditorOption[];
  readOnly?: boolean;
  isOwner?: boolean;
}) {
  const queryKey = queryKeys.trips.todos(tripId, currentUserId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchApiRoomTodos(tripId, signal),
    enabled: Boolean(tripId && currentUserId),
  });
  const [filter, setFilter] = useState<Filter>("active");
  const [editor, setEditor] = useState<EditorState>();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const todos = useMemo(() => sortTodos(query.data ?? []), [query.data]);
  const filtered = todos.filter((todo) => todoVisibleForFilter(todo, filter));
  const activeCount = todos.filter((todo) => todoVisibleForFilter(todo, "active")).length;
  const memberNames = Object.fromEntries(members.map((member) => [member.userId, member.name]));
  const memberOptions = members.map((member) => ({ id: member.userId, label: member.name }));
  const itineraryOptions: EditorOption[] = itinerary.map((item) => ({
    id: item.id,
    label: placesById[item.placeId ?? ""]?.name ?? item.note?.trim() ?? "일정",
    description: `${item.date} ${item.startTime} · ${item.durationMinutes}분`,
  }));
  const suggestedDates = [
    ...(tripStartDate ? [{ id: tripStartDate, label: "여행 첫날" }] : []),
    ...(tripEndDate && tripEndDate !== tripStartDate ? [{ id: tripEndDate, label: "여행 마지막날" }] : []),
  ];
  const mutationsDisabled = readOnly || busy || query.isFetching || Boolean(query.error);

  const setCachedTodo = (todo: ApiRoomTodo) => {
    queryClient.setQueryData<ApiRoomTodo[]>(queryKey, (current) => replaceTodo(current ?? [], todo));
  };

  const removeCachedTodo = (todoId: string) => {
    queryClient.setQueryData<ApiRoomTodo[]>(queryKey, (current) => (current ?? []).filter((todo) => todo.id !== todoId));
  };

  const refetchAfterMutation = async (successMessage: string) => {
    const refreshed = await query.refetch();
    setMessage(refreshed.isError
      ? `${successMessage} 저장은 완료됐지만 최신 목록을 다시 불러오지 못했어요. 다시 불러와 확인해 주세요.`
      : successMessage);
  };

  const handleConflict = async (error: unknown, todoId: string) => {
    const conflict = parseApiRoomTodoRevisionConflict(error);
    if (!conflict) return undefined;
    let latest = conflict.latestTodo;
    if (latest) setCachedTodo(latest);
    else {
      const refreshed = await query.refetch();
      latest = refreshed.data?.find((todo) => todo.id === todoId);
    }
    return latest;
  };

  const openCreate = () => {
    setMessage("");
    setEditor({
      draft: emptyDraft(currentUserId, timezone),
      mutationId: createApiTodoMutationId("todo-create"),
      instanceKey: createApiTodoMutationId("todo-editor"),
    });
  };

  const openEdit = (todo: ApiRoomTodo) => {
    setMessage("");
    const draft = apiRoomTodoToDraft(todo);
    setEditor({
      todo,
      draft: todo.source.kind === "duriAnalysis" && !todo.source.userEdited
        ? { ...draft, title: automaticDuriText(todo, draft.title), description: automaticDuriText(todo, draft.description) }
        : draft,
      mutationId: createApiTodoMutationId("todo-update"),
      instanceKey: createApiTodoMutationId("todo-editor"),
    });
  };

  const saveEditor = async (draft: ApiRoomTodoDraft) => {
    if (!editor || busy) return { ok: false as const, message: "다른 요청을 처리하고 있어요." };
    setBusy(true);
    try {
      if (!editor.todo) {
        const created = await createApiRoomTodo(tripId, { ...draft, clientMutationId: editor.mutationId });
        setCachedTodo(created);
        setEditor(undefined);
        await refetchAfterMutation("공유 TODO를 추가했어요.");
        return { ok: true as const };
      }
      const updated = await updateApiRoomTodo(tripId, editor.todo.id, {
        ...draft,
        expectedRevision: editor.todo.revision,
        clientMutationId: editor.mutationId,
      });
      setCachedTodo(updated);
      setEditor(undefined);
      await refetchAfterMutation("공유 TODO를 수정했어요.");
      return { ok: true as const };
    } catch (error) {
      const latest = editor.todo ? await handleConflict(error, editor.todo.id) : undefined;
      if (latest) {
        setEditor((current) => current ? { ...current, todo: latest } : current);
        return {
          ok: false as const,
          message: "다른 참여자가 먼저 수정했어요. 최신 내용은 목록에 반영했고 작성 중인 입력은 유지했습니다. 내용을 확인한 뒤 다시 저장해 주세요.",
        };
      }
      const refreshed = await query.refetch();
      return {
        ok: false as const,
        message: `${toUserFacingApiErrorMessage(error, "TODO를 저장하지 못했어요.")} ${refreshed.isError ? "최신 TODO 목록도 확인하지 못했어요." : "최신 TODO 목록을 다시 확인했어요."} 작성 중인 내용은 유지했으며 같은 창에서 다시 시도할 수 있습니다.`,
      };
    } finally {
      setBusy(false);
    }
  };

  const updateQuickly = async (todo: ApiRoomTodo, draft: ApiRoomTodoDraft, successMessage: string) => {
    if (mutationsDisabled) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateApiRoomTodo(tripId, todo.id, {
        ...draft,
        expectedRevision: todo.revision,
        clientMutationId: createApiTodoMutationId("todo-quick"),
      });
      setCachedTodo(updated);
      await refetchAfterMutation(successMessage);
    } catch (error) {
      const latest = await handleConflict(error, todo.id);
      if (latest) {
        setMessage("다른 참여자가 먼저 수정해 최신 TODO를 불러왔어요. 변경 내용을 확인한 뒤 다시 시도해 주세요.");
      } else {
        const refreshed = await query.refetch();
        setMessage(`${toUserFacingApiErrorMessage(error, "TODO 변경 결과를 확인하지 못했어요.")} ${refreshed.isError ? "최신 목록도 확인하지 못했어요." : "새로 불러온 목록에서 반영 여부를 확인해 주세요."}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const removeTodo = async () => {
    if (!pendingDelete || mutationsDisabled) return;
    const target = pendingDelete;
    setBusy(true);
    setMessage("");
    try {
      const result = await deleteApiRoomTodo(tripId, target.todo.id, target.todo.revision, target.mutationId);
      if (result.todo) setCachedTodo(result.todo);
      else removeCachedTodo(target.todo.id);
      setPendingDelete(undefined);
      await refetchAfterMutation(result.suppressed ? "자동 TODO를 보관하고 같은 원인의 즉시 재생성을 막았어요." : "공유 TODO를 삭제했어요.");
    } catch (error) {
      const latest = await handleConflict(error, target.todo.id);
      if (latest) {
        setPendingDelete({ ...target, todo: latest });
        setMessage("다른 참여자가 먼저 수정해 최신 TODO를 불러왔어요. 다시 확인한 뒤 삭제해 주세요.");
      } else {
        const refreshed = await query.refetch();
        const refreshedTodo = refreshed.data?.find((todo) => todo.id === target.todo.id);
        if (!refreshed.isError && (!refreshedTodo || (refreshedTodo.archived && refreshedTodo.source.suppressed))) {
          if (refreshedTodo) setCachedTodo(refreshedTodo);
          else removeCachedTodo(target.todo.id);
          setPendingDelete(undefined);
          setMessage(refreshedTodo
            ? "응답은 확인하지 못했지만 새로 불러온 목록에서 자동 TODO가 보관된 것을 확인했어요."
            : "응답은 확인하지 못했지만 새로 불러온 목록에서 삭제된 것을 확인했어요.");
        } else {
          setMessage(toUserFacingApiErrorMessage(error, "TODO 삭제 결과를 확인하지 못했어요. 다시 시도해 주세요."));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (query.isLoading && !query.data) return <Card style={styles.card}><Text style={styles.emptyTitle}>공유 TODO를 불러오는 중이에요</Text></Card>;
  if (query.error && !query.data) return <Card style={styles.card}><Text style={styles.emptyTitle}>공유 TODO를 불러오지 못했어요</Text><Text accessibilityRole="alert" style={styles.error}>{toUserFacingApiErrorMessage(query.error, "잠시 후 다시 불러와 주세요.")}</Text><SecondaryButton label="다시 불러오기" onPress={() => { void query.refetch(); }} /></Card>;

  return <Card style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}><Text style={styles.eyebrow}>함께 준비하기</Text><Text style={styles.title}>여행 준비 TODO</Text><Text style={styles.description}>동행자와 할 일, 마감, 체크리스트와 관련 일정을 함께 관리해요.</Text></View>
      <View style={styles.count}><Text style={styles.countValue}>{activeCount}</Text><Text style={styles.countLabel}>남음</Text></View>
    </View>
    {query.error ? <View style={styles.staleNotice}><Text style={styles.staleTitle}>최신 목록을 확인하지 못했어요</Text><Text style={styles.staleText}>마지막으로 확인한 목록을 표시하고 있어요. 연결이 복구되면 다시 불러와 주세요.</Text><SecondaryButton label="다시 불러오기" onPress={() => { void query.refetch(); }} /></View> : null}
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    <View style={styles.filters}>{filterOptions.map((option) => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: filter === option.value }} onPress={() => setFilter(option.value)} style={({ pressed }) => [styles.filter, filter === option.value && styles.filterSelected, pressed && styles.pressed]}><Text style={[styles.filterText, filter === option.value && styles.filterTextSelected]}>{option.label}</Text></Pressable>)}</View>
    {filtered.length ? <View style={styles.list}>{filtered.map((todo) => {
      const canMutate = !readOnly && (isOwner || todo.createdBy === currentUserId || todo.assigneeId === currentUserId);
      const completedChecklist = todo.checklist.filter((entry) => entry.done).length;
      return <View key={todo.id} style={[styles.todo, todo.archived && styles.todoMuted]}>
        <View style={styles.todoHeading}><View style={styles.todoCopy}><Text style={styles.todoTitle}>{automaticDuriText(todo, todo.title)}</Text>{todo.description ? <Text numberOfLines={3} style={styles.todoDescription}>{automaticDuriText(todo, todo.description)}</Text> : null}</View><Text style={[styles.priority, todo.priority === "urgent" && styles.priorityUrgent]}>{priorityLabel[toApiTodoUiPriority(todo.priority)]}</Text></View>
        <View style={styles.metaRow}><Text style={styles.meta}>{todo.archived ? "보관" : statusLabel[toApiTodoUiStatus(todo.status)]}</Text><Text style={styles.meta}>{dateLabel(todo)}</Text><Text style={styles.meta}>{todo.assigneeId ? memberNames[todo.assigneeId] ?? "알 수 없는 담당자" : "담당자 없음"}</Text></View>
        <Text style={styles.source}>{sourceLabel[todo.source.kind]}{todo.source.userEdited ? " · 직접 수정함" : ""}</Text>
        {todo.checklist.length ? <View style={styles.checklist}>{todo.checklist.map((entry) => <Pressable key={entry.id} accessibilityRole="checkbox" accessibilityState={{ checked: entry.done }} disabled={!canMutate || mutationsDisabled} onPress={() => void updateQuickly(todo, { ...apiRoomTodoToDraft(todo), checklist: todo.checklist.map((item) => ({ id: item.id, title: item.title, done: item.id === entry.id ? !item.done : item.done })) }, "체크리스트를 저장했어요.")} style={({ pressed }) => [styles.checkItem, (!canMutate || mutationsDisabled) && styles.disabled, pressed && styles.pressed]}><Text style={styles.checkIcon}>{entry.done ? "✓" : "○"}</Text><Text style={[styles.checkText, entry.done && styles.completedText]}>{entry.title}</Text></Pressable>)}</View> : null}
        {todo.checklist.length ? <Text style={styles.checkSummary}>체크리스트 {completedChecklist}/{todo.checklist.length}</Text> : null}
        {canMutate ? <View style={styles.actions}><Pressable accessibilityRole="button" disabled={mutationsDisabled} onPress={() => void updateQuickly(todo, { ...apiRoomTodoToDraft(todo), status: todo.status === "done" ? "open" : "completed" }, todo.status === "done" ? "TODO를 다시 열었어요." : "TODO를 완료했어요.")} style={({ pressed }) => [styles.action, mutationsDisabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.actionText}>{todo.status === "done" ? "다시 열기" : "완료"}</Text></Pressable><Pressable accessibilityRole="button" disabled={mutationsDisabled} onPress={() => openEdit(todo)} style={({ pressed }) => [styles.action, mutationsDisabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.actionText}>편집</Text></Pressable><Pressable accessibilityRole="button" disabled={mutationsDisabled} onPress={() => setPendingDelete({ todo, mutationId: createApiTodoMutationId("todo-delete") })} style={({ pressed }) => [styles.deleteAction, mutationsDisabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.deleteText}>삭제</Text></Pressable></View> : null}
      </View>;
    })}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>{filter === "active" ? "남은 TODO가 없어요" : "이 목록은 비어 있어요"}</Text><Text style={styles.emptyText}>다른 상태를 선택하거나 공유 TODO를 추가해 보세요.</Text></View>}
    <SecondaryButton label={readOnly ? "완료된 여행에서는 추가할 수 없어요" : "공유 TODO 추가"} disabled={mutationsDisabled} onPress={openCreate} />
    {editor ? <ApiTodoEditorModal
      key={editor.instanceKey}
      initialTodo={editor.todo}
      initialDraft={editor.draft}
      members={memberOptions}
      itineraryOptions={itineraryOptions}
      documentOptions={documentOptions}
      suggestedDates={suggestedDates}
      busy={busy}
      onClose={() => { if (!busy) setEditor(undefined); }}
      onSave={saveEditor}
    /> : null}
    <Modal visible={Boolean(pendingDelete)} transparent animationType="fade" onRequestClose={() => { if (!busy) setPendingDelete(undefined); }}>
      <View style={styles.confirmOverlay}><Pressable accessibilityRole="button" accessibilityLabel="TODO 삭제 취소" disabled={busy} onPress={() => setPendingDelete(undefined)} style={StyleSheet.absoluteFill} /><SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.confirmSafeArea}><View accessibilityViewIsModal style={styles.confirmCard}><Text style={styles.confirmTitle}>TODO를 삭제할까요?</Text><Text style={styles.confirmText}>{pendingDelete?.todo.source.kind === "manual" ? "직접 만든 TODO는 동행자 목록에서도 삭제되며 되돌릴 수 없어요." : "자동 TODO는 보관되고 같은 원인으로 즉시 다시 생성되지 않아요."}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => { void removeTodo(); }} style={({ pressed }) => [styles.confirmDelete, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.confirmDeleteText}>{busy ? "처리 중…" : "삭제"}</Text></Pressable><SecondaryButton label="취소" disabled={busy} onPress={() => setPendingDelete(undefined)} /></View></SafeAreaView></View>
    </Modal>
  </Card>;
}

function ApiTodoEditorModal({
  initialTodo,
  initialDraft,
  members,
  itineraryOptions,
  documentOptions,
  suggestedDates,
  busy,
  onClose,
  onSave,
}: {
  initialTodo?: ApiRoomTodo;
  initialDraft: ApiRoomTodoDraft;
  members: readonly EditorOption[];
  itineraryOptions: readonly EditorOption[];
  documentOptions: readonly EditorOption[];
  suggestedDates: readonly EditorOption[];
  busy: boolean;
  onClose(): void;
  onSave(draft: ApiRoomTodoDraft): Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [draft, setDraft] = useState<ApiRoomTodoDraft>(() => ({
    ...initialDraft,
    checklist: initialDraft.checklist.map((entry) => ({ ...entry })),
    links: initialDraft.links.map((link) => ({ ...link })),
  }));
  const [checklistTitle, setChecklistTitle] = useState("");
  const [message, setMessage] = useState("");

  const update = <K extends keyof ApiRoomTodoDraft>(key: K, value: ApiRoomTodoDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };
  const toggleLink = (type: "scheduleItem" | "document", targetId: string) => setDraft((current) => {
    const exists = current.links.some((link) => link.type === type && link.targetId === targetId);
    return {
      ...current,
      links: exists
        ? current.links.filter((link) => !(link.type === type && link.targetId === targetId))
        : [...current.links, { type, targetId, scheduleItemId: type === "scheduleItem" ? targetId : null }],
    };
  });
  const submit = async () => {
    const title = draft.title.trim();
    if (!title) { setMessage("제목을 입력해 주세요."); return; }
    if (title.length > 200) { setMessage("제목은 200자 이하로 입력해 주세요."); return; }
    if (draft.description.length > 2000) { setMessage("내용은 2,000자 이하로 입력해 주세요."); return; }
    if (draft.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) { setMessage("마감 날짜를 YYYY-MM-DD 형식으로 입력해 주세요."); return; }
    if (draft.dueTime && !draft.dueDate) { setMessage("마감 시간을 사용하려면 날짜도 입력해 주세요."); return; }
    if (draft.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.dueTime)) { setMessage("마감 시간을 HH:mm 형식으로 입력해 주세요."); return; }
    if (draft.checklist.some((entry) => !entry.title.trim() || entry.title.trim().length > 200)) { setMessage("체크리스트 항목은 1~200자로 입력해 주세요."); return; }
    setMessage("");
    const result = await onSave({
      ...draft,
      title,
      description: draft.description.trim(),
      checklist: draft.checklist.map((entry) => ({ ...entry, title: entry.title.trim() })),
    });
    if (!result.ok) setMessage(result.message);
  };
  const addChecklist = () => {
    const title = checklistTitle.trim();
    if (!title) return;
    const id = createApiTodoMutationId("todo-check");
    update("checklist", [...draft.checklist, { id, title: title.slice(0, 200), done: false }]);
    setChecklistTitle("");
  };
  const statusOptions: readonly { value: ApiTodoUiStatus; label: string }[] = [
    { value: "open", label: "할 일" }, { value: "in-progress", label: "진행 중" }, { value: "completed", label: "완료" }, { value: "cancelled", label: "취소" },
  ];
  const priorityOptions: readonly { value: ApiTodoUiPriority; label: string }[] = [
    { value: "urgent", label: "긴급" }, { value: "high", label: "높음" }, { value: "normal", label: "보통" }, { value: "low", label: "낮음" },
  ];

  return <Modal visible transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined} style={styles.keyboardAvoider}>
    <View style={styles.editorOverlay}><SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.editorSafeArea}><Pressable accessibilityRole="button" accessibilityLabel="TODO 편집 닫기" disabled={busy} onPress={onClose} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={styles.editorSheet}><View style={styles.handle} /><Text style={styles.editorTitle}>{initialTodo ? "공유 TODO 수정" : "공유 TODO 추가"}</Text><ScrollView style={styles.editorScroll} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
      {initialTodo?.source.kind !== "manual" ? <View style={styles.generatedNotice}><Text style={styles.generatedTitle}>자동 생성된 TODO</Text><Text style={styles.generatedText}>내용을 직접 수정하면 이후 자동 정리 과정에서도 수정한 내용을 유지해요.</Text></View> : null}
      <View style={styles.contractNotice}><Text style={styles.contractTitle}>동행자와 함께 관리해요</Text><Text style={styles.contractText}>상태, 우선순위, 마감, 담당자, 체크리스트와 관련 일정·문서를 함께 저장할 수 있어요.</Text></View>
      <TextField label="제목 *" value={draft.title} onChangeText={(value) => update("title", value)} maxLength={200} placeholder="예: KTX 승차권 시간 다시 확인" />
      <TextField label="내용" value={draft.description} onChangeText={(value) => update("description", value)} multiline maxLength={2000} placeholder="해야 할 일과 확인 사항을 적어 주세요." />
      <FieldGroup label="상태"><ChoiceRow>{statusOptions.map((option) => <Choice key={option.value} label={option.label} selected={draft.status === option.value} onPress={() => update("status", option.value)} />)}</ChoiceRow></FieldGroup>
      <FieldGroup label="우선순위"><ChoiceRow>{priorityOptions.map((option) => <Choice key={option.value} label={option.label} selected={draft.priority === option.value} onPress={() => update("priority", option.value)} />)}</ChoiceRow></FieldGroup>
      <View style={styles.twoFields}><View style={styles.fieldFlex}><TextField label="마감 날짜" value={draft.dueDate} onChangeText={(value) => update("dueDate", value)} maxLength={10} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /></View><View style={styles.fieldFlex}><TextField label="마감 시간" value={draft.dueTime} onChangeText={(value) => update("dueTime", value)} maxLength={5} placeholder="HH:mm (선택)" keyboardType="numbers-and-punctuation" /></View></View>
      {suggestedDates.length ? <FieldGroup label="빠른 날짜 선택"><ChoiceRow>{suggestedDates.map((option) => <Choice key={option.id} label={option.label} selected={draft.dueDate === option.id} onPress={() => update("dueDate", option.id)} />)}<Choice label="날짜 없음" selected={!draft.dueDate} onPress={() => { setDraft((current) => ({ ...current, dueDate: "", dueTime: "" })); setMessage(""); }} /></ChoiceRow></FieldGroup> : null}
      <FieldGroup label="담당자 한 명"><OptionRadioList options={[{ id: "", label: "담당자 없음" }, ...members]} selectedId={draft.assigneeId ?? ""} onSelect={(id) => update("assigneeId", id || null)} /></FieldGroup>
      <FieldGroup label={`체크리스트 ${draft.checklist.filter((entry) => entry.done).length}/${draft.checklist.length}`}><View style={styles.inlineInput}><View style={styles.fieldFlex}><TextField label="새 체크 항목" value={checklistTitle} onChangeText={setChecklistTitle} maxLength={200} placeholder="확인할 단계를 입력" /></View><Pressable accessibilityRole="button" onPress={addChecklist} style={({ pressed }) => [styles.addSmall, pressed && styles.pressed]}><Text style={styles.addSmallText}>추가</Text></Pressable></View>{draft.checklist.map((entry) => <View key={entry.id} style={styles.editorCheckItem}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: entry.done }} onPress={() => update("checklist", draft.checklist.map((item) => item.id === entry.id ? { ...item, done: !item.done } : item))}><Text style={styles.checkIcon}>{entry.done ? "✓" : "○"}</Text></Pressable><Text style={[styles.checkText, entry.done && styles.completedText]}>{entry.title}</Text><Pressable accessibilityRole="button" onPress={() => update("checklist", draft.checklist.filter((item) => item.id !== entry.id))}><Text style={styles.deleteText}>삭제</Text></Pressable></View>)}</FieldGroup>
      {itineraryOptions.length ? <FieldGroup label="관련 일정"><OptionCheckList options={itineraryOptions} selectedIds={draft.links.filter((link) => link.type === "scheduleItem").map((link) => link.targetId)} onToggle={(id) => toggleLink("scheduleItem", id)} /></FieldGroup> : null}
      {documentOptions.length ? <FieldGroup label="관련 공유 문서"><OptionCheckList options={documentOptions} selectedIds={draft.links.filter((link) => link.type === "document").map((link) => link.targetId)} onToggle={(id) => toggleLink("document", id)} /></FieldGroup> : null}
      {draft.links.some((link) => link.type === "reservation" || link.type === "ticket") ? <Text style={styles.helper}>예약·티켓과 연결된 정보는 내용을 수정해도 그대로 유지돼요.</Text> : null}
      {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
      <PrimaryButton label={initialTodo ? "수정 내용 저장" : "공유 TODO 추가"} loading={busy} onPress={() => { void submit(); }} />
      <SecondaryButton label="취소" disabled={busy} onPress={onClose} />
    </ScrollView></View></SafeAreaView></View>
    </KeyboardAvoidingView>
  </Modal>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.group}><Text style={styles.groupLabel}>{label}</Text>{children}</View>; }
function ChoiceRow({ children }: { children: React.ReactNode }) { return <View style={styles.choiceRow}>{children}</View>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>; }
function OptionRadioList({ options, selectedId, onSelect }: { options: readonly EditorOption[]; selectedId: string; onSelect(id: string): void }) { return <View style={styles.optionList}>{options.map((option) => <Pressable key={option.id || "unassigned"} accessibilityRole="radio" accessibilityState={{ checked: selectedId === option.id }} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.option, selectedId === option.id && styles.optionSelected, pressed && styles.pressed]}><Text style={[styles.optionIcon, selectedId === option.id && styles.choiceTextSelected]}>{selectedId === option.id ? "●" : "○"}</Text><Text style={styles.optionLabel}>{option.label}</Text></Pressable>)}</View>; }
function OptionCheckList({ options, selectedIds, onToggle }: { options: readonly EditorOption[]; selectedIds: readonly string[]; onToggle(id: string): void }) { return <View style={styles.optionList}>{options.map((option) => { const selected = selectedIds.includes(option.id); return <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => onToggle(option.id)} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}><Text style={[styles.optionIcon, selected && styles.choiceTextSelected]}>{selected ? "✓" : "○"}</Text><View style={styles.optionCopy}><Text style={styles.optionLabel}>{option.label}</Text>{option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}</View></Pressable>; })}</View>; }

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xxs },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text },
  description: { ...typography.body, color: colors.textSecondary },
  count: { minWidth: 48, height: 48, flexDirection: "row", alignItems: "baseline", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingTop: spacing.sm },
  countValue: { ...typography.subtitle, color: colors.primary },
  countLabel: { ...typography.caption, color: colors.primary },
  contractNotice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm },
  contractTitle: { ...typography.bodyStrong, color: colors.primary },
  contractText: { ...typography.caption, color: colors.textSecondary },
  staleNotice: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  staleTitle: { ...typography.bodyStrong, color: colors.warning },
  staleText: { ...typography.caption, color: colors.textSecondary },
  message: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  filter: { minHeight: 38, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm },
  filterSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { ...typography.caption, color: colors.textSecondary },
  filterTextSelected: { color: colors.primary },
  list: { gap: spacing.sm },
  todo: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  todoMuted: { opacity: 0.7, backgroundColor: colors.surfaceMuted },
  todoHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  todoCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  todoTitle: { ...typography.bodyStrong, color: colors.text },
  todoDescription: { ...typography.body, color: colors.textSecondary },
  priority: { ...typography.caption, color: colors.primary, borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  priorityUrgent: { color: colors.danger, backgroundColor: colors.dangerSoft },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  meta: { ...typography.caption, color: colors.textSecondary },
  source: { ...typography.caption, color: colors.textMuted },
  checklist: { gap: spacing.xxs },
  checkItem: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm },
  checkIcon: { ...typography.subtitle, color: colors.primary },
  checkText: { ...typography.body, color: colors.text, flex: 1 },
  completedText: { color: colors.textMuted, textDecorationLine: "line-through" },
  checkSummary: { ...typography.caption, color: colors.textSecondary },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  action: { minHeight: 38, justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm },
  actionText: { ...typography.caption, color: colors.primary },
  deleteAction: { minHeight: 38, justifyContent: "center", paddingHorizontal: spacing.sm },
  deleteText: { ...typography.caption, color: colors.danger },
  empty: { gap: spacing.xxs, alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, padding: spacing.lg },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  confirmOverlay: { flex: 1, justifyContent: "center", backgroundColor: colors.overlay, padding: spacing.lg },
  confirmSafeArea: { width: "100%" },
  confirmCard: { width: "100%", maxWidth: 440, alignSelf: "center", gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg },
  confirmTitle: { ...typography.subtitle, color: colors.text },
  confirmText: { ...typography.body, color: colors.textSecondary },
  confirmDelete: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.danger },
  confirmDeleteText: { ...typography.button, color: colors.white },
  keyboardAvoider: { flex: 1 },
  editorOverlay: { flex: 1, backgroundColor: colors.overlay },
  editorSafeArea: { flex: 1, width: "100%", justifyContent: "flex-end" },
  editorSheet: { width: "100%", maxWidth: 680, maxHeight: "94%", alignSelf: "center", overflow: "hidden", gap: spacing.sm, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg },
  handle: { width: 44, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  editorTitle: { ...typography.title, color: colors.text },
  editorScroll: { minHeight: 0, flexShrink: 1 },
  editorContent: { gap: spacing.lg, paddingBottom: spacing.sm },
  generatedNotice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm },
  generatedTitle: { ...typography.bodyStrong, color: colors.primary },
  generatedText: { ...typography.caption, color: colors.textSecondary },
  group: { gap: spacing.xs },
  groupLabel: { ...typography.bodyStrong, color: colors.text },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { ...typography.caption, color: colors.textSecondary },
  choiceTextSelected: { color: colors.primary },
  twoFields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fieldFlex: { flex: 1, minWidth: 150 },
  inlineInput: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  addSmall: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.md },
  addSmallText: { ...typography.bodyStrong, color: colors.primary },
  editorCheckItem: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm },
  optionList: { gap: spacing.xs },
  option: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionIcon: { ...typography.subtitle, color: colors.textMuted },
  optionCopy: { flex: 1, minWidth: 0 },
  optionLabel: { ...typography.bodyStrong, color: colors.text },
  optionDescription: { ...typography.caption, color: colors.textSecondary },
  helper: { ...typography.caption, color: colors.textSecondary },
});
