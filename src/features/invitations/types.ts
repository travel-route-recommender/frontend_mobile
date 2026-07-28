import type { EntityId, TripRoom } from "../../domain";

export type TripInviteLinkStatus = "active" | "disabled";

export interface TripInviteLinkRecord {
  tripId: EntityId;
  code: string;
  revision: number;
  status: TripInviteLinkStatus;
}

export type TripInviteRouteInput = {
  code: string;
  tripId?: EntityId;
  revision?: string | number;
};

export type TripInviteResolution =
  | {
      status: "success";
      trip: TripRoom;
      record: TripInviteLinkRecord;
    }
  | {
      status: "invalid" | "disabled" | "stale" | "closed";
      message: string;
    };

