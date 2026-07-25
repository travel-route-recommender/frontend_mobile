import type { CreateTripDraft, CreateTripDraftPatch } from "../types";

export type EditableTripStep = 0 | 1 | 2 | 3;

export function createTripDraftEditCopy(draft: CreateTripDraft): CreateTripDraft {
  return { ...draft, selectedMemberUserIds: [...draft.selectedMemberUserIds] };
}

export function getRegionSelectionPatch(draft: Pick<CreateTripDraft, "isRoomNameCustomized">, regionId: string, regionName: string): CreateTripDraftPatch {
  return {
    regionId,
    ...(!draft.isRoomNameCustomized ? { roomName: `${regionName.trim()} 여행` } : {}),
  };
}

export function getTripEditCommitPatch(step: EditableTripStep, edited: CreateTripDraft): CreateTripDraftPatch {
  if (step === 0) return { regionId: edited.regionId, roomName: edited.roomName, isRoomNameCustomized: edited.isRoomNameCustomized };
  if (step === 1) return { startDate: edited.startDate, endDate: edited.endDate, dateUndecided: edited.dateUndecided };
  if (step === 2) return { transport: edited.transport, budgetLevel: edited.budgetLevel, intensity: edited.intensity };
  return { companionType: edited.companionType, expectedMemberCount: edited.expectedMemberCount, selectedMemberUserIds: [...edited.selectedMemberUserIds] };
}
