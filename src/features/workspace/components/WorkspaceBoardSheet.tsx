import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderHandlers,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";

export type WorkspaceBoardTab = "itinerary" | "candidates";
export type WorkspaceBoardSheetSnap = "collapsed" | "mid" | "expanded";

const SNAP_ORDER: WorkspaceBoardSheetSnap[] = ["collapsed", "mid", "expanded"];
const SNAP_RATIO: Record<WorkspaceBoardSheetSnap, number> = {
  collapsed: 0.28,
  mid: 0.58,
  expanded: 0.88,
};

function snapLabel(snap: WorkspaceBoardSheetSnap) {
  if (snap === "collapsed") return "작게 보기";
  if (snap === "expanded") return "크게 보기";
  return "중간 크기";
}

export function WorkspaceBoardSheet({
  activeTab,
  snap,
  dayLabel,
  dateLabel,
  itineraryCount,
  candidateCount,
  itineraryBoard,
  candidateBoard,
  contentScrollEnabled = true,
  onTabChange,
  onSnapChange,
}: {
  activeTab: WorkspaceBoardTab;
  snap: WorkspaceBoardSheetSnap;
  dayLabel: string;
  dateLabel: string;
  itineraryCount: number;
  candidateCount: number;
  itineraryBoard: ReactNode;
  candidateBoard: ReactNode;
  contentScrollEnabled?: boolean;
  onTabChange: (tab: WorkspaceBoardTab) => void;
  onSnapChange: (snap: WorkspaceBoardSheetSnap) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maximumHeight = Math.max(420, Math.min(windowHeight * SNAP_RATIO.expanded, windowHeight - insets.top - spacing.sm));
  const offsets = useMemo<Record<WorkspaceBoardSheetSnap, number>>(() => ({
    collapsed: Math.max(maximumHeight - Math.max(windowHeight * SNAP_RATIO.collapsed, 210), 0),
    mid: Math.max(maximumHeight - windowHeight * SNAP_RATIO.mid, 0),
    expanded: 0,
  }), [maximumHeight, windowHeight]);

  const [translateY] = useState(() => new Animated.Value(offsets[snap]));
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers>({});
  const dragStartRef = useRef(offsets[snap]);
  const offsetsRef = useRef(offsets);
  const snapRef = useRef(snap);
  const onSnapChangeRef = useRef(onSnapChange);

  useEffect(() => {
    offsetsRef.current = offsets;
    snapRef.current = snap;
    onSnapChangeRef.current = onSnapChange;
    Animated.spring(translateY, {
      toValue: offsets[snap],
      damping: 24,
      stiffness: 240,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [offsets, onSnapChange, snap, translateY]);

  useEffect(() => {
    const settle = (gestureY: number, velocityY: number) => {
      const current = Math.min(Math.max(dragStartRef.current + gestureY, 0), offsetsRef.current.collapsed);
      const projected = Math.min(Math.max(current + velocityY * 48, 0), offsetsRef.current.collapsed);
      const target = SNAP_ORDER.reduce((closest, candidate) => {
        const closestDistance = Math.abs(offsetsRef.current[closest] - projected);
        const candidateDistance = Math.abs(offsetsRef.current[candidate] - projected);
        return candidateDistance < closestDistance ? candidate : closest;
      }, snapRef.current);
      onSnapChangeRef.current(target);
    };
    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        translateY.stopAnimation((value) => { dragStartRef.current = value; });
      },
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(Math.min(Math.max(dragStartRef.current + gesture.dy, 0), offsetsRef.current.collapsed));
      },
      onPanResponderRelease: (_event, gesture) => settle(gesture.dy, gesture.vy),
      onPanResponderTerminate: (_event, gesture) => settle(gesture.dy, gesture.vy),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
    setPanHandlers(panResponder.panHandlers);
  }, [translateY]);

  const cycleSnap = () => {
    const index = SNAP_ORDER.indexOf(snap);
    onSnapChange(SNAP_ORDER[(index + 1) % SNAP_ORDER.length]);
  };

  return <Animated.View
    accessibilityLabel="워크스페이스 작업 보드"
    style={[styles.sheet, { height: maximumHeight, paddingBottom: Math.max(insets.bottom, spacing.sm), transform: [{ translateY }] }]}
    testID="workspace-board-sheet"
  >
    <View {...panHandlers} style={styles.dragZone}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`작업 보드 높이 변경, 현재 ${snapLabel(snap)}`}
        accessibilityHint="두 번 누르거나 위아래로 끌어 높이를 변경하세요"
        onPress={cycleSnap}
        style={({ pressed }) => [styles.handleButton, pressed && styles.pressed]}
        testID="workspace-board-sheet-handle"
      >
        <View style={styles.handle} />
        <View style={styles.sheetHeading}>
          <View style={styles.sheetHeadingCopy}>
            <Text style={styles.eyebrow}>WORKSPACE BOARD</Text>
            <Text style={styles.sheetTitle}>{dayLabel} · {dateLabel}</Text>
          </View>
          <Text style={styles.snapText}>{snapLabel(snap)}</Text>
        </View>
      </Pressable>
    </View>
    <View accessibilityRole="tablist" style={styles.tabs}>
      <BoardTab label="일정 보드" count={itineraryCount} selected={activeTab === "itinerary"} onPress={() => onTabChange("itinerary")} />
      <BoardTab label="후보 장소" count={candidateCount} selected={activeTab === "candidates"} onPress={() => onTabChange("candidates")} />
    </View>
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      scrollEnabled={contentScrollEnabled}
      showsVerticalScrollIndicator={false}
      testID={`workspace-${activeTab}-board`}
    >
      {activeTab === "itinerary" ? itineraryBoard : candidateBoard}
    </ScrollView>
  </Animated.View>;
}

function BoardTab({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return <Pressable
    accessibilityRole="tab"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}
  >
    <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
    <View style={[styles.count, selected && styles.countSelected]}><Text style={[styles.countText, selected && styles.countTextSelected]}>{count}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, alignSelf: "center", maxWidth: 560, zIndex: 40, elevation: 20, overflow: "hidden", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.surface, ...shadows.floating },
  dragZone: { backgroundColor: colors.surface },
  handleButton: { paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  handle: { width: 46, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  sheetHeading: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  sheetHeadingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.primary },
  sheetTitle: { ...typography.subtitle, color: colors.text },
  snapText: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  tabs: { flexDirection: "row", gap: spacing.xs, marginHorizontal: spacing.lg, padding: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  tab: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.pill },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { ...typography.bodyStrong, color: colors.textSecondary },
  tabTextSelected: { color: colors.white },
  count: { minWidth: 24, minHeight: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  countSelected: { backgroundColor: colors.white },
  countText: { ...typography.caption, color: colors.primary },
  countTextSelected: { color: colors.primary },
  content: { flex: 1, marginTop: spacing.sm },
  contentContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.82 },
});
