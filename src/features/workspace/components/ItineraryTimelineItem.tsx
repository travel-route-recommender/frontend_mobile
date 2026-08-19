import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderHandlers } from "react-native";
import { Chip } from "../../../components/common";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import type { ItineraryItemViewModel } from "../types";

function SmallAction({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
  ><Text style={styles.actionText}>{label}</Text></Pressable>;
}

export function ItineraryTimelineItem({
  item,
  order,
  first,
  last,
  canEdit,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
  onMeasure,
  onDragStateChange,
  onDrop,
}: {
  item: ItineraryItemViewModel;
  order: number;
  first: boolean;
  last: boolean;
  canEdit: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMeasure: (layout: { y: number; height: number }) => void;
  onDragStateChange: (dragging: boolean) => void;
  onDrop: (translationY: number) => void;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers>({});
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dragReady = useRef(false);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const onDropRef = useRef(onDrop);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    onDragStateChangeRef.current = onDragStateChange;
    onDropRef.current = onDrop;
  }, [onDragStateChange, onDrop]);

  useEffect(() => {
    const clearLongPress = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    };
    const finishDrag = (translation: number, commit: boolean) => {
      const wasDragging = dragReady.current;
      clearLongPress();
      dragReady.current = false;
      translateY.setValue(0);
      if (!wasDragging) return;
      setDragging(false);
      onDragStateChangeRef.current(false);
      if (commit) onDropRef.current(translation);
    };
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => canEdit,
      onStartShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => {
        if (!canEdit) return;
        clearLongPress();
        longPressTimer.current = setTimeout(() => {
          dragReady.current = true;
          setDragging(true);
          onDragStateChangeRef.current(true);
        }, 280);
      },
      onPanResponderMove: (_event, gesture) => {
        if (!dragReady.current) {
          if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) clearLongPress();
          return;
        }
        translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => finishDrag(gesture.dy, true),
      onPanResponderTerminate: (_event, gesture) => finishDrag(gesture.dy, false),
      onPanResponderTerminationRequest: () => !dragReady.current,
      onShouldBlockNativeResponder: () => dragReady.current,
    });
    setPanHandlers(panResponder.panHandlers);
    return () => {
      clearLongPress();
      if (dragReady.current) {
        dragReady.current = false;
        onDragStateChangeRef.current(false);
      }
    };
  }, [canEdit, translateY]);

  return <Animated.View
    onLayout={(event) => onMeasure({ y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}
    style={[
      styles.row,
      item.hasTimeConflict && styles.conflictBorder,
      dragging && styles.dragging,
      { transform: [{ translateY }, { scale: dragging ? 1.01 : 1 }] },
    ]}
    accessibilityLabel={`${order}번째 일정, ${item.startTime}부터 ${item.endTime}, ${item.placeName}${item.lockedForDuri ? ", 두리 변경 잠금" : ""}`}
    testID={`workspace-itinerary-${item.id}`}
  >
    <View style={styles.timeline}><View style={[styles.dot, item.hasTimeConflict && styles.dotConflict]}><Text style={styles.order}>{order}</Text></View>{!last ? <View style={styles.line} /> : null}</View>
    <View style={styles.card}>
      <View style={styles.heading}><View style={styles.copy}><Text style={styles.time}>{item.startTime}–{item.endTime}</Text><Text style={styles.name}>{item.placeName}</Text></View><Chip label={item.categoryLabel} /></View>
      <Text style={styles.duration}>체류 {item.durationMinutes}분{item.lockedForDuri ? " · 두리 변경 잠금" : ""}{item.preferredByNames.length ? ` · 함께 담은 사람 ${item.preferredByNames.join(", ")}` : ""}</Text>
      {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
      {item.placeMissing ? <Text style={styles.warning}>장소 정보가 누락됐지만 시간과 메모는 편집할 수 있어요.</Text> : null}
      {item.hasTimeConflict ? <Text accessibilityRole="alert" style={styles.conflict}>다른 일정과 시간이 겹쳐요.</Text> : null}
      {canEdit ? <View
        {...panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${item.placeName} 일정 순서 변경`}
        accessibilityHint="길게 누른 뒤 위아래로 끌어 놓으세요"
        style={[styles.dragHandle, dragging && styles.dragHandleActive]}
        testID={`workspace-drag-handle-${item.id}`}
      ><Text style={[styles.dragHandleText, dragging && styles.dragHandleTextActive]}>{dragging ? "이동 중 · 놓아서 순서 저장" : "≡  길게 눌러 순서 이동"}</Text></View> : null}
      <View style={styles.actions}>
        <SmallAction label="위로 이동" disabled={!canEdit || first} onPress={onMoveUp} />
        <SmallAction label="아래로 이동" disabled={!canEdit || last} onPress={onMoveDown} />
        <SmallAction label="편집" disabled={!canEdit} onPress={onEdit} />
        <SmallAction label="삭제" disabled={!canEdit} onPress={onRemove} />
      </View>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  dragging: { zIndex: 20, elevation: 12, opacity: 0.94 },
  conflictBorder: { borderRadius: radius.lg, backgroundColor: colors.warningSoft },
  timeline: { width: 32, alignItems: "center" },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  dotConflict: { backgroundColor: colors.warning },
  order: { ...typography.caption, color: colors.white },
  line: { width: 2, flex: 1, minHeight: 92, backgroundColor: colors.borderStrong },
  card: { flex: 1, minWidth: 0, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  time: { ...typography.caption, color: colors.primary },
  name: { ...typography.subtitle, color: colors.text },
  duration: { ...typography.caption, color: colors.textSecondary },
  note: { ...typography.body, color: colors.text, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm },
  warning: { ...typography.caption, color: colors.danger },
  conflict: { ...typography.caption, color: colors.warning },
  dragHandle: { minHeight: sizes.touch, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  dragHandleActive: { borderColor: colors.primary, borderStyle: "solid", backgroundColor: colors.primary },
  dragHandleText: { ...typography.caption, color: colors.textSecondary },
  dragHandleTextActive: { color: colors.white },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  action: { minHeight: sizes.touch, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  actionText: { ...typography.caption, color: colors.primary },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.8 },
});
