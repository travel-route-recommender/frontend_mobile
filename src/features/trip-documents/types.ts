export type TravelDocumentKind =
  | "accommodation"
  | "admission"
  | "train"
  | "bus"
  | "rental-car"
  | "other";

export type TravelDocumentStorage = "native-private" | "web-session" | "external-url";

/**
 * OCR 결과는 어디까지나 검토 후보이며, `confirmed`가 되기 전에는 일정의
 * 고정 조건으로 사용할 수 없다.
 */
export type TravelDocumentFactKind =
  | "reservation"
  | "train"
  | "bus"
  | "rental-car-return"
  | "mandatory-place";

export type TravelDocumentFactReviewState = "suggested" | "confirmed" | "rejected";

export type TravelDocumentFact = {
  id: string;
  kind: TravelDocumentFactKind;
  label: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  placeName?: string;
  placeId?: string;
  itineraryItemId?: string;
  confidence: number;
  fieldConfidence: Partial<Record<"label" | "date" | "startTime" | "endTime" | "placeName", number>>;
  reviewState: TravelDocumentFactReviewState;
  provenance: {
    source: "ocr" | "manual";
    providerId: string;
    extractedAt: string;
    /** 개인정보가 포함될 수 있는 OCR 전문 대신 검토에 필요한 짧은 근거만 보관한다. */
    evidenceSnippets: string[];
  };
  confirmedAt?: string;
  confirmedByUserId?: string;
};

export type TravelDocumentExtractionFailureCode =
  | "unsupported-runtime"
  | "unsupported-file-type"
  | "pdf-rendering-required"
  | "file-unavailable"
  | "timeout"
  | "provider-failed"
  | "empty-result"
  | "unsafe-result"
  | "interrupted";

export type TravelDocumentExtraction = {
  status: "processing" | "unsupported" | "failed" | "needs-review" | "confirmed";
  providerId: string;
  mode: "on-device" | "manual";
  attemptedAt: string;
  completedAt?: string;
  failureCode?: TravelDocumentExtractionFailureCode;
  failureMessage?: string;
  facts: TravelDocumentFact[];
};

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
  extraction?: TravelDocumentExtraction;
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
