import type { EntityId, ISODateString, TimeString } from "./user";

export type ItineraryItemType = "place" | "meal" | "rest" | "transport";

export type ItineraryItem = {
  id: EntityId;
  tripId: EntityId;
  placeId?: EntityId;
  date: ISODateString;
  startTime: TimeString;
  durationMinutes: number;
  itemType: ItineraryItemType;
  preferredByUserIds: EntityId[];
  note?: string;
};
