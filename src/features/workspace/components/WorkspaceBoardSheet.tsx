import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderHandlers,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import {
  clampWorkspaceBoardHeight,
  getInitialWorkspaceBoardHeight,
  getWorkspaceBoardHeightBounds,
  isWorkspaceBoardCollapsed,
  resizeWorkspaceBoardHeight,
  stepWorkspaceBoardHeight,
} from "../logic/workspaceBoardLayout";

export function WorkspaceBoardSheet({
  candidateBoard,
  unscheduledCandidateCount = 0,
  contentScrollEnabled = true,
}: {
  candidateBoard: ReactNode;
  unscheduledCandidateCount?: number;
  contentScrollEnabled?: boolean;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bounds = useMemo(
    () => getWorkspaceBoardHeightBounds(windowHeight, insets.top, insets.bottom),
    [insets.bottom, insets.top, windowHeight],
  );
  const boundsRef = useRef(bounds);
  const [panelHeight, setPanelHeight] = useState(() => getInitialWorkspaceBoardHeight(windowHeight, bounds));
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers>({});
  const heightRef = useRef(panelHeight);
  const dragStartRef = useRef(panelHeight);
  const collapsed = isWorkspaceBoardCollapsed(panelHeight, bounds);

  const updateHeight = useCallback((height: number) => {
    const next = clampWorkspaceBoardHeight(height, boundsRef.current);
    heightRef.current = next;
    setPanelHeight(next);
  }, []);

  useEffect(() => {
    boundsRef.current = bounds;
    updateHeight(heightRef.current);
  }, [bounds, updateHeight]);

  useEffect(() => {
    if (collapsed) Keyboard.dismiss();
  }, [collapsed]);

  useEffect(() => {
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        dragStartRef.current = heightRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        updateHeight(resizeWorkspaceBoardHeight(dragStartRef.current, gesture.dy, boundsRef.current));
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
    setPanHandlers(panResponder.panHandlers);
  }, [updateHeight]);

  const adjustHeight = (direction: -1 | 1) => {
    updateHeight(stepWorkspaceBoardHeight(heightRef.current, direction, boundsRef.current));
  };

  return <View
    accessibilityLabel="미배치 후보 보드"
    style={[
      styles.sheet,
      {
        height: panelHeight,
      },
    ]}
    testID="workspace-board-sheet"
  >
    <View
      {...panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="후보 보드 높이 조절"
      accessibilityHint="위로 끌어 펼치고 아래로 끝까지 끌어 손잡이만 남기거나 접근성 조절 동작을 사용하세요"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityValue={{
        min: Math.round(bounds.minHeight),
        max: Math.round(bounds.maxHeight),
        now: Math.round(panelHeight),
        text: `${Math.round(panelHeight)}픽셀`,
      }}
      accessibilityActions={[
        { name: "increment", label: "후보 보드 높이 20픽셀 늘리기" },
        { name: "decrement", label: "후보 보드 높이 20픽셀 줄이기" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") adjustHeight(1);
        if (event.nativeEvent.actionName === "decrement") adjustHeight(-1);
      }}
      style={styles.dragZone}
      testID="workspace-board-sheet-handle"
    >
      <View style={styles.handle} />
    </View>
    <View
      accessibilityElementsHidden={collapsed}
      importantForAccessibility={collapsed ? "no-hide-descendants" : "auto"}
      pointerEvents={collapsed ? "none" : "auto"}
      style={styles.body}
    >
      <View style={styles.sheetHeading}>
        <View style={styles.sheetHeadingCopy}>
          <Text style={styles.eyebrow}>CANDIDATE BOARD</Text>
          <Text style={styles.sheetTitle}>미배치 {unscheduledCandidateCount}곳</Text>
        </View>
      </View>
      <Text style={styles.candidateGuide}>후보를 일정에 추가한 뒤, 위 시간표에서 위치와 체류시간을 조절하세요.</Text>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled={contentScrollEnabled && !collapsed}
        showsVerticalScrollIndicator
        testID="workspace-candidates-board"
      >
        {candidateBoard}
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40, elevation: 20, overflow: "hidden", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.surface, ...shadows.floating },
  dragZone: { minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  handle: { width: 46, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  body: { flex: 1, minHeight: 0 },
  sheetHeading: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, paddingHorizontal: spacing.lg },
  sheetHeadingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.primary },
  sheetTitle: { ...typography.subtitle, color: colors.text },
  candidateGuide: { ...typography.caption, color: colors.textSecondary, marginHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  content: { flex: 1, marginTop: spacing.sm },
  contentContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
});
