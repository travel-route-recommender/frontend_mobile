import { getTripDates } from "../../../utils/schedule";
import type { CreateTripDraft } from "../types";
import type { RegionOption } from "../services/regionService";
import type { CreateTripRoomRequest } from "../services/createTripRoomService";

export type TripCreationInitialDay = {
  id: string;
  dayNumber: number;
  date: string | null;
  items: [];
};

export function mapDraftToCreateTripRoomRequest(
  draft: CreateTripDraft,
  region: RegionOption,
  invitedUserIds: readonly string[],
): CreateTripRoomRequest {
  const uniqueInvitedUserIds = [...new Set(invitedUserIds)].filter(Boolean);
  return {
    name: draft.roomName.trim(),
    regionId: region.id,
    ...(region.areaCode ? { areaCode: region.areaCode } : {}),
    ...(region.sigunguCode ? { sigunguCode: region.sigunguCode } : {}),
    startDate: draft.dateUndecided ? null : draft.startDate,
    endDate: draft.dateUndecided ? null : draft.endDate,
    dateUndecided: draft.dateUndecided,
    travelStyles: [
      `transport:${draft.transport}`,
      `budget:${draft.budgetLevel}`,
      `intensity:${draft.intensity}`,
    ],
    companionType: draft.companionType,
    expectedMemberCount: draft.expectedMemberCount ?? uniqueInvitedUserIds.length + 1,
    invitedUserIds: uniqueInvitedUserIds,
    transport: draft.transport,
    budgetLevel: draft.budgetLevel,
    intensity: draft.intensity,
  };
}

export function buildInitialTripDays(input: Pick<CreateTripRoomRequest, "startDate" | "endDate" | "dateUndecided">): TripCreationInitialDay[] {
  if (input.dateUndecided) return [{ id: "draft-day-1", dayNumber: 1, date: null, items: [] }];
  return getTripDates(input.startDate, input.endDate).map((date, index) => ({
    id: `draft-day-${index + 1}`,
    dayNumber: index + 1,
    date,
    items: [],
  }));
}
