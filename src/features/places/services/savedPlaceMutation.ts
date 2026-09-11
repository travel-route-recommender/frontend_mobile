import type { QueryClient } from "@tanstack/react-query";
import type { Place } from "../../../domain";
import { queryKeys } from "../../../query/keys";
import { fetchBackendSavedPlaces, getBackendPlace, removeBackendSavedPlace, saveBackendPlace, type BackendSavedPlace } from "./placeApi";

// Share the guard across Home, Explore, Details and Saved hook instances.
const pendingByClient = new WeakMap<QueryClient, Set<string>>();

export async function toggleBackendSavedPlace(
  queryClient: QueryClient,
  userId: string,
  place: Place,
  isCurrentSession: () => boolean,
): Promise<"saved" | "removed" | "pending" | "stale"> {
  const pending = pendingByClient.get(queryClient) ?? new Set<string>();
  pendingByClient.set(queryClient, pending);
  const operationKey = JSON.stringify([userId, place.id]);
  if (pending.has(operationKey)) return "pending";
  pending.add(operationKey);
  const queryKey = queryKeys.users.saves(userId);
  try {
    // An unloaded list is not proof that the place is unsaved.
    const current = queryClient.getQueryData<BackendSavedPlace[]>(queryKey)
      ?? await queryClient.fetchQuery({ queryKey, queryFn: ({ signal }) => fetchBackendSavedPlaces(signal) });
    if (!Array.isArray(current)) throw new Error("저장 목록을 먼저 확인해 주세요.");
    if (!isCurrentSession()) return "stale";
    const existing = current.find((entry) => entry.place.id === place.id);
    let backendPlaceId = existing?.place.backendPlaceId ?? place.backendPlaceId;
    if (!backendPlaceId) backendPlaceId = (await getBackendPlace(place.id))?.backendPlaceId;
    if (!isCurrentSession()) return "stale";
    if (!backendPlaceId) throw new Error("장소 저장에 필요한 정보를 확인하지 못했어요.");
    if (existing) await removeBackendSavedPlace(backendPlaceId);
    else await saveBackendPlace(backendPlaceId);
    if (!isCurrentSession()) return "stale";
    // A read started before the write must not replace the confirmed result.
    await queryClient.cancelQueries({ queryKey, exact: true });
    if (!isCurrentSession()) return "stale";
    queryClient.setQueryData<BackendSavedPlace[]>(queryKey, (latest = []) => {
      const others = latest.filter((entry) => entry.place.id !== place.id);
      return existing ? others : [{
        id: `${place.id}:saved`,
        savedAt: new Date().toISOString(),
        place: { ...place, backendPlaceId },
      }, ...others];
    });
    return existing ? "removed" : "saved";
  } finally {
    pending.delete(operationKey);
    // Reconcile once all writes for this user's list have settled.
    if (isCurrentSession() && ![...pending].some((key) => JSON.parse(key)[0] === userId)) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    }
  }
}
