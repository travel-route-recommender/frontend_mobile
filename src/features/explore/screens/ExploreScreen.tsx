import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import mediumSymbolWeight from "expo-symbols/androidWeights/medium";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { AppHeader, Screen } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { queryKeys } from "../../../query/keys";
import { useDuriStore } from "../../../store/useDuriStore";
import type { Place, Region } from "../../../domain";
import { placeRepository } from "../../places/services/placeDataPolicy";
import {
  fetchBackendCategoryCodeTree,
  fetchBackendRegionCodeTree,
  resolveAreaCodeForRegion,
  resolveRegionIdForAreaCode,
  searchBackendFestivalPage,
  searchBackendRegionPlacePage,
  type BackendPlacePageResult,
  type BackendRegionCodeTree,
} from "../../places/services/placeApi";
import { buildPlaceCardViewModel, selectActiveCandidateTrip } from "../../places/selectors/placeSelectors";
import { dedupePlacesForDisplay, filterPlaces, getPlaceDistanceProximityLabel, normalizeSearchKeyword, searchPlaces } from "../../places/logic/placeSearch";
import {
  FESTIVAL_CLASSIFICATION_CODE,
  buildClassificationLookup,
  enrichPlaceClassificationTags,
  getPlaceClassificationSelectionValues,
  type PlaceClassificationSelection,
} from "../../places/logic/placeClassification";
import { buildPlaceLocationOptions, getPlaceLocationDisplayLabel, getPlaceLocationValue, type PlaceLocationFilterOption } from "../../places/logic/placeFilterOptions";
import { PlaceCard } from "../../places/components/PlaceCard";
import {
  ActiveTripBanner,
  AddCandidateTripPickerModal,
  ExploreFilterSheet,
  EXPLORE_SORT_OPTIONS,
  PlaceFeedbackBanner,
  PlaceSearchInput,
  RegionSelectionSheet,
} from "../../places/components/PlaceExploreControls";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { useExploreSearchStore } from "../store/useExploreSearchStore";
import { loadRecentExploreSearches, mergeRecentExploreSearch, saveRecentExploreSearches } from "../services/recentExploreSearches";
import type { PlaceLocationSelection, PlaceSortOption } from "../../places/types";
import {
  buildPlaceDetailHref,
  buildTripExploreReturnHref,
  resolveTripExploreContext,
} from "../logic/exploreNavigation";

const EXPLORE_RESULTS_PER_PAGE = 10;
const BACKEND_PLACE_PAGE_SIZE = 50;
const NO_CATEGORY_FILTERS: string[] = [];
type SearchSuggestion = {
  key: string;
  label: string;
  description?: string;
  kind: "keyword" | "region";
  location?: PlaceLocationSelection;
};

type BackendRegionScope = {
  key: string;
  label: string;
  regionId: string;
  district: string;
  regionQuery: string;
  areaCode?: string;
  sigunguCode?: string;
};

type ExploreFilterApplyInput = {
  category: string | "all";
  categories: string[];
  classification?: PlaceClassificationSelection;
  classifications: PlaceClassificationSelection[];
  eventStartDate?: string;
  eventEndDate?: string;
  sort: PlaceSortOption;
  tripId?: string;
};

function buildBackendRegionsById(regionCodeTree: readonly BackendRegionCodeTree[] = []) {
  return Object.fromEntries(regionCodeTree.flatMap((region): [string, Region][] => {
    const regionId = resolveRegionIdForAreaCode(region.code);
    if (!regionId) return [];
    return [[regionId, {
      id: regionId,
      name: region.name,
      shortName: region.name.replace(/특별자치도|특별자치시|광역시|특별시/g, ""),
      description: `${region.name} 여행지`,
      spots: 0,
      weather: "",
      imageUrl: "",
    }]];
  }));
}

function locationSelectionFromOption(option: PlaceLocationFilterOption): PlaceLocationSelection {
  return {
    value: option.value,
    label: getPlaceLocationDisplayLabel(option) || option.description,
    regionId: option.regionId,
    district: option.district,
    ...(option.areaCode ? { areaCode: option.areaCode } : {}),
    ...(option.sigunguCode ? { sigunguCode: option.sigunguCode } : {}),
  };
}

