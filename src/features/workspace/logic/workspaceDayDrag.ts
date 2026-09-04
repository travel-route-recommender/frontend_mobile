const FIRST_SLOT_SWITCH_RATIO = 0.35;
const FOLLOWING_SLOT_SWITCH_RATIO = 0.65;

export function resolveDayDragTargetIndex(
  sourceIndex: number,
  currentTargetIndex: number,
  translationX: number,
  dayCount: number,
  tabStep: number,
) {
  "worklet";

  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= dayCount) return -1;
  const lastIndex = dayCount - 1;
  const targetIndex = Number.isInteger(currentTargetIndex) && currentTargetIndex >= 0 && currentTargetIndex <= lastIndex
    ? currentTargetIndex
    : sourceIndex;
  if (!Number.isFinite(translationX) || !Number.isFinite(tabStep) || tabStep <= 0) return targetIndex;

  const draggedCenterIndex = sourceIndex + translationX / tabStep;
  let resolvedTarget = targetIndex;
  while (resolvedTarget < lastIndex) {
    const switchRatio = resolvedTarget === sourceIndex ? FIRST_SLOT_SWITCH_RATIO : FOLLOWING_SLOT_SWITCH_RATIO;
    if (draggedCenterIndex <= resolvedTarget + switchRatio) break;
    resolvedTarget += 1;
  }
  while (resolvedTarget > 0) {
    const switchRatio = resolvedTarget === sourceIndex ? FIRST_SLOT_SWITCH_RATIO : FOLLOWING_SLOT_SWITCH_RATIO;
    if (draggedCenterIndex >= resolvedTarget - switchRatio) break;
    resolvedTarget -= 1;
  }
  return resolvedTarget;
}
