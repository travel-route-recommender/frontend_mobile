import { useQuery } from "@tanstack/react-query";
import { environment } from "../../../config/environment";
import { queryKeys } from "../../../query/keys";
import { fetchApiPreferenceProfile } from "../services/preferenceProfileApi";

export function useApiPreferenceProfile(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.preferences.profile(userId ?? "signed-out"),
    queryFn: ({ signal }) => fetchApiPreferenceProfile(signal),
    enabled: environment.dataSource !== "mock" && enabled && Boolean(userId),
    staleTime: 5 * 60_000,
  });
}
