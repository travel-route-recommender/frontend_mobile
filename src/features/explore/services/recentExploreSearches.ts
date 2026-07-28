import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENT_EXPLORE_SEARCHES_KEY = "duri.explore.recent-searches.v1";
const MAX_RECENT_EXPLORE_SEARCHES = 10;

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseRecentSearches(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map(normalizeSearchTerm)
      .filter(Boolean)
      .slice(0, MAX_RECENT_EXPLORE_SEARCHES);
  } catch {
    return [];
  }
}

export function mergeRecentExploreSearch(searches: readonly string[], term: string) {
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return [...searches];
  const next = [normalized, ...searches.filter((item) => item.toLocaleLowerCase("ko-KR") !== normalized.toLocaleLowerCase("ko-KR"))];
  return next.slice(0, MAX_RECENT_EXPLORE_SEARCHES);
}

export async function loadRecentExploreSearches() {
  return parseRecentSearches(await AsyncStorage.getItem(RECENT_EXPLORE_SEARCHES_KEY));
}

export async function saveRecentExploreSearches(searches: readonly string[]) {
  await AsyncStorage.setItem(RECENT_EXPLORE_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_EXPLORE_SEARCHES)));
}
