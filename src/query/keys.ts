import type { EntityId } from "../domain";

export const queryKeys = {
  places: {
    all: ["places"] as const,
    search: (params: Record<string, unknown>) => ["places", "search", params] as const,
    detail: (placeId: EntityId) => ["places", placeId] as const,
  },
  trips: {
    all: ["trips"] as const,
    detail: (tripId: EntityId) => ["trips", tripId] as const,
  },
} as const;
