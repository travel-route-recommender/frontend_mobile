import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../query/keys";
import { fetchApiTripList } from "./tripRoomApi";

/** 홈과 여행 탭이 같은 사용자 scope·query key·API 변환 결과를 공유한다. */
export function useApiTripListQuery(currentUserId?: string | null, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.trips.all, "api", currentUserId],
    queryFn: ({ signal }) => fetchApiTripList(currentUserId, signal),
    enabled: enabled && Boolean(currentUserId),
  });
}
