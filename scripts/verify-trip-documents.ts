import {
  discardExpiredWebSessionDocuments,
  normalizeTravelDocument,
  normalizeTravelDocumentsByTripId,
  reconcileTravelDocumentLinks,
  setItineraryDocumentLinks,
} from "../src/features/trip-documents/logic/travelDocumentState";
import { TRAVEL_DOCUMENT_SESSION_ID, type TravelDocument } from "../src/features/trip-documents/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const document = (id: string, itineraryItemIds: string[] = []): TravelDocument => ({
  id,
  tripId: "trip-1",
  itineraryItemIds,
  kind: "admission",
  displayName: id + ".pdf",
  fileName: id + ".pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  localUri: "file:///documents/" + id + ".pdf",
  storage: "native-private",
  createdByUserId: "owner",
  createdAt: "2026-07-28T00:00:00.000Z",
});

assert(!normalizeTravelDocument({ id: "broken" }), "필수 파일 metadata가 없으면 복원하지 않는다");
const normalized = normalizeTravelDocument({ ...document("ticket"), itineraryItemIds: ["item-1", "item-1", 4] });
assert(normalized?.itineraryItemIds.join() === "item-1", "일정 연결 ID를 문자열 중복 없이 정규화한다");

const normalizedByTrip = normalizeTravelDocumentsByTripId({
  "trip-1": [document("ticket"), document("ticket"), { ...document("wrong-trip"), tripId: "trip-2" }],
});
assert(normalizedByTrip["trip-1"]?.length === 1, "중복 문서와 다른 여행방 문서를 격리한다");

const linked = setItineraryDocumentLinks([document("ticket"), document("hotel", ["item-old"])], "item-1", ["ticket"]);
assert(linked.find((entry) => entry.id === "ticket")?.itineraryItemIds.join() === "item-1", "선택 문서를 일정에 연결한다");
assert(linked.find((entry) => entry.id === "hotel")?.itineraryItemIds.join() === "item-old", "다른 일정 연결은 보존한다");

const replaced = setItineraryDocumentLinks(linked, "item-1", ["hotel"]);
assert(!replaced.find((entry) => entry.id === "ticket")?.itineraryItemIds.includes("item-1"), "선택 해제 문서 연결을 제거한다");
assert(replaced.find((entry) => entry.id === "hotel")?.itineraryItemIds.sort().join() === "item-1,item-old", "새 문서 연결과 기존 연결을 함께 보존한다");

const reconciled = reconcileTravelDocumentLinks(replaced, new Set(["item-1"]));
assert(reconciled.find((entry) => entry.id === "hotel")?.itineraryItemIds.join() === "item-1", "삭제된 일정의 고아 연결만 정리한다");
assert(reconciled.length === replaced.length, "일정 삭제가 원본 여행 문서를 삭제하지 않는다");

const noOpLinked = setItineraryDocumentLinks(reconciled, "item-1", ["hotel"]);
assert(noOpLinked === reconciled, "같은 일정 연결을 다시 저장하면 배열 참조를 유지한다");
const noOpReconciled = reconcileTravelDocumentLinks(reconciled, new Set(["item-1"]));
assert(noOpReconciled === reconciled, "고아 연결이 없으면 reconciliation이 상태를 다시 쓰지 않는다");

const currentWebDocument: TravelDocument = {
  ...document("web-current"),
  storage: "web-session",
  localUri: "blob:current",
  sessionId: TRAVEL_DOCUMENT_SESSION_ID,
};
const expiredWebDocument: TravelDocument = {
  ...document("web-expired"),
  storage: "web-session",
  localUri: "blob:expired",
  sessionId: "old-session",
};
const webFiltered = discardExpiredWebSessionDocuments({ "trip-1": [currentWebDocument, expiredWebDocument, document("native")] });
assert(webFiltered["trip-1"]?.some((entry) => entry.id === "web-current"), "현재 웹 탭의 Blob 문서는 유지한다");
assert(!webFiltered["trip-1"]?.some((entry) => entry.id === "web-expired") && webFiltered["trip-1"]?.some((entry) => entry.id === "native"), "새로고침 뒤 만료 Blob만 제거한다");

console.log("Trip document verification passed: 13 scenarios");
