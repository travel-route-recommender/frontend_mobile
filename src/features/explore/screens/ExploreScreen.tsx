import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import mediumSymbolWeight from "expo-symbols/androidWeights/medium";
import { useInfiniteQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { Screen } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { queryKeys } from "../../../query/keys";
import { useDuriStore } from "../../../store/useDuriStore";
import type { Place } from "../../../domain";
import { placeRepository } from "../../places/services/placeDataPolicy";
import { searchBackendFestivalPage, searchBackendPlacePage, TOUR_FESTIVAL_CATEGORY, TOUR_PLACE_CATEGORIES, type BackendPlacePageResult } from "../../places/services/placeApi";
import { buildPlaceCardViewModel, selectActiveCandidateTrip } from "../../places/selectors/placeSelectors";
import { dedupePlacesForDisplay, getPlaceDistanceProximityLabel, normalizeSearchKeyword, searchPlaces } from "../../places/logic/placeSearch";
import { buildPlaceLocationOptions } from "../../places/logic/placeFilterOptions";
import { PlaceCard } from "../../places/components/PlaceCard";
import {
  ActiveTripBanner,
  AddCandidateTripPickerModal,
  ExploreFilterSheet,
  EXPLORE_SORT_OPTIONS,
  PlaceFeedbackBanner,
  PlaceSearchInput,
} from "../../places/components/PlaceExploreControls";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { useExploreSearchStore } from "../store/useExploreSearchStore";
import { loadRecentExploreSearches, mergeRecentExploreSearch, saveRecentExploreSearches } from "../services/recentExploreSearches";
import type { PlaceLocationSelection, PlaceSortOption } from "../../places/types";

const EXPLORE_RESULTS_PER_PAGE = 10;
const BACKEND_PLACE_PAGE_SIZE = 50;
type SearchSuggestion = {
  key: string;
  label: string;
  description?: string;
  kind: "keyword" | "region";
  location?: PlaceLocationSelection;
};

export function ExploreScreen() {
  const router = useRouter();
  const actions = usePlaceActions();
  const searchState = useExploreSearchStore();
  const syncActiveTripRegion = useExploreSearchStore((state) => state.syncActiveTripRegion);
  const upsertPlaces = useDuriStore((state) => state.upsertPlaces);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [distanceBaseQuery, setDistanceBaseQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<Place>>(null);
  const autoSelectedTripRef = useRef(false);

  const clearBlurTimer = useCallback(() => {
    if (!blurTimerRef.current) return;
    clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
  }, []);

  const handleSearchFocus = useCallback(() => {
    clearBlurTimer();
    setSortMenuOpen(false);
    setSearchFocused(true);
  }, [clearBlurTimer]);

  const handleSearchBlur = useCallback(() => {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      setSearchFocused(false);
      blurTimerRef.current = null;
    }, 120);
  }, [clearBlurTimer]);

  const rememberSearch = useCallback((term: string) => {
    const normalized = term.trim();
    if (!normalized) return;
    setRecentSearches((current) => {
      const next = mergeRecentExploreSearch(current, normalized);
      void saveRecentExploreSearches(next);
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    void saveRecentExploreSearches([]);
  }, []);

  useEffect(() => {
    let active = true;
    void loadRecentExploreSearches().then((searches) => {
      if (active) setRecentSearches(searches);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => clearBlurTimer(), [clearBlurTimer]);
  const requestLocations = useMemo<PlaceLocationSelection[]>(() => {
    if (searchState.selectedLocations.length) return searchState.selectedLocations;
    if (searchState.selectedRegionId === "all") return [];
    const value = `${searchState.selectedRegionId}::${searchState.selectedDistrict}`;
    return [{ value, label: value, regionId: searchState.selectedRegionId, district: searchState.selectedDistrict }];
  }, [searchState.selectedDistrict, searchState.selectedLocations, searchState.selectedRegionId]);
  const backendSearchParams = useMemo(() => ({
    keyword: searchState.submittedKeyword,
    categories: searchState.selectedCategories,
    locations: requestLocations.map((location) => ({ regionId: location.regionId, district: location.district, value: location.value })),
    eventStartDate: searchState.selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) ? searchState.eventStartDate : undefined,
    eventEndDate: searchState.selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) ? searchState.eventEndDate : undefined,
    limit: BACKEND_PLACE_PAGE_SIZE,
  }), [requestLocations, searchState.eventEndDate, searchState.eventStartDate, searchState.selectedCategories, searchState.submittedKeyword]);
  const backendPlacesQuery = useInfiniteQuery({
    queryKey: queryKeys.places.search(backendSearchParams),
    queryFn: async ({ signal, pageParam }) => {
      const page = Number(pageParam) || 1;
      const regionIds = [...new Set(requestLocations.map((location) => location.regionId).filter((regionId): regionId is string => regionId !== "all"))];
      const categoryFilters = backendSearchParams.categories.length ? backendSearchParams.categories : [undefined];
      const regionFilters = regionIds.length ? regionIds : [undefined];
      const groups = await Promise.all(regionFilters.flatMap((regionId) => categoryFilters.map((category) => {
        if (category === TOUR_FESTIVAL_CATEGORY) {
          return searchBackendFestivalPage({ keyword: searchState.submittedKeyword, category, regionId, eventStartDate: backendSearchParams.eventStartDate, eventEndDate: backendSearchParams.eventEndDate, page, limit: backendSearchParams.limit, signal });
        }
        return searchBackendPlacePage({ keyword: searchState.submittedKeyword, category, regionId, page, limit: backendSearchParams.limit, signal });
      })));
      const merged = new Map(groups.flatMap((group) => group.places).map((place) => [place.id, place]));
      const totals = groups.map((group) => group.total).filter((total): total is number => typeof total === "number");
      return {
        places: [...merged.values()],
        page,
        size: backendSearchParams.limit,
        ...(totals.length === groups.length ? { total: totals.reduce((sum, total) => sum + total, 0) } : {}),
        hasNextPage: groups.some((group) => group.hasNextPage),
      } satisfies BackendPlacePageResult;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    enabled: placeRepository.remoteEnabled,
  });
  const backendPlaces = useMemo(() => dedupePlacesForDisplay(backendPlacesQuery.data?.pages.flatMap((page) => page.places) ?? []), [backendPlacesQuery.data]);
  const backendPlacesById = useMemo(
    () => Object.fromEntries(backendPlaces.map((place) => [place.id, place])),
    [backendPlaces],
  );
  const source = useMemo(() => (
    placeRepository.remoteEnabled
      ? { ...actions.source, placesById: { ...actions.source.placesById, ...backendPlacesById } }
      : actions.source
  ), [actions.source, backendPlacesById]);

  useEffect(() => {
    if (backendPlaces.length) upsertPlaces(backendPlaces);
  }, [backendPlaces, upsertPlaces]);

  const activeTrip = selectActiveCandidateTrip(source);
  const activeTripId = activeTrip?.id;
  const activeTripRegionId = activeTrip?.regionId;
  useEffect(() => {
    if (activeTrip) {
      autoSelectedTripRef.current = true;
      return;
    }
    if (autoSelectedTripRef.current || !actions.eligibleTrips.length) return;
    autoSelectedTripRef.current = true;
    actions.setActiveTrip(actions.eligibleTrips[0].id);
  }, [actions, activeTrip]);
  useEffect(() => {
    if (!activeTripId || !activeTripRegionId) return;
    syncActiveTripRegion(activeTripId, activeTripRegionId);
  }, [activeTripId, activeTripRegionId, syncActiveTripRegion]);

  const places = useMemo(
    () => placeRepository.remoteEnabled ? backendPlaces : Object.values(source.placesById),
    [backendPlaces, source.placesById],
  );
  const distanceReferencePlaces = useMemo(() => Object.values(source.placesById), [source.placesById]);
  const distanceBasePlace = searchState.distanceBasePlaceId ? source.placesById[searchState.distanceBasePlaceId] : undefined;
  const sortablePlaces = useMemo(() => {
    if (!distanceBasePlace || places.some((place) => place.id === distanceBasePlace.id)) return places;
    return [...places, distanceBasePlace];
  }, [distanceBasePlace, places]);
  const savedIds = useMemo(() => new Set(source.savedPlaceIdsByUserId[source.currentUserId] ?? []), [source.currentUserId, source.savedPlaceIdsByUserId]);
  const categories = useMemo(() => [...new Set(places.map((place) => place.category.trim() || "기타"))].sort((left, right) => left.localeCompare(right, "ko")), [places]);
  const filterCategories = useMemo(() => [{ value: "all", label: "전체" }, ...[...new Set([...TOUR_PLACE_CATEGORIES, ...categories])].map((category) => ({ value: category, label: category }))], [categories]);
  const selectedCategories = useMemo(() => searchState.selectedCategories.filter((selected) => filterCategories.some((category) => category.value === selected)), [filterCategories, searchState.selectedCategories]);
  const selectedCategory = selectedCategories[0] ?? "all";
  const locationOptions = useMemo(() => buildPlaceLocationOptions(source.regionsById, places), [places, source.regionsById]);
  const activeLocations = useMemo(() => requestLocations.map((location) => {
    const option = locationOptions.find((candidate) => candidate.value === location.value);
    return option ? { value: option.value, label: option.description, regionId: option.regionId, district: option.district } : location;
  }), [locationOptions, requestLocations]);
  const pageScopeKey = useMemo(() => [
    searchState.submittedKeyword,
    activeLocations.map((location) => location.value).join("|"),
    selectedCategories.join("|"),
    searchState.eventStartDate ?? "",
    searchState.eventEndDate ?? "",
    searchState.sortOption,
    searchState.distanceBasePlaceId ?? "",
    searchState.distanceBaseLocation?.value ?? "",
  ].join("::"), [activeLocations, searchState.distanceBaseLocation?.value, searchState.distanceBasePlaceId, searchState.eventEndDate, searchState.eventStartDate, searchState.sortOption, searchState.submittedKeyword, selectedCategories]);
  const sortedFilteredPlaces = useMemo(
    () => searchPlaces(sortablePlaces, { keyword: searchState.submittedKeyword, regionId: searchState.selectedRegionId, district: searchState.selectedDistrict, locations: activeLocations, category: "all", categories: selectedCategories, eventStartDate: selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) ? searchState.eventStartDate : undefined, eventEndDate: selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) ? searchState.eventEndDate : undefined, sort: searchState.sortOption, distanceBasePlaceId: searchState.distanceBasePlaceId, distanceBaseLocation: searchState.distanceBaseLocation }, source.regionsById, savedIds),
    [source.regionsById, sortablePlaces, savedIds, activeLocations, searchState.distanceBaseLocation, searchState.distanceBasePlaceId, searchState.eventEndDate, searchState.eventStartDate, searchState.selectedDistrict, searchState.selectedRegionId, searchState.sortOption, searchState.submittedKeyword, selectedCategories],
  );
  const filteredPlaces = useMemo(
    () => searchState.distanceBasePlaceId ? sortedFilteredPlaces.filter((place) => place.id !== searchState.distanceBasePlaceId) : sortedFilteredPlaces,
    [searchState.distanceBasePlaceId, sortedFilteredPlaces],
  );
  const loadedPageCount = Math.max(1, Math.ceil(filteredPlaces.length / EXPLORE_RESULTS_PER_PAGE));
  const hasNextBackendPage = placeRepository.remoteEnabled && Boolean(backendPlacesQuery.hasNextPage);
  const isFetchingNextBackendPage = backendPlacesQuery.isFetchingNextPage;
  const fetchNextBackendPage = backendPlacesQuery.fetchNextPage;
  const maxReachablePage = loadedPageCount;
  const currentPage = Math.min(Math.max(pageState.key === pageScopeKey ? pageState.page : 1, 1), maxReachablePage);
  const canGoPreviousPage = currentPage > 1;
  const canGoNextPage = currentPage < loadedPageCount;

  useEffect(() => {
    if (!hasNextBackendPage || isFetchingNextBackendPage || !filteredPlaces.length) return;
    if (currentPage >= Math.max(1, loadedPageCount - 1)) void fetchNextBackendPage();
  }, [currentPage, fetchNextBackendPage, filteredPlaces.length, hasNextBackendPage, isFetchingNextBackendPage, loadedPageCount]);

  const resultCountText = useMemo(() => {
    const countLabel = hasNextBackendPage ? `${filteredPlaces.length}곳 이상` : `${filteredPlaces.length}곳`;
    return `검색 결과 ${countLabel}`;
  }, [filteredPlaces.length, hasNextBackendPage]);
  const distanceBaseLabel = searchState.sortOption === "distance"
    ? distanceBasePlace?.name ?? searchState.distanceBaseLocation?.label
    : undefined;
  const normalizedDistanceBaseQuery = normalizeSearchKeyword(distanceBaseQuery);
  const distanceBaseMatches = useMemo(() => {
    if (searchState.sortOption !== "distance" || !normalizedDistanceBaseQuery) return [];
    return distanceReferencePlaces
      .filter((place) => place.id !== searchState.distanceBasePlaceId)
      .filter((place) => normalizeSearchKeyword(`${place.name} ${place.address} ${place.category} ${place.tags.join(" ")}`).includes(normalizedDistanceBaseQuery))
      .slice(0, 6);
  }, [distanceReferencePlaces, normalizedDistanceBaseQuery, searchState.distanceBasePlaceId, searchState.sortOption]);
  const pageStart = (currentPage - 1) * EXPLORE_RESULTS_PER_PAGE;
  const pagedPlaces = useMemo(() => filteredPlaces.slice(pageStart, pageStart + EXPLORE_RESULTS_PER_PAGE), [filteredPlaces, pageStart]);
  const cardsById = useMemo(() => Object.fromEntries(pagedPlaces.flatMap((place) => {
    const viewModel = buildPlaceCardViewModel(source, place.id);
    return viewModel ? [[place.id, viewModel]] : [];
  })), [source, pagedPlaces]);
  const distanceProximityById = useMemo<Record<string, string>>(() => {
    if (searchState.sortOption !== "distance" || !distanceBasePlace) return {};
    return Object.fromEntries(pagedPlaces.flatMap((place) => {
      const label = getPlaceDistanceProximityLabel(place, distanceBasePlace);
      return label ? [[place.id, label]] : [];
    }));
  }, [distanceBasePlace, pagedPlaces, searchState.sortOption]);
  const eventDateFilterActive = selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) && Boolean(searchState.eventStartDate || searchState.eventEndDate);
  const eventDateFilterLabel = useMemo(() => {
    if (!eventDateFilterActive) return undefined;
    const format = (value?: string) => value?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");
    const start = format(searchState.eventStartDate);
    const end = format(searchState.eventEndDate);
    return start && end && start !== end ? `행사일: ${start}~${end}` : `행사일: ${start ?? end}`;
  }, [eventDateFilterActive, searchState.eventEndDate, searchState.eventStartDate]);
  const hasFilters = Boolean(searchState.submittedKeyword || activeLocations.length || selectedCategories.length || eventDateFilterActive || searchState.sortOption !== "popular");
  const activeFilterBadges = useMemo(() => {
    const badges: string[] = [];
    activeLocations.forEach((location) => badges.push(`지역: ${location.label}`));
    if (eventDateFilterLabel) badges.push(eventDateFilterLabel);
    return badges;
  }, [activeLocations, eventDateFilterLabel]);

  const goToPage = useCallback((page: number) => {
    const nextPage = Math.min(Math.max(page, 1), maxReachablePage);
    setPageState({ key: pageScopeKey, page: nextPage });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [maxReachablePage, pageScopeKey]);
  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    const draft = normalizeSearchKeyword(searchState.keyword);
    if (!draft) return [];
    const submitted = normalizeSearchKeyword(searchState.submittedKeyword);
    const terms = new Map<string, SearchSuggestion>();
    locationOptions.forEach((option) => {
      if (option.regionId === "all") return;
      const key = normalizeSearchKeyword(`${option.label} ${option.description}`);
      if (key.includes(draft)) terms.set(`region:${option.value}`, { key: `region:${option.value}`, label: option.label, description: option.description, kind: "region", location: { value: option.value, label: option.description, regionId: option.regionId, district: option.district } });
    });
    const add = (value?: string) => {
      const label = value?.trim();
      if (!label) return;
      const key = normalizeSearchKeyword(label);
      if (key && key !== submitted && key.includes(draft) && !terms.has(`keyword:${key}`)) terms.set(`keyword:${key}`, { key: `keyword:${key}`, label, kind: "keyword" });
    };
    places.forEach((place) => {
      add(place.name);
      add(place.category);
      place.tags.forEach(add);
    });
    Object.values(source.regionsById).forEach((region) => {
      add(region.name);
      add(region.shortName);
    });
    categories.forEach(add);
    return [...terms.values()].slice(0, 8);
  }, [categories, locationOptions, places, searchState.keyword, searchState.submittedKeyword, source.regionsById]);
  const draftKeyword = normalizeSearchKeyword(searchState.keyword);
  const recentSearchMatches = useMemo(() => {
    if (!searchFocused) return [];
    if (!draftKeyword) return recentSearches.slice(0, 6);
    return recentSearches.filter((term) => normalizeSearchKeyword(term).includes(draftKeyword)).slice(0, 4);
  }, [draftKeyword, recentSearches, searchFocused]);
  const showSearchDropdown = searchFocused && Boolean(recentSearchMatches.length || searchSuggestions.length);
  const filterActive = hasFilters || searchState.keyword !== searchState.submittedKeyword;
  const submitSearch = (keyword = searchState.keyword) => {
    const normalized = keyword.trim();
    searchState.submitKeyword(normalized);
    rememberSearch(normalized);
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const applySuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "region" && suggestion.location) {
      searchState.applyFilters({ regionId: suggestion.location.regionId, district: suggestion.location.district, locations: [suggestion.location], category: selectedCategory, categories: selectedCategories, eventStartDate: selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) ? searchState.eventStartDate : undefined, eventEndDate: selectedCategories.includes(TOUR_FESTIVAL_CATEGORY) ? searchState.eventEndDate : undefined, sort: searchState.sortOption, distanceBasePlaceId: searchState.distanceBasePlaceId, distanceBaseLocation: searchState.distanceBaseLocation });
      rememberSearch(suggestion.label);
      searchState.submitKeyword("");
      setSearchFocused(false);
      setPageState({ key: "", page: 1 });
      return;
    }
    submitSearch(suggestion.label);
  };
  const resetFilters = () => {
    if (activeTrip) searchState.startTripExplore(activeTrip.regionId);
    else searchState.resetFilters();
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const clearActiveTripSelection = () => {
    actions.clearActiveTrip();
    searchState.clearActiveTripContext();
    setSearchFocused(false);
    setSortMenuOpen(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const clearCategoryFilter = (category: string) => {
    const nextCategories = selectedCategories.filter((selected) => selected !== category);
    searchState.setCategories(nextCategories);
    if (!nextCategories.includes(TOUR_FESTIVAL_CATEGORY)) searchState.setEventDateRange(undefined, undefined);
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const changeSort = (sort: PlaceSortOption) => {
    setSortMenuOpen(false);
    if (sort === searchState.sortOption) return;
    searchState.setSort(sort);
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const selectDistanceBasePlace = (placeId: string) => {
    searchState.setDistanceBasePlace(placeId);
    setDistanceBaseQuery("");
    setSearchFocused(false);
    setSortMenuOpen(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const clearDistanceBase = () => {
    searchState.setDistanceBasePlace(undefined);
    setDistanceBaseQuery("");
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const changeKeyword = (value: string) => {
    handleSearchFocus();
    setSortMenuOpen(false);
    searchState.setKeyword(value);
  };
  const openFilterSheet = () => {
    setSearchFocused(false);
    setSortMenuOpen(false);
    setFilterOpen(true);
  };

  if (!placeRepository.available) return <Screen><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></Screen>;
  if (placeRepository.remoteEnabled && backendPlacesQuery.isLoading) return <Screen><LoadingState label="장소를 탐색 중이에요." /></Screen>;
  if (placeRepository.remoteEnabled && backendPlacesQuery.isError && !backendPlacesQuery.data) {
    return <Screen><ErrorState message={backendPlacesQuery.error instanceof Error ? backendPlacesQuery.error.message : "백엔드 장소 데이터를 불러오지 못했어요."} onRetry={() => { void backendPlacesQuery.refetch(); }} /></Screen>;
  }
  if (source.currentUserId && !source.usersById[source.currentUserId]) return <Screen><ErrorState message="현재 사용자 정보를 찾을 수 없어 저장과 후보 관계를 불러오지 못했어요." /></Screen>;

  const searchHeader = <View style={styles.fixedSearchHeader}>
    <View style={styles.searchRow}>
      <View style={styles.searchGroup}>
        <PlaceSearchInput value={searchState.keyword} onFocus={handleSearchFocus} onBlur={handleSearchBlur} onChangeText={changeKeyword} onClear={() => changeKeyword("")} onSearch={() => submitSearch()} expanded={showSearchDropdown} placeholder={activeTrip ? `${activeTrip.title} 후보 장소 검색` : "장소, 지역, 태그 검색"} />
        {showSearchDropdown ? <View style={styles.searchDropdown}>
          {recentSearchMatches.length ? <View style={styles.searchSection}>
            <View style={styles.suggestionHeadingRow}><Text style={styles.suggestionLabel}>최근 검색어</Text><Pressable accessibilityRole="button" accessibilityLabel="최근 검색어 전체 삭제" onPress={clearRecentSearches} style={styles.clearRecentButton}><Text style={styles.clearRecentText}>전체 삭제</Text></Pressable></View>
            {recentSearchMatches.map((term) => <Pressable key={`recent:${term}`} accessibilityRole="button" accessibilityLabel={`${term} 최근 검색어로 검색`} onPress={() => submitSearch(term)} style={styles.suggestionRow}><View style={styles.suggestionCopy}><Text numberOfLines={1} style={styles.suggestionText}>{term}</Text></View><Text style={styles.recentBadge}>최근</Text></Pressable>)}
          </View> : null}
          {searchSuggestions.length ? <View style={styles.searchSection}>
            <Text style={styles.suggestionLabel}>연관 검색어</Text>
            {searchSuggestions.map((suggestion) => <Pressable key={suggestion.key} accessibilityRole="button" accessibilityLabel={`${suggestion.label} 검색`} onPress={() => applySuggestion(suggestion)} style={styles.suggestionRow}><View style={styles.suggestionCopy}><Text numberOfLines={1} style={styles.suggestionText}>{suggestion.label}</Text>{suggestion.description && suggestion.description !== suggestion.label ? <Text numberOfLines={1} style={styles.suggestionMeta}>{suggestion.description}</Text> : null}</View>{suggestion.kind === "region" ? <Text style={styles.regionBadge}>지역</Text> : null}</Pressable>)}
          </View> : null}
        </View> : null}
      </View>
    </View>
    <View style={styles.filterToolbarRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="검색 필터 열기" accessibilityState={{ selected: filterActive }} onPress={openFilterSheet} style={styles.filterToolbarButton}><FilterButtonIcon /><Text style={styles.filterToolbarButtonText}>필터</Text></Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterToolbarChips} contentContainerStyle={styles.filterBadgeRow}>
        {selectedCategories.map((category) => <Pressable key={category} accessibilityRole="button" accessibilityLabel={`${category} 카테고리 필터 해제`} onPress={() => clearCategoryFilter(category)} style={styles.categoryFilterBadge}><Text numberOfLines={1} style={styles.categoryFilterText}>{category}</Text><Text style={styles.categoryFilterRemove}>×</Text></Pressable>)}
        {activeFilterBadges.map((badge) => <Pressable key={badge} accessibilityRole="button" accessibilityLabel={`${badge} 필터 수정`} onPress={openFilterSheet} style={styles.filterBadge}><Text numberOfLines={1} style={styles.filterBadgeText}>{badge}</Text></Pressable>)}
      </ScrollView>
      {hasFilters ? <Pressable accessibilityRole="button" accessibilityLabel="검색 조건 초기화" onPress={resetFilters} style={styles.inlineReset}><Text style={styles.inlineResetText}>초기화</Text></Pressable> : null}
    </View>
  </View>;

  const resultsHeader = <View style={styles.header}>
    <ActiveTripBanner trip={activeTrip} region={activeTrip ? source.regionsById[activeTrip.regionId] : undefined} onClear={clearActiveTripSelection} />
    <View style={styles.resultRow}><View style={styles.resultCopy}><Text style={styles.resultTitle}>장소 목록</Text><Text style={styles.resultCount}>{resultCountText}</Text></View><View style={styles.resultActions}><ExploreSortDropdown value={searchState.sortOption} open={sortMenuOpen} onToggle={() => { setSearchFocused(false); setSortMenuOpen((open) => !open); }} onChange={changeSort} /></View></View>
    {searchState.sortOption === "distance" ? <View style={styles.distanceBasePanel}>
      {distanceBaseLabel ? <View style={styles.distanceBaseSelected}><View style={styles.flex}><Text style={styles.distanceBaseEyebrow}>거리 기준</Text><Text numberOfLines={1} style={styles.distanceBaseText}>{distanceBaseLabel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="거리 기준 장소 해제" onPress={clearDistanceBase} style={styles.distanceBaseClear}><Text style={styles.distanceBaseClearText}>×</Text></Pressable></View> : null}
      <TextInput accessibilityLabel="거리 기준 관광지 검색" value={distanceBaseQuery} onFocus={() => { setSearchFocused(false); setSortMenuOpen(false); }} onChangeText={setDistanceBaseQuery} placeholder="기준 관광지 검색" placeholderTextColor={colors.textMuted} autoCorrect={false} style={styles.distanceBaseInput} />
      {normalizedDistanceBaseQuery ? <View style={styles.distanceBaseResults}>
        {distanceBaseMatches.length ? distanceBaseMatches.map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`${place.name} 거리 기준으로 선택`} onPress={() => selectDistanceBasePlace(place.id)} style={styles.distanceBaseResult}><View style={styles.flex}><Text numberOfLines={1} style={styles.distanceBaseResultTitle}>{place.name}</Text><Text numberOfLines={1} style={styles.distanceBaseResultMeta}>{place.address}</Text></View><Text style={styles.linkText}>선택</Text></Pressable>) : <Text style={styles.distanceBaseEmpty}>일치하는 관광지가 없어요.</Text>}
      </View> : null}
    </View> : null}
  </View>;

  const paginationPageCount = Math.max(loadedPageCount, currentPage);
  const pageWindowSize = Math.min(5, paginationPageCount);
  const firstVisiblePage = Math.min(Math.max(currentPage - 2, 1), Math.max(1, paginationPageCount - pageWindowSize + 1));
  const visiblePageNumbers = Array.from({ length: pageWindowSize }, (_, index) => firstVisiblePage + index);
  const pagination = paginationPageCount > 1 || hasNextBackendPage ? <View style={styles.pagination}>
    {paginationPageCount > 1 || hasNextBackendPage ? <View style={styles.pageControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 검색 결과 페이지" accessibilityState={{ disabled: !canGoPreviousPage }} disabled={!canGoPreviousPage} onPress={() => goToPage(currentPage - 1)} style={[styles.pageArrow, !canGoPreviousPage && styles.pageButtonDisabled]}><PaginationChevron direction="left" disabled={!canGoPreviousPage} /></Pressable>
      <View style={styles.pageDots}>{visiblePageNumbers.map((page) => <Pressable key={page} accessibilityRole="button" accessibilityLabel={`${page}번째 검색 결과 페이지`} accessibilityState={{ selected: currentPage === page }} onPress={() => goToPage(page)} style={[styles.pageDot, currentPage === page && styles.pageDotActive]} />)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 검색 결과 페이지" accessibilityState={{ disabled: !canGoNextPage }} disabled={!canGoNextPage} onPress={() => goToPage(currentPage + 1)} style={[styles.pageArrow, !canGoNextPage && styles.pageButtonDisabled]}><PaginationChevron direction="right" disabled={!canGoNextPage} /></Pressable>
    </View> : null}
  </View> : null;

  return <Screen scroll={false}>{searchHeader}<FlatList
    ref={listRef}
    style={styles.listFrame}
    data={pagedPlaces}
    keyExtractor={(place) => place.id}
    keyboardShouldPersistTaps="handled"
    onScrollBeginDrag={() => { setSearchFocused(false); setSortMenuOpen(false); }}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.list}
    extraData={`${sortMenuOpen}-${searchState.sortOption}-${selectedCategories.join("|")}-${activeFilterBadges.join("|")}-${distanceBaseLabel ?? ""}`}
    ItemSeparatorComponent={() => <View style={styles.gap} />}
    ListHeaderComponent={resultsHeader}
    ListFooterComponent={pagination}
    ListEmptyComponent={<EmptyState title="검색 결과가 없어요" description="검색어나 지역, 카테고리 조건을 바꿔 다시 찾아보세요." ctaLabel="조건 초기화" onPress={resetFilters} />}
    renderItem={({ item }) => {
      const viewModel = cardsById[item.id];
      return viewModel ? <PlaceCard viewModel={viewModel} distanceProximityLabel={distanceProximityById[item.id]} onPress={() => { setSearchFocused(false); router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } }); }} onToggleSaved={() => { setSearchFocused(false); actions.toggleSaved(item.id); }} onAddCandidate={() => { setSearchFocused(false); actions.requestCandidate(item.id); }} /> : null;
    }}
  />
  <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
  <ExploreFilterSheet visible={filterOpen} locationOptions={locationOptions} categories={filterCategories} selectedLocations={activeLocations} selectedCategories={selectedCategories} selectedEventStartDate={searchState.eventStartDate} selectedEventEndDate={searchState.eventEndDate} festivalCategory={TOUR_FESTIVAL_CATEGORY} sortOption={searchState.sortOption} trips={actions.eligibleTrips} regionsById={source.regionsById} activeTripId={source.activeTripId} onApply={(input) => { const selectedTrip = input.tripId ? source.tripsById[input.tripId] : undefined; const nextInput = selectedTrip && input.locations.length === 0 ? { ...input, regionId: selectedTrip.regionId, district: "all" as const } : input; searchState.applyFilters({ ...nextInput, distanceBasePlaceId: searchState.distanceBasePlaceId, distanceBaseLocation: searchState.distanceBaseLocation }); if (input.tripId) actions.setActiveTrip(input.tripId); else { actions.clearActiveTrip(); searchState.clearActiveTripContext(); } searchState.submitKeyword(); setPageState({ key: "", page: 1 }); listRef.current?.scrollToOffset({ offset: 0, animated: true }); }} onReset={resetFilters} onClose={() => setFilterOpen(false)} />
  <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
  {actions.memberGatePrompt}</Screen>;
}

function ExploreSortDropdown({ value, open, onToggle, onChange }: { value: PlaceSortOption; open: boolean; onToggle(): void; onChange(value: PlaceSortOption): void }) {
  const current = EXPLORE_SORT_OPTIONS.find((option) => option.value === value) ?? EXPLORE_SORT_OPTIONS[0];
  const buttonRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number }>();
  const toggleMenu = () => {
    if (!open) {
      buttonRef.current?.measureInWindow((left, top, width, height) => {
        setAnchor({ top: top + height + spacing.xs, left, width });
      });
    }
    onToggle();
  };
  const closeMenu = () => {
    if (open) onToggle();
  };

  return <>
    <View style={styles.sortDropdownRoot}>
      <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={`정렬 기준 ${current.label}`} accessibilityState={{ expanded: open }} onPress={toggleMenu} style={styles.sortDropdownButton}><Text style={styles.sortDropdownText}>{current.label}</Text><SortChevronIcon open={open} /></Pressable>
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeMenu}>
      <View style={styles.sortDropdownModalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="정렬 메뉴 닫기" onPress={closeMenu} style={StyleSheet.absoluteFill} />
        <View accessibilityRole="radiogroup" style={[styles.sortDropdownList, styles.sortDropdownFloating, anchor ? { top: anchor.top, left: anchor.left, right: undefined, width: anchor.width } : null]}>
          {EXPLORE_SORT_OPTIONS.map((option) => {
            const selected = value === option.value;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`정렬 기준 ${option.label}`} accessibilityState={{ checked: selected }} onPress={() => onChange(option.value)} style={[styles.sortDropdownOption, selected && styles.sortDropdownOptionSelected]}><Text style={[styles.sortDropdownOptionText, selected && styles.sortDropdownOptionTextSelected]}>{option.label}</Text>{selected ? <Text style={styles.sortSelectedMark}>✓</Text> : null}</Pressable>;
          })}
        </View>
      </View>
    </Modal>
  </>;
}

function SortChevronIcon({ open }: { open: boolean }) {
  return <SymbolView name={{ ios: "chevron.down", android: "keyboard_arrow_down", web: "keyboard_arrow_down" }} tintColor={colors.primary} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={[styles.sortChevronIcon, open && styles.sortChevronOpen]} />;
}

function FilterButtonIcon() {
  return <SymbolView name={{ ios: "slider.horizontal.3", android: "tune", web: "tune" }} tintColor={colors.white} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.filterButtonIcon} />;
}

function PaginationChevron({ direction, disabled }: { direction: "left" | "right"; disabled?: boolean }) {
  return <SymbolView name={{ ios: direction === "left" ? "chevron.left" : "chevron.right", android: direction === "left" ? "keyboard_arrow_left" : "keyboard_arrow_right", web: direction === "left" ? "keyboard_arrow_left" : "keyboard_arrow_right" }} tintColor={disabled ? colors.textMuted : colors.primary} size={22} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.paginationChevronIcon} />;
}

