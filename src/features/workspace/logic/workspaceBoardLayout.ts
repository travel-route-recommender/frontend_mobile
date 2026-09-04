// 접었을 때는 후보 내용이 일정표를 가리지 않고, 다시 펼칠 손잡이만 남긴다.
export const WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX = 40;
export const WORKSPACE_BOARD_INITIAL_HEIGHT_PX = 116;
export const WORKSPACE_BOARD_RESERVED_VIEWPORT_PX = 104;

export type WorkspaceBoardHeightBounds = {
  minHeight: number;
  maxHeight: number;
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function clampWorkspaceBoardHeight(height: number, bounds: WorkspaceBoardHeightBounds) {
  const fallback = bounds.minHeight;
  const value = Number.isFinite(height) ? height : fallback;
  return Math.min(Math.max(value, bounds.minHeight), bounds.maxHeight);
}

export function getWorkspaceBoardHeightBounds(
  viewportHeight: number,
  topInset = 0,
  bottomInset = 0,
): WorkspaceBoardHeightBounds {
  const safeViewportHeight = Math.max(
    finiteNonNegative(viewportHeight)
      - finiteNonNegative(topInset)
      - finiteNonNegative(bottomInset),
    0,
  );
  const minHeight = Math.min(WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX, safeViewportHeight);
  const maxHeight = Math.max(
    minHeight,
    safeViewportHeight - WORKSPACE_BOARD_RESERVED_VIEWPORT_PX,
  );
  return { minHeight, maxHeight };
}

export function isWorkspaceBoardCollapsed(
  height: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  return clampWorkspaceBoardHeight(height, bounds) <= bounds.minHeight + 0.5;
}

export function getInitialWorkspaceBoardHeight(
  viewportHeight: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  return clampWorkspaceBoardHeight(Math.min(viewportHeight, WORKSPACE_BOARD_INITIAL_HEIGHT_PX), bounds);
}

export function resizeWorkspaceBoardHeight(
  startHeight: number,
  translationY: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  const safeTranslation = Number.isFinite(translationY) ? translationY : 0;
  return clampWorkspaceBoardHeight(startHeight - safeTranslation, bounds);
}

export function stepWorkspaceBoardHeight(
  currentHeight: number,
  direction: -1 | 1,
  bounds: WorkspaceBoardHeightBounds,
) {
  const availableRange = Math.max(bounds.maxHeight - bounds.minHeight, 0);
  const step = Math.max(44, Math.round(availableRange / 4));
  return clampWorkspaceBoardHeight(currentHeight + direction * step, bounds);
}

export function settleWorkspaceBoardHeight(
  currentHeight: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  // 드래그를 놓은 위치를 그대로 유지한다. 세 단계로 강제 이동하지 않는다.
  return clampWorkspaceBoardHeight(currentHeight, bounds);
}
