import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import { resolveDayDragTargetIndex } from "../logic/workspaceDayDrag";
import type { WorkspaceDate } from "../types";

const DAY_TAB_WIDTH = 104;
const DAY_TAB_GAP = spacing.sm;
const DAY_TAB_STEP = DAY_TAB_WIDTH + DAY_TAB_GAP;
const DRAG_LONG_PRESS_MS = 360;
const POST_DRAG_PRESS_GUARD_MS = 120;

export function WorkspaceDateTabs({
  dates,
  selectedDate,
  onSelect,
  onAddDay,
  onDeleteDay,
  onEditDateRange,
  onMoveDay,
  addDisabled = false,
  managementDisabledReason,
}: {
  dates: readonly WorkspaceDate[];
  selectedDate: string;
  onSelect: (date: string) => void;
  onAddDay: () => void;
  onDeleteDay: (date: string) => void;
  onEditDateRange: () => void;
  onMoveDay: (date: string, targetIndex: number) => boolean;
  addDisabled?: boolean;
  managementDisabledReason?: string;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const [dragging, setDragging] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const dragX = useSharedValue(0);
  const suppressTabPress = useSharedValue(false);
  const scrollGesture = useMemo(() => Gesture.Native(), []);

  useEffect(() => {
    if (dragging) return;
    const selectedIndex = dates.findIndex((date) => date.date === selectedDate);
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(selectedIndex * DAY_TAB_STEP - 16, 0), animated: true });
  }, [dates, dragging, selectedDate]);

  const selectedDay = dates.find((date) => date.date === selectedDate) ?? dates[0];
  const dateValues = useMemo(() => dates.map((date) => date.date), [dates]);
  const selectDay = useCallback((date: string) => {
    if (!suppressTabPress.get()) onSelect(date);
  }, [onSelect, suppressTabPress]);
  const dropDay = useCallback((date: string, destinationIndex: number) => {
    onMoveDay(date, destinationIndex);
  }, [onMoveDay]);
  const resetDrag = useCallback(() => {
    dragX.set(0);
    activeIndex.set(-1);
    targetIndex.set(-1);
    setDragging(false);
    setTimeout(() => {
      suppressTabPress.set(false);
    }, POST_DRAG_PRESS_GUARD_MS);
  }, [activeIndex, dragX, suppressTabPress, targetIndex]);
  const finishDrop = useCallback((date: string, destinationIndex: number) => {
    dropDay(date, destinationIndex);
    resetDrag();
  }, [dropDay, resetDrag]);
  const dragGestures = useMemo(() => dateValues.map((date, sourceIndex) => Gesture.Pan()
    .enabled(!addDisabled && dateValues.length > 1)
    .activateAfterLongPress(DRAG_LONG_PRESS_MS)
    .failOffsetY([-14, 14])
    .shouldCancelWhenOutside(false)
    .blocksExternalGesture(scrollGesture)
    .onStart(() => {
      activeIndex.set(sourceIndex);
      targetIndex.set(sourceIndex);
      dragX.set(0);
      suppressTabPress.set(true);
      runOnJS(setDragging)(true);
    })
    .onUpdate((event) => {
      if (activeIndex.get() !== sourceIndex) return;
      const minimum = -sourceIndex * DAY_TAB_STEP;
      const maximum = (dateValues.length - sourceIndex - 1) * DAY_TAB_STEP;
      const boundedX = Math.min(Math.max(event.translationX, minimum), maximum);
      dragX.set(boundedX);
      targetIndex.set(resolveDayDragTargetIndex(
        sourceIndex,
        targetIndex.get(),
        boundedX,
        dateValues.length,
        DAY_TAB_STEP,
      ));
    })
    .onEnd(() => {
      if (activeIndex.get() !== sourceIndex) return;
      runOnJS(finishDrop)(date, targetIndex.get());
    })
    .onFinalize((_event, success) => {
      if (success) return;
      runOnJS(resetDrag)();
    })), [activeIndex, addDisabled, dateValues, dragX, finishDrop, resetDrag, scrollGesture, suppressTabPress, targetIndex]);

  return <View style={styles.wrap}>
    <GestureDetector gesture={scrollGesture}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={!dragging}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        accessibilityRole="tablist"
      >
        {dates.map((date, index) => <DraggableDayTab
          key={date.date}
          date={date}
          index={index}
          dayCount={dates.length}
          selected={date.date === selectedDate}
          disabled={addDisabled || dates.length < 2}
          activeIndex={activeIndex}
          targetIndex={targetIndex}
          dragX={dragX}
          dragGesture={dragGestures[index]}
          onSelect={selectDay}
          onDrop={dropDay}
        />)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="마지막 Day 다음에 여행일 추가"
          accessibilityState={{ disabled: addDisabled }}
          disabled={addDisabled}
          onPress={() => { resetDrag(); onAddDay(); }}
          testID="workspace-add-day"
          style={({ pressed }) => [styles.addTab, addDisabled && styles.disabled, pressed && !addDisabled && styles.pressed]}
        >
          <Text style={styles.addSymbol}>+</Text>
          <Text style={styles.addLabel}>날짜 추가</Text>
        </Pressable>
      </ScrollView>
    </GestureDetector>
    <View style={styles.compactGuide}>
      <Text numberOfLines={managementDisabledReason ? 2 : 1} style={styles.dragGuide}>{managementDisabledReason ?? (dragging ? "원하는 순서에서 손을 떼세요" : "길게 눌러 DAY 순서 변경")}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="선택한 DAY 관리" disabled={addDisabled} onPress={() => setManageOpen(true)} style={({ pressed }) => [styles.manageTrigger, addDisabled && styles.disabled, pressed && !addDisabled && styles.pressed]}><Text style={styles.manageTriggerText}>DAY 관리</Text></Pressable>
    </View>
    <DayManagementModal
      visible={manageOpen}
      selectedDay={selectedDay}
      canDelete={dates.length > 1}
      onClose={() => setManageOpen(false)}
      onEditDateRange={() => { setManageOpen(false); onEditDateRange(); }}
      onDeleteDay={() => {
        setManageOpen(false);
        if (selectedDay) onDeleteDay(selectedDay.date);
      }}
    />
  </View>;
}

