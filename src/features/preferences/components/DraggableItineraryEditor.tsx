import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { activityBlocks, itineraryHourSlots, itineraryRows } from "../config/travel-preference-test-config";
import {
  canPlaceItineraryBlock,
  createEmptyItineraryDay,
  getFilledItineraryCount,
  getItineraryDays,
  getItinerarySlotAt,
  getItinerarySlotIndex,
} from "../logic/travel-preference-survey";
import type { ActivityTagId, ItineraryBlock, ItineraryDay, PersonalPreferenceDraftAnswers } from "../types";

const HOUR_HEIGHT = 58;
const DAY_WIDTH = 192;
const TIME_RAIL_WIDTH = 54;
const DAY_BODY_WIDTH = DAY_WIDTH - TIME_RAIL_WIDTH;
const DAY_HEADER_HEIGHT = 44;
const TIMELINE_HEIGHT = itineraryHourSlots.length * HOUR_HEIGHT;
const EDITOR_VIEWPORT_HEIGHT = 540;
const EDITOR_MAX_WIDTH = 240;
const NEW_DAY_PREVIEW_WIDTH = 48;

type Props = {
  answers: PersonalPreferenceDraftAnswers;
  onChange: (patch: Partial<PersonalPreferenceDraftAnswers>) => void;
};

type DropTarget = { dayId: string; startIndex: number };

