import type { EntityId, Region, User } from "../../../domain";
import { isValidISODate } from "../../../utils/formatters";
import { isValidClockTime } from "../../../utils/schedule";
import type { CreateTripDraft, CreateTripEndConditionDraft, CreateTripStep } from "../types";

const WHOLE_MINUTES = /^\d{1,4}$/;

export function validateEndConditionDraft(condition: CreateTripEndConditionDraft): string | undefined {
  if (!condition.location.trim()) return "여행 종료 지점을 입력해 주세요.";
  if (condition.location.trim().length > 100) return "여행 종료 지점은 100자 이하로 입력해 주세요.";
  if (!isValidClockTime(condition.deadline)) return "여행 종료 시각은 HH:mm 형식으로 입력해 주세요.";
  if (!WHOLE_MINUTES.test(condition.travelMinutes.trim())) return "종료 지점까지 예상 이동시간을 분 단위로 입력해 주세요.";
  const travelMinutes = Number(condition.travelMinutes);
  if (!Number.isInteger(travelMinutes) || travelMinutes < 0 || travelMinutes > 1440) return "예상 이동시간은 0~1440분으로 입력해 주세요.";
  if (!WHOLE_MINUTES.test(condition.serviceBufferMinutes.trim())) return "승차 준비 또는 반납 시간을 분 단위로 입력해 주세요.";
  const bufferMinutes = Number(condition.serviceBufferMinutes);
  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 720) return "승차 준비 또는 반납 시간은 0~720분으로 입력해 주세요.";
  if (condition.note.trim().length > 300) return "여행 종료 조건 메모는 300자 이하로 입력해 주세요.";
  return undefined;
}

export interface CreateTripValidationContext {
  regionsById: Readonly<Record<EntityId, Region>>;
  availableRegionIds?: ReadonlySet<EntityId>;
  usersById: Readonly<Record<EntityId, User>>;
  currentUserId: EntityId;
}

export function validateCreateTripStep(draft: CreateTripDraft, step: CreateTripStep, context: CreateTripValidationContext): string | undefined {
  if (!context.currentUserId || !context.usersById[context.currentUserId] || draft.ownerUserId !== context.currentUserId) return "여행방을 만들 회원 정보를 확인해 주세요.";
  if (step >= 0
    && !context.regionsById[draft.regionId]
    && !context.availableRegionIds?.has(draft.regionId)) return "여행지를 선택해 주세요.";
  if (step >= 1) {
    if (draft.dateUndecided) {
      if (draft.startDate !== null || draft.endDate !== null) return "날짜 미정 상태에는 여행 날짜를 함께 저장할 수 없어요.";
      if (draft.endCondition !== null) return "날짜 미정 여행에는 종료 조건을 저장할 수 없어요.";
    } else {
      if (!isValidISODate(draft.startDate) || !isValidISODate(draft.endDate)) return "시작일과 종료일을 모두 선택해 주세요.";
      if (draft.endDate < draft.startDate) return "종료일은 시작일보다 빠를 수 없어요.";
    }
  }
  if (step >= 2) {
    if (!draft.transport) return "실제 이동 방식을 선택해 주세요.";
    if (draft.accommodationLocation.trim().length > 100) return "숙소 위치는 100자 이하로 입력해 주세요.";
    if (draft.endCondition) {
      const endConditionError = validateEndConditionDraft(draft.endCondition);
      if (endConditionError) return endConditionError;
    }
  }
  if (step >= 3) {
    if (!draft.companionType) return "동행 유형을 선택해 주세요.";
    if (draft.expectedMemberCount !== null && (!Number.isInteger(draft.expectedMemberCount) || draft.expectedMemberCount < 1)) return "예상 인원 정보를 다시 확인해 주세요.";
    const invalidMember = draft.selectedMemberUserIds.some((userId) => userId === context.currentUserId || !context.usersById[userId]);
    if (invalidMember) return "선택한 동행자 정보를 다시 확인해 주세요.";
  }
  if (step >= 4 && !draft.roomName.trim()) return "여행방 이름을 입력해 주세요.";
  if (step >= 4 && draft.roomName.trim().length > 40) return "여행방 이름은 40자 이하로 입력해 주세요.";
  return undefined;
}

export function validateCreateTripDraft(draft: CreateTripDraft, context: CreateTripValidationContext) {
  return validateCreateTripStep(draft, 4, context);
}

export function normalizeInvitedUserIds(userIds: readonly EntityId[], ownerUserId: EntityId, usersById: Readonly<Record<EntityId, User>>) {
  return [...new Set(userIds)].filter((userId) => userId !== ownerUserId && Boolean(usersById[userId]));
}
