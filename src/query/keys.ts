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
    /** 상세 응답에는 현재 사용자의 로컬 사실·overlay가 포함되므로 viewer별로 격리한다. */
    detail: (tripId: EntityId, viewerId: EntityId) => ["trips", "detail", tripId, viewerId] as const,
    /** 인증 계정 전환 시 이전 참여자의 공유 TODO cache를 노출하지 않는다. */
    todos: (tripId: EntityId, viewerId: EntityId) => ["trips", "todos", tripId, viewerId] as const,
  },
  users: {
    directory: () => ["users", "directory"] as const,
    saves: (userId: EntityId) => ["users", "saves", userId] as const,
  },
  preferences: {
    profile: (userId: EntityId) => ["preferences", "profile", userId] as const,
  },
} as const;