const styles = StyleSheet.create({
  fixedSearchHeader: { zIndex: 120, gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.background },
  listFrame: { flex: 1, zIndex: 1 },
  flex: { flex: 1 },
  list: { paddingTop: spacing.xs, paddingBottom: spacing.xxxl },
  header: { zIndex: 90, elevation: 30, gap: spacing.sm, marginBottom: spacing.lg },
  gap: { height: spacing.md },
  searchRow: { zIndex: 50, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  searchGroup: { zIndex: 60, flex: 1, position: "relative" },
  searchDropdown: { position: "absolute", top: 51, left: 0, right: 0, zIndex: 80, maxHeight: 320, overflow: "hidden", borderWidth: 1, borderTopWidth: 0, borderColor: colors.borderStrong, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, backgroundColor: colors.surface, ...shadows.floating },
  searchSection: { borderTopWidth: 1, borderTopColor: colors.border },
  suggestionHeadingRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingRight: spacing.md },
  suggestionLabel: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  clearRecentButton: { minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.xs },
  clearRecentText: { ...typography.caption, color: colors.textMuted },
  suggestionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  suggestionCopy: { flex: 1 },
  suggestionText: { ...typography.bodyStrong, color: colors.text },
  suggestionMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  recentBadge: { ...typography.caption, color: colors.textSecondary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  regionBadge: { ...typography.caption, color: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  sortDropdownRoot: { zIndex: 160, elevation: 40, position: "relative" },
  sortDropdownButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  sortDropdownText: { ...typography.bodyStrong, color: colors.text },
  sortChevronIcon: { width: 18, height: 18 },
  sortChevronOpen: { transform: [{ rotate: "180deg" }] },
  sortDropdownModalRoot: { flex: 1 },
  sortDropdownFloating: { position: "absolute", top: 150, right: spacing.lg, width: 142, zIndex: 220, elevation: 50 },
  sortDropdownList: { overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, ...shadows.floating },
  sortDropdownOption: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  sortDropdownOptionSelected: { backgroundColor: colors.primarySoft },
  sortDropdownOptionText: { ...typography.body, color: colors.text },
  sortDropdownOptionTextSelected: { ...typography.bodyStrong, color: colors.primary },
  sortSelectedMark: { ...typography.bodyStrong, color: colors.primary },
  distanceBasePanel: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distanceBaseSelected: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  distanceBaseEyebrow: { ...typography.caption, color: colors.primary },
  distanceBaseText: { ...typography.bodyStrong, color: colors.text },
  distanceBaseClear: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface },
  distanceBaseClearText: { fontSize: 22, lineHeight: 24, textAlign: "center", color: colors.primary },
  distanceBaseInput: { minHeight: 42, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.sm, ...typography.body, color: colors.text, backgroundColor: colors.background },
  distanceBaseResults: { overflow: "hidden", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distanceBaseResult: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  distanceBaseResultTitle: { ...typography.bodyStrong, color: colors.text },
  distanceBaseResultMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  distanceBaseEmpty: { ...typography.caption, color: colors.textSecondary, padding: spacing.sm },
  linkText: { ...typography.caption, color: colors.primary },
  filterToolbarRow: { zIndex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filterToolbarButton: { minHeight: 38, minWidth: 74, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary, ...shadows.card },
  filterToolbarButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterButtonIcon: { width: 18, height: 18 },
  filterToolbarButtonText: { ...typography.caption, color: colors.white },
  filterToolbarButtonTextActive: { color: colors.white },
  filterToolbarChips: { flex: 1 },
  filterBadgeRow: { alignItems: "center", gap: spacing.xs, paddingRight: spacing.sm },
  categoryFilterBadge: { minHeight: 34, maxWidth: 168, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingLeft: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  categoryFilterText: { ...typography.caption, color: colors.primary },
  categoryFilterRemove: { minWidth: 18, fontSize: 18, lineHeight: 20, textAlign: "center", color: colors.primary },
  filterBadge: { minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  filterBadgeText: { ...typography.caption, color: colors.textSecondary },
  inlineReset: { minHeight: 34, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  inlineResetText: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  resultRow: { zIndex: 100, elevation: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { ...typography.subtitle, color: colors.text },
  resultCount: { ...typography.caption, color: colors.textSecondary },
  resultActions: { zIndex: 30, width: 142, alignItems: "stretch" },
  pagination: { alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingTop: spacing.lg },
  pageControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  pageArrow: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  paginationChevronIcon: { width: 22, height: 22 },
  pageButtonDisabled: { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  pageDots: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  pageDot: { width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  pageDotActive: { width: 24, backgroundColor: colors.primary },
});
