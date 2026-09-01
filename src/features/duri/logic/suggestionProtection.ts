import type { ItineraryItem } from "../../../domain";
import type { DuriAnalysisInput, DuriDocumentReference } from "../../../duri/duri-analysis";
import type { DuriSuggestion, ScheduleChangeAction, ScheduleChangePreview } from "../../../duri/duri-suggestions";
import { isUsableConfirmedScheduleConstraint } from "./confirmedScheduleConstraint";

const TIME_SENSITIVE_DOCUMENT_KINDS = new Set<DuriDocumentReference["kind"]>([
  "accommodation",
  "admission",
  "train",
  "bus",
  "rental-car",
]);

export type DuriItemProtectionReason =
  | "user-lock"
  | "semantic-reservation"
  | "confirmed-date-time"
  | "confirmed-date"
  | "linked-order-protected-document"
  | "linked-time-sensitive-document"
  | "linked-document";

export type DuriItemProtection = {
  blocked: boolean;
  reason?: DuriItemProtectionReason;
  message?: string;
};

function linkedDocuments(input: Pick<DuriAnalysisInput, "documentReferences">, itemId: string) {
  return (input.documentReferences ?? []).filter((reference) => reference.itineraryItemIds.includes(itemId));
}

function confirmedConstraintsForItem(
  input: Pick<DuriAnalysisInput, "trip" | "confirmedScheduleConstraints">,
  item: ItineraryItem,
) {
  return (input.confirmedScheduleConstraints ?? [])
    .filter((constraint) => isUsableConfirmedScheduleConstraint(constraint, input.trip))
    .filter((constraint) => constraint.itineraryItemId === item.id
      || (!constraint.itineraryItemId
        && Boolean(item.placeId)
        && constraint.placeId === item.placeId));
}

/**
 * 두리가 변경해서는 안 되는 사용자 사실을 한 곳에서 판정한다.
 *
 * - 직접 잠금과 시각이 확인된 예약은 모든 자동 변경을 막는다.
 * - 날짜만 확인된 필수 방문은 제거·대체·다른 날짜 이동만 막는다.
 * - 구조화되지 않은 시간 민감 문서는 사실을 잃지 않도록 보수적으로 모두 막는다.
 * - 기타 문서도 제거·대체 시 연결이 조용히 끊어지지 않도록 막는다.
 */
export function getDuriItemProtection(
  input: Pick<DuriAnalysisInput, "trip" | "confirmedScheduleConstraints" | "documentReferences">,
  item: ItineraryItem,
  change: Pick<ScheduleChangePreview, "action" | "after">,
): DuriItemProtection {
  if (item.lockedForDuri) {
    return {
      blocked: true,
      reason: "user-lock",
      message: "사용자가 두리 변경 잠금으로 보호한 일정은 변경할 수 없어요.",
    };
  }

  if (item.itemType === "reservation") {
    return {
      blocked: true,
      reason: "semantic-reservation",
      message: "예약 일정으로 표시된 항목은 사용자가 예약 상태를 확인하기 전 두리가 변경할 수 없어요.",
    };
  }

  const constraints = confirmedConstraintsForItem(input, item);
  if (constraints.some((constraint) => Boolean(constraint.startTime || constraint.endTime))) {
    return {
      blocked: true,
      reason: "confirmed-date-time",
      message: "사용자가 확인한 예약 날짜·시각과 연결된 일정은 두리가 변경할 수 없어요.",
    };
  }
  if (constraints.length) {
    const changesConfirmedDate = change.action === "move"
      && Boolean(change.after?.date)
      && constraints.some((constraint) => change.after?.date !== constraint.date);
    if (change.action === "remove" || change.action === "replace" || changesConfirmedDate) {
      return {
        blocked: true,
        reason: "confirmed-date",
        message: "사용자가 확인한 필수 방문 날짜를 제거·대체하거나 다른 날로 옮길 수 없어요.",
      };
    }
  }

  const documents = linkedDocuments(input, item.id);
  if (documents.some((document) => document.orderProtected === true)) {
    return {
      blocked: true,
      reason: "linked-order-protected-document",
      message: "사용자가 티켓을 첨부한 일정은 문서 내용을 확인하기 전 두리가 변경할 수 없어요.",
    };
  }
  if (documents.some((document) => TIME_SENSITIVE_DOCUMENT_KINDS.has(document.kind))) {
    return {
      blocked: true,
      reason: "linked-time-sensitive-document",
      message: "입장권·예약·교통 문서가 연결된 일정은 문서 내용을 확인하기 전 두리가 변경할 수 없어요.",
    };
  }
  if (documents.length && (change.action === "remove" || change.action === "replace")) {
    return {
      blocked: true,
      reason: "linked-document",
      message: "첨부 문서 연결이 끊길 수 있는 제거·대체 제안은 적용할 수 없어요.",
    };
  }
  return { blocked: false };
}

export function validateDuriSuggestionProtection(
  input: Pick<DuriAnalysisInput, "trip" | "itinerary" | "confirmedScheduleConstraints" | "documentReferences">,
  suggestion: Pick<DuriSuggestion, "changes">,
): { valid: true } | { valid: false; message: string; itemId?: string; action?: ScheduleChangeAction } {
  const itemById = new Map(input.itinerary.map((item) => [item.id, item]));
  for (const change of suggestion.changes) {
    if (change.action === "add" || !change.itemId) continue;
    const item = itemById.get(change.itemId);
    if (!item) continue;
    const protection = getDuriItemProtection(input, item, change);
    if (protection.blocked) {
      return {
        valid: false,
        message: protection.message ?? "보호된 일정은 두리가 변경할 수 없어요.",
        itemId: item.id,
        action: change.action,
      };
    }
  }
  return { valid: true };
}
