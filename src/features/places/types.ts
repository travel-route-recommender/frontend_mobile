import type { EntityId } from "../../domain";
import type { PlaceClassificationSelection } from "./logic/placeClassification";

export type PlaceCategoryFilter = "all" | string;
export type PlaceSortOption = "popular" | "rating" | "distance" | "default" | "name" | "saved-first";
export type PlaceCandidateState = "not-added" | "candidate" | "scheduled";
export type PlaceLocationSelection = {
  value: string;
  label: string;
  regionId: EntityId | "all";
  district: string | "all";
  areaCode?: string;
  sigunguCode?: string;
};

export interface PlaceSearchParams {
  keyword: string;
  regionId: EntityId | "all";
  district?: string | "all";
  locations?: readonly PlaceLocationSelection[];
  category: PlaceCategoryFilter;
  categories?: readonly string[];
  classification?: PlaceClassificationSelection;
  classifications?: readonly PlaceClassificationSelection[];
  sort: PlaceSortOption;
  eventStartDate?: string;
  eventEndDate?: string;
  distanceBasePlaceId?: EntityId;
  distanceBaseLocation?: PlaceLocationSelection;
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
