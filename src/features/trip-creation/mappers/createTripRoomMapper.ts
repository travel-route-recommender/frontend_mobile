import { getTripDates } from "../../../utils/schedule";
import type { CreateTripDraft } from "../types";
import type { RegionOption } from "../services/regionService";
import type { CreateTripRoomRequest } from "../services/createTripRoomService";
import { validateEndConditionDraft } from "../validation/validateCreateTripDraft";

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
  if (!draft.transport) throw new Error("이동 방식을 선택해 주세요.");
  const accommodationName = draft.accommodationLocation.trim();
  if (accommodationName.length > 100) throw new Error("숙소 위치는 100자 이하로 입력해 주세요.");
  if (draft.dateUndecided && draft.endCondition) throw new Error("날짜 미정 여행에는 종료 조건을 저장할 수 없어요.");
  if (draft.endCondition) {
    const endConditionError = validateEndConditionDraft(draft.endCondition);
    if (endConditionError) throw new Error(endConditionError);
  }
  const condition = draft.endCondition;
  const endConditionLocation = condition
    ? condition.locationDetails?.name === condition.location.trim()
      ? condition.locationDetails
      : { name: condition.location.trim(), source: "manual" as const }
    : null;
  const endCondition = draft.dateUndecided || !condition || !endConditionLocation ? null : {
    type: condition.type,
    location: endConditionLocation,
    deadline: condition.deadline,
    travelMinutes: Number(condition.travelMinutes),
    serviceBufferMinutes: Number(condition.serviceBufferMinutes),
    ...(condition.note.trim() ? { note: condition.note.trim() } : {}),
  };
  return {
    name: draft.roomName.trim(),
    regionId: region.id,
    regionName: region.name,
    ...(region.areaCode ? { areaCode: region.areaCode } : {}),
    ...(region.sigunguCode ? { sigunguCode: region.sigunguCode } : {}),
    startDate: draft.dateUndecided ? null : draft.startDate,
    endDate: draft.dateUndecided ? null : draft.endDate,
    dateUndecided: draft.dateUndecided,
    companionType: draft.companionType,
    expectedMemberCount: draft.expectedMemberCount ?? uniqueInvitedUserIds.length + 1,
    invitedUserIds: uniqueInvitedUserIds,
    transport: draft.transport,
    accommodationLocation: accommodationName
      ? draft.accommodationLocationDetails?.name === accommodationName
        ? draft.accommodationLocationDetails
        : { name: accommodationName, source: "manual" }
      : null,
    endCondition,
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
