import type { DuriDomainState } from "../../data/mock/demoData";
import type { AuthIntegrityState, StateIntegrityIssue } from "./types";
import { issue } from "./types";

export function validateUsers(domain: DuriDomainState, auth: AuthIntegrityState): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];
  const { currentSessionUserId, sessionKind } = auth;

  if (currentSessionUserId && !domain.usersById[currentSessionUserId]) {
    issues.push(issue("error", "user.session-reference-missing", "user", "세션 사용자가 usersById에 없습니다.", currentSessionUserId));
  }
  if (domain.currentUserId && !domain.usersById[domain.currentUserId]) {
    issues.push(issue("error", "user.current-reference-missing", "user", "현재 사용자가 usersById에 없습니다.", domain.currentUserId));
  }

  if (sessionKind === "anonymous") {
    if (currentSessionUserId) {
      issues.push(issue("error", "user.anonymous-session-has-user", "session", "anonymous 세션은 사용자 ID를 가지면 안 됩니다."));
    }
    if (domain.currentUserId) {
      issues.push(issue("error", "user.anonymous-domain-has-user", "session", "anonymous 세션이 domain member 사용자를 가리키고 있습니다."));
    }
  }

  if (sessionKind === "member" || sessionKind === "guest") {
    if (!currentSessionUserId) {
      issues.push(issue("error", "user.authenticated-session-missing-user", "session", `${sessionKind} 세션에 사용자 ID가 없습니다.`));
    }
    if (!domain.currentUserId) {
      issues.push(issue("error", "user.authenticated-domain-missing-user", "session", `${sessionKind} 세션에 currentUserId가 없습니다.`));
    }
    if (currentSessionUserId && domain.currentUserId && currentSessionUserId !== domain.currentUserId) {
      issues.push(issue("error", "user.session-domain-mismatch", "session", "인증 Store와 domain Store의 현재 사용자가 다릅니다."));
    }
  }

  return issues;
}

