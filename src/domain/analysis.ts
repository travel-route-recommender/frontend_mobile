import type { EntityId } from "./user";

export type TripAnalysis = {
  tripId: EntityId;
  matchRate: number;
  commonPreferences: string[];
  needsTune: string[];
  routeWarning: string;
  unplannedCandidateMessage: string;
  suggestion: string;
};
