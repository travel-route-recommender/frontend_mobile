import type { PropsWithChildren } from "react";
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, type GestureResponderHandlers } from "react-native";

const SWIPE_ACTIVATION_DISTANCE = 14;
const SWIPE_CHANGE_DISTANCE = 54;

export function WorkspaceDayPager({
  children,
  selectedIndex,
  dayCount,
  disabled = false,
  onSelectIndex,
}: PropsWithChildren<{
  selectedIndex: number;
  dayCount: number;
  disabled?: boolean;
  onSelectIndex: (index: number) => void;
}>) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers>({});
  const selectedIndexRef = useRef(selectedIndex);
  const dayCountRef = useRef(dayCount);
  const disabledRef = useRef(disabled);
  const onSelectIndexRef = useRef(onSelectIndex);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    dayCountRef.current = dayCount;
    disabledRef.current = disabled;
    onSelectIndexRef.current = onSelectIndex;
  }, [dayCount, disabled, onSelectIndex, selectedIndex]);

  useEffect(() => {
    const canSwipe = (dx: number, dy: number) => !disabledRef.current
      && Math.abs(dx) >= SWIPE_ACTIVATION_DISTANCE
      && Math.abs(dx) > Math.abs(dy) * 1.25;
    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => canSwipe(gesture.dx, gesture.dy),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => canSwipe(gesture.dx, gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        translateX.setValue(Math.max(Math.min(gesture.dx * 0.35, 64), -64));
      },
      onPanResponderRelease: (_event, gesture) => {
        const direction = gesture.dx <= -SWIPE_CHANGE_DISTANCE ? 1 : gesture.dx >= SWIPE_CHANGE_DISTANCE ? -1 : 0;
        const currentIndex = selectedIndexRef.current;
        const targetIndex = Math.min(Math.max(currentIndex + direction, 0), Math.max(dayCountRef.current - 1, 0));
        Animated.timing(translateX, {
          toValue: direction && targetIndex !== currentIndex ? direction * -32 : 0,
          duration: 100,
          useNativeDriver: true,
        }).start(() => {
          translateX.setValue(0);
          if (targetIndex !== currentIndex) onSelectIndexRef.current(targetIndex);
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminationRequest: () => true,
    });
    setPanHandlers(panResponder.panHandlers);
  }, [translateX]);

  return <Animated.View
    {...panHandlers}
    accessibilityLabel="Day 일정 좌우 스와이프 영역"
    style={[styles.page, { transform: [{ translateX }] }]}
    testID="workspace-day-pager"
  >
    {children}
  </Animated.View>;
}

const styles = StyleSheet.create({
  page: { width: "100%" },
});
