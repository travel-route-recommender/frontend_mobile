import { useCallback, useEffect, useMemo, useState } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  clampMapSheetHeight,
  getMapSheetHeight,
  projectMapSheetHeight,
  resolveMapSheetPosition,
  type MapSheetPosition,
  type MapSheetSnapPoints,
} from "../logic/mapSheetLayout";

const SHEET_SPRING = {
  damping: 28,
  mass: 0.82,
  stiffness: 260,
  overshootClamping: true,
} as const;

export function useExploreMapSheet(
  snapPoints: MapSheetSnapPoints,
) {
  const [position, setPosition] = useState<MapSheetPosition>("half");
  const [targetPosition, setTargetPosition] = useState<MapSheetPosition>("half");
  const [dragging, setDragging] = useState(false);
  const visibleHeight = useSharedValue(snapPoints.half);
  const dragStartHeight = useSharedValue(snapPoints.half);
  const snapPointSignature = `${snapPoints.collapsed}:${snapPoints.half}:${snapPoints.expanded}`;

  const commitSnap = useCallback((nextPosition: MapSheetPosition) => {
    setPosition(nextPosition);
    setTargetPosition(nextPosition);
    setDragging(false);
  }, []);

  const beginSnap = useCallback((nextPosition: MapSheetPosition) => {
    setTargetPosition(nextPosition);
    setDragging(false);
  }, []);

  const beginDrag = useCallback(() => {
    setDragging(true);
  }, []);

  const animateToPosition = useCallback((nextPosition: MapSheetPosition) => {
    const nextHeight = getMapSheetHeight(nextPosition, snapPoints);
    beginSnap(nextPosition);
    visibleHeight.set(withSpring(nextHeight, SHEET_SPRING, (finished) => {
      if (finished) runOnJS(commitSnap)(nextPosition);
    }));
  }, [beginSnap, commitSnap, snapPoints, visibleHeight]);

  const dragGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-6, 6])
    .shouldCancelWhenOutside(false)
    .onStart(() => {
      cancelAnimation(visibleHeight);
      dragStartHeight.set(visibleHeight.get());
      runOnJS(beginDrag)();
    })
    .onUpdate((event) => {
      visibleHeight.set(clampMapSheetHeight(
        dragStartHeight.get() - event.translationY,
        snapPoints,
      ));
    })
    .onEnd((event) => {
      const projectedHeight = projectMapSheetHeight(
        dragStartHeight.get(),
        event.translationY,
        event.velocityY,
        snapPoints,
      );
      const nextPosition = resolveMapSheetPosition(projectedHeight, snapPoints);
      const nextHeight = getMapSheetHeight(nextPosition, snapPoints);
      runOnJS(beginSnap)(nextPosition);
      visibleHeight.set(withSpring(nextHeight, SHEET_SPRING, (finished) => {
        if (finished) runOnJS(commitSnap)(nextPosition);
      }));
    })
    .onFinalize((_event, success) => {
      if (success) return;
      const nextPosition = resolveMapSheetPosition(visibleHeight.get(), snapPoints);
      const nextHeight = getMapSheetHeight(nextPosition, snapPoints);
      runOnJS(beginSnap)(nextPosition);
      visibleHeight.set(withSpring(nextHeight, SHEET_SPRING, (finished) => {
        if (finished) runOnJS(commitSnap)(nextPosition);
      }));
    }), [beginDrag, beginSnap, commitSnap, dragStartHeight, snapPoints, visibleHeight]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: Math.max(0, snapPoints.expanded - visibleHeight.value),
    }],
  }), [snapPoints.expanded]);

  useEffect(() => {
    const nextHeight = getMapSheetHeight(targetPosition, snapPoints);
    cancelAnimation(visibleHeight);
    visibleHeight.set(nextHeight);
    dragStartHeight.set(nextHeight);
  // The numeric signature intentionally represents all responsive snap-point changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapPointSignature]);

  return {
    animatedSheetStyle,
    bodyVisible: dragging || position !== "collapsed" || targetPosition !== "collapsed",
    committedHeight: getMapSheetHeight(position, snapPoints),
    dragGesture,
    position,
    snapTo: animateToPosition,
    targetPosition,
  };
}
