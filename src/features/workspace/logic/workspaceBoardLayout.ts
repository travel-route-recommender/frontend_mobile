export const WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX = 44;
export const WORKSPACE_BOARD_RESERVED_VIEWPORT_PX = 120;
export const WORKSPACE_BOARD_ACCESSIBILITY_STEP_PX = 20;

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
  const availableHeight = Math.max(
    safeViewportHeight - WORKSPACE_BOARD_RESERVED_VIEWPORT_PX,
    0,
  );
  const minHeight = Math.min(WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX, safeViewportHeight);
  return { minHeight, maxHeight: Math.max(minHeight, availableHeight) };
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
  return clampWorkspaceBoardHeight(viewportHeight * 0.52, bounds);
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
  return clampWorkspaceBoardHeight(
    currentHeight + direction * WORKSPACE_BOARD_ACCESSIBILITY_STEP_PX,
    bounds,
  );
}
