export const WORKSPACE_DAY_SWIPE_ACTIVATION_PX = 12;
export const WORKSPACE_DAY_SWIPE_CHANGE_PX = 44;
export const WORKSPACE_DAY_SWIPE_HORIZONTAL_RATIO = 1.15;

export function shouldActivateWorkspaceDaySwipe(
  translationX: number,
  translationY: number,
  disabled = false,
) {
  if (
    disabled
    || !Number.isFinite(translationX)
    || !Number.isFinite(translationY)
  ) return false;
  const horizontal = Math.abs(translationX);
  return horizontal >= WORKSPACE_DAY_SWIPE_ACTIVATION_PX
    && horizontal > Math.abs(translationY) * WORKSPACE_DAY_SWIPE_HORIZONTAL_RATIO;
}

export function resolveWorkspaceDaySwipeTargetIndex(
  currentIndex: number,
  dayCount: number,
  translationX: number,
) {
  const safeDayCount = Number.isInteger(dayCount) ? Math.max(dayCount, 0) : 0;
  const maxIndex = Math.max(safeDayCount - 1, 0);
  const safeCurrentIndex = Number.isInteger(currentIndex)
    ? Math.min(Math.max(currentIndex, 0), maxIndex)
    : 0;
  if (!Number.isFinite(translationX)) return safeCurrentIndex;
  const direction = translationX <= -WORKSPACE_DAY_SWIPE_CHANGE_PX
    ? 1
    : translationX >= WORKSPACE_DAY_SWIPE_CHANGE_PX
      ? -1
      : 0;
  return Math.min(Math.max(safeCurrentIndex + direction, 0), maxIndex);
}
