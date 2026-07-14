import { create } from "zustand";
import type { EntityId } from "../../../domain";
import type { ExploreViewMode, PlaceSortOption } from "../../places/types";

interface ExploreSearchState {
  keyword: string;
  selectedRegionId: EntityId | "all";
  selectedCategory: string | "all";
  sortOption: PlaceSortOption;
  viewMode: ExploreViewMode;
  setKeyword(value: string): void;
  setRegion(regionId: EntityId | "all"): void;
  setCategory(category: string | "all"): void;
  setSort(sort: PlaceSortOption): void;
  setViewMode(mode: ExploreViewMode): void;
  startTripExplore(regionId: EntityId): void;
  resetFilters(): void;
}

export const useExploreSearchStore = create<ExploreSearchState>((set) => ({
  keyword: "",
  selectedRegionId: "all",
  selectedCategory: "all",
  sortOption: "default",
  viewMode: "list",
  setKeyword: (keyword) => set({ keyword }),
  setRegion: (selectedRegionId) => set({ selectedRegionId }),
  setCategory: (selectedCategory) => set({ selectedCategory }),
  setSort: (sortOption) => set({ sortOption }),
  setViewMode: (viewMode) => set({ viewMode }),
  startTripExplore: (selectedRegionId) => set({ selectedRegionId, selectedCategory: "all", keyword: "", viewMode: "list" }),
  resetFilters: () => set({ keyword: "", selectedRegionId: "all", selectedCategory: "all", sortOption: "default" }),
}));