function DraggableDayTab({
  date,
  index,
  dayCount,
  selected,
  disabled,
  activeIndex,
  targetIndex,
  dragX,
  dragGesture,
  onSelect,
  onDrop,
}: {
  date: WorkspaceDate;
  index: number;
  dayCount: number;
  selected: boolean;
  disabled: boolean;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragX: SharedValue<number>;
  dragGesture: ReturnType<typeof Gesture.Pan>;
  onSelect: (date: string) => void;
  onDrop: (date: string, targetIndex: number) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIndex.get();
    const target = targetIndex.get();
    let offset = 0;
    if (active === index) {
      offset = dragX.get();
    } else if (active >= 0 && active < target && index > active && index <= target) {
      offset = -DAY_TAB_STEP;
    } else if (active >= 0 && target < active && index >= target && index < active) {
      offset = DAY_TAB_STEP;
    }
    const lifted = active === index;
    const dragActive = active >= 0;
    return {
      zIndex: lifted ? 20 : 1,
      opacity: lifted ? 0.94 : 1,
      transform: [
        { translateX: lifted ? offset : dragActive ? withTiming(offset, { duration: 85 }) : 0 },
        { translateY: dragActive ? withTiming(lifted ? -6 : 0, { duration: 120 }) : 0 },
        { scale: dragActive ? withTiming(lifted ? 1.055 : 1, { duration: 120 }) : 1 },
      ],
    };
  });
  const moveByAccessibilityAction = (actionName: string) => {
    if (actionName === "decrement" && index > 0) onDrop(date.date, index - 1);
    if (actionName === "increment" && index < dayCount - 1) onDrop(date.date, index + 1);
  };

  return <GestureDetector gesture={dragGesture}><Animated.View style={animatedStyle}>
      <Pressable
        testID={`workspace-day-tab-${date.date}`}
        accessibilityRole="tab"
        accessibilityState={{ selected, disabled: false }}
        accessibilityLabel={`${date.dayLabel} ${date.monthDayLabel} ${date.weekdayLabel}, 일정 ${date.itineraryCount}개`}
        accessibilityHint={disabled ? undefined : "길게 누른 뒤 좌우로 드래그해 일정 묶음 순서를 변경할 수 있어요."}
        accessibilityActions={disabled ? undefined : [{ name: "decrement", label: "이전 DAY로 이동" }, { name: "increment", label: "다음 DAY로 이동" }]}
        onAccessibilityAction={(event) => moveByAccessibilityAction(event.nativeEvent.actionName)}
        onPress={() => {
          if (activeIndex.get() < 0) onSelect(date.date);
        }}
        style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}
      >
        <Text style={[styles.day, selected && styles.textSelected]}>{date.dayLabel}</Text>
        <Text style={[styles.date, selected && styles.textSelected]}>{date.monthDayLabel} {date.weekdayLabel}</Text>
        <Text style={[styles.count, selected && styles.countSelected]}>{date.itineraryCount}개 일정</Text>
        {!disabled ? <Text aria-hidden style={[styles.dragHandle, selected && styles.dragHandleSelected]}>⠿</Text> : null}
      </Pressable>
  </Animated.View></GestureDetector>;
}

