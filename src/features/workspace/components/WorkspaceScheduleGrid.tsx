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
import type { TripEndConditionTimelineEntry } from "../logic/tripEndCondition";
import {
  getScheduleBlockDisplayMode,
  shouldShowScheduleResizeHandle,
} from "../logic/workspaceScheduleLayout";
import type { ItineraryItemViewModel, WorkspaceDate } from "../types";

const TIME_AXIS_WIDTH = 58;
const GRID_VIEWPORT_HEIGHT = 520;
const MOVE_LONG_PRESS_MS = 240;

export function WorkspaceScheduleGrid({
  date,
  items,
  endCondition,
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
  endCondition?: TripEndConditionTimelineEntry;
  canEdit: boolean;
  interactionItemId?: string;
  onAdd: () => void;
  onEdit: (itemId: string) => void;
  onMove: (itemId: string, startTime: string) => void;
  onResize: (itemId: string, durationMinutes: number) => void;
  onInteractionStateChange: (itemId?: string) => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const firstStart = itemsRef.current.reduce<number | null>((earliest, item) => {
      const minutes = parseTimeToMinutes(item.startTime);
      if (minutes === null) return earliest;
      return earliest === null ? minutes : Math.min(earliest, minutes);
    }, null);
    const top = firstStart === null
      ? 0
      : Math.max(((firstStart - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX - 72, 0);
    scrollRef.current?.scrollTo({ y: top, animated: false });
  }, [date.date]);

  return <View style={styles.card} testID="workspace-schedule-grid">
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{date.dayLabel} · {date.monthDayLabel} {date.weekdayLabel}</Text>
        <Text style={styles.title}>일정표</Text>
        <Text style={styles.guide}>08:00–24:00 · {SLOT_MINUTES}분 단위</Text>
      </View>
      {canEdit ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="후보 장소에서 일정 추가"
        onPress={onAdd}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      ><Text style={styles.addButtonText}>+ 일정 추가</Text></Pressable> : null}
    </View>
    <Text style={styles.interactionGuide}>시간표를 좌우로 밀어 DAY를 바꾸고, 오른쪽·아래 핸들로 일정 시간과 체류시간을 조절하세요.</Text>
    {endCondition ? <View style={styles.endConditionSummary}>
      <Text style={styles.endConditionSummaryTitle}>마지막 날 복귀 조건</Text>
      <Text style={styles.endConditionSummaryText}>{formatEndConditionStart(endCondition)} → {endCondition.locationName} {endCondition.deadline}까지</Text>
      <Text style={styles.endConditionSummaryMeta}>예상 이동 {endCondition.travelMinutes}분 + 승차·반납 준비 {endCondition.serviceBufferMinutes}분</Text>
    </View> : null}
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
          {endCondition ? <EndConditionTimelineMarker entry={endCondition} /> : null}
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
      const top = Math.min(
        Math.max(((minutes - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX - 8, 0),
        WORKSPACE_GRID_HEIGHT_PX - 18,
      );
      return <Text key={minutes} style={[styles.timeLabel, { top }]}>{formatMinutesToTime(minutes)}</Text>;
    })}
  </View>;
}

function formatEndConditionStart(entry: TripEndConditionTimelineEntry) {
  if (entry.cutoffMinutes < WORKSPACE_START_MINUTES) return "08:00 이전 출발 필요";
  return `${formatMinutesToTime(entry.cutoffMinutes) ?? "--:--"} 복귀 출발`;
}