export function DraggableItineraryEditor({ answers, onChange }: Props) {
  const days = getItineraryDays(answers);
  const daysRef = useRef(days);
  useEffect(() => { daysRef.current = days; }, [days]);
  const dayBodyRefs = useRef<Record<string, View | null>>({});
  const horizontalScrollRef = useRef<ScrollView>(null);
  const viewportWidthRef = useRef(EDITOR_MAX_WIDTH);
  const shouldRevealAddedDayRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(EDITOR_MAX_WIDTH);
  const horizontalInset = Math.max(0, (viewportWidth - DAY_WIDTH) / 2);
  const blockSequence = useRef(0);
  const filledCount = getFilledItineraryCount(answers);
  const averageHours = filledCount / days.length;

  const commitDays = (nextDays: ItineraryDay[]) => onChange({ itineraryDays: nextDays });

  const resolveDropTarget = (absoluteX: number, absoluteY: number, callback: (target: DropTarget) => void) => {
    Object.entries(dayBodyRefs.current).forEach(([dayId, node]) => {
      node?.measureInWindow((x, y, width, height) => {
        if (absoluteX < x || absoluteX > x + width || absoluteY < y || absoluteY > y + height) return;
        const startIndex = Math.max(0, Math.min(itineraryHourSlots.length - 1, Math.floor((absoluteY - y) / HOUR_HEIGHT)));
        callback({ dayId, startIndex });
      });
    });
  };

  const dropPaletteBlock = (activityId: ActivityTagId, absoluteX: number, absoluteY: number) => {
    resolveDropTarget(absoluteX, absoluteY, ({ dayId, startIndex }) => {
      const latestDays = daysRef.current;
      const targetDay = latestDays.find((day) => day.id === dayId);
      if (!targetDay || !canPlaceItineraryBlock(targetDay, startIndex, 1)) return;
      blockSequence.current += 1;
      const block: ItineraryBlock = {
        id: `${dayId}-block-${Date.now()}-${blockSequence.current}`,
        activityId,
        startSlot: getItinerarySlotAt(startIndex),
        durationHours: 1,
      };
      commitDays(latestDays.map((day) => day.id === dayId ? { ...day, blocks: [...day.blocks, block] } : day));
    });
  };

  const moveBlock = (sourceDayId: string, blockId: string, absoluteX: number, absoluteY: number) => {
    resolveDropTarget(absoluteX, absoluteY, ({ dayId: targetDayId, startIndex }) => {
      const latestDays = daysRef.current;
      const sourceDay = latestDays.find((day) => day.id === sourceDayId);
      const sourceBlock = sourceDay?.blocks.find((block) => block.id === blockId);
      const targetDay = latestDays.find((day) => day.id === targetDayId);
      if (!sourceDay || !sourceBlock || !targetDay) return;
      const excludedBlockId = sourceDayId === targetDayId ? blockId : undefined;
      if (!canPlaceItineraryBlock(targetDay, startIndex, sourceBlock.durationHours, excludedBlockId)) return;
      const movedBlock = { ...sourceBlock, startSlot: getItinerarySlotAt(startIndex) };
      commitDays(latestDays.map((day) => {
        if (sourceDayId === targetDayId && day.id === sourceDayId) return { ...day, blocks: day.blocks.map((block) => block.id === blockId ? movedBlock : block) };
        if (day.id === sourceDayId) return { ...day, blocks: day.blocks.filter((block) => block.id !== blockId) };
        if (day.id === targetDayId) return { ...day, blocks: [...day.blocks, movedBlock] };
        return day;
      }));
    });
  };

  const resizeBlock = (dayId: string, blockId: string, edge: "top" | "bottom", translationY: number) => {
    const deltaHours = Math.round(translationY / HOUR_HEIGHT);
    if (!deltaHours) return;
    const latestDays = daysRef.current;
    const day = latestDays.find((entry) => entry.id === dayId);
    const block = day?.blocks.find((entry) => entry.id === blockId);
    if (!day || !block) return;
    const currentStart = getItinerarySlotIndex(block.startSlot);
    const nextStart = edge === "top" ? currentStart + deltaHours : currentStart;
    const nextDuration = edge === "top" ? block.durationHours - deltaHours : block.durationHours + deltaHours;
    if (!canPlaceItineraryBlock(day, nextStart, nextDuration, blockId)) return;
    const nextBlock = { ...block, startSlot: getItinerarySlotAt(nextStart), durationHours: nextDuration };
    commitDays(latestDays.map((entry) => entry.id === dayId ? { ...entry, blocks: entry.blocks.map((item) => item.id === blockId ? nextBlock : item) } : entry));
  };

  const removeBlock = (dayId: string, blockId: string) => commitDays(daysRef.current.map((day) => day.id === dayId ? { ...day, blocks: day.blocks.filter((block) => block.id !== blockId) } : day));
  const addDay = () => {
    shouldRevealAddedDayRef.current = true;
    commitDays([...daysRef.current, createEmptyItineraryDay(daysRef.current.length + 1)]);
  };
  const removeDay = () => {
    if (daysRef.current.length <= 1) return;
    shouldRevealAddedDayRef.current = false;
    commitDays(daysRef.current.slice(0, -1));
  };
  const revealAddedDay = (contentWidth: number) => {
    if (!shouldRevealAddedDayRef.current) return;
    shouldRevealAddedDayRef.current = false;
    const targetX = Math.max(0, contentWidth - horizontalInset - DAY_WIDTH + NEW_DAY_PREVIEW_WIDTH - viewportWidthRef.current);
    horizontalScrollRef.current?.scrollTo({ x: targetX, animated: true });
  };

  return <View style={styles.sectionGap}>
    <View style={styles.metricBanner}>
      <View><Text style={styles.metricLabel}>내가 만든 일정</Text><Text selectable style={styles.metricValue}>{days.length}일 · {filledCount}시간</Text></View>
      <Text style={styles.metricHint}>{averageHours <= 4 ? "여유로운 일정" : averageHours <= 9 ? "균형 있는 일정" : "알찬 일정"}</Text>
    </View>

    <View style={styles.paletteHeader}><Text style={styles.subsectionTitle}>드래그할 액티비티</Text><Text style={styles.paletteStatus}>블록을 길게 잡고 아래 일정표의 자유시간으로 옮기세요</Text></View>
    <View accessibilityLabel="드래그 가능한 액티비티 블록" style={styles.activityPalette}>{activityBlocks.map((block) => <DraggablePaletteBlock key={block.id} activityId={block.id} onDrop={dropPaletteBlock} />)}</View>

    <View style={styles.editorRow}>
      <View style={styles.dayControlSlot}>
        <Pressable accessibilityLabel="마지막 일정 하루 삭제" accessibilityRole="button" accessibilityState={{ disabled: days.length <= 1 }} disabled={days.length <= 1} onPress={removeDay} testID="remove-itinerary-day" style={({ pressed }) => [styles.dayControlButton, styles.removeDayButton, days.length <= 1 && styles.dayControlDisabled, pressed && styles.pressed]}><Text style={[styles.dayControlSymbol, styles.removeDayText]}>−</Text><Text style={[styles.dayControlLabel, styles.removeDayText]}>하루</Text></Pressable>
      </View>
      <View onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        viewportWidthRef.current = width;
        setViewportWidth((currentWidth) => currentWidth === width ? currentWidth : width);
      }} style={styles.editorShell}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.verticalSchedule} contentContainerStyle={styles.verticalScheduleContent}>
          <ScrollView ref={horizontalScrollRef} horizontal nestedScrollEnabled removeClippedSubviews={false} showsHorizontalScrollIndicator contentContainerStyle={[styles.dayColumns, { paddingHorizontal: horizontalInset }]} onContentSizeChange={(width) => revealAddedDay(width)}>
            {days.map((day, dayIndex) => <DayColumn
              key={day.id}
              day={day}
              dayIndex={dayIndex}
              onRegisterBody={(node) => { dayBodyRefs.current[day.id] = node; }}
            />)}
            {days.flatMap((day, dayIndex) => day.blocks.map((block) => <ScheduledBlock
              key={block.id}
              block={block}
              dayId={day.id}
              layoutLeft={horizontalInset + dayIndex * DAY_WIDTH + TIME_RAIL_WIDTH + 3}
              onMove={moveBlock}
              onRemove={removeBlock}
              onResize={resizeBlock}
            />))}
          </ScrollView>
        </ScrollView>
      </View>
      <View style={styles.dayControlSlot}>
        <Pressable accessibilityLabel="일정표 오른쪽에 하루 추가" accessibilityRole="button" onPress={addDay} testID="add-itinerary-day" style={({ pressed }) => [styles.dayControlButton, styles.addDayButton, pressed && styles.pressed]}><Text style={[styles.dayControlSymbol, styles.addDayText]}>＋</Text><Text style={[styles.dayControlLabel, styles.addDayText]}>하루</Text></Pressable>
      </View>
    </View>
    <View style={styles.legend}><Text style={styles.legendText}>↕ 일정표는 위아래로 스크롤</Text><Text style={styles.legendText}>↔ 날짜는 좌우로 스크롤</Text></View>
    <Text style={styles.footnote}>블록 가운데를 드래그하면 다른 빈 시간으로 옮길 수 있어요. 위·아래의 점선 핸들은 빈 시간에 한해 1시간 단위로 늘어나거나 줄어들어요.</Text>
  </View>;
}