export function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; origin?: string | string[] }>();
  const tripExploreContext = useMemo(
    () => resolveTripExploreContext(params.tripId, params.origin),
    [params.origin, params.tripId],
  );
  const returnToTrip = useCallback(() => {
    if (tripExploreContext) router.dismissTo(buildTripExploreReturnHref(tripExploreContext));
  }, [router, tripExploreContext]);
  const actions = usePlaceActions();
  const searchState = useExploreSearchStore();
  const syncActiveTripRegion = useExploreSearchStore((state) => state.syncActiveTripRegion);
  const upsertPlaces = useDuriStore((state) => state.upsertPlaces);
  const [filterOpen, setFilterOpen] = useState(false);
  const [regionSheetOpen, setRegionSheetOpen] = useState(false);
  const [regionSheetInitialQuery, setRegionSheetInitialQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [distanceBaseSheetOpen, setDistanceBaseSheetOpen] = useState(false);
  const [distanceBaseQuery, setDistanceBaseQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [regionSearchAttempted, setRegionSearchAttempted] = useState(false);
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<Place>>(null);

  const regionCodeTreeQuery = useQuery({
    queryKey: queryKeys.places.regionCodes(),
    queryFn: ({ signal }) => fetchBackendRegionCodeTree(signal),
    enabled: placeRepository.remoteEnabled,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
  const categoryCodeTreeQuery = useQuery({
    queryKey: queryKeys.places.categoryCodes(),
    queryFn: ({ signal }) => fetchBackendCategoryCodeTree(signal),
    enabled: placeRepository.remoteEnabled,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
  const classificationLookup = useMemo(
    () => buildClassificationLookup(categoryCodeTreeQuery.data ?? []),
    [categoryCodeTreeQuery.data],
  );
  const backendRegionsById = useMemo(
    () => buildBackendRegionsById(regionCodeTreeQuery.data ?? []),
    [regionCodeTreeQuery.data],
  );
  const regionAwareSource = useMemo(
    () => placeRepository.remoteEnabled
      ? { ...actions.source, regionsById: { ...backendRegionsById, ...actions.source.regionsById } }
      : actions.source,
    [actions.source, backendRegionsById],
  );
  const locationOptions = useMemo(
    () => buildPlaceLocationOptions(
      regionAwareSource.regionsById,
      placeRepository.remoteEnabled ? [] : Object.values(regionAwareSource.placesById),
      regionCodeTreeQuery.data ?? [],
    ),
    [regionAwareSource.placesById, regionAwareSource.regionsById, regionCodeTreeQuery.data],
  );

  useFocusEffect(useCallback(() => {
    if (!tripExploreContext || Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      returnToTrip();
      return true;
    });
    return () => subscription.remove();
  }, [returnToTrip, tripExploreContext]));

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
    const value = getPlaceLocationValue(searchState.selectedRegionId, searchState.selectedDistrict);
    const option = locationOptions.find((candidate) => candidate.value === value);
    const areaCode = option?.areaCode ?? resolveAreaCodeForRegion(searchState.selectedRegionId);
    return [{
      value,
      label: option?.description ?? option?.label ?? value,
      regionId: searchState.selectedRegionId,
      district: searchState.selectedDistrict,
      ...(areaCode ? { areaCode } : {}),
      ...(option?.sigunguCode ? { sigunguCode: option.sigunguCode } : {}),
    }];
  }, [locationOptions, searchState.selectedDistrict, searchState.selectedLocations, searchState.selectedRegionId]);
  const activeLocations = useMemo(() => requestLocations.map((location) => {
    const option = locationOptions.find((candidate) => candidate.value === location.value);
    return option ? locationSelectionFromOption(option) : location;
  }), [locationOptions, requestLocations]);
  const hasRegionContext = activeLocations.some((location) => location.regionId !== "all");
  const backendRegionScopes = useMemo<BackendRegionScope[]>(() => activeLocations.flatMap((location) => {
    if (location.regionId === "all") return [];
    const areaCode = location.areaCode ?? resolveAreaCodeForRegion(location.regionId);
    const regionQuery = areaCode ?? location.regionId;
    return [{
      key: location.value,
      label: location.label,
      regionId: location.regionId,
      district: location.district,
      regionQuery,
      ...(areaCode ? { areaCode } : {}),
      ...(location.sigunguCode ? { sigunguCode: location.sigunguCode } : {}),
    }];
  }), [activeLocations]);
  const normalizedDistanceBaseQuery = useMemo(() => normalizeSearchKeyword(distanceBaseQuery), [distanceBaseQuery]);
  const selectedClassifications = searchState.selectedClassifications;
  const selectedClassificationValues = selectedClassifications.map((selection) => selection.value).join("|");
  const festivalClassificationSelected = selectedClassifications.some((selection) => selection.lclsSystm1 === FESTIVAL_CLASSIFICATION_CODE);
  const backendSearchParams = useMemo(() => ({
    keyword: searchState.submittedKeyword,
    categories: NO_CATEGORY_FILTERS,
    classifications: selectedClassifications,
    regionScopes: backendRegionScopes.map((scope) => ({
      key: scope.key,
      regionQuery: scope.regionQuery,
      areaCode: scope.areaCode,
      sigunguCode: scope.sigunguCode,
      regionId: scope.regionId,
      district: scope.district,
    })),
    eventStartDate: festivalClassificationSelected ? searchState.eventStartDate : undefined,
    eventEndDate: festivalClassificationSelected ? searchState.eventEndDate : undefined,
    limit: BACKEND_PLACE_PAGE_SIZE,
  }), [backendRegionScopes, festivalClassificationSelected, searchState.eventEndDate, searchState.eventStartDate, searchState.submittedKeyword, selectedClassifications]);
  const backendPlacesQuery = useInfiniteQuery({
    queryKey: queryKeys.places.search(backendSearchParams),
    queryFn: async ({ signal, pageParam }) => {
      const page = Number(pageParam) || 1;
      const classificationFilters = backendSearchParams.classifications.length ? backendSearchParams.classifications : [undefined];
      const groups = await Promise.all(backendRegionScopes.flatMap((scope) => classificationFilters.map((classification) => classification?.lclsSystm1 === FESTIVAL_CLASSIFICATION_CODE
        ? searchBackendFestivalPage({ keyword: backendSearchParams.keyword, classification, regionId: scope.regionId, areaCode: scope.areaCode, sigunguCode: scope.sigunguCode, eventStartDate: backendSearchParams.eventStartDate, eventEndDate: backendSearchParams.eventEndDate, page, limit: backendSearchParams.limit, signal })
        : searchBackendRegionPlacePage(scope.regionQuery, { keyword: backendSearchParams.keyword, classification, sigunguCode: scope.sigunguCode, page, limit: backendSearchParams.limit, signal }))));
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
    enabled: placeRepository.remoteEnabled && hasRegionContext,
  });
  const backendPlaces = useMemo(
    () => dedupePlacesForDisplay(backendPlacesQuery.data?.pages.flatMap((page) => page.places) ?? [])
      .map((place) => enrichPlaceClassificationTags(place, classificationLookup)),
    [backendPlacesQuery.data, classificationLookup],
  );
  const backendPlacesById = useMemo(
    () => Object.fromEntries(backendPlaces.map((place) => [place.id, place])),
    [backendPlaces],
  );
  const backendDistanceBaseSearchParams = useMemo(() => ({
    mode: "distance-base",
    keyword: distanceBaseQuery.trim(),
    regionScopes: backendRegionScopes.map((scope) => ({
      key: scope.key,
      regionQuery: scope.regionQuery,
      sigunguCode: scope.sigunguCode,
    })),
    limit: 12,
  }), [backendRegionScopes, distanceBaseQuery]);
  const backendDistanceBaseSearchQuery = useQuery({
    queryKey: queryKeys.places.search(backendDistanceBaseSearchParams),
    queryFn: async ({ signal }) => {
      const groups = await Promise.all(backendRegionScopes.map((scope) => searchBackendRegionPlacePage(scope.regionQuery, { keyword: backendDistanceBaseSearchParams.keyword, sigunguCode: scope.sigunguCode, page: 1, limit: backendDistanceBaseSearchParams.limit, signal })));
      return dedupePlacesForDisplay(groups.flatMap((group) => group.places)).map((place) => enrichPlaceClassificationTags(place, classificationLookup));
    },
    enabled: placeRepository.remoteEnabled && distanceBaseSheetOpen && hasRegionContext && Boolean(normalizedDistanceBaseQuery),
  });
  const backendDistanceBasePlaces = useMemo(
    () => backendDistanceBaseSearchQuery.data ?? [],
    [backendDistanceBaseSearchQuery.data],
  );
  const backendDistanceBasePlacesById = useMemo(
    () => Object.fromEntries(backendDistanceBasePlaces.map((place) => [place.id, place])),
    [backendDistanceBasePlaces],
  );
  const source = useMemo(() => (
    placeRepository.remoteEnabled
      ? { ...regionAwareSource, placesById: { ...regionAwareSource.placesById, ...backendPlacesById, ...backendDistanceBasePlacesById } }
      : regionAwareSource
  ), [backendDistanceBasePlacesById, backendPlacesById, regionAwareSource]);

  useEffect(() => {
    const placesToUpsert = dedupePlacesForDisplay([...backendPlaces, ...backendDistanceBasePlaces]);
    if (placesToUpsert.length) upsertPlaces(placesToUpsert);
  }, [backendDistanceBasePlaces, backendPlaces, upsertPlaces]);

  const activeTrip = selectActiveCandidateTrip(source);
  const activeTripId = activeTrip?.id;
  const activeTripRegionId = activeTrip?.regionId;
  useEffect(() => {
    if (!tripExploreContext || activeTripId === tripExploreContext.tripId) return;
    const trip = source.tripsById[tripExploreContext.tripId];
    if (trip?.members.some((member) => member.userId === source.currentUserId) && trip.status !== "completed") actions.setActiveTrip(trip.id);
  }, [actions, activeTripId, source.currentUserId, source.tripsById, tripExploreContext]);
  useEffect(() => {
    if (!tripExploreContext || !activeTripId || !activeTripRegionId) return;
    syncActiveTripRegion(activeTripId, activeTripRegionId);
  }, [activeTripId, activeTripRegionId, syncActiveTripRegion, tripExploreContext]);

  const places = useMemo(
    () => placeRepository.remoteEnabled ? backendPlaces : Object.values(source.placesById),
    [backendPlaces, source.placesById],
  );
  const distanceReferencePlaces = useMemo(() => Object.values(source.placesById), [source.placesById]);
  const distanceBasePlace = searchState.distanceBasePlaceId ? source.placesById[searchState.distanceBasePlaceId] : undefined;
  const activeTripCandidatePlaces = useMemo(() => {
    if (!activeTrip) return [];
    const seen = new Set<string>();
    return (source.candidatesByTripId[activeTrip.id] ?? []).flatMap((candidate) => {
      if (seen.has(candidate.placeId)) return [];
      const place = source.placesById[candidate.placeId];
      if (!place) return [];
      seen.add(candidate.placeId);
      return [place];
    });
  }, [activeTrip, source.candidatesByTripId, source.placesById]);
  const sortablePlaces = useMemo(() => {
    if (!distanceBasePlace || places.some((place) => place.id === distanceBasePlace.id)) return places;
    return [...places, distanceBasePlace];
  }, [distanceBasePlace, places]);
  const savedIds = useMemo(() => new Set(source.savedPlaceIdsByUserId[source.currentUserId] ?? []), [source.currentUserId, source.savedPlaceIdsByUserId]);
  const classificationAvailabilityPlaces = useMemo(
    () => filterPlaces(Object.values(source.placesById), { keyword: searchState.submittedKeyword, regionId: placeRepository.remoteEnabled ? "all" : searchState.selectedRegionId, district: placeRepository.remoteEnabled ? "all" : searchState.selectedDistrict, locations: activeLocations, category: "all", categories: NO_CATEGORY_FILTERS }, source.regionsById),
    [activeLocations, source.placesById, source.regionsById, searchState.selectedDistrict, searchState.selectedRegionId, searchState.submittedKeyword],
  );
  const availableClassificationValues = useMemo(
    () => new Set(classificationAvailabilityPlaces.flatMap(getPlaceClassificationSelectionValues)),
    [classificationAvailabilityPlaces],
  );
  const pageScopeKey = useMemo(() => [
    searchState.submittedKeyword,
    activeLocations.map((location) => location.value).join("|"),
    searchState.eventStartDate ?? "",
    searchState.eventEndDate ?? "",
    selectedClassificationValues,
    searchState.sortOption,
    searchState.distanceBasePlaceId ?? "",
    searchState.distanceBaseLocation?.value ?? "",
  ].join("::"), [activeLocations, searchState.distanceBaseLocation?.value, searchState.distanceBasePlaceId, searchState.eventEndDate, searchState.eventStartDate, searchState.sortOption, searchState.submittedKeyword, selectedClassificationValues]);
  const sortedFilteredPlaces = useMemo(
    () => searchPlaces(sortablePlaces, { keyword: searchState.submittedKeyword, regionId: placeRepository.remoteEnabled ? "all" : searchState.selectedRegionId, district: placeRepository.remoteEnabled ? "all" : searchState.selectedDistrict, locations: placeRepository.remoteEnabled ? [] : activeLocations, category: "all", categories: NO_CATEGORY_FILTERS, classifications: selectedClassifications, eventStartDate: festivalClassificationSelected ? searchState.eventStartDate : undefined, eventEndDate: festivalClassificationSelected ? searchState.eventEndDate : undefined, sort: searchState.sortOption, distanceBasePlaceId: searchState.distanceBasePlaceId, distanceBaseLocation: searchState.distanceBaseLocation }, source.regionsById, savedIds),
    [source.regionsById, sortablePlaces, savedIds, activeLocations, festivalClassificationSelected, searchState.distanceBaseLocation, searchState.distanceBasePlaceId, searchState.eventEndDate, searchState.eventStartDate, searchState.selectedDistrict, searchState.selectedRegionId, searchState.sortOption, searchState.submittedKeyword, selectedClassifications],
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
  const distanceBaseMatches = useMemo(() => {
    if (!normalizedDistanceBaseQuery) return [];
    return dedupePlacesForDisplay([...backendDistanceBasePlaces, ...distanceReferencePlaces])
      .filter((place) => place.id !== searchState.distanceBasePlaceId)
      .filter((place) => normalizeSearchKeyword(`${place.name} ${place.address} ${place.category} ${place.tags.join(" ")}`).includes(normalizedDistanceBaseQuery))
      .slice(0, 8);
  }, [backendDistanceBasePlaces, distanceReferencePlaces, normalizedDistanceBaseQuery, searchState.distanceBasePlaceId]);
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
  const eventDateFilterActive = festivalClassificationSelected && Boolean(searchState.eventStartDate || searchState.eventEndDate);
  const eventDateFilterLabel = useMemo(() => {
    if (!eventDateFilterActive) return undefined;
    const format = (value?: string) => value?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1.$2.$3");
    const start = format(searchState.eventStartDate);
    const end = format(searchState.eventEndDate);
    return start && end && start !== end ? `행사일: ${start}~${end}` : `행사일: ${start ?? end}`;
  }, [eventDateFilterActive, searchState.eventEndDate, searchState.eventStartDate]);
  const hasFilters = Boolean(searchState.submittedKeyword || selectedClassifications.length || eventDateFilterActive);
  const activeFilterBadges = useMemo(() => {
    const badges: string[] = [];
    selectedClassifications.forEach((selection) => badges.push(selection.label));
    if (eventDateFilterLabel) badges.push(eventDateFilterLabel);
    return badges;
  }, [eventDateFilterLabel, selectedClassifications]);

  const goToPage = useCallback((page: number) => {
    const nextPage = Math.min(Math.max(page, 1), maxReachablePage);
    setPageState({ key: pageScopeKey, page: nextPage });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [maxReachablePage, pageScopeKey]);
  const draftKeyword = normalizeSearchKeyword(searchState.keyword);
  const placeSuggestions = useMemo<SearchSuggestion[]>(() => {
    if (!draftKeyword) return [];
    const submitted = normalizeSearchKeyword(searchState.submittedKeyword);
    const terms = new Map<string, SearchSuggestion>();
    const add = (value?: string) => {
      const label = value?.trim();
      if (!label) return;
      const key = normalizeSearchKeyword(label);
      if (key && key !== submitted && key.includes(draftKeyword) && !terms.has(`keyword:${key}`)) terms.set(`keyword:${key}`, { key: `keyword:${key}`, label, kind: "keyword" });
    };
    places.forEach((place) => {
      add(place.name);
    });
    return [...terms.values()].slice(0, 8);
  }, [draftKeyword, places, searchState.submittedKeyword]);
  const searchSuggestions = hasRegionContext ? placeSuggestions : [];
  const recentSearchMatches = useMemo(() => {
    if (!searchFocused || !hasRegionContext) return [];
    if (!draftKeyword) return recentSearches.slice(0, 6);
    return recentSearches.filter((term) => normalizeSearchKeyword(term).includes(draftKeyword)).slice(0, 4);
  }, [draftKeyword, hasRegionContext, recentSearches, searchFocused]);
  const showSearchDropdown = searchFocused && Boolean(recentSearchMatches.length || searchSuggestions.length);
  const filterActive = hasRegionContext && (hasFilters || searchState.keyword !== searchState.submittedKeyword);
  const openRegionSheet = (initialQuery = "") => {
    setSearchFocused(false);
    setSortMenuOpen(false);
    setRegionSheetInitialQuery(initialQuery);
    setRegionSheetOpen(true);
  };
  const submitSearch = (keyword = searchState.keyword) => {
    const normalized = keyword.trim();
    if (!hasRegionContext) {
      setRegionSearchAttempted(Boolean(normalized));
      openRegionSheet(normalized);
      return;
    }
    searchState.submitKeyword(normalized);
    rememberSearch(normalized);
    setRegionSearchAttempted(false);
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const applyRegionSelection = (locations: PlaceLocationSelection[]) => {
    const seenLocations = new Set<string>();
    const normalizedLocations = locations.filter((location) => location.regionId !== "all").filter((location) => {
      if (seenLocations.has(location.value)) return false;
      seenLocations.add(location.value);
      return true;
    });
    const primaryLocation = normalizedLocations[0];
    searchState.applyFilters({
      regionId: primaryLocation?.regionId ?? "all",
      district: primaryLocation?.district ?? "all",
      locations: normalizedLocations,
      category: "all",
      categories: NO_CATEGORY_FILTERS,
      classification: selectedClassifications[0],
      classifications: selectedClassifications,
      eventStartDate: festivalClassificationSelected ? searchState.eventStartDate : undefined,
      eventEndDate: festivalClassificationSelected ? searchState.eventEndDate : undefined,
      sort: searchState.sortOption,
      distanceBasePlaceId: searchState.distanceBasePlaceId,
      distanceBaseLocation: searchState.distanceBaseLocation,
    });
    if (normalizedLocations.length && !tripExploreContext) {
      actions.clearActiveTrip();
      searchState.clearActiveTripContext();
    }
    searchState.submitKeyword("");
    setRegionSearchAttempted(false);
    setSearchFocused(false);
    setRegionSheetOpen(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const applySuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.kind === "region" && suggestion.location) {
      searchState.applyFilters({ regionId: suggestion.location.regionId, district: suggestion.location.district, locations: [suggestion.location], category: "all", categories: NO_CATEGORY_FILTERS, classification: selectedClassifications[0], classifications: selectedClassifications, eventStartDate: festivalClassificationSelected ? searchState.eventStartDate : undefined, eventEndDate: festivalClassificationSelected ? searchState.eventEndDate : undefined, sort: searchState.sortOption, distanceBasePlaceId: searchState.distanceBasePlaceId, distanceBaseLocation: searchState.distanceBaseLocation });
      rememberSearch(suggestion.label);
      searchState.submitKeyword("");
      setRegionSearchAttempted(false);
      setSearchFocused(false);
      setPageState({ key: "", page: 1 });
      return;
    }
    submitSearch(suggestion.label);
  };
  const resetFilters = () => {
    const primaryLocation = activeLocations[0];
    searchState.applyFilters({
      regionId: primaryLocation?.regionId ?? "all",
      district: primaryLocation?.district ?? "all",
      locations: activeLocations,
      category: "all",
      categories: [],
      classification: undefined,
      classifications: [],
      sort: searchState.sortOption,
      distanceBasePlaceId: searchState.distanceBasePlaceId,
      distanceBaseLocation: searchState.distanceBaseLocation,
    });
    searchState.submitKeyword("");
    setRegionSearchAttempted(false);
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const clearActiveTripSelection = () => {
    actions.clearActiveTrip();
    searchState.clearActiveTripContext();
    setRegionSearchAttempted(false);
    setSearchFocused(false);
    setSortMenuOpen(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const openDistanceBaseSheet = () => {
    setSearchFocused(false);
    setSortMenuOpen(false);
    setDistanceBaseQuery("");
    setDistanceBaseSheetOpen(true);
  };
  const changeSort = (sort: PlaceSortOption) => {
    setSortMenuOpen(false);
    if (sort === "distance") {
      if (searchState.distanceBasePlaceId || searchState.distanceBaseLocation) searchState.setSort("distance");
      openDistanceBaseSheet();
      return;
    }
    if (sort === searchState.sortOption) return;
    searchState.setSort(sort);
    setSearchFocused(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const selectDistanceBasePlace = (placeId: string) => {
    searchState.setDistanceBasePlace(placeId);
    searchState.setSort("distance");
    setDistanceBaseQuery("");
    setSearchFocused(false);
    setSortMenuOpen(false);
    setDistanceBaseSheetOpen(false);
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const changeDistanceBaseQuery = (value: string) => {
    setDistanceBaseQuery(value);
    setSearchFocused(false);
    setSortMenuOpen(false);
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
    setRegionSearchAttempted(false);
    searchState.setKeyword(value);
  };
  const openFilterSheet = () => {
    setSearchFocused(false);
    setSortMenuOpen(false);
    setFilterOpen(true);
  };
  const applyExploreFilters = (input: ExploreFilterApplyInput) => {
    const selectedTrip = input.tripId ? source.tripsById[input.tripId] : undefined;
    const tripLocations = selectedTrip
      ? locationOptions
        .filter((option) => option.level === "province" && option.regionId === selectedTrip.regionId)
        .slice(0, 1)
        .map(locationSelectionFromOption)
      : undefined;
    const nextLocations = tripLocations?.length ? tripLocations : activeLocations;
    const primaryLocation = nextLocations[0];
    searchState.applyFilters({
      regionId: primaryLocation?.regionId ?? "all",
      district: primaryLocation?.district ?? "all",
      locations: nextLocations,
      category: input.category,
      categories: input.categories,
      classification: input.classification,
      classifications: input.classifications,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
      sort: input.sort,
      distanceBasePlaceId: searchState.distanceBasePlaceId,
      distanceBaseLocation: searchState.distanceBaseLocation,
    });
    if (input.tripId) actions.setActiveTrip(input.tripId);
    else {
      actions.clearActiveTrip();
      searchState.clearActiveTripContext();
    }
    searchState.submitKeyword();
    setPageState({ key: "", page: 1 });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const activeRegionLabel = activeLocations.length === 1
    ? getPlaceLocationDisplayLabel(activeLocations[0]) || activeLocations[0]?.label || ""
    : activeLocations.length > 1
      ? `${getPlaceLocationDisplayLabel(activeLocations[0]) || activeLocations[0]?.label || "선택 지역"} 외 ${activeLocations.length - 1}곳`
      : "";
  const searchPlaceholder = hasRegionContext
    ? `${activeRegionLabel || "선택 지역"} 내의 여행지를 검색해보세요`
    : "여행할 지역을 검색해주세요";
  const initialPromptTitle = regionSearchAttempted ? "일치하는 지역이 없어요" : "어디로 떠나볼까요?";
  const initialPromptDescription = regionSearchAttempted
    ? "상단 검색창에 시도/시군구 이름을 다시 입력하거나, 지역 목록에서 직접 골라보세요."
    : "상단 검색창에 지역명을 입력하거나 아래 버튼을 눌러 시도/시군구를 먼저 선택해 주세요.";
  const initialPromptCtaLabel = regionSearchAttempted ? "지역 목록에서 선택하기" : "지역 선택하기";

  if (!placeRepository.available) return <Screen><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></Screen>;
  if (source.currentUserId && !source.usersById[source.currentUserId]) return <Screen><ErrorState message="현재 사용자 정보를 찾을 수 없어 저장과 후보 관계를 불러오지 못했어요." /></Screen>;

  const listEmptyComponent = placeRepository.remoteEnabled && backendPlacesQuery.isLoading
    ? <LoadingState label={`${activeRegionLabel || "선택 지역"} 여행지를 불러오는 중이에요.`} />
    : placeRepository.remoteEnabled && backendPlacesQuery.isError
      ? <ErrorState message={backendPlacesQuery.error instanceof Error ? backendPlacesQuery.error.message : "백엔드 장소 데이터를 불러오지 못했어요."} onRetry={() => { void backendPlacesQuery.refetch(); }} />
      : <EmptyState title="검색 결과가 없어요" description="검색어나 지역, 카테고리 조건을 바꿔 다시 찾아보세요." ctaLabel="조건 초기화" onPress={resetFilters} />;

  const searchHeader = <View style={styles.fixedSearchHeader}>
    <View style={[styles.searchRow, showSearchDropdown && styles.searchRowDropdownOpen]}>
      <View style={styles.searchGroup}>
        <PlaceSearchInput value={searchState.keyword} onFocus={handleSearchFocus} onBlur={handleSearchBlur} onChangeText={changeKeyword} onClear={() => changeKeyword("")} onSearch={() => submitSearch()} expanded={showSearchDropdown} placeholder={searchPlaceholder} />
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
    {hasRegionContext ? <View style={[styles.appliedFilterToolbarRow, showSearchDropdown && styles.filterToolbarRowDropdownOpen]}>
      <Pressable accessibilityRole="button" accessibilityLabel="검색 필터 열기" accessibilityState={{ selected: filterActive }} onPress={openFilterSheet} style={[styles.filterToolbarButton, filterActive && styles.filterToolbarButtonActive]}><FilterButtonIcon /></Pressable>
      {activeFilterBadges.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterToolbarChips} contentContainerStyle={styles.filterBadgeRow}>
        {activeFilterBadges.map((badge) => <Pressable key={badge} accessibilityRole="button" accessibilityLabel={`${badge} 필터 수정`} onPress={openFilterSheet} style={styles.filterBadge}><Text numberOfLines={1} style={styles.filterBadgeText}>{badge}</Text></Pressable>)}
      </ScrollView> : <View style={styles.filterToolbarSpacer} />}
      {hasFilters ? <Pressable accessibilityRole="button" accessibilityLabel="검색 조건 초기화" onPress={resetFilters} style={styles.inlineReset}><Text style={styles.inlineResetText}>초기화</Text></Pressable> : null}
    </View> : null}
  </View>;

  const resultsHeader = <View style={styles.header}>
    {activeTrip ? <ActiveTripBanner trip={activeTrip} region={source.regionsById[activeTrip.regionId]} onClear={clearActiveTripSelection} /> : null}
    <View style={styles.resultRow}><View style={styles.resultCopy}><Pressable accessibilityRole="button" accessibilityLabel={`${activeRegionLabel || "선택 지역"} 지역 변경`} onPress={() => openRegionSheet()} style={styles.resultRegionButton}><Text numberOfLines={1} style={styles.resultTitle}>{activeRegionLabel || "선택 지역"} 여행지</Text><SymbolView name={{ ios: "chevron.down", android: "keyboard_arrow_down", web: "keyboard_arrow_down" }} tintColor={colors.primary} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.resultRegionChevron} /></Pressable><Text style={styles.resultCount}>{resultCountText}</Text></View><View style={styles.resultActions}><ExploreSortDropdown value={searchState.sortOption} open={sortMenuOpen} onToggle={() => { setSearchFocused(false); setSortMenuOpen((open) => !open); }} onChange={changeSort} /></View></View>
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

  if (!hasRegionContext) {
    return <Screen scroll={false}>
      {tripExploreContext ? <AppHeader title="장소 더 찾기" onBack={returnToTrip} /> : null}
      {searchHeader}
      <View style={styles.initialPrompt}>
        <Text style={styles.initialPromptTitle}>{initialPromptTitle}</Text>
        <Text style={styles.initialPromptDescription}>{initialPromptDescription}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="탐색 지역 선택" onPress={() => openRegionSheet()} style={styles.initialPromptButton}>
          <SymbolView name={{ ios: "mappin.circle.fill", android: "location_on", web: "location_on" }} tintColor={colors.white} size={20} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.initialPromptButtonIcon} />
          <Text style={styles.initialPromptButtonText}>{initialPromptCtaLabel}</Text>
        </Pressable>
      </View>
      <RegionSelectionSheet visible={regionSheetOpen} locationOptions={locationOptions} selectedLocations={activeLocations} initialQuery={regionSheetInitialQuery} onApply={applyRegionSelection} onClose={() => setRegionSheetOpen(false)} />
      {actions.memberGatePrompt}
    </Screen>;
  }

  return <Screen scroll={false}>
    {tripExploreContext ? <AppHeader title="장소 더 찾기" onBack={returnToTrip} /> : null}
    {searchHeader}<FlatList
    ref={listRef}
    style={styles.listFrame}
    data={pagedPlaces}
    keyExtractor={(place) => place.id}
    keyboardShouldPersistTaps="handled"
    onScrollBeginDrag={() => { setSearchFocused(false); setSortMenuOpen(false); }}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.list}
    extraData={`${sortMenuOpen}-${searchState.sortOption}-${selectedClassificationValues}-${activeFilterBadges.join("|")}-${distanceBaseLabel ?? ""}`}
    ItemSeparatorComponent={() => <View style={styles.gap} />}
    ListHeaderComponent={resultsHeader}
    ListFooterComponent={pagination}
    ListEmptyComponent={listEmptyComponent}
    renderItem={({ item }) => {
      const viewModel = cardsById[item.id];
      return viewModel ? <PlaceCard viewModel={viewModel} distanceProximityLabel={distanceProximityById[item.id]} onPress={() => { setSearchFocused(false); router.push(buildPlaceDetailHref(item.id, tripExploreContext)); }} onToggleSaved={() => { setSearchFocused(false); actions.toggleSaved(item.id); }} onAddCandidate={() => { setSearchFocused(false); actions.requestCandidate(item.id); }} /> : null;
    }}
  />
  <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
  <RegionSelectionSheet visible={regionSheetOpen} locationOptions={locationOptions} selectedLocations={activeLocations} initialQuery={regionSheetInitialQuery} onApply={applyRegionSelection} onClose={() => setRegionSheetOpen(false)} />
  <ExploreFilterSheet visible={filterOpen} categoryTree={categoryCodeTreeQuery.data ?? []} selectedClassifications={selectedClassifications} availableClassificationValues={availableClassificationValues} categoryTreeLoading={categoryCodeTreeQuery.isFetching && !categoryCodeTreeQuery.data} selectedEventStartDate={searchState.eventStartDate} selectedEventEndDate={searchState.eventEndDate} sortOption={searchState.sortOption} trips={actions.eligibleTrips} regionsById={source.regionsById} activeTripId={source.activeTripId} onApply={applyExploreFilters} onReset={resetFilters} onClose={() => setFilterOpen(false)} />
  <DistanceBasePlaceSheet visible={distanceBaseSheetOpen} query={distanceBaseQuery} selectedPlace={distanceBasePlace} candidatePlaces={activeTripCandidatePlaces} searchResults={distanceBaseMatches} searchLoading={backendDistanceBaseSearchQuery.isFetching && Boolean(normalizedDistanceBaseQuery)} activeTripTitle={activeTrip?.title} onQueryChange={changeDistanceBaseQuery} onSelect={selectDistanceBasePlace} onClear={clearDistanceBase} onClose={() => setDistanceBaseSheetOpen(false)} />
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

function DistanceBasePlaceSheet({
  visible,
  query,
  selectedPlace,
  candidatePlaces,
  searchResults,
  searchLoading,
  activeTripTitle,
  onQueryChange,
  onSelect,
  onClear,
  onClose,
}: {
  visible: boolean;
  query: string;
  selectedPlace?: Place;
  candidatePlaces: readonly Place[];
  searchResults: readonly Place[];
  searchLoading: boolean;
  activeTripTitle?: string;
  onQueryChange(value: string): void;
  onSelect(placeId: string): void;
  onClear(): void;
  onClose(): void;
}) {
  if (!visible) return null;
  const normalizedQuery = normalizeSearchKeyword(query);
  const candidateResults = candidatePlaces.filter((place) => place.id !== selectedPlace?.id).slice(0, 8);

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.distanceSheetOverlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="거리 기준 관광지 선택 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.distanceSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.distanceSheetHeading}>
          <View style={styles.flex}>
            <Text style={styles.distanceSheetTitle}>거리 기준 관광지</Text>
            <Text style={styles.distanceSheetSubtitle}>가까운 여행지부터 보려면 출발점이 될 장소를 골라주세요.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="거리 기준 관광지 선택 닫기" onPress={onClose} style={styles.distanceSheetClose}><Text style={styles.distanceSheetCloseText}>×</Text></Pressable>
        </View>
        <View style={styles.distanceBaseInputWrap}>
          <TextInput accessibilityLabel="거리 기준 관광지 검색" value={query} onChangeText={onQueryChange} placeholder="기준 관광지를 검색해보세요" placeholderTextColor={colors.textMuted} returnKeyType="search" autoCorrect={false} style={styles.distanceBaseInput} />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="거리 기준 관광지 검색어 지우기" onPress={() => onQueryChange("")} style={styles.distanceBaseClear}><Text style={styles.distanceBaseClearText}>×</Text></Pressable> : null}
        </View>
        {selectedPlace ? <View style={styles.distanceSelectedCard}>
          <View style={styles.flex}>
            <Text style={styles.distanceSelectedEyebrow}>현재 기준</Text>
            <Text numberOfLines={1} style={styles.distanceSelectedTitle}>{selectedPlace.name}</Text>
            <Text numberOfLines={1} style={styles.distanceSelectedMeta}>{selectedPlace.address}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="거리 기준 관광지 해제" onPress={onClear} style={styles.distanceSelectedClear}><Text style={styles.distanceSelectedClearText}>해제</Text></Pressable>
        </View> : null}
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.distanceSheetList} contentContainerStyle={styles.distanceSheetListContent}>
          {normalizedQuery ? <View style={styles.distanceSheetSection}>
            <Text style={styles.distanceSheetSectionTitle}>검색 결과</Text>
            {searchLoading ? <Text style={styles.distanceSheetEmpty}>관광지를 찾는 중이에요.</Text> : searchResults.length ? searchResults.map((place) => <DistanceBasePlaceRow key={`search:${place.id}`} place={place} selected={place.id === selectedPlace?.id} onSelect={onSelect} />) : <Text style={styles.distanceSheetEmpty}>일치하는 관광지가 없어요.</Text>}
          </View> : null}
          <View style={styles.distanceSheetSection}>
            <Text style={styles.distanceSheetSectionTitle}>{activeTripTitle ? `${activeTripTitle} 후보` : "여행방 후보"}</Text>
            {candidateResults.length ? candidateResults.map((place) => <DistanceBasePlaceRow key={`candidate:${place.id}`} place={place} selected={place.id === selectedPlace?.id} onSelect={onSelect} />) : <Text style={styles.distanceSheetEmpty}>{activeTripTitle ? "이 여행방에 담긴 후보 장소가 아직 없어요." : "후보를 담을 여행방을 선택하면 그 방의 장소도 바로 고를 수 있어요."}</Text>}
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

function DistanceBasePlaceRow({ place, selected, onSelect }: { place: Place; selected: boolean; onSelect(placeId: string): void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${place.name} 거리 기준으로 선택`} onPress={() => onSelect(place.id)} style={({ pressed }) => [styles.distancePlaceRow, selected && styles.distancePlaceRowSelected, pressed && styles.pressed]}>
    <View style={styles.flex}>
      <Text numberOfLines={1} style={[styles.distancePlaceTitle, selected && styles.distancePlaceTitleSelected]}>{place.name}</Text>
      <Text numberOfLines={1} style={[styles.distancePlaceMeta, selected && styles.distancePlaceMetaSelected]}>{place.category} · {place.address}</Text>
    </View>
    <Text style={[styles.distancePlaceAction, selected && styles.distancePlaceActionSelected]}>{selected ? "기준" : "선택"}</Text>
  </Pressable>;
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
  fixedSearchHeader: { position: "relative", zIndex: 200, gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.background },
  listFrame: { flex: 1, zIndex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.82 },
  list: { paddingTop: spacing.xs, paddingBottom: spacing.xxxl },
  header: { zIndex: 90, elevation: 30, gap: spacing.sm, marginBottom: spacing.lg },
  initialPrompt: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  initialPromptTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  initialPromptDescription: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  initialPromptButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary, ...shadows.card },
  initialPromptButtonIcon: { width: 20, height: 20 },
  initialPromptButtonText: { ...typography.bodyStrong, color: colors.white },
  gap: { height: spacing.md },
  searchRow: { position: "relative", zIndex: 20, minHeight: 52 },
  searchRowDropdownOpen: { zIndex: 180 },
  searchGroup: { zIndex: 1, minHeight: 52, position: "relative" },
  searchDropdown: { position: "absolute", top: 51, left: 0, right: 0, zIndex: 220, maxHeight: 320, overflow: "hidden", borderWidth: 1, borderTopWidth: 0, borderColor: colors.borderStrong, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, backgroundColor: colors.surface, ...shadows.floating },
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
  sheetHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  distanceSheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  distanceSheet: { height: "80%", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.background, ...shadows.floating },
  distanceSheetHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  distanceSheetTitle: { ...typography.subtitle, color: colors.text },
  distanceSheetSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  distanceSheetClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface },
  distanceSheetCloseText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.textSecondary },
  distanceSelectedCard: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  distanceSelectedEyebrow: { ...typography.caption, color: colors.primary },
  distanceSelectedTitle: { ...typography.bodyStrong, color: colors.text },
  distanceSelectedMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  distanceSelectedClear: { minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface },
  distanceSelectedClearText: { ...typography.caption, color: colors.primary },
  distanceSheetList: { flex: 1, minHeight: 0 },
  distanceSheetListContent: { gap: spacing.md, paddingBottom: spacing.lg },
  distanceSheetSection: { gap: spacing.xs },
  distanceSheetSectionTitle: { ...typography.bodyStrong, color: colors.text },
  distanceSheetEmpty: { ...typography.caption, color: colors.textSecondary, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  distancePlaceRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distancePlaceRowSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  distancePlaceTitle: { ...typography.bodyStrong, color: colors.text },
  distancePlaceTitleSelected: { color: colors.white },
  distancePlaceMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  distancePlaceMetaSelected: { color: colors.primarySoft },
  distancePlaceAction: { ...typography.caption, color: colors.primary },
  distancePlaceActionSelected: { color: colors.white },
  distanceBasePanel: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distanceBaseSelected: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  distanceBaseEyebrow: { ...typography.caption, color: colors.primary },
  distanceBaseText: { ...typography.bodyStrong, color: colors.text },
  distanceBaseInputWrap: { minHeight: 44, flexDirection: "row", alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.background, overflow: "hidden" },
  distanceBaseClear: { width: 42, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  distanceBaseClearText: { fontSize: 22, lineHeight: 24, textAlign: "center", color: colors.primary },
  distanceBaseInput: { flex: 1, height: 42, paddingHorizontal: spacing.sm, paddingTop: 10, paddingBottom: 10, textAlignVertical: "center", ...typography.body, color: colors.text },
  distanceBaseResults: { overflow: "hidden", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distanceBaseResult: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  distanceBaseResultTitle: { ...typography.bodyStrong, color: colors.text },
  distanceBaseResultMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  distanceBaseEmpty: { ...typography.caption, color: colors.textSecondary, padding: spacing.sm },
  linkText: { ...typography.caption, color: colors.primary },
  filterToolbarRowDropdownOpen: { zIndex: 10 },
  appliedFilterToolbarRow: { position: "relative", zIndex: 80, minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filterToolbarButton: { flexShrink: 0, width: 42, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary, ...shadows.card },
  filterToolbarButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterButtonIcon: { width: 18, height: 18 },
  filterToolbarChips: { flex: 1, minWidth: 0 },
  filterToolbarSpacer: { flex: 1 },
  filterBadgeRow: { alignItems: "center", gap: spacing.xs, paddingRight: spacing.sm },
  categoryFilterBadge: { minHeight: 34, maxWidth: 168, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingLeft: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  categoryFilterText: { ...typography.caption, color: colors.primary },
  categoryFilterRemove: { minWidth: 18, fontSize: 18, lineHeight: 20, textAlign: "center", color: colors.primary },
  filterBadge: { minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  filterBadgeText: { ...typography.caption, color: colors.textSecondary },
  inlineReset: { flexShrink: 0, minHeight: 34, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  inlineResetText: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  resultRow: { zIndex: 100, elevation: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  resultCopy: { flex: 1, minWidth: 0 },
  resultRegionButton: { maxWidth: "100%", minHeight: 30, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: spacing.xs },
  resultRegionChevron: { flexShrink: 0, width: 18, height: 18 },
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
