import type { ItineraryItem, ItineraryItemType } from "../../../domain";
import type { WorkspaceScheduleLocalOverlay } from "../services/workspaceScheduleContract";

export const API_WORKSPACE_OVERLAY_STORAGE_VERSION = 1;
const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ITEM_TYPES = new Set<ItineraryItemType>(["place", "meal", "rest", "transport", "reservation"]);

function normalizeOverlay(value: unknown): WorkspaceScheduleLocalOverlay | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const itemType = typeof record.itemType === "string" && ITEM_TYPES.has(record.itemType as ItineraryItemType)
    ? record.itemType as ItineraryItemType
    : undefined;
  const preferredByUserIds = Array.isArray(record.preferredByUserIds)
    ? [...new Set(record.preferredByUserIds.filter((entry): entry is string => typeof entry === "string" && MONGO_OBJECT_ID_PATTERN.test(entry)))]
    : undefined;
  const note = typeof record.note === "string" ? record.note.slice(0, 120) : undefined;
  const lockedForDuri = record.lockedForDuri === true ? true : undefined;
  if (!itemType && !preferredByUserIds?.length && note === undefined && !lockedForDuri) return undefined;
  return {
    ...(itemType ? { itemType } : {}),
    ...(preferredByUserIds?.length ? { preferredByUserIds } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(lockedForDuri ? { lockedForDuri } : {}),
  };
}

export function parseApiWorkspaceOverlays(value: unknown): Record<string, WorkspaceScheduleLocalOverlay> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  if (
    record.version !== API_WORKSPACE_OVERLAY_STORAGE_VERSION
    || !record.items
    || typeof record.items !== "object"
    || Array.isArray(record.items)
  ) return {};
  return Object.fromEntries(Object.entries(record.items as Record<string, unknown>).flatMap(([itemId, overlay]) => {
    if (!itemId.trim()) return [];
    const normalized = normalizeOverlay(overlay);
    return normalized ? [[itemId, normalized]] : [];
  }));
}

export function buildApiWorkspaceOverlays(items: readonly ItineraryItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, {
    itemType: item.itemType,
    preferredByUserIds: [...item.preferredByUserIds],
    ...(item.note !== undefined ? { note: item.note } : {}),
    ...(item.lockedForDuri === true ? { lockedForDuri: true } : {}),
  } satisfies WorkspaceScheduleLocalOverlay]));
}
