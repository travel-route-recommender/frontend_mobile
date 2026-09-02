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
  getWorkspaceBoardSnapState,
  isWorkspaceBoardCollapsed,
  resizeWorkspaceBoardHeight,
  snapWorkspaceBoardHeight,
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
  const snapState = getWorkspaceBoardSnapState(panelHeight, bounds);
  const snapLabel = snapState === "peek" ? "미리보기" : snapState === "half" ? "절반" : "전체";

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
      onPanResponderRelease: (_event, gesture) => {
        updateHeight(snapWorkspaceBoardHeight(heightRef.current, gesture.vy, boundsRef.current));
      },
      onPanResponderTerminate: () => {
        updateHeight(snapWorkspaceBoardHeight(heightRef.current, 0, boundsRef.current));
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
      accessibilityHint="위아래로 끌어 미리보기, 절반, 전체 상태를 선택하거나 접근성 조절 동작을 사용하세요"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityValue={{
        text: `${snapLabel} 상태`,
      }}
      accessibilityActions={[
        { name: "increment", label: "후보 보드 한 단계 펼치기" },
        { name: "decrement", label: "후보 보드 한 단계 접기" },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") adjustHeight(1);
        if (event.nativeEvent.actionName === "decrement") adjustHeight(-1);
      }}
      style={[styles.dragZone, !collapsed && styles.dragZoneExpanded]}
      testID="workspace-board-sheet-handle"
    >
      <View style={styles.handle} />
      <View style={styles.peekHeading}>
        <View style={styles.peekCopy}>
          <Text style={styles.peekEyebrow}>후보 장소</Text>
          <Text style={styles.peekTitle}>미배치 {unscheduledCandidateCount}곳</Text>
        </View>
      </View>
    </View>
    {!collapsed ? <View style={styles.body}>
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
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40, elevation: 20, overflow: "hidden", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, backgroundColor: colors.surface, ...shadows.floating },
  dragZone: { minHeight: 116, alignItems: "center", justifyContent: "flex-start", backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  dragZoneExpanded: { minHeight: 72, paddingBottom: spacing.sm },
  handle: { width: 44, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  peekHeading: { width: "100%", flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  peekCopy: { flex: 1, minWidth: 0 },
  peekEyebrow: { ...typography.caption, color: colors.textSecondary },
  peekTitle: { ...typography.subtitle, color: colors.text },
  body: { flex: 1, minHeight: 0 },
  candidateGuide: { ...typography.caption, color: colors.textSecondary, marginHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  content: { flex: 1, marginTop: spacing.sm },
  contentContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
});