function DraggablePaletteBlock({ activityId, onDrop }: { activityId: ActivityTagId; onDrop: (activityId: ActivityTagId, absoluteX: number, absoluteY: number) => void }) {
  const block = activityBlocks.find((entry) => entry.id === activityId)!;
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(0);
  const gesture = Gesture.Pan()
    .activateAfterLongPress(120)
    .onBegin(() => { dragging.value = 1; })
    .onUpdate((event) => { translateX.value = event.translationX; translateY.value = event.translationY; })
    .onEnd((event) => { runOnJS(onDrop)(activityId, event.absoluteX, event.absoluteY); })
    .onFinalize(() => { translateX.value = withSpring(0); translateY.value = withSpring(0); dragging.value = withSpring(0); });
  const animatedStyle = useAnimatedStyle(() => ({ zIndex: dragging.value ? 100 : 1, opacity: dragging.value ? 0.9 : 1, transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: dragging.value ? 1.06 : 1 }] }));
  return <GestureDetector gesture={gesture}><Animated.View accessibilityLabel={`${block.label} 블록. 일정표로 드래그`} style={[styles.activityBlock, { backgroundColor: block.softColor, borderColor: block.color }, animatedStyle]}><Text style={styles.activityIcon}>{block.icon}</Text><Text style={[styles.activityLabel, { color: block.color }]}>{block.label}</Text><Text style={[styles.dragMark, { color: block.color }]}>⠿</Text></Animated.View></GestureDetector>;
}

function DayColumn({ day, dayIndex, onRegisterBody }: {
  day: ItineraryDay;
  dayIndex: number;
  onRegisterBody: (node: View | null) => void;
}) {
  return <View style={styles.dayColumn}>
    <View style={styles.dayHeader}><Text style={styles.dayHeaderText}>DAY {dayIndex + 1}</Text><Text style={styles.dayHours}>{day.blocks.reduce((total, block) => total + block.durationHours, 0)}시간</Text></View>
    <View style={styles.dayTimelineRow}>
      <View style={styles.timeRail}>{itineraryRows.map((row) => <View key={row.label} style={styles.timeRailRow}><Text style={styles.scheduleRange}>{row.label}</Text><Text style={styles.scheduleUnit}>2시간</Text></View>)}</View>
      <View ref={onRegisterBody} collapsable={false} style={styles.dayBody}>
        {itineraryHourSlots.map((slot, index) => <View key={slot} style={[styles.emptyHour, Math.floor(index / 2) % 2 === 1 && styles.emptyHourAlternating]}><Text style={styles.emptyHourTime}>{slot}</Text><Text style={styles.freeTime}>자유시간</Text></View>)}
      </View>
    </View>
  </View>;
}

