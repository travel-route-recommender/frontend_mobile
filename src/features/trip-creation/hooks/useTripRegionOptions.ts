import { useCallback, useEffect, useState } from "react";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import type { RegionOption, RegionService } from "../services/regionService";

export function useTripRegionOptions(service: RegionService) {
  const [keyword, setKeyword] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{
    service: RegionService | null;
    keyword: string;
    reloadKey: number;
    options: RegionOption[];
    error: string;
  }>({ service: null, keyword: "", reloadKey: -1, options: [], error: "" });

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    const request = keyword.trim() ? service.searchRegions(keyword) : service.getPopularRegions();
    void request.then((nextOptions) => {
      if (active) setResult({ service, keyword, reloadKey, options: nextOptions, error: "" });
    }).catch((reason: unknown) => {
      if (!active) return;
      setResult({
        service,
        keyword,
        reloadKey,
        options: [],
        error: toUserFacingApiErrorMessage(reason, "여행지 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."),
      });
    });
    return () => { active = false; };
  }, [keyword, reloadKey, service]);

  const isLoading = result.service !== service || result.keyword !== keyword || result.reloadKey !== reloadKey;
  return { keyword, setKeyword, options: isLoading ? [] : result.options, isLoading, error: isLoading ? "" : result.error, reload };
}
