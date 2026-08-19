import type { EntityId, ISODateString, TimeString } from "./user";

export type ItineraryItemType = "place" | "meal" | "rest" | "transport" | "reservation";

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
  /** 사용자가 직접 편집할 수는 있지만, 두리 제안은 이 일정을 변경할 수 없다. */
  lockedForDuri?: boolean;
};
