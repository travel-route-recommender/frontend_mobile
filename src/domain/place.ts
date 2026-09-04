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

export type PlaceClassification = {
  lclsSystm1?: string;
  lclsSystm1Name?: string;
  lclsSystm2?: string;
  lclsSystm2Name?: string;
  lclsSystm3?: string;
  lclsSystm3Name?: string;
};

export type PlaceInfoItem = {
  label: string;
  value: string;
  tag?: string;
};

export type Place = {
  id: EntityId;
  /** API 장소의 원본 식별자. 화면용 id와 서버 저장용 id를 섞지 않는다. */
  externalId?: string;
  backendPlaceId?: string;
  source?: "tour" | "kakao" | "manual";
  regionId: EntityId;
  name: string;
  category: string;
  contentTypeId?: number;
  classification?: PlaceClassification;
  infoItems?: PlaceInfoItem[];
  tags: string[];
  rating?: number;
  distanceLabel: string;
  latitude?: number;
  longitude?: number;
  eventStartDate?: string;
  eventEndDate?: string;
  imageUrl: string;
  address: string;
  summary: string;
};
