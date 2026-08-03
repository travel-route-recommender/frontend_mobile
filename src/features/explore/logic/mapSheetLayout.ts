export type MapSheetPosition = "collapsed" | "half" | "expanded";

export type MapSheetSnapPoints = Record<MapSheetPosition, number>;

const COLLAPSED_SHEET_HEIGHT = 112;
const MIN_MAP_REMAINDER = 24;
const VELOCITY_PROJECTION_SECONDS = 0.16;

export function clampMapSheetHeight(height: number, snapPoints: MapSheetSnapPoints) {
  "worklet";
  return Math.min(Math.max(height, snapPoints.collapsed), snapPoints.expanded);
}

export function createMapSheetSnapPoints(
  viewportHeight: number,
  expandedTopGap: number,
): MapSheetSnapPoints {
  const safeViewportHeight = Math.max(COLLAPSED_SHEET_HEIGHT, Math.round(viewportHeight));
  const maximumSheetHeight = Math.max(
    COLLAPSED_SHEET_HEIGHT,
    safeViewportHeight - MIN_MAP_REMAINDER,
  );
  const halfHeight = Math.min(
    Math.max(Math.round(safeViewportHeight * 0.5), COLLAPSED_SHEET_HEIGHT),
    maximumSheetHeight,
  );
  const expandedHeight = Math.min(
    Math.max(safeViewportHeight - Math.round(expandedTopGap), halfHeight),
    maximumSheetHeight,
  );

  return {
    collapsed: COLLAPSED_SHEET_HEIGHT,
    half: halfHeight,
    expanded: expandedHeight,
  };
}

export function getMapSheetHeight(
  position: MapSheetPosition,
  snapPoints: MapSheetSnapPoints,
) {
  "worklet";
  return snapPoints[position];
}

export function resolveMapSheetPosition(
  height: number,
  snapPoints: MapSheetSnapPoints,
): MapSheetPosition {
  "worklet";
  const collapsedDistance = Math.abs(height - snapPoints.collapsed);
  const halfDistance = Math.abs(height - snapPoints.half);
  const expandedDistance = Math.abs(height - snapPoints.expanded);

  if (expandedDistance < halfDistance && expandedDistance < collapsedDistance) {
    return "expanded";
  }
  if (collapsedDistance < halfDistance) return "collapsed";
  return "half";
}

export function projectMapSheetHeight(
  dragStartHeight: number,
  translationY: number,
  velocityY: number,
  snapPoints: MapSheetSnapPoints,
) {
  "worklet";
  return clampMapSheetHeight(
    dragStartHeight - translationY - velocityY * VELOCITY_PROJECTION_SECONDS,
    snapPoints,
  );
}
