import type { DuriDomainState } from "../../data/mock/demoData";
import { buildItineraryFingerprint } from "../../duri/duri-suggestions";
import { createDuriInputFingerprint } from "../../features/duri/logic/analysisSnapshot";
import { buildDuriAnalysisInputFromState } from "../../features/duri/selectors/duriSelectors";
import type { DuriIntegrityState, StateIntegrityIssue } from "./types";
import { issue } from "./types";

export function validateDuri(domain: DuriDomainState, duri?: DuriIntegrityState): StateIntegrityIssue[] {
  const issues: StateIntegrityIssue[] = [];
  if (Object.keys(domain.analysesByTripId).length) {
    issues.push(issue("warning", "duri.legacy-analysis-persisted", "analysis", "파생 분석 결과가 legacy domain 필드에 남아 있습니다."));
  }
  if (!duri) return issues;

  const currentFingerprints = new Map<string, string>();
  for (const tripId of Object.keys(domain.tripsById)) {
    const input = buildDuriAnalysisInputFromState(domain, tripId);
    if (input) currentFingerprints.set(tripId, createDuriInputFingerprint(input));
  }

  for (const [tripId, session] of Object.entries(duri.sessionsByTripId)) {
    if (!session) continue;
    if (!domain.tripsById[tripId]) {
      issues.push(issue("error", "duri.analysis-trip-missing", "trip", "분석 세션의 여행방이 존재하지 않습니다.", tripId));
      continue;
    }
    if (session.tripId !== tripId) {
      issues.push(issue("error", "duri.analysis-trip-mismatch", "analysis", "분석 세션 tripId가 저장 key와 다릅니다.", tripId));
    }
    const snapshotFingerprint = createDuriInputFingerprint(session.snapshot);
    if (session.inputFingerprint !== snapshotFingerprint) {
      issues.push(issue("error", "duri.analysis-fingerprint-invalid", "analysis", "분석 fingerprint가 실제 분석 snapshot과 일치하지 않습니다.", tripId));
    }
    const currentFingerprint = currentFingerprints.get(tripId);
    if (currentFingerprint && session.inputFingerprint !== currentFingerprint) {
      issues.push(issue("warning", "duri.analysis-stale", "analysis", "현재 분석 입력이 변경되어 기존 분석이 stale 상태입니다.", tripId));
    }
  }

  const suggestionIds = new Set<string>();
  for (const [tripId, envelopes] of Object.entries(duri.suggestionsByTripId)) {
    if (!envelopes) continue;
    const session = duri.sessionsByTripId[tripId];
    if (!domain.tripsById[tripId]) {
      issues.push(issue("error", "duri.suggestion-trip-missing", "trip", "제안 목록의 여행방이 존재하지 않습니다.", tripId));
    }
    for (const envelope of envelopes) {
      const suggestionId = envelope.suggestion.id;
      if (suggestionIds.has(suggestionId)) {
        issues.push(issue("error", "duri.suggestion-id-duplicate", "suggestion", "Duri suggestion ID가 중복되어 있습니다.", suggestionId));
      }
      suggestionIds.add(suggestionId);
      if (envelope.suggestion.tripId !== tripId) {
        issues.push(issue("error", "duri.suggestion-trip-mismatch", "suggestion", "제안 tripId가 저장 key와 다릅니다.", suggestionId));
      }
      if (!session || envelope.baseFingerprint !== session.inputFingerprint) {
        issues.push(issue("error", "duri.suggestion-analysis-mismatch", "suggestion", "제안 baseFingerprint가 분석 세션과 일치하지 않습니다.", suggestionId));
      }
      const currentFingerprint = currentFingerprints.get(tripId);
      if (currentFingerprint && envelope.baseFingerprint !== currentFingerprint) {
        issues.push(issue("warning", "duri.suggestion-stale", "suggestion", "제안 생성 후 분석 입력이 변경되어 적용할 수 없습니다.", suggestionId));
      }
      const currentItineraryFingerprint = buildItineraryFingerprint(domain.itineraryByTripId[tripId] ?? []);
      if (envelope.suggestion.itineraryFingerprint !== currentItineraryFingerprint) {
        issues.push(issue("warning", "duri.suggestion-itinerary-stale", "suggestion", "제안 생성 후 일정이 변경되어 적용할 수 없습니다.", suggestionId));
      }
    }
  }

  for (const [suggestionId, receipt] of Object.entries(duri.receiptsBySuggestionId)) {
    if (!receipt) continue;
    if (receipt.suggestionId !== suggestionId) {
      issues.push(issue("error", "duri.receipt-key-mismatch", "receipt", "적용 영수증 suggestionId가 저장 key와 다릅니다.", suggestionId));
    }
    const trip = domain.tripsById[receipt.tripId];
    if (!trip) {
      issues.push(issue("error", "duri.receipt-trip-missing", "receipt", "적용 영수증의 여행방이 존재하지 않습니다.", suggestionId));
    } else if (!trip.members.some((member) => member.userId === receipt.appliedByUserId)) {
      issues.push(issue("error", "duri.receipt-applier-not-member", "receipt", "제안을 적용한 사용자가 여행방 멤버가 아닙니다.", suggestionId));
    }
  }

  return issues;
}

