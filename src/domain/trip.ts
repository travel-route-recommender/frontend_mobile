import type { EntityId, ISODateString } from "./user";

export type TripStatus = "planning" | "drafting" | "confirmed" | "completed";
export type TripMemberRole = "owner" | "member";
export type TripTransport = "public" | "car";
export type TripBudgetLevel = "budget" | "standard" | "premium";
export type TripIntensity = "relaxed" | "balanced" | "packed";
export type TripEndConditionType = "train" | "intercity-bus" | "rental-car-return" | "other";

export type TripLocation = {
  name: string;
  address?: string;
};

export type TripEndCondition = {
  type: TripEndConditionType;
  location: TripLocation;
  /** 여행 마지막 날짜의 현지 시각(HH:mm) */
  deadline: string;
  /** 사용자가 마지막 일정 장소에서 종료 지점까지 확보하기로 한 이동시간 */
  travelMinutes: number;
  /** 승차 준비나 렌터카 반납 절차 등에 필요한 확보 시간 */
  serviceBufferMinutes: number;
  note?: string;
};

export type TripMember = {
  userId: EntityId;
  role: TripMemberRole;
};

export type TripRoom = {
  id: EntityId;
  title: string;
  regionId: EntityId;
  startDate: ISODateString | null;
  endDate: ISODateString | null;
  dateUndecided?: boolean;
  status: TripStatus;
  transport: TripTransport;
  /** 새 여행방에서는 개인 성향 조사 결과를 사용한다. 이 필드들은 기존 저장값 호환용이다. */
  budgetLevel?: TripBudgetLevel;
  intensity?: TripIntensity;
  travelStyles?: string[];
  accommodationLocation?: TripLocation | null;
  endCondition?: TripEndCondition | null;
  companionType?: string | null;
  expectedMemberCount?: number | null;
  members: TripMember[];
};

export type TripCandidate = {
  tripId: EntityId;
  placeId: EntityId;
  addedByUserIds: EntityId[];
  recommendedByDuri: boolean;
  addedAt?: ISODateString;
};