function DayManagementModal({
  visible,
  selectedDay,
  canDelete,
  onClose,
  onEditDateRange,
  onDeleteDay,
}: {
  visible: boolean;
  selectedDay: WorkspaceDate | undefined;
  canDelete: boolean;
  onClose: () => void;
  onEditDateRange: () => void;
  onDeleteDay: () => void;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.menuOverlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="DAY 관리 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.menuCard}>
        <View style={styles.menuHeader}><View style={styles.menuCopy}><Text style={styles.menuTitle}>{selectedDay?.dayLabel ?? "DAY 관리"}</Text><Text style={styles.menuSubtitle}>{selectedDay ? `${selectedDay.monthDayLabel} ${selectedDay.weekdayLabel} · 일정 ${selectedDay.itineraryCount}개` : "선택한 DAY를 관리하세요."}</Text></View><Pressable accessibilityRole="button" onPress={onClose} style={styles.menuClose}><Text style={styles.menuCloseText}>닫기</Text></Pressable></View>
        <Pressable accessibilityRole="button" onPress={onEditDateRange} style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}><View style={styles.menuActionCopy}><Text style={styles.menuActionTitle}>여행 날짜 변경</Text><Text style={styles.menuActionDescription}>시작일과 종료일을 달력에서 다시 선택합니다.</Text></View><Text style={styles.menuChevron}>›</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canDelete }} disabled={!canDelete} onPress={onDeleteDay} style={({ pressed }) => [styles.menuAction, styles.menuDeleteAction, !canDelete && styles.disabled, pressed && canDelete && styles.pressed]}><View style={styles.menuActionCopy}><Text style={styles.menuDeleteTitle}>선택 DAY 삭제</Text><Text style={styles.menuActionDescription}>{canDelete ? "해당 DAY의 일정도 확인 후 함께 삭제합니다." : "여행에는 최소 DAY 1이 필요합니다."}</Text></View><Text style={styles.menuDeleteChevron}>›</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.lg },
  content: { gap: DAY_TAB_GAP, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxs },
  tab: { width: DAY_TAB_WIDTH, minHeight: 72, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: 1, overflow: "hidden" },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary, outlineStyle: "solid", outlineWidth: 0 },
  day: { ...typography.caption, color: colors.primary },
  date: { ...typography.bodyStrong, color: colors.text },
  count: { ...typography.caption, color: colors.textMuted },
  countSelected: { color: colors.primarySoft },
  textSelected: { color: colors.white },
  dragHandle: { position: "absolute", top: spacing.xs, right: spacing.xs, fontSize: 17, lineHeight: 20, color: colors.textMuted },
  dragHandleSelected: { color: colors.primarySoft },
  addTab: { width: 84, minHeight: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: "#9B91D2", backgroundColor: "#F4F1FF", gap: 2 },
  addSymbol: { fontSize: 22, lineHeight: 24, fontWeight: "900", color: colors.primary },
  addLabel: { ...typography.caption, color: "#7569BE" },
  compactGuide: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.lg },
  dragGuide: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  manageTrigger: { minHeight: 30, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  manageTriggerText: { ...typography.caption, color: colors.primary },
  menuOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay, padding: spacing.lg },
  menuCard: { width: "100%", maxWidth: 520, alignSelf: "center", gap: spacing.xs, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.md },
  menuHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  menuCopy: { flex: 1 },
  menuTitle: { ...typography.subtitle, color: colors.text },
  menuSubtitle: { ...typography.caption, color: colors.textSecondary },
  menuClose: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
  menuCloseText: { ...typography.caption, color: colors.primary },
  menuAction: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  menuDeleteAction: { backgroundColor: colors.dangerSoft },
  menuActionCopy: { flex: 1 },
  menuActionTitle: { ...typography.bodyStrong, color: colors.text },
  menuDeleteTitle: { ...typography.bodyStrong, color: colors.danger },
  menuActionDescription: { ...typography.caption, color: colors.textSecondary },
  menuChevron: { fontSize: 24, color: colors.primary },
  menuDeleteChevron: { fontSize: 24, color: colors.danger },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.82 },
});
