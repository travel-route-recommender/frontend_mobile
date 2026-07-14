import type { EntityId } from "./user";

export type Region = {
  id: EntityId;
  name: string;
  shortName: string;
  description: string;
  spots: number;
  weather: string;
  imageUrl: string;
};

export type Place = {
  id: EntityId;
  regionId: EntityId;
  name: string;
  category: string;
  tags: string[];
  rating: number;
  distanceLabel: string;
  imageUrl: string;
  address: string;
  summary: string;
};
