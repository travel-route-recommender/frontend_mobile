import type { ItineraryItem } from "../../../domain";
import { applySuggestionChanges, buildItineraryFingerprint } from "../../../duri/duri-suggestions";
import { findOverlappingItem, getTripDates, isValidScheduleRange } from "../../../utils/schedule";
import { DURI_SUGGESTION_VERSION } from "../constants";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../logic/analysisSnapshot";
import { buildDuriAnalysisInputFromState } from "../selectors/duriSelectors";
import type {
  ApplyDuriSuggestionAtomicallyInput,
  ApplyDuriSuggestionAtomicallyResult,
  DuriApplyFailureReason,
  DuriInputSource,
  DuriSuggestionApplyReceipt,
} from "../types";
import { analyzeTripEndCondition } from "../../workspace/logic/tripEndCondition";

type ValidationResult = { valid: true } | { valid: false; reason: DuriApplyFailureReason; message: string };

export function validateFinalItinerary(
  itinerary: ItineraryItem[],
  state: DuriInputSource,
  tripId: string,
): ValidationResult {
  const trip = state.tripsById[tripId];
  if (!trip) return { valid: false, reason: "invalid-change", message: "여행방을 찾을 수 없어요." };
  const dates = new Set(getTripDates(trip.startDate, trip.endDate));
  const itemIds = new Set<string>();
  const placeIds = new Set<string>();
  for (const item of itinerary) {
    if (itemIds.has(item.id) || item.tripId !== tripId) return { valid: false, reason: "invalid-change", message: "중복되었거나 다른 여행방의 일정 항목이 있어요." };
    itemIds.add(item.id);
    if (!dates.has(item.date) || !isValidScheduleRange(item)) return { valid: false, reason: "invalid-time", message: "여행 기간 또는 일정 시간이 올바르지 않아요." };
    if (item.placeId) {
      if (!state.placesById[item.placeId]) return { valid: false, reason: "invalid-change", message: "제안에 필요한 장소를 찾을 수 없어요." };
      if (placeIds.has(item.placeId)) return { valid: false, reason: "invalid-change", message: "같은 장소가 일정에 중복되어 있어요." };
      placeIds.add(item.placeId);
    }
    if (item.itemType === "place" && !item.placeId) return { valid: false, reason: "invalid-change", message: "장소 일정에 placeId가 없어요." };
    if (findOverlappingItem(itinerary, item, item.id)) return { valid: false, reason: "invalid-time", message: "적용 후 시간이 다른 일정과 겹쳐요." };
  }
  const endCondition = analyzeTripEndCondition(trip, itinerary);
  if (endCondition.status === "infeasible" || endCondition.status === "invalid") {
    return { valid: false, reason: "invalid-time", message: endCondition.message };
  }
  return { valid: true };
}

export function validateDuriSuggestion(
  state: DuriInputSource,
  input: ApplyDuriSuggestionAtomicallyInput,
): ValidationResult {
  const { envelope } = input;
  const trip = state.tripsById[input.tripId];
  if (!trip || envelope.suggestion.tripId !== input.tripId) return { valid: false, reason: "invalid-change", message: "제안과 여행방 정보가 일치하지 않아요." };
  if (envelope.algorithmVersion !== DURI_SUGGESTION_VERSION) return { valid: false, reason: "unsupported-version", message: "오래된 제안이에요. 현재 일정으로 다시 분석해 주세요." };
  if (trip.status === "completed") return { valid: false, reason: "trip-not-editable", message: "완료된 여행방은 수정할 수 없어요." };
  if (!input.appliedByUserId || input.appliedByUserId !== state.currentUserId || !trip.members.some((member) => member.userId === input.appliedByUserId)) {
    return { valid: false, reason: "permission-denied", message: "이 여행방의 일정을 수정할 권한이 없어요." };
  }
  if (!envelope.suggestion.canApply || !envelope.suggestion.changes.length) return { valid: false, reason: "invalid-change", message: envelope.suggestion.unavailableReason ?? "적용할 수 없는 제안이에요." };
  const supportedTypes = new Set(["reorder-route", "move-item", "insert-rest", "insert-meal", "add-preference-place", "remove-overload-item", "replace-place"]);
  if (!supportedTypes.has(envelope.suggestion.type)) return { valid: false, reason: "invalid-change", message: "지원하지 않는 제안 타입이에요." };
  const currentIds = new Set((state.itineraryByTripId[input.tripId] ?? []).map((item) => item.id));
  const candidatePlaceIds = new Set((state.candidatesByTripId[input.tripId] ?? []).map((candidate) => candidate.placeId));
  const supportedActions = new Set(["add", "remove", "move", "resize", "replace"]);
  const changeIds = new Set<string>();
  for (const change of envelope.suggestion.changes) {
    if (!change.itemId) return { valid: false, reason: "invalid-change", message: "변경할 일정 ID가 없어요." };
    if (!supportedActions.has(change.action)) return { valid: false, reason: "invalid-change", message: "지원하지 않는 일정 변경 방식이에요." };
    if (changeIds.has(change.itemId)) return { valid: false, reason: "invalid-change", message: "같은 일정 항목을 한 제안에서 두 번 변경할 수 없어요." };
    changeIds.add(change.itemId);
    if (change.action !== "add" && !currentIds.has(change.itemId)) return { valid: false, reason: "missing-item", message: "변경 대상 일정이 사라졌어요. 다시 분석해 주세요." };
    const afterPlaceId = change.after?.placeId;
    if (afterPlaceId && !state.placesById[afterPlaceId]) return { valid: false, reason: "invalid-change", message: "제안에 필요한 장소를 찾을 수 없어요." };
    if (afterPlaceId && (change.action === "add" || change.action === "replace") && !candidatePlaceIds.has(afterPlaceId)) return { valid: false, reason: "invalid-change", message: "추가하거나 대체할 후보 장소 관계를 찾을 수 없어요." };
  }
  return { valid: true };
}

