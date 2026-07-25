import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderHandlers,
} from "react-native";
import {
  MIN_DURATION_MINUTES,
  SLOT_HEIGHT_PX,
  SLOT_MINUTES,
  WORKSPACE_END_MINUTES,
  WORKSPACE_GRID_HEIGHT_PX,
  WORKSPACE_SLOT_COUNT,
  WORKSPACE_START_MINUTES,
} from "../../../data/workspaceSchedule";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import {
  formatMinutesToTime,
  getSnappedDurationFromTranslation,
  getSnappedStartTimeFromTranslation,
  parseTimeToMinutes,
} from "../logic/workspaceDateTime";
import type { ItineraryItemViewModel, WorkspaceDate } from "../types";

const TIME_AXIS_WIDTH = 58;
const GRID_VIEWPORT_HEIGHT = 520;
const MOVE_LONG_PRESS_MS = 240;

export function WorkspaceScheduleGrid({
  date,
  items,
  canEdit,
  interactionItemId,
  onAdd,
  onEdit,
  onMove,
  onResize,
  onInteractionStateChange,
}: {
  date: WorkspaceDate;
  items: readonly ItineraryItemViewModel[];
  canEdit: boolean;
  interactionItemId?: string;
  onAdd: () => void;
  onEdit: (itemId: string) => void;
  onMove: (itemId: string, startTime: string) => void;
  onResize: (itemId: string, durationMinutes: number) => void;
  onInteractionStateChange: (itemId?: string) => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const firstStart = items.reduce<number | null>((earliest, item) => {
      const minutes = parseTimeToMinutes(item.startTime);
      if (minutes === null) return earliest;
      return earliest === null ? minutes : Math.min(earliest, minutes);
    }, null);
    const top = firstStart === null
      ? 0
      : Math.max(((firstStart - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX - 72, 0);
    scrollRef.current?.scrollTo({ y: top, animated: false });
  }, [date.date, items]);

  return <View style={styles.card} testID="workspace-schedule-grid">
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{date.dayLabel} · {date.monthDayLabel} {date.weekdayLabel}</Text>
        <Text style={styles.title}>일정표</Text>
        <Text style={styles.guide}>08:00–24:00 · 30분 단위</Text>
      </View>
      {canEdit ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="후보 장소에서 일정 추가"
        onPress={onAdd}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      ><Text style={styles.addButtonText}>+ 일정 추가</Text></Pressable> : null}
    </View>
    <Text style={styles.interactionGuide}>오른쪽 핸들로 시간을 옮기고, 블록 아래 핸들로 체류시간을 조절하세요.</Text>
    <ScrollView
      ref={scrollRef}
      style={styles.viewport}
      contentContainerStyle={styles.viewportContent}
      nestedScrollEnabled
      scrollEnabled={!interactionItemId}
      showsVerticalScrollIndicator
      testID="workspace-schedule-scroll"
    >
      <View style={styles.grid}>
        <TimeAxis />
        <View style={styles.dayColumn}>
          {Array.from({ length: WORKSPACE_SLOT_COUNT + 1 }, (_, index) => {
            const minutes = WORKSPACE_START_MINUTES + index * SLOT_MINUTES;
            const major = minutes % 60 === 0;
            return <View
              key={minutes}
              style={[styles.slotLine, major ? styles.majorLine : styles.minorLine, { top: index * SLOT_HEIGHT_PX }]}
            />;
          })}
          {!items.length ? <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 일정이 없어요</Text>
            <Text style={styles.emptyText}>아래 후보 장소 보드에서 장소를 일정에 추가해보세요.</Text>
          </View> : null}
          {items.map((item) => <ScheduleGridItem
            key={`${item.id}-${item.startTime}-${item.durationMinutes}`}
            item={item}
            canEdit={canEdit}
            onEdit={() => onEdit(item.id)}
            onMove={(startTime) => onMove(item.id, startTime)}
            onResize={(durationMinutes) => onResize(item.id, durationMinutes)}
            onInteractionStateChange={(active) => onInteractionStateChange(active ? item.id : undefined)}
          />)}
        </View>
      </View>
    </ScrollView>
  </View>;
}

function TimeAxis() {
  return <View style={styles.timeAxis}>
    {Array.from({ length: 17 }, (_, index) => {
      const minutes = WORKSPACE_START_MINUTES + index * 60;
      const top = Math.min(Math.max(index * SLOT_HEIGHT_PX * 2 - 8, 0), WORKSPACE_GRID_HEIGHT_PX - 18);
      return <Text key={minutes} style={[styles.timeLabel, { top }]}>{formatMinutesToTime(minutes)}</Text>;
    })}
  </View>;
}

function ScheduleGridItem({
  item,
  canEdit,
  onEdit,
  onMove,
  onResize,
  onInteractionStateChange,
}: {
  item: ItineraryItemViewModel;
  canEdit: boolean;
  onEdit: () => void;
  onMove: (startTime: string) => void;
  onResize: (durationMinutes: number) => void;
  onInteractionStateChange: (active: boolean) => void;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const [moveHandlers, setMoveHandlers] = useState<GestureResponderHandlers>({});
  const [resizeHandlers, setResizeHandlers] = useState<GestureResponderHandlers>({});
  const [moving, setMoving] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [previewStartTime, setPreviewStartTime] = useState(item.startTime);
  const [previewDuration, setPreviewDuration] = useState(item.durationMinutes);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const moveReadyRef = useRef(false);
  const previewStartRef = useRef(item.startTime);
  const previewDurationRef = useRef(item.durationMinutes);
  const resizingRef = useRef(false);
  const onInteractionStateChangeRef = useRef(onInteractionStateChange);
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onInteractionStateChangeRef.current = onInteractionStateChange;
    onMoveRef.current = onMove;
    onResizeRef.current = onResize;
  }, [onInteractionStateChange, onMove, onResize]);

  useEffect(() => {
    const clearLongPress = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    };
    const finishMove = (commit: boolean) => {
      const wasMoving = moveReadyRef.current;
      clearLongPress();
      moveReadyRef.current = false;
      translateY.setValue(0);
      if (!wasMoving) return;
      setMoving(false);
      onInteractionStateChangeRef.current(false);
      const nextStartTime = previewStartRef.current;
      setPreviewStartTime(item.startTime);
      if (commit && nextStartTime !== item.startTime) onMoveRef.current(nextStartTime);
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => canEdit,
      onMoveShouldSetPanResponder: () => canEdit,
      onPanResponderGrant: () => {
        if (!canEdit) return;
        clearLongPress();
        previewStartRef.current = item.startTime;
        setPreviewStartTime(item.startTime);
        longPressTimer.current = setTimeout(() => {
          moveReadyRef.current = true;
          setMoving(true);
          onInteractionStateChangeRef.current(true);
        }, MOVE_LONG_PRESS_MS);
      },
      onPanResponderMove: (_event, gesture) => {
        if (!moveReadyRef.current) {
          if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) clearLongPress();
          return;
        }
        const nextStartTime = getSnappedStartTimeFromTranslation(
          item.startTime,
          item.durationMinutes,
          gesture.dy,
        );
        if (!nextStartTime) return;
        previewStartRef.current = nextStartTime;
        setPreviewStartTime(nextStartTime);
        const startMinutes = parseTimeToMinutes(item.startTime);
        const nextMinutes = parseTimeToMinutes(nextStartTime);
        if (startMinutes !== null && nextMinutes !== null) {
          translateY.setValue(((nextMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT_PX);
        }
      },
      onPanResponderRelease: () => finishMove(true),
      onPanResponderTerminate: () => finishMove(false),
      onPanResponderTerminationRequest: () => !moveReadyRef.current,
      onShouldBlockNativeResponder: () => moveReadyRef.current,
    });
    setMoveHandlers(responder.panHandlers);
    return () => {
      clearLongPress();
      if (moveReadyRef.current) onInteractionStateChangeRef.current(false);
      moveReadyRef.current = false;
    };
  }, [canEdit, item.durationMinutes, item.startTime, translateY]);

  useEffect(() => {
    const finishResize = (commit: boolean) => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      setResizing(false);
      onInteractionStateChangeRef.current(false);
      const nextDuration = previewDurationRef.current;
      setPreviewDuration(item.durationMinutes);
      if (commit && nextDuration !== item.durationMinutes) onResizeRef.current(nextDuration);
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => canEdit,
      onMoveShouldSetPanResponder: () => canEdit,
      onPanResponderGrant: () => {
        if (!canEdit) return;
        previewDurationRef.current = item.durationMinutes;
        setPreviewDuration(item.durationMinutes);
        resizingRef.current = true;
        setResizing(true);
        onInteractionStateChangeRef.current(true);
      },
      onPanResponderMove: (_event, gesture) => {
        const nextDuration = getSnappedDurationFromTranslation(
          item.startTime,
          item.durationMinutes,
          gesture.dy,
        );
        if (nextDuration === null) return;
        previewDurationRef.current = nextDuration;
        setPreviewDuration(nextDuration);
      },
      onPanResponderRelease: () => finishResize(true),
      onPanResponderTerminate: () => finishResize(false),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
    setResizeHandlers(responder.panHandlers);
    return () => {
      if (resizingRef.current) onInteractionStateChangeRef.current(false);
      resizingRef.current = false;
    };
  }, [canEdit, item.durationMinutes, item.startTime]);

  const startMinutes = parseTimeToMinutes(item.startTime) ?? WORKSPACE_START_MINUTES;
  const top = ((startMinutes - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX + 2;
  const height = Math.max((previewDuration / SLOT_MINUTES) * SLOT_HEIGHT_PX - 4, 36);
  const previewEndTime = formatMinutesToTime((parseTimeToMinutes(previewStartTime) ?? startMinutes) + previewDuration) ?? item.endTime;
  const compact = previewDuration <= MIN_DURATION_MINUTES;

  const moveBySlot = (direction: -1 | 1) => {
    const next = getSnappedStartTimeFromTranslation(item.startTime, item.durationMinutes, direction * SLOT_HEIGHT_PX);
    if (next && next !== item.startTime) onMove(next);
  };
  const resizeBySlot = (direction: -1 | 1) => {
    const next = getSnappedDurationFromTranslation(item.startTime, item.durationMinutes, direction * SLOT_HEIGHT_PX);
    if (next !== null && next !== item.durationMinutes) onResize(next);
  };

  return <Animated.View
    accessibilityLabel={`${item.placeName}, ${previewStartTime}부터 ${previewEndTime}`}
    style={[
      styles.item,
      item.hasTimeConflict && styles.itemConflict,
      moving && styles.itemMoving,
      { top, height, transform: [{ translateY }] },
    ]}
    testID={`workspace-grid-item-${item.id}`}
  >
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.placeName} 일정 편집`}
      onPress={onEdit}
      style={({ pressed }) => [styles.itemOpen, pressed && styles.itemPressed]}
    >
      <Text numberOfLines={1} style={styles.itemName}>{item.placeName}</Text>
      <Text numberOfLines={1} style={styles.itemTime}>{previewStartTime}{compact ? "" : `–${previewEndTime}`}</Text>
      {!compact ? <Text numberOfLines={1} style={styles.itemMeta}>{item.categoryLabel} · {previewDuration}분</Text> : null}
    </Pressable>
    {canEdit ? <View
      {...moveHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${item.placeName} 시작 시간 이동`}
      accessibilityHint="길게 누른 뒤 위아래로 끌거나 접근성 조절 동작을 사용하세요"
      accessibilityValue={{ text: previewStartTime }}
      accessibilityActions={[{ name: "increment", label: "30분 뒤로 이동" }, { name: "decrement", label: "30분 앞으로 이동" }]}
      onAccessibilityAction={(event) => moveBySlot(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={[styles.moveHandle, moving && styles.handleActive]}
      testID={`workspace-grid-move-${item.id}`}
    ><Text style={[styles.moveHandleText, moving && styles.handleTextActive]}>{moving ? previewStartTime : "⋮⋮"}</Text></View> : null}
    {canEdit ? <View
      {...resizeHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${item.placeName} 체류시간 조절`}
      accessibilityHint="위아래로 끌거나 접근성 조절 동작을 사용하세요"
      accessibilityValue={{ text: `${previewDuration}분` }}
      accessibilityActions={[{ name: "increment", label: "30분 늘리기" }, { name: "decrement", label: "30분 줄이기" }]}
      onAccessibilityAction={(event) => resizeBySlot(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={[styles.resizeHandle, resizing && styles.handleActive]}
      testID={`workspace-grid-resize-${item.id}`}
    ><Text style={[styles.resizeHandleText, resizing && styles.handleTextActive]}>{resizing ? `${previewEndTime} · ${previewDuration}분` : "━"}</Text></View> : null}
  </Animated.View>;
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadows.card },
  header: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text, marginTop: 1 },
  guide: { ...typography.caption, color: colors.textSecondary },
  addButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  addButtonText: { ...typography.caption, color: colors.white },
  interactionGuide: { ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  viewport: { height: GRID_VIEWPORT_HEIGHT },
  viewportContent: { minHeight: WORKSPACE_GRID_HEIGHT_PX + spacing.md },
  grid: { position: "relative", minHeight: WORKSPACE_GRID_HEIGHT_PX, flexDirection: "row" },
  timeAxis: { position: "relative", width: TIME_AXIS_WIDTH, height: WORKSPACE_GRID_HEIGHT_PX, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  timeLabel: { position: "absolute", right: spacing.xs, ...typography.caption, fontSize: 10, color: colors.textMuted },
  dayColumn: { position: "relative", flex: 1, height: WORKSPACE_GRID_HEIGHT_PX, backgroundColor: colors.surfaceMuted },
  slotLine: { position: "absolute", left: 0, right: 0, borderTopWidth: 1 },
  majorLine: { borderTopColor: colors.borderStrong },
  minorLine: { borderTopColor: colors.border, borderStyle: "dashed" },
  empty: { position: "absolute", top: spacing.md, left: spacing.md, right: spacing.md, zIndex: 2, gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: spacing.md },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textSecondary },
  item: { position: "absolute", left: spacing.xs, right: spacing.xs, zIndex: 5, overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: "#AFCDF7", backgroundColor: "#E7F1FF", shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  itemConflict: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  itemMoving: { zIndex: 20, opacity: 0.92, elevation: 12 },
  itemOpen: { height: "100%", paddingLeft: spacing.sm, paddingRight: 48, paddingTop: spacing.xs, paddingBottom: 18 },
  itemPressed: { opacity: 0.78 },
  itemName: { ...typography.bodyStrong, fontSize: 13, lineHeight: 18, color: colors.navy },
  itemTime: { ...typography.caption, fontSize: 10, lineHeight: 14, color: colors.primary },
  itemMeta: { ...typography.caption, fontSize: 9, lineHeight: 13, color: colors.textSecondary },
  moveHandle: { position: "absolute", top: 0, right: 0, width: 44, minHeight: 36, bottom: 14, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: "rgba(255,255,255,0.76)" },
  moveHandleText: { ...typography.bodyStrong, color: colors.textSecondary },
  resizeHandle: { position: "absolute", left: spacing.xs, right: spacing.xs, bottom: 0, height: 18, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.border },
  resizeHandleText: { ...typography.caption, fontSize: 10, lineHeight: 14, color: colors.textSecondary },
  handleActive: { backgroundColor: colors.primary },
  handleTextActive: { color: colors.white },
  pressed: { opacity: 0.82 },
});
