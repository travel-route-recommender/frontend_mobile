import type { EntityId } from "../domain";

export const queryKeys = {
  places: {
    all: ["places"] as const,
    search: (params: Record<string, unknown>) => ["places", "search", params] as const,
    regionCodes: () => ["places", "region-codes"] as const,
    categoryCodes: () => ["places", "category-codes"] as const,
    detail: (placeId: EntityId) => ["places", placeId] as const,
  },
  trips: {
    all: ["trips"] as const,
    detail: (tripId: EntityId) => ["trips", tripId] as const,
  },
  users: {
    directory: () => ["users", "directory"] as const,
  },
} as const;
