import type { DuriDomainState } from "../../data/mock/demoData";
import { isSupportedPreferenceResult } from "../../duri/group-preferences";
import type { PersonalPreferenceDraft } from "../../features/preferences/types";
import type { CreateTripDraft } from "../../features/trip-creation/types";
import type { AuthIntegrityState, StateIntegrityIssue } from "./types";
import { issue } from "./types";
import { isValidISODate } from "../../utils/formatters";

export function validatePreferences(
  domain: DuriDomainState,
  auth: AuthIntegrityState,
  preferenceDraft?: PersonalPreferenceDraft | null,
): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];

  for (const [userId, result] of Object.entries(domain.preferenceResultsByUserId)) {
    if (!domain.usersById[userId]) {
      issues.push(issue("warning", "preference.user-reference-missing", "user", "성향 결과의 사용자를 찾을 수 없습니다.", userId));
    }
    if (result.userId !== userId) {
      issues.push(issue("error", "preference.user-key-mismatch", "preference", "성향 결과의 userId가 저장 key와 다릅니다.", userId));
    }
    if (!isSupportedPreferenceResult(result, userId)) {
      issues.push(issue("warning", "preference.result-unsupported", "preference", "현재 문항 버전에서 지원하지 않는 성향 결과입니다.", userId));
    }
  }

  if (auth.sessionKind === "member" || auth.sessionKind === "guest") {
    const userId = auth.currentSessionUserId;
    const hasResult = Boolean(userId && isSupportedPreferenceResult(domain.preferenceResultsByUserId[userId], userId));
    if (auth.preferenceTestCompleted !== hasResult) {
      issues.push(issue("error", "preference.completion-result-mismatch", "session", "preferenceTestCompleted와 실제 지원되는 결과 존재 여부가 다릅니다."));
    }
  } else if (auth.preferenceTestCompleted) {
    issues.push(issue("error", "preference.anonymous-completion-persisted", "session", "anonymous 세션은 완료 결과를 영구 완료 상태로 저장하면 안 됩니다."));
  }

  if (preferenceDraft) {
    if (preferenceDraft.owner.kind === "anonymous") {
      if (auth.sessionKind !== "anonymous") {
        issues.push(issue("warning", "preference.draft-owner-stale", "preference-draft", "다른 세션의 anonymous 초안이 격리되어 있습니다."));
      }
    } else {
      if (!domain.usersById[preferenceDraft.owner.userId]) {
        issues.push(issue("warning", "preference.draft-user-missing", "user", "성향 초안 소유자의 사용자 정보를 찾을 수 없습니다.", preferenceDraft.owner.userId));
      }
      if (auth.currentSessionUserId !== preferenceDraft.owner.userId) {
        issues.push(issue("warning", "preference.draft-owner-stale", "preference-draft", "현재 세션과 다른 사용자의 성향 초안이 격리되어 있습니다."));
      }
    }
  }

  return issues;
}

export function validateCreateTripDraft(
  domain: DuriDomainState,
  auth: AuthIntegrityState,
  draft?: CreateTripDraft | null,
): StateIntegrityIssue[] {
  if (!draft) return [];
  const issues: StateIntegrityIssue[] = [];
  if (!domain.usersById[draft.ownerUserId]) {
    issues.push(issue("warning", "trip-draft.owner-reference-missing", "user", "여행방 초안 소유자의 사용자 정보를 찾을 수 없습니다.", draft.ownerUserId));
  }
  if (auth.sessionKind !== "member" || auth.currentSessionUserId !== draft.ownerUserId) {
    issues.push(issue("warning", "trip-draft.owner-stale", "trip-draft", "현재 회원과 다른 사용자의 여행방 초안이 격리되어 있습니다."));
  }
  if (draft.regionId && !domain.regionsById[draft.regionId]) {
    issues.push(issue("warning", "trip-draft.region-reference-missing", "trip-draft", "여행방 초안의 지역 정보를 찾을 수 없습니다.", draft.regionId));
  }
  if (draft.dateUndecided) {
    if (draft.startDate !== null || draft.endDate !== null) issues.push(issue("error", "trip-draft.date-undecided-range-present", "trip-draft", "날짜 미정 초안에 날짜 범위가 함께 저장되어 있습니다."));
  } else if ((draft.startDate !== null || draft.endDate !== null) && (!isValidISODate(draft.startDate) || !isValidISODate(draft.endDate) || draft.endDate < draft.startDate)) {
    issues.push(issue("error", "trip-draft.date-range-invalid", "trip-draft", "여행방 초안의 날짜 범위가 올바르지 않습니다."));
  }
  if (draft.roomName.length > 40) {
    issues.push(issue("error", "trip-draft.room-name-too-long", "trip-draft", "여행방 초안의 이름이 40자를 초과합니다."));
  }
  if (draft.expectedMemberCount !== null && (!Number.isInteger(draft.expectedMemberCount) || draft.expectedMemberCount < 1)) {
    issues.push(issue("error", "trip-draft.member-count-invalid", "trip-draft", "여행방 초안의 예상 인원이 올바르지 않습니다."));
  }
  if (draft.selectedMemberUserIds.includes(draft.ownerUserId)) {
    issues.push(issue("error", "trip-draft.owner-selected", "trip-draft", "여행방 owner가 동행자 목록에도 포함되어 있습니다."));
  }
  if (new Set(draft.selectedMemberUserIds).size !== draft.selectedMemberUserIds.length) {
    issues.push(issue("error", "trip-draft.member-duplicate", "trip-draft", "여행방 초안의 동행자 ID가 중복되어 있습니다."));
  }
  for (const userId of draft.selectedMemberUserIds) {
    if (!domain.usersById[userId]) {
      issues.push(issue("warning", "trip-draft.member-reference-missing", "user", "여행방 초안의 동행자 정보를 찾을 수 없습니다.", userId));
    }
  }
  return issues;
}
