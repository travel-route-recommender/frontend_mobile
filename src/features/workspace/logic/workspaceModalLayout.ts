export const WORKSPACE_MODAL_MIN_HEIGHT_PX = 320;
export const WORKSPACE_MODAL_MIN_AVAILABLE_HEIGHT_PX = 220;
export const WORKSPACE_MODAL_TOP_GAP_PX = 48;
export const WORKSPACE_MODAL_ACCESSIBILITY_STEP_PX = 20;

export type WorkspaceModalHeightBounds = {
  minHeight: number;
  maxHeight: number;
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function clampWorkspaceModalHeight(height: number, bounds: WorkspaceModalHeightBounds) {
  const value = Number.isFinite(height) ? height : bounds.minHeight;
  return Math.min(Math.max(value, bounds.minHeight), bounds.maxHeight);
}

export function getWorkspaceModalHeightBounds(
  viewportHeight: number,
  topInset = 0,
  bottomInset = 0,
): WorkspaceModalHeightBounds {
  const availableHeight = Math.max(
    finiteNonNegative(viewportHeight)
      - finiteNonNegative(topInset)
      - finiteNonNegative(bottomInset)
      - WORKSPACE_MODAL_TOP_GAP_PX,
    WORKSPACE_MODAL_MIN_AVAILABLE_HEIGHT_PX,
  );
  const minHeight = Math.min(WORKSPACE_MODAL_MIN_HEIGHT_PX, availableHeight);
  return { minHeight, maxHeight: Math.max(minHeight, availableHeight) };
}

export function getInitialWorkspaceModalHeight(
  viewportHeight: number,
  bounds: WorkspaceModalHeightBounds,
) {
  return clampWorkspaceModalHeight(viewportHeight * 0.68, bounds);
}

export function resizeWorkspaceModalHeight(
  startHeight: number,
  translationY: number,
  bounds: WorkspaceModalHeightBounds,
) {
  const safeTranslation = Number.isFinite(translationY) ? translationY : 0;
  return clampWorkspaceModalHeight(startHeight - safeTranslation, bounds);
}

export function stepWorkspaceModalHeight(
  currentHeight: number,
  direction: -1 | 1,
  bounds: WorkspaceModalHeightBounds,
) {
  return clampWorkspaceModalHeight(
    currentHeight + direction * WORKSPACE_MODAL_ACCESSIBILITY_STEP_PX,
    bounds,
  );
}
