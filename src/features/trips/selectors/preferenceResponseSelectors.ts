import type { EntityId, TripMember, TripRoom, User } from "../../../domain";
import { normalizePreferenceResult } from "../../../duri/group-preferences";
import type { DiagnosisCoverage } from "../../../duri/group-preferences";

export type MemberPreferenceResponseState = "completed" | "pending" | "invalid";
export type InvalidPreferenceReason = "missing-user" | "unsupported-result";

export interface MemberPreferenceStatus {
  userId: EntityId;
  role: TripMember["role"];
  name: string;
  initial: string;
  profileImageUrl?: string;
  state: MemberPreferenceResponseState;
  invalidReason?: InvalidPreferenceReason;
  completedAt?: string;
  profileType?: string;
  isCurrentUser: boolean;
}

export interface RoomPreferenceResponseSummary {
  roomId: EntityId;
  members: MemberPreferenceStatus[];
  completedMemberIds: EntityId[];
  pendingMemberIds: EntityId[];
  invalidMemberIds: EntityId[];
  completedCount: number;
  pendingCount: number;
  invalidCount: number;
  totalCount: number;
  completionRate: number;
  coverage: DiagnosisCoverage;
  hasEnoughDataForGroupDiagnosis: boolean;
  isComplete: boolean;
}

export interface RoomPreferenceSelectorState {
  tripsById: Readonly<Record<EntityId, TripRoom>>;
  usersById: Readonly<Record<EntityId, User>>;
  preferenceResultsByUserId: Readonly<Record<EntityId, unknown>>;
  currentUserId?: EntityId;
}

const emptySummary = (roomId: EntityId): RoomPreferenceResponseSummary => ({
  roomId,
  members: [],
  completedMemberIds: [],
  pendingMemberIds: [],
  invalidMemberIds: [],
  completedCount: 0,
  pendingCount: 0,
  invalidCount: 0,
  totalCount: 0,
  completionRate: 0,
  coverage: "insufficient",
  hasEnoughDataForGroupDiagnosis: false,
  isComplete: false,
});

export function selectRoomMembers(
  state: Pick<RoomPreferenceSelectorState, "tripsById">,
  roomId: EntityId,
): TripMember[] {
  const trip = state.tripsById[roomId];
  if (!trip) return [];
  const seen = new Set<EntityId>();
  return trip.members.flatMap((member) => {
    if (seen.has(member.userId)) return [];
    seen.add(member.userId);
    return [{ ...member }];
  });
}

export function selectMemberPreferenceStatus(
  state: RoomPreferenceSelectorState,
  roomId: EntityId,
): MemberPreferenceStatus[] {
  return selectRoomMembers(state, roomId).map((member) => {
    const user = state.usersById[member.userId];
    const rawResult = state.preferenceResultsByUserId[member.userId];
    const result = normalizePreferenceResult(rawResult, member.userId);
    const base = {
      userId: member.userId,
      role: member.role,
      name: user?.name ?? "알 수 없는 참여자",
      initial: user?.initial ?? "?",
      ...(user?.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}),
      isCurrentUser: member.userId === state.currentUserId,
    };
    if (!user) return { ...base, state: "invalid" as const, invalidReason: "missing-user" as const };
    if (rawResult === undefined) return { ...base, state: "pending" as const };
    if (!result) return { ...base, state: "invalid" as const, invalidReason: "unsupported-result" as const };
    const completedAt = typeof (rawResult as { completedAt?: unknown }).completedAt === "string"
      ? (rawResult as { completedAt: string }).completedAt
      : undefined;
    return {
      ...base,
      state: "completed" as const,
      ...(completedAt ? { completedAt } : {}),
      ...(result.profileType ? { profileType: result.profileType } : {}),
    };
  });
}

export function getRoomPreferenceResponseSummary(
  state: RoomPreferenceSelectorState,
  roomId: EntityId,
): RoomPreferenceResponseSummary {
  if (!state.tripsById[roomId]) return emptySummary(roomId);
  const members = selectMemberPreferenceStatus(state, roomId);
  const completedMemberIds = members.flatMap((member) => member.state === "completed" ? [member.userId] : []);
  const pendingMemberIds = members.flatMap((member) => member.state === "pending" ? [member.userId] : []);
  const invalidMemberIds = members.flatMap((member) => member.state === "invalid" ? [member.userId] : []);
  const totalCount = members.length;
  const completedCount = completedMemberIds.length;
  const isComplete = totalCount > 0 && completedCount === totalCount;
  const coverage: DiagnosisCoverage = completedCount < 2
    ? "insufficient"
    : isComplete
      ? "complete"
      : "partial";
  return {
    roomId,
    members,
    completedMemberIds,
    pendingMemberIds,
    invalidMemberIds,
    completedCount,
    pendingCount: pendingMemberIds.length,
    invalidCount: invalidMemberIds.length,
    totalCount,
    completionRate: totalCount ? completedCount / totalCount : 0,
    coverage,
    hasEnoughDataForGroupDiagnosis: completedCount >= 2,
    isComplete,
  };
}

export const selectRoomPreferenceResponseSummary = getRoomPreferenceResponseSummary;