function ScheduledBlock({ block, dayId, layoutLeft, onMove, onResize, onRemove }: {
  block: ItineraryBlock;
  dayId: string;
  layoutLeft: number;
  onMove: (dayId: string, blockId: string, absoluteX: number, absoluteY: number) => void;
  onResize: (dayId: string, blockId: string, edge: "top" | "bottom", translationY: number) => void;
  onRemove: (dayId: string, blockId: string) => void;
}) {
  const activity = activityBlocks.find((entry) => entry.id === block.activityId)!;
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(0);
  const moveGesture = Gesture.Pan()
    .activateAfterLongPress(80)
    .onBegin(() => { dragging.value = 1; })
    .onUpdate((event) => { translateX.value = event.translationX; translateY.value = event.translationY; })
    .onEnd((event) => { runOnJS(onMove)(dayId, block.id, event.absoluteX, event.absoluteY); })
    .onFinalize(() => { translateX.value = withSpring(0); translateY.value = withSpring(0); dragging.value = withSpring(0); });
  const animatedStyle = useAnimatedStyle(() => ({ zIndex: dragging.value ? 50 : 5, opacity: dragging.value ? 0.88 : 1, transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: dragging.value ? 1.03 : 1 }] }));
  const top = DAY_HEADER_HEIGHT + getItinerarySlotIndex(block.startSlot) * HOUR_HEIGHT + 2;
  const height = block.durationHours * HOUR_HEIGHT - 4;

  return <Animated.View style={[styles.scheduledBlock, { top, left: layoutLeft, width: DAY_BODY_WIDTH - 6, height, backgroundColor: activity.softColor, borderColor: activity.color }, animatedStyle]}>
    <ResizeHandle color={activity.color} edge="top" onResize={(translationY) => onResize(dayId, block.id, "top", translationY)} />
    <GestureDetector gesture={moveGesture}><Animated.View style={styles.scheduledBlockContent}><Text style={styles.scheduledIcon}>{activity.icon}</Text><View style={styles.scheduledCopy}><Text numberOfLines={1} style={[styles.scheduledTitle, { color: activity.color }]}>{activity.label}</Text><Text style={styles.scheduledDuration}>{block.startSlot} · {block.durationHours}시간</Text></View></Animated.View></GestureDetector>
    <Pressable accessibilityLabel={`${activity.label} 일정 삭제`} accessibilityRole="button" hitSlop={8} onPress={() => onRemove(dayId, block.id)} testID={`remove-itinerary-block-${block.id}`} style={({ pressed }) => [styles.removeBlockButton, pressed && styles.removeBlockButtonPressed]}><Text style={styles.removeBlockText}>×</Text></Pressable>
    <ResizeHandle color={activity.color} edge="bottom" onResize={(translationY) => onResize(dayId, block.id, "bottom", translationY)} />
  </Animated.View>;
}

function ResizeHandle({ edge, color, onResize }: { edge: "top" | "bottom"; color: string; onResize: (translationY: number) => void }) {
  const translateY = useSharedValue(0);
  const gesture = Gesture.Pan().onUpdate((event) => { translateY.value = event.translationY; }).onEnd((event) => { runOnJS(onResize)(event.translationY); }).onFinalize(() => { translateY.value = withSpring(0); });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  return <GestureDetector gesture={gesture}><Animated.View accessibilityLabel={`${edge === "top" ? "위" : "아래"}쪽 길이 조절 핸들`} style={[styles.resizeHandle, edge === "top" ? styles.resizeHandleTop : styles.resizeHandleBottom, animatedStyle]}><View style={[styles.resizeGrip, { backgroundColor: color }]} /></Animated.View></GestureDetector>;
}

