import type { EntityId } from "../../domain";

export type PlaceCategoryFilter = "all" | string;
export type PlaceSortOption = "default" | "name" | "saved-first";
export type ExploreViewMode = "list" | "map";
export type PlaceCandidateState = "not-added" | "candidate" | "scheduled";

export interface PlaceSearchParams {
  keyword: string;
  regionId: EntityId | "all";
  category: PlaceCategoryFilter;
  sort: PlaceSortOption;
}

export interface PlaceCardViewModel {
  id: EntityId;
  name: string;
  imageUrl?: string;
  address: string;
  summary: string;
  regionName: string;
  categoryLabel: string;
  tags: string[];
  hiddenTagCount: number;
  rating?: number;
  distanceLabel?: string;
  isSaved: boolean;
  candidateTripIds: EntityId[];
  activeTripCandidateState: PlaceCandidateState;
}

export type PlaceActionFeedback = {
  message: string;
  tripId?: EntityId;
};