export type PreparedAtomicDuriApply =
  | { ok: true; nextItinerary: ItineraryItem[]; receipt: DuriSuggestionApplyReceipt }
  | { ok: false; result: ApplyDuriSuggestionAtomicallyResult };

export function prepareDuriSuggestionAtomicApply(
  state: DuriInputSource,
  input: ApplyDuriSuggestionAtomicallyInput,
  appliedAt: string,
): PreparedAtomicDuriApply {
  const initialValidation = validateDuriSuggestion(state, input);
  if (!initialValidation.valid) return { ok: false, result: { ok: false, reason: initialValidation.reason, message: initialValidation.message } };
  const currentInput = buildDuriAnalysisInputFromState(state, input.tripId);
  if (!currentInput) return { ok: false, result: { ok: false, reason: "invalid-change", message: "분석 입력을 구성할 수 없어요." } };
  const currentFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(currentInput));
  if (currentFingerprint !== input.expectedFingerprint || currentFingerprint !== input.envelope.baseFingerprint) {
    return { ok: false, result: { ok: false, reason: "stale", message: "제안이 만들어진 뒤 일정이나 분석 입력이 변경되었어요. 다시 분석해 주세요." } };
  }
  const currentItinerary = state.itineraryByTripId[input.tripId] ?? [];
  if (buildItineraryFingerprint(currentItinerary) !== input.envelope.suggestion.itineraryFingerprint) {
    return { ok: false, result: { ok: false, reason: "stale", message: "일정이 변경되어 제안을 적용하지 않았어요." } };
  }
  const changed = applySuggestionChanges(currentItinerary, input.envelope.suggestion, {
    tripId: input.tripId,
    tripDates: getTripDates(currentInput.trip.startDate, currentInput.trip.endDate),
    placesById: currentInput.placesById,
    candidates: currentInput.candidates,
  });
  if (!changed.success) {
    const reason: DuriApplyFailureReason = changed.reason.includes("대상 일정") ? "missing-item" : changed.status === "conflict" ? "invalid-time" : "invalid-change";
    return { ok: false, result: { ok: false, reason, message: `${changed.reason} 일정은 변경되지 않았어요.` } };
  }
  const finalValidation = validateFinalItinerary(changed.itinerary, state, input.tripId);
  if (!finalValidation.valid) return { ok: false, result: { ok: false, reason: finalValidation.reason, message: `${finalValidation.message} 일정은 변경되지 않았어요.` } };
  const afterState: DuriInputSource = {
    ...state,
    itineraryByTripId: { ...state.itineraryByTripId, [input.tripId]: changed.itinerary },
  };
  const afterInput = buildDuriAnalysisInputFromState(afterState, input.tripId);
  if (!afterInput) return { ok: false, result: { ok: false, reason: "unknown", message: "적용 결과를 확인할 수 없어 일정은 변경하지 않았어요." } };
  const affectedDates = [...new Set(input.envelope.suggestion.changes.flatMap((change) => [change.before?.date, change.after?.date].filter((date): date is string => Boolean(date))))].sort();
  return {
    ok: true,
    nextItinerary: changed.itinerary,
    receipt: {
      suggestionId: input.envelope.suggestion.id,
      tripId: input.tripId,
      appliedByUserId: input.appliedByUserId,
      appliedAt,
      beforeFingerprint: currentFingerprint,
      afterFingerprint: createDuriInputFingerprint(createDuriAnalysisSnapshot(afterInput)),
      changedItemIds: changed.changedItemIds,
      affectedDates,
    },
  };
}