const styles = StyleSheet.create({
  sectionGap: { gap: spacing.md }, metricBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, metricLabel: { ...typography.caption, color: colors.textSecondary }, metricValue: { ...typography.subtitle, color: colors.primary, marginTop: spacing.xxs }, metricHint: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  paletteHeader: { gap: spacing.xxs }, subsectionTitle: { ...typography.bodyStrong, color: colors.text }, paletteStatus: { ...typography.caption, color: colors.primary }, activityPalette: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, zIndex: 10 }, activityBlock: { minHeight: 52, flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm }, activityIcon: { fontSize: 21 }, activityLabel: { ...typography.caption, flex: 1 }, dragMark: { fontSize: 18, fontWeight: "700" },
  editorRow: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs }, editorShell: { flex: 1, maxWidth: EDITOR_MAX_WIDTH, height: EDITOR_VIEWPORT_HEIGHT, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface }, verticalSchedule: { flex: 1 }, verticalScheduleContent: { minHeight: DAY_HEADER_HEIGHT + TIMELINE_HEIGHT }, dayColumns: { position: "relative", flexGrow: 1, minHeight: DAY_HEADER_HEIGHT + TIMELINE_HEIGHT }, dayColumn: { width: DAY_WIDTH, borderRightWidth: 1, borderRightColor: colors.border }, dayHeader: { height: DAY_HEADER_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.backgroundStrong, paddingHorizontal: spacing.sm }, dayHeaderText: { ...typography.bodyStrong, color: colors.text }, dayHours: { ...typography.caption, color: colors.primary, fontVariant: ["tabular-nums"] }, dayTimelineRow: { flexDirection: "row", height: TIMELINE_HEIGHT },
  timeRail: { width: TIME_RAIL_WIDTH, backgroundColor: colors.surfaceMuted, borderRightWidth: 1, borderRightColor: colors.border }, timeRailRow: { height: HOUR_HEIGHT * 2, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border }, scheduleRange: { ...typography.caption, color: colors.text, fontVariant: ["tabular-nums"] }, scheduleUnit: { fontSize: 10, lineHeight: 14, color: colors.textMuted }, dayBody: { position: "relative", width: DAY_BODY_WIDTH, height: TIMELINE_HEIGHT }, emptyHour: { height: HOUR_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.sm }, emptyHourAlternating: { backgroundColor: colors.surfaceMuted }, emptyHourTime: { fontSize: 10, lineHeight: 14, color: colors.textMuted, fontVariant: ["tabular-nums"] }, freeTime: { ...typography.caption, color: colors.textMuted },
  dayControlSlot: { width: 44, height: EDITOR_VIEWPORT_HEIGHT, alignItems: "center", justifyContent: "center" }, dayControlButton: { width: 44, minHeight: 68, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" }, addDayButton: { borderColor: colors.primary, backgroundColor: colors.primary }, removeDayButton: { borderColor: colors.borderStrong, backgroundColor: colors.surface }, dayControlSymbol: { fontSize: 25, lineHeight: 26, fontWeight: "600" }, dayControlLabel: { ...typography.caption }, addDayText: { color: colors.white }, removeDayText: { color: colors.textSecondary }, dayControlDisabled: { opacity: 0.35 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  scheduledBlock: { position: "absolute", zIndex: 5, borderWidth: 2, borderRadius: radius.md, minHeight: HOUR_HEIGHT - 4 }, scheduledBlockContent: { flex: 1, minHeight: 24, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.xs, paddingRight: 32 }, scheduledIcon: { fontSize: 19 }, scheduledCopy: { flex: 1, minWidth: 0 }, scheduledTitle: { fontSize: 11, lineHeight: 14, fontWeight: "800" }, scheduledDuration: { fontSize: 9, lineHeight: 12, color: colors.textSecondary, fontVariant: ["tabular-nums"] }, removeBlockButton: { position: "absolute", top: "50%", right: 3, zIndex: 30, width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", transform: [{ translateY: -12 }] }, removeBlockButtonPressed: { opacity: 0.65 }, removeBlockText: { color: colors.danger, fontSize: 18, lineHeight: 20, fontWeight: "700" },
  resizeHandle: { height: 14, alignItems: "center", justifyContent: "center", zIndex: 20 }, resizeHandleTop: { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }, resizeHandleBottom: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md }, resizeGrip: { width: 34, height: 3, borderRadius: radius.pill },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, legendText: { ...typography.caption, color: colors.textSecondary }, footnote: { ...typography.caption, color: colors.textMuted },
});
