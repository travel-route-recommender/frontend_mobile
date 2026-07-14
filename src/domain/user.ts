export type EntityId = string;
export type ISODateString = string;
export type TimeString = string;

export type User = {
  id: EntityId;
  name: string;
  initial: string;
  profileImageUrl?: string;
};
