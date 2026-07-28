import { create } from "zustand";
import type { EntityId } from "../../../domain";
import type { PlaceLocationSelection, PlaceSortOption } from "../../places/types";

interface ExploreSearchState {
  keyword: string;
  submittedKeyword: string;
  activeTripRegionContext?: { tripId: EntityId; regionId: EntityId };
  selectedRegionId: EntityId | "all";
  selectedDistrict: string | "all";
  selectedLocations: PlaceLocationSelection[];
  selectedCategory: string | "all";
  selectedCategories: string[];
  eventStartDate?: string;
  eventEndDate?: string;
  sortOption: PlaceSortOption;
  distanceBasePlaceId?: EntityId;
  distanceBaseLocation?: PlaceLocationSelection;
  setKeyword(value: string): void;
  submitKeyword(value?: string): void;
  setRegion(regionId: EntityId | "all"): void;
  setDistrict(district: string | "all"): void;
  setLocations(locations: PlaceLocationSelection[]): void;
  setCategory(category: string | "all"): void;
  setCategories(categories: string[]): void;
  setEventDateRange(startDate?: string, endDate?: string): void;
  setSort(sort: PlaceSortOption): void;
  setDistanceBasePlace(placeId?: EntityId): void;
  setDistanceBaseLocation(location?: PlaceLocationSelection): void;
  applyFilters(input: {
    regionId: EntityId | "all";
    district: string | "all";
    locations?: PlaceLocationSelection[];
    category: string | "all";
    categories?: string[];
    eventStartDate?: string;
    eventEndDate?: string;
    sort: PlaceSortOption;
    distanceBasePlaceId?: EntityId;
    distanceBaseLocation?: PlaceLocationSelection;
  }): void;
  syncActiveTripRegion(tripId: EntityId, regionId: EntityId): void;
  clearActiveTripContext(): void;
  startTripExplore(regionId: EntityId): void;
  resetFilters(): void;
}

export const useExploreSearchStore = create<ExploreSearchState>((set) => ({
  keyword: "",
  submittedKeyword: "",
  activeTripRegionContext: undefined,
  selectedRegionId: "all",
  selectedDistrict: "all",
  selectedLocations: [],
  selectedCategory: "all",
  selectedCategories: [],
  eventStartDate: undefined,
  eventEndDate: undefined,
  sortOption: "popular",
  setKeyword: (keyword) => set({ keyword }),
  submitKeyword: (value) => set((state) => ({ keyword: value ?? state.keyword, submittedKeyword: value ?? state.keyword })),
  setRegion: (selectedRegionId) => set({ selectedRegionId, selectedDistrict: "all", selectedLocations: [] }),
  setDistrict: (selectedDistrict) => set({ selectedDistrict, selectedLocations: [] }),
  setLocations: (selectedLocations) => set({
    selectedLocations,
    selectedRegionId: selectedLocations[0]?.regionId ?? "all",
    selectedDistrict: selectedLocations[0]?.district ?? "all",
  }),
  setCategory: (selectedCategory) => set({ selectedCategory, selectedCategories: selectedCategory === "all" ? [] : [selectedCategory] }),
  setCategories: (selectedCategories) => set({ selectedCategories, selectedCategory: selectedCategories[0] ?? "all" }),
  setEventDateRange: (eventStartDate, eventEndDate) => set({ eventStartDate, eventEndDate }),
  setSort: (sortOption) => set({ sortOption }),
  setDistanceBasePlace: (distanceBasePlaceId) => set({ distanceBasePlaceId, distanceBaseLocation: undefined }),
  setDistanceBaseLocation: (distanceBaseLocation) => set({ distanceBaseLocation, distanceBasePlaceId: undefined }),
  applyFilters: ({ regionId, district, locations = [], category, categories, eventStartDate, eventEndDate, sort, distanceBasePlaceId, distanceBaseLocation }) => {
    const selectedCategories = categories?.length ? categories : category === "all" ? [] : [category];
    return set({
    selectedRegionId: locations[0]?.regionId ?? regionId,
    selectedDistrict: locations[0]?.district ?? district,
    selectedLocations: locations,
    selectedCategory: selectedCategories[0] ?? "all",
    selectedCategories,
    eventStartDate,
    eventEndDate,
    sortOption: sort,
    distanceBasePlaceId,
    distanceBaseLocation,
    });
  },
  syncActiveTripRegion: (tripId, regionId) => set((state) => {
    const previousRegionId = state.activeTripRegionContext?.regionId;
    if (state.activeTripRegionContext?.tripId === tripId && previousRegionId === regionId) return state;
    const shouldUseTripRegion = state.selectedRegionId === "all" || state.selectedRegionId === previousRegionId;
    return {
      activeTripRegionContext: { tripId, regionId },
      ...(shouldUseTripRegion
        ? { selectedRegionId: regionId, selectedDistrict: "all" as const, selectedLocations: [], distanceBasePlaceId: undefined, distanceBaseLocation: undefined }
        : {}),
    };
  }),
  clearActiveTripContext: () => set({ activeTripRegionContext: undefined }),
  startTripExplore: (selectedRegionId) => set({ selectedRegionId, selectedDistrict: "all", selectedLocations: [], selectedCategory: "all", selectedCategories: [], eventStartDate: undefined, eventEndDate: undefined, keyword: "", submittedKeyword: "", distanceBasePlaceId: undefined, distanceBaseLocation: undefined }),
  resetFilters: () => set({ keyword: "", submittedKeyword: "", selectedRegionId: "all", selectedDistrict: "all", selectedLocations: [], selectedCategory: "all", selectedCategories: [], eventStartDate: undefined, eventEndDate: undefined, sortOption: "popular", distanceBasePlaceId: undefined, distanceBaseLocation: undefined }),
}));

