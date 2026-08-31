export const WORKSPACE_BOARD_PEEK_HEIGHT_PX = 116;
export const WORKSPACE_BOARD_COLLAPSED_HEIGHT_PX = WORKSPACE_BOARD_PEEK_HEIGHT_PX;
export const WORKSPACE_BOARD_RESERVED_VIEWPORT_PX = 104;

export type WorkspaceBoardSnapState = "peek" | "half" | "full";

export type WorkspaceBoardHeightBounds = {
  minHeight: number;
  halfHeight: number;
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
  const minHeight = Math.min(WORKSPACE_BOARD_PEEK_HEIGHT_PX, safeViewportHeight);
  const maxHeight = Math.max(
    minHeight,
    safeViewportHeight - WORKSPACE_BOARD_RESERVED_VIEWPORT_PX,
  );
  const halfHeight = Math.min(
    Math.max(Math.round(safeViewportHeight * 0.54), minHeight),
    maxHeight,
  );
  return { minHeight, halfHeight, maxHeight };
}

export function getWorkspaceBoardSnapState(
  height: number,
  bounds: WorkspaceBoardHeightBounds,
): WorkspaceBoardSnapState {
  const value = clampWorkspaceBoardHeight(height, bounds);
  const points: [WorkspaceBoardSnapState, number][] = [
    ["peek", bounds.minHeight],
    ["half", bounds.halfHeight],
    ["full", bounds.maxHeight],
  ];
  return points.reduce((nearest, point) => (
    Math.abs(point[1] - value) < Math.abs(nearest[1] - value) ? point : nearest
  ))[0];
}

export function getWorkspaceBoardSnapHeight(
  state: WorkspaceBoardSnapState,
  bounds: WorkspaceBoardHeightBounds,
) {
  if (state === "peek") return bounds.minHeight;
  if (state === "half") return bounds.halfHeight;
  return bounds.maxHeight;
}

export function isWorkspaceBoardCollapsed(
  height: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  return getWorkspaceBoardSnapState(height, bounds) === "peek";
}

export function getInitialWorkspaceBoardHeight(
  viewportHeight: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  return clampWorkspaceBoardHeight(Math.min(viewportHeight, bounds.minHeight), bounds);
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
  const states: WorkspaceBoardSnapState[] = ["peek", "half", "full"];
  const currentState = getWorkspaceBoardSnapState(currentHeight, bounds);
  const nextIndex = Math.min(
    Math.max(states.indexOf(currentState) + direction, 0),
    states.length - 1,
  );
  return getWorkspaceBoardSnapHeight(states[nextIndex], bounds);
}

export function snapWorkspaceBoardHeight(
  currentHeight: number,
  _velocityY: number,
  bounds: WorkspaceBoardHeightBounds,
) {
  return getWorkspaceBoardSnapHeight(getWorkspaceBoardSnapState(currentHeight, bounds), bounds);
}