function EndConditionTimelineMarker({ entry }: { entry: TripEndConditionTimelineEntry }) {
  const visibleStart = Math.min(Math.max(entry.cutoffMinutes, WORKSPACE_START_MINUTES), WORKSPACE_END_MINUTES);
  const visibleDeadline = Math.min(Math.max(entry.deadlineMinutes, WORKSPACE_START_MINUTES), WORKSPACE_END_MINUTES);
  const startTop = ((visibleStart - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
  const deadlineTop = Math.min(
    ((visibleDeadline - WORKSPACE_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX,
    WORKSPACE_GRID_HEIGHT_PX - 1,
  );
  const windowHeight = Math.max(deadlineTop - startTop, 2);
  const labelTop = Math.min(startTop + spacing.xxs, WORKSPACE_GRID_HEIGHT_PX - 58);
  const accessibilityLabel = `${entry.locationName} 복귀 조건, ${formatEndConditionStart(entry)}, ${entry.deadline}까지, 이동 ${entry.travelMinutes}분, 준비 ${entry.serviceBufferMinutes}분`;

  return <View
    accessible
    accessibilityLabel={accessibilityLabel}
    pointerEvents="none"
    style={StyleSheet.absoluteFill}
  >
    <View style={[styles.endConditionWindow, { top: startTop, height: windowHeight }]} />
    <View style={[styles.endConditionDeadlineLine, { top: deadlineTop }]} />
    <View style={[styles.endConditionMarker, { top: labelTop }]}>
      <Text numberOfLines={1} style={styles.endConditionMarkerTitle}>복귀 · {entry.locationName}</Text>
      <Text numberOfLines={1} style={styles.endConditionMarkerTime}>{formatEndConditionStart(entry)} · {entry.deadline} 마감</Text>
    </View>
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
  const height = Math.max((previewDuration / SLOT_MINUTES) * SLOT_HEIGHT_PX - 4, SLOT_HEIGHT_PX - 4);
  const previewEndTime = formatMinutesToTime((parseTimeToMinutes(previewStartTime) ?? startMinutes) + previewDuration) ?? item.endTime;
  // Keep gesture handles tied to the committed duration so the active responder
  // never unmounts, while the visible copy follows the live resize preview.
  const interactionDisplayMode = getScheduleBlockDisplayMode(item.durationMinutes);
  const visualDisplayMode = getScheduleBlockDisplayMode(resizing ? previewDuration : item.durationMinutes);
  const showResizeHandle = shouldShowScheduleResizeHandle(canEdit, item.durationMinutes);
  const micro = interactionDisplayMode === "micro";
  const compact = interactionDisplayMode !== "full";
  const visualMicro = visualDisplayMode === "micro";
  const visualCompact = visualDisplayMode !== "full";

  const moveBySlot = (direction: -1 | 1) => {
    const next = getSnappedStartTimeFromTranslation(item.startTime, item.durationMinutes, direction * SLOT_HEIGHT_PX);
    if (next && next !== item.startTime) onMove(next);
  };
  const resizeBySlot = (direction: -1 | 1) => {
    const next = getSnappedDurationFromTranslation(item.startTime, item.durationMinutes, direction * SLOT_HEIGHT_PX);
    if (next !== null && next !== item.durationMinutes) onResize(next);
  };

  return <Animated.View
    accessibilityLabel={`${item.placeName}, ${previewStartTime}부터 ${previewEndTime}, ${previewDuration}분`}
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
      accessibilityHint={micro ? "두 번 탭하여 시간과 체류시간을 편집하세요" : undefined}
      hitSlop={compact ? { top: 12, bottom: 12 } : undefined}
      onPress={onEdit}
      style={({ pressed }) => [styles.itemOpen, visualCompact && styles.itemOpenCompact, visualMicro && styles.itemOpenMicro, pressed && styles.itemPressed]}
    >
      <Text
        maxFontSizeMultiplier={visualMicro ? 1 : visualCompact ? 1.15 : undefined}
        numberOfLines={1}
        style={[styles.itemName, visualCompact && styles.itemNameCompact, visualMicro && styles.itemNameMicro]}
      >{visualCompact ? `${previewStartTime}–${previewEndTime} · ${item.placeName}` : item.placeName}</Text>
      {!visualCompact ? <Text numberOfLines={1} style={styles.itemTime}>{previewStartTime}–{previewEndTime}</Text> : null}
      {!visualCompact ? <Text numberOfLines={1} style={styles.itemMeta}>{item.categoryLabel} · {previewDuration}분</Text> : null}
    </Pressable>
    {canEdit ? <View
      {...moveHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${item.placeName} 시작 시간 이동`}
      accessibilityHint="길게 누른 뒤 위아래로 끌거나 접근성 조절 동작을 사용하세요"
      accessibilityValue={{ text: previewStartTime }}
      hitSlop={compact ? { top: 14, bottom: 14, left: 8 } : undefined}
      accessibilityActions={[{ name: "increment", label: `${SLOT_MINUTES}분 뒤로 이동` }, { name: "decrement", label: `${SLOT_MINUTES}분 앞으로 이동` }]}
      onAccessibilityAction={(event) => moveBySlot(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={[styles.moveHandle, compact && styles.moveHandleCompact, micro && styles.moveHandleMicro, moving && styles.handleActive]}
      testID={`workspace-grid-move-${item.id}`}
    ><Text style={[styles.moveHandleText, compact && styles.moveHandleTextCompact, moving && styles.handleTextActive]}>{moving ? previewStartTime : "⋮⋮"}</Text></View> : null}
    {showResizeHandle ? <View
      {...resizeHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${item.placeName} 체류시간 조절`}
      accessibilityHint={micro ? "아래 가장자리 손잡이를 아래로 끌어 체류시간을 늘리거나 접근성 조절 동작을 사용하세요" : "아래 손잡이를 위아래로 끌거나 접근성 조절 동작을 사용하세요"}
      accessibilityValue={{ text: `${previewDuration}분` }}
      hitSlop={micro ? { bottom: 8, left: 8, right: 8 } : undefined}
      accessibilityActions={[{ name: "increment", label: `${SLOT_MINUTES}분 늘리기` }, { name: "decrement", label: `${SLOT_MINUTES}분 줄이기` }]}
      onAccessibilityAction={(event) => resizeBySlot(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={[micro ? styles.resizeHandleMicro : styles.resizeHandle, !micro && compact && styles.resizeHandleCompact, !micro && resizing && styles.handleActive]}
      testID={`workspace-grid-resize-${item.id}`}
    >{micro
      ? <View style={[styles.resizeHandleMicroIndicator, resizing && styles.resizeHandleMicroIndicatorActive]} />
      : <Text style={[styles.resizeHandleText, resizing && styles.handleTextActive]}>{resizing ? `${previewEndTime} · ${previewDuration}분` : "━"}</Text>
    }</View> : null}
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
  endConditionSummary: { gap: spacing.xxs, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.warningSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  endConditionSummaryTitle: { ...typography.bodyStrong, color: colors.warning },
  endConditionSummaryText: { ...typography.caption, color: colors.text },
  endConditionSummaryMeta: { ...typography.caption, color: colors.textSecondary },
  viewport: { height: GRID_VIEWPORT_HEIGHT },
  viewportContent: { minHeight: WORKSPACE_GRID_HEIGHT_PX + spacing.md },
  grid: { position: "relative", minHeight: WORKSPACE_GRID_HEIGHT_PX, flexDirection: "row" },
  timeAxis: { position: "relative", width: TIME_AXIS_WIDTH, height: WORKSPACE_GRID_HEIGHT_PX, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  timeLabel: { position: "absolute", right: spacing.xs, ...typography.caption, fontSize: 10, color: colors.textMuted },
  dayColumn: { position: "relative", flex: 1, height: WORKSPACE_GRID_HEIGHT_PX, backgroundColor: colors.surfaceMuted },
  endConditionWindow: { position: "absolute", left: 0, right: 0, zIndex: 1, borderLeftWidth: 3, borderLeftColor: colors.warning, backgroundColor: "rgba(255, 193, 7, 0.14)" },
  endConditionDeadlineLine: { position: "absolute", left: 0, right: 0, zIndex: 2, borderTopWidth: 2, borderTopColor: colors.warning, borderStyle: "dashed" },
  endConditionMarker: { position: "absolute", left: spacing.xs, right: spacing.xs, zIndex: 3, minHeight: 50, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  endConditionMarkerTitle: { ...typography.bodyStrong, fontSize: 12, lineHeight: 16, color: colors.warning },
  endConditionMarkerTime: { ...typography.caption, fontSize: 10, lineHeight: 14, color: colors.textSecondary },
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
  itemOpenCompact: { justifyContent: "center", paddingLeft: spacing.xs, paddingTop: 0, paddingBottom: 14, paddingRight: 40 },
  itemOpenMicro: { paddingBottom: 0, paddingRight: 36 },
  itemPressed: { opacity: 0.78 },
  itemName: { ...typography.bodyStrong, fontSize: 13, lineHeight: 18, color: colors.navy },
  itemNameCompact: { fontSize: 11, lineHeight: 15 },
  itemNameMicro: { fontSize: 11, lineHeight: 13 },
  itemTime: { ...typography.caption, fontSize: 10, lineHeight: 14, color: colors.primary },
  itemMeta: { ...typography.caption, fontSize: 9, lineHeight: 13, color: colors.textSecondary },
  moveHandle: { position: "absolute", top: 0, right: 0, width: 44, minHeight: 36, bottom: 18, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: "rgba(255,255,255,0.76)" },
  moveHandleCompact: { width: 40, minHeight: 0, bottom: 14 },
  moveHandleMicro: { width: 36, bottom: 0 },
  moveHandleText: { ...typography.bodyStrong, color: colors.textSecondary },
  moveHandleTextCompact: { fontSize: 11, lineHeight: 14 },
  resizeHandle: { position: "absolute", left: spacing.xs, right: spacing.xs, bottom: 0, height: 18, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.border },
  resizeHandleCompact: { height: 14 },
  resizeHandleMicro: { position: "absolute", left: "50%", bottom: 0, width: 56, height: "100%", transform: [{ translateX: -28 }], alignItems: "center", justifyContent: "flex-end" },
  resizeHandleMicroIndicator: { width: 40, height: 3, marginBottom: 1, borderRadius: radius.pill, backgroundColor: colors.primary },
  resizeHandleMicroIndicatorActive: { height: 4, backgroundColor: colors.primaryPressed },
  resizeHandleText: { ...typography.caption, fontSize: 10, lineHeight: 14, color: colors.textSecondary },
  handleActive: { backgroundColor: colors.primary },
  handleTextActive: { color: colors.white },
  pressed: { opacity: 0.82 },
});
