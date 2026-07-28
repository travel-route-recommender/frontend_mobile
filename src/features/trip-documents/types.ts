export type TravelDocumentKind =
  | "accommodation"
  | "admission"
  | "train"
  | "bus"
  | "rental-car"
  | "other";

export type TravelDocumentStorage = "native-private" | "web-session";

export const TRAVEL_DOCUMENT_SESSION_ID = "travel-document-session-"
  + Date.now().toString(36)
  + "-"
  + Math.random().toString(36).slice(2, 10);

export type TravelDocument = {
  id: string;
  tripId: string;
  itineraryItemIds: string[];
  kind: TravelDocumentKind;
  displayName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  localUri: string;
  storage: TravelDocumentStorage;
  sessionId?: string;
  createdByUserId: string;
  createdAt: string;
};

export type TravelDocumentPickResult =
  | { status: "selected"; document: TravelDocument }
  | { status: "cancelled" }
  | { status: "rejected"; message: string }
  | { status: "error"; message: string };

export const travelDocumentKindOptions: readonly {
  value: TravelDocumentKind;
  label: string;
  description: string;
}[] = [
  { value: "accommodation", label: "숙소 예약", description: "호텔·펜션 예약 확인서" },
  { value: "admission", label: "입장권", description: "관광지·공연·체험 티켓" },
  { value: "train", label: "기차표", description: "KTX·철도 승차권" },
  { value: "bus", label: "버스표", description: "고속·시외버스 승차권" },
  { value: "rental-car", label: "렌터카", description: "예약·반납 확인서" },
  { value: "other", label: "기타", description: "그 밖의 여행 문서" },
];

export function getTravelDocumentKindLabel(kind: TravelDocumentKind) {
  return travelDocumentKindOptions.find((option) => option.value === kind)?.label ?? "기타";
}
