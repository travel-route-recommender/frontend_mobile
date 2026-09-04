import type { ConfirmedScheduleConstraint, DuriDocumentReference } from "../../../duri/duri-analysis";
import { redactSensitiveTextPreview } from "../../../utils/sensitiveText";
import type {
  TravelDocument,
  TravelDocumentExtraction,
  TravelDocumentExtractionFailureCode,
  TravelDocumentFact,
  TravelDocumentFactKind,
  TravelDocumentKind,
} from "../types";

const MAX_RECOGNIZED_TEXT_LENGTH = 100_000;
const MAX_EVIDENCE_SNIPPET_LENGTH = 96;
const DEFAULT_TIMEOUT_MS = 20_000;
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const factKinds: readonly TravelDocumentFactKind[] = ["reservation", "train", "bus", "rental-car-return", "mandatory-place"];

type Candidate<T> = {
  value: T;
  confidence: number;
  score: number;
  evidence: string;
};

export type TravelDocumentTextRecognitionAvailability =
  | { available: true }
  | {
    available: false;
    code: Extract<TravelDocumentExtractionFailureCode, "unsupported-runtime" | "unsupported-file-type" | "pdf-rendering-required">;
    message: string;
  };

export type TravelDocumentRecognizedPage = {
  pageNumber?: number;
  text: string;
  confidence?: number;
};

/**
 * 네이티브 OCR 구현은 이 경계 뒤에 둔다. 구현체는 원문을 외부 서버로
 * 전송하지 않는 경우에만 `mode: on-device`로 등록해야 한다.
 */
export interface TravelDocumentTextRecognizer {
  readonly id: string;
  readonly mode: "on-device";
  getAvailability(document: Pick<TravelDocument, "mimeType" | "fileName">): TravelDocumentTextRecognitionAvailability;
  recognize(input: {
    uri: string;
    mimeType: string;
    signal?: AbortSignal;
  }): Promise<{ pages: TravelDocumentRecognizedPage[] }>;
}

export type TravelDocumentExtractionContext = {
  tripStartDate?: string;
  tripEndDate?: string;
  fileAvailable?: boolean;
  attemptedAt?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type TravelDocumentFactConfirmationInput = {
  factId: string;
  kind?: TravelDocumentFactKind;
  label: string;
  date: string;
  startTime?: string;
  endTime?: string;
  placeName?: string;
  placeId?: string;
  itineraryItemId?: string;
  confirmedByUserId: string;
  confirmedAt?: string;
  tripStartDate?: string;
  tripEndDate?: string;
};

export type TravelDocumentFactConfirmationResult =
  | { ok: true; extraction: TravelDocumentExtraction; fact: TravelDocumentFact }
  | { ok: false; message: string };

export type ConfirmedDocumentConstraintBuildResult = {
  constraints: ConfirmedScheduleConstraint[];
  skipped: { documentId: string; factId?: string; reason: string }[];
};

export type DuriDocumentReferenceWithExtraction = DuriDocumentReference & {
  extractionStatus: TravelDocumentExtraction["status"] | "not-requested";
  confirmedFactIds: string[];
  pendingReviewFactIds: string[];
};

export function getNextTravelDocumentFactForReview(extraction: TravelDocumentExtraction) {
  return extraction.facts.find((fact) => fact.reviewState === "suggested")
    ?? extraction.facts.find((fact) => fact.reviewState === "confirmed")
    ?? extraction.facts[0];
}

function clampConfidence(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toIsoDate(year: number, month: number, day: number) {
  const value = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return isIsoDate(value) ? value : undefined;
}

function withinRange(value: string, start?: string, end?: string) {
  if (start && isIsoDate(start) && value < start) return false;
  if (end && isIsoDate(end) && value > end) return false;
  return true;
}

function normalizedEvidence(value: string) {
  return redactSensitiveTextPreview(value, MAX_EVIDENCE_SNIPPET_LENGTH);
}

function uniqueEvidence(values: readonly string[]) {
  return [...new Set(values.map(normalizedEvidence).filter(Boolean))].slice(0, 4);
}

function kindForDocument(kind: TravelDocumentKind): TravelDocumentFactKind {
  if (kind === "train") return "train";
  if (kind === "bus") return "bus";
  if (kind === "rental-car") return "rental-car-return";
  return "reservation";
}

function relevantKeywords(kind: TravelDocumentKind) {
  if (kind === "train" || kind === "bus") return /출발|승차|탑승|departure|boarding/i;
  if (kind === "rental-car") return /반납|return|drop[ -]?off/i;
  if (kind === "accommodation") return /체크인|입실|check[ -]?in/i;
  if (kind === "admission") return /예약|입장|관람|공연|방문|admission|reservation|visit/i;
  return /예약|방문|출발|입장|reservation|visit|departure/i;
}

function misleadingKeywords(kind: TravelDocumentKind) {
  if (kind === "train" || kind === "bus") return /도착|arrival/i;
  if (kind === "rental-car") return /인수|픽업|pickup|pick[ -]?up/i;
  if (kind === "accommodation") return /체크아웃|퇴실|check[ -]?out/i;
  return /취소|cancel/i;
}

function keywordScore(line: string, kind: TravelDocumentKind) {
  if (relevantKeywords(kind).test(line)) return 4;
  if (misleadingKeywords(kind).test(line)) return -4;
  return 0;
}

function resolveMonthDay(month: number, day: number, start?: string, end?: string) {
  const startYear = start && isIsoDate(start) ? Number(start.slice(0, 4)) : undefined;
  const endYear = end && isIsoDate(end) ? Number(end.slice(0, 4)) : startYear;
  if (startYear === undefined || endYear === undefined || endYear - startYear > 2) return undefined;
  const matches: string[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const value = toIsoDate(year, month, day);
    if (value && withinRange(value, start, end)) matches.push(value);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function dateCandidates(lines: readonly string[], kind: TravelDocumentKind, start?: string, end?: string) {
  const candidates: Candidate<string>[] = [];
  lines.forEach((line) => {
    const score = keywordScore(line, kind);
    const yearPattern = /(20\d{2})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*일?/g;
    for (const match of line.matchAll(yearPattern)) {
      const value = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
      if (value && withinRange(value, start, end)) candidates.push({ value, confidence: score > 0 ? 0.96 : 0.88, score: score + 3, evidence: line });
    }
    const koreanPattern = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/g;
    for (const match of line.matchAll(koreanPattern)) {
      const value = resolveMonthDay(Number(match[1]), Number(match[2]), start, end);
      if (value) candidates.push({ value, confidence: score > 0 ? 0.84 : 0.72, score: score + 1, evidence: line });
    }
    const shortPattern = /(?:^|\D)(\d{1,2})\s*[./-]\s*(\d{1,2})(?=\D|$)/g;
    for (const match of line.matchAll(shortPattern)) {
      const value = resolveMonthDay(Number(match[1]), Number(match[2]), start, end);
      if (value) candidates.push({ value, confidence: score > 0 ? 0.78 : 0.64, score, evidence: line });
    }
  });
  return candidates;
}

function timeCandidates(lines: readonly string[], kind: TravelDocumentKind) {
  const candidates: Candidate<string>[] = [];
  lines.forEach((line) => {
    const score = keywordScore(line, kind);
    const meridiemPattern = /(오전|오후|AM|PM)\s*(\d{1,2})(?:\s*(?::|시)\s*(\d{1,2}))?\s*분?/gi;
    for (const match of line.matchAll(meridiemPattern)) {
      let hour = Number(match[2]);
      const minute = Number(match[3] ?? 0);
      const marker = match[1].toUpperCase();
      if (hour < 1 || hour > 12 || minute > 59) continue;
      if ((marker === "오후" || marker === "PM") && hour !== 12) hour += 12;
      if ((marker === "오전" || marker === "AM") && hour === 12) hour = 0;
      candidates.push({
        value: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
        confidence: score > 0 ? 0.96 : 0.84,
        score: score + 3,
        evidence: line,
      });
    }
    const colonPattern = /(?:^|\D)((?:[01]?\d|2[0-3]))\s*:\s*([0-5]\d)(?=\D|$)/g;
    for (const match of line.matchAll(colonPattern)) {
      candidates.push({
        value: `${Number(match[1]).toString().padStart(2, "0")}:${match[2]}`,
        confidence: score > 0 ? 0.9 : 0.72,
        score: score + 2,
        evidence: line,
      });
    }
    const koreanPattern = /(?:^|\D)((?:[01]?\d|2[0-3]))\s*시(?:\s*([0-5]?\d)\s*분)?/g;
    for (const match of line.matchAll(koreanPattern)) {
      const minute = Number(match[2] ?? 0);
      candidates.push({
        value: `${Number(match[1]).toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
        confidence: score > 0 ? 0.88 : 0.68,
        score: score + 1,
        evidence: line,
      });
    }
  });
  return candidates;
}

function clockValuesFromLine(line: string) {
  const values: string[] = [];
  const add = (hour: number, minute: number, marker?: string) => {
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return;
    if (marker) {
      if (hour < 1 || hour > 12) return;
      const normalized = marker.toUpperCase();
      if ((normalized === "오후" || normalized === "PM") && hour !== 12) hour += 12;
      if ((normalized === "오전" || normalized === "AM") && hour === 12) hour = 0;
    }
    if (hour < 0 || hour > 23) return;
    values.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
  };
  for (const match of line.matchAll(/(오전|오후|AM|PM)\s*(\d{1,2})(?:\s*(?::|시)\s*(\d{1,2}))?\s*분?/gi)) {
    add(Number(match[2]), Number(match[3] ?? 0), match[1]);
  }
  const withoutMeridiem = line.replace(/(오전|오후|AM|PM)\s*\d{1,2}(?:\s*(?::|시)\s*\d{1,2})?\s*분?/gi, " ");
  for (const match of withoutMeridiem.matchAll(/(?:^|\D)((?:[01]?\d|2[0-3]))\s*:\s*([0-5]\d)(?=\D|$)/g)) {
    add(Number(match[1]), Number(match[2]));
  }
  for (const match of withoutMeridiem.matchAll(/(?:^|\D)((?:[01]?\d|2[0-3]))\s*시(?:\s*([0-5]?\d)\s*분)?/g)) {
    add(Number(match[1]), Number(match[2] ?? 0));
  }
  return [...new Set(values)];
}

function endTimeKeywords(kind: TravelDocumentKind) {
  if (kind === "train" || kind === "bus") return /도착|하차|arrival/i;
  if (kind === "accommodation") return /체크아웃|퇴실|check[ -]?out/i;
  if (kind === "admission") return /종료|관람\s*종료|공연\s*종료|end(?:ing)?/i;
  return /종료|end(?:ing)?/i;
}

function startTimeKeywords(kind: TravelDocumentKind) {
  if (kind === "train" || kind === "bus") return /출발|승차|탑승|departure|boarding/i;
  if (kind === "rental-car") return /반납|return|drop[ -]?off/i;
  if (kind === "accommodation") return /체크인|입실|check[ -]?in/i;
  if (kind === "admission") return /예약|입장|관람|공연|시작|admission|reservation|visit|start/i;
  return /예약|방문|출발|입장|시작|reservation|visit|departure|start/i;
}

function prioritizedStartTimeCandidates(lines: readonly string[], kind: TravelDocumentKind) {
  const explicit = lines.flatMap((line): Candidate<string>[] => {
    const values = clockValuesFromLine(line);
    if (!values.length || !startTimeKeywords(kind).test(line)) return [];
    return [{ value: values[0], confidence: 0.94, score: 10, evidence: line }];
  });
  return [...explicit, ...timeCandidates(lines, kind)];
}

/** 도착·종료 표기나 명시적인 시간 범위가 있을 때만 종료 시각 후보를 만든다. */
function endTimeCandidates(lines: readonly string[], kind: TravelDocumentKind) {
  return lines.flatMap((line): Candidate<string>[] => {
    const values = clockValuesFromLine(line);
    if (!values.length) return [];
    const explicitEnd = endTimeKeywords(kind).test(line);
    const explicitRange = values.length >= 2
      && /(?:~|〜|–|—|\bto\b|부터.+까지|\d\s*-\s*(?=\d))/i.test(line)
      && keywordScore(line, kind) > 0;
    if (!explicitEnd && !explicitRange) return [];
    const value = values.at(-1);
    return value ? [{
      value,
      confidence: explicitEnd ? 0.92 : 0.86,
      score: explicitEnd ? 6 : 4,
      evidence: line,
    }] : [];
  });
}

/** 최고 점수가 동률인데 값이 다르면 임의로 하나를 고르지 않는다. */
function chooseUnambiguous<T>(candidates: readonly Candidate<T>[]) {
  if (!candidates.length) return undefined;
  const sorted = [...candidates].sort((left, right) => right.score - left.score || right.confidence - left.confidence);
  const best = sorted[0];
  const tiedValues = new Set(sorted.filter((entry) => entry.score === best.score && entry.confidence === best.confidence).map((entry) => String(entry.value)));
  return tiedValues.size === 1 ? best : undefined;
}

function baseLabel(document: Pick<TravelDocument, "displayName" | "fileName" | "kind">) {
  const raw = document.displayName || document.fileName;
  const withoutExtension = raw.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.slice(0, 80) || `${document.kind} 예약 정보`;
}

export function extractTravelDocumentFactsFromText(input: {
  document: Pick<TravelDocument, "id" | "kind" | "displayName" | "fileName" | "itineraryItemIds">;
  text: string;
  providerId: string;
  providerConfidence?: number;
  extractedAt: string;
  tripStartDate?: string;
  tripEndDate?: string;
}) {
  const text = input.text.normalize("NFKC").replace(/\u0000/g, "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2_000);
  const date = chooseUnambiguous(dateCandidates(lines, input.document.kind, input.tripStartDate, input.tripEndDate));
  const time = chooseUnambiguous(prioritizedStartTimeCandidates(lines, input.document.kind));
  const endCandidate = chooseUnambiguous(endTimeCandidates(lines, input.document.kind));
  const endTime = time && endCandidate && endCandidate.value > time.value ? endCandidate : undefined;
  const fieldConfidences = [date?.confidence, time?.confidence, endTime?.confidence].filter((value): value is number => value !== undefined);
  const providerConfidence = input.providerConfidence === undefined ? 1 : clampConfidence(input.providerConfidence);
  const confidence = fieldConfidences.length
    ? Math.min(0.95, fieldConfidences.reduce((sum, value) => sum + value, 0) / fieldConfidences.length * providerConfidence)
    : 0.2 * providerConfidence;
  const fact: TravelDocumentFact = {
    id: `${input.document.id}-fact-1`,
    kind: kindForDocument(input.document.kind),
    label: baseLabel(input.document),
    ...(date ? { date: date.value } : {}),
    ...(time ? { startTime: time.value } : {}),
    ...(endTime ? { endTime: endTime.value } : {}),
    ...(input.document.itineraryItemIds.length === 1 ? { itineraryItemId: input.document.itineraryItemIds[0] } : {}),
    confidence,
    fieldConfidence: {
      label: 0.5,
      ...(date ? { date: date.confidence } : {}),
      ...(time ? { startTime: time.confidence } : {}),
      ...(endTime ? { endTime: endTime.confidence } : {}),
    },
    reviewState: "suggested",
    provenance: {
      source: "ocr",
      providerId: input.providerId,
      extractedAt: input.extractedAt,
      evidenceSnippets: uniqueEvidence([date?.evidence ?? "", time?.evidence ?? "", endTime?.evidence ?? ""]),
    },
  };
  return [fact];
}

function failedExtraction(input: {
  providerId: string;
  attemptedAt: string;
  status?: "unsupported" | "failed";
  code: TravelDocumentExtractionFailureCode;
  message: string;
}): TravelDocumentExtraction {
  return {
    status: input.status ?? "failed",
    providerId: input.providerId,
    mode: "on-device",
    attemptedAt: input.attemptedAt,
    completedAt: input.attemptedAt,
    failureCode: input.code,
    failureMessage: input.message.slice(0, 240),
    facts: [],
  };
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("OCR_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}

/**
 * OCR 실패를 값으로 격리한다. 호출자는 이 함수의 실패 때문에 문서나 일정을
 * 삭제/변경해서는 안 되며 반환된 extraction만 저장하면 된다.
 */
export async function runTravelDocumentTextExtraction(
  document: TravelDocument,
  recognizer: TravelDocumentTextRecognizer,
  context: TravelDocumentExtractionContext = {},
): Promise<TravelDocumentExtraction> {
  const attemptedAt = context.attemptedAt ?? new Date().toISOString();
  if (context.fileAvailable === false) {
    return failedExtraction({ providerId: recognizer.id, attemptedAt, code: "file-unavailable", message: "기기에서 원본 파일을 찾을 수 없어요." });
  }
  if (document.mimeType === "application/pdf") {
    return failedExtraction({ providerId: recognizer.id, attemptedAt, status: "unsupported", code: "pdf-rendering-required", message: "PDF는 예약 정보를 직접 입력하거나 필요한 페이지를 이미지로 추가해 주세요." });
  }
  if (!imageMimeTypes.has(document.mimeType.toLowerCase())) {
    return failedExtraction({ providerId: recognizer.id, attemptedAt, status: "unsupported", code: "unsupported-file-type", message: "이 이미지 형식은 현재 문자 인식을 지원하지 않아요." });
  }
  const availability = recognizer.getAvailability(document);
  if (!availability.available) {
    return failedExtraction({ providerId: recognizer.id, attemptedAt, status: "unsupported", code: availability.code, message: availability.message });
  }
  try {
    const output = await promiseWithTimeout(
      recognizer.recognize({ uri: document.localUri, mimeType: document.mimeType, signal: context.signal }),
      Math.min(60_000, Math.max(1_000, context.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    );
    const combinedText = output.pages.map((page) => page.text).join("\n").normalize("NFKC").trim();
    if (!combinedText) {
      return failedExtraction({ providerId: recognizer.id, attemptedAt, code: "empty-result", message: "문자 인식 결과가 비어 있어 직접 확인이 필요해요." });
    }
    if (combinedText.length > MAX_RECOGNIZED_TEXT_LENGTH) {
      return failedExtraction({ providerId: recognizer.id, attemptedAt, code: "unsafe-result", message: "인식 결과가 너무 커서 안전하게 처리하지 않았어요." });
    }
    const pageConfidences = output.pages.map((page) => page.confidence).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const providerConfidence = pageConfidences.length ? pageConfidences.reduce((sum, value) => sum + clampConfidence(value), 0) / pageConfidences.length : undefined;
    const facts = extractTravelDocumentFactsFromText({
      document,
      text: combinedText,
      providerId: recognizer.id,
      providerConfidence,
      extractedAt: attemptedAt,
      tripStartDate: context.tripStartDate,
      tripEndDate: context.tripEndDate,
    });
    return {
      status: "needs-review",
      providerId: recognizer.id,
      mode: "on-device",
      attemptedAt,
      completedAt: new Date().toISOString(),
      facts,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "OCR_TIMEOUT";
    return failedExtraction({
      providerId: recognizer.id,
      attemptedAt,
      code: timedOut ? "timeout" : "provider-failed",
      message: timedOut ? "문자 인식 시간이 초과되어 중단했어요. 일정과 문서는 그대로 유지돼요." : "문자 인식에 실패했어요. 일정과 문서는 그대로 유지돼요.",
    });
  }
}

export function createUnavailableTextRecognizer(message = "이 빌드에는 기기 내 문자 인식 모듈이 포함되어 있지 않아요."): TravelDocumentTextRecognizer {
  return {
    id: "unavailable-on-device-ocr",
    mode: "on-device",
    getAvailability: () => ({ available: false, code: "unsupported-runtime", message }),
    recognize: async () => ({ pages: [] }),
  };
}

export function confirmTravelDocumentFact(
  extraction: TravelDocumentExtraction | undefined,
  input: TravelDocumentFactConfirmationInput,
): TravelDocumentFactConfirmationResult {
  const label = input.label.trim().slice(0, 80);
  const confirmedAt = input.confirmedAt ?? new Date().toISOString();
  if (!extraction) return { ok: false, message: "검토할 추출 정보가 없어요." };
  const existing = extraction.facts.find((fact) => fact.id === input.factId);
  if (!existing) return { ok: false, message: "검토할 예약 정보를 찾을 수 없어요." };
  if (!label) return { ok: false, message: "예약 또는 방문 이름을 입력해 주세요." };
  if (!isIsoDate(input.date)) return { ok: false, message: "날짜를 YYYY-MM-DD 형식으로 확인해 주세요." };
  if (!withinRange(input.date, input.tripStartDate, input.tripEndDate)) return { ok: false, message: "여행 기간 안의 날짜인지 다시 확인해 주세요." };
  if (input.startTime && !isTime(input.startTime)) return { ok: false, message: "시작 시각을 HH:mm 형식으로 확인해 주세요." };
  if (input.endTime && !isTime(input.endTime)) return { ok: false, message: "종료 시각을 HH:mm 형식으로 확인해 주세요." };
  if (input.endTime && !input.startTime) return { ok: false, message: "종료 시각을 사용하려면 시작 시각도 입력해 주세요." };
  if (input.startTime && input.endTime && input.endTime <= input.startTime) return { ok: false, message: "종료 시각은 시작 시각보다 뒤여야 해요." };
  if (!input.itineraryItemId && !input.placeId) return { ok: false, message: "하드 일정 조건으로 사용하려면 연결 일정 또는 장소를 선택해 주세요." };
  if (!input.confirmedByUserId.trim() || !Number.isFinite(Date.parse(confirmedAt))) return { ok: false, message: "확인한 사용자와 시각을 기록할 수 없어요." };
  const confirmed: TravelDocumentFact = {
    ...existing,
    kind: input.kind && factKinds.includes(input.kind) ? input.kind : existing.kind,
    label,
    date: input.date,
    ...(input.startTime ? { startTime: input.startTime } : { startTime: undefined }),
    ...(input.endTime ? { endTime: input.endTime } : { endTime: undefined }),
    ...(input.placeName?.trim() ? { placeName: input.placeName.trim().slice(0, 100) } : { placeName: undefined }),
    ...(input.placeId ? { placeId: input.placeId } : { placeId: undefined }),
    ...(input.itineraryItemId ? { itineraryItemId: input.itineraryItemId } : { itineraryItemId: undefined }),
    confidence: 1,
    fieldConfidence: {
      ...existing.fieldConfidence,
      label: 1,
      date: 1,
      ...(input.startTime ? { startTime: 1 } : {}),
      ...(input.endTime ? { endTime: 1 } : {}),
      ...(input.placeName?.trim() ? { placeName: 1 } : {}),
    },
    reviewState: "confirmed",
    provenance: { ...existing.provenance, source: existing.provenance.source },
    confirmedAt,
    confirmedByUserId: input.confirmedByUserId,
  };
  const facts = extraction.facts.map((fact) => fact.id === input.factId ? confirmed : fact);
  return {
    ok: true,
    fact: confirmed,
    extraction: {
      ...extraction,
      status: facts.some((fact) => fact.reviewState === "suggested") ? "needs-review" : "confirmed",
      completedAt: extraction.completedAt ?? confirmedAt,
      facts,
    },
  };
}

/** OCR 없이 사용자가 직접 구조화된 사실을 기록하는 안전한 대체 경로다. */
export function createManualTravelDocumentExtraction(input: {
  document: Pick<TravelDocument, "id" | "kind" | "displayName" | "fileName" | "itineraryItemIds">;
  label?: string;
  createdAt?: string;
}): TravelDocumentExtraction {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    status: "needs-review",
    providerId: "manual-entry",
    mode: "manual",
    attemptedAt: createdAt,
    completedAt: createdAt,
    facts: [{
      id: `${input.document.id}-fact-manual-1`,
      kind: kindForDocument(input.document.kind),
      label: input.label?.trim().slice(0, 80) || baseLabel(input.document),
      ...(input.document.itineraryItemIds.length === 1 ? { itineraryItemId: input.document.itineraryItemIds[0] } : {}),
      confidence: 0,
      fieldConfidence: {},
      reviewState: "suggested",
      provenance: { source: "manual", providerId: "manual-entry", extractedAt: createdAt, evidenceSnippets: [] },
    }],
  };
}

/**
 * 오직 사용자가 명시적으로 확인한 문서 사실만 Duri 하드 제약으로 변환한다.
 * status나 OCR confidence만으로는 절대 변환하지 않는다.
 */
export function buildConfirmedScheduleConstraintsFromDocuments(
  documents: readonly TravelDocument[],
): ConfirmedDocumentConstraintBuildResult {
  const constraints: ConfirmedScheduleConstraint[] = [];
  const skipped: ConfirmedDocumentConstraintBuildResult["skipped"] = [];
  const seen = new Set<string>();
  documents.forEach((document) => {
    const extraction = document.extraction;
    if (!extraction) {
      skipped.push({ documentId: document.id, reason: "structured-fact-missing" });
      return;
    }
    extraction.facts.forEach((fact) => {
      if (fact.reviewState !== "confirmed") {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "not-user-confirmed" });
        return;
      }
      if (!fact.label.trim()) {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "label-missing" });
        return;
      }
      if (!isIsoDate(fact.date ?? "") || (fact.startTime !== undefined && !isTime(fact.startTime))) {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "invalid-date-or-time" });
        return;
      }
      if ((fact.endTime !== undefined && !isTime(fact.endTime))
        || (fact.endTime !== undefined && fact.startTime === undefined)
        || (fact.startTime !== undefined && fact.endTime !== undefined && fact.endTime <= fact.startTime)) {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "invalid-date-or-time" });
        return;
      }
      if (!fact.confirmedAt || !fact.confirmedByUserId || !Number.isFinite(Date.parse(fact.confirmedAt))) {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "confirmation-audit-missing" });
        return;
      }
      if (!fact.itineraryItemId && !fact.placeId) {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "schedule-target-missing" });
        return;
      }
      if (fact.itineraryItemId && !document.itineraryItemIds.includes(fact.itineraryItemId)) {
        skipped.push({ documentId: document.id, factId: fact.id, reason: "source-document-link-missing" });
        return;
      }
      const id = `document-constraint:${document.id}:${fact.id}`;
      if (seen.has(id)) return;
      seen.add(id);
      constraints.push({
        id,
        kind: fact.kind,
        label: fact.label,
        source: "document-confirmed",
        date: fact.date!,
        ...(fact.startTime ? { startTime: fact.startTime } : {}),
        ...(fact.endTime ? { endTime: fact.endTime } : {}),
        ...(fact.itineraryItemId ? { itineraryItemId: fact.itineraryItemId } : {}),
        ...(fact.placeId ? { placeId: fact.placeId } : {}),
        sourceDocumentId: document.id,
        confirmedAt: fact.confirmedAt,
      });
    });
  });
  constraints.sort((left, right) => left.date.localeCompare(right.date) || (left.startTime ?? "").localeCompare(right.startTime ?? "") || left.id.localeCompare(right.id));
  return { constraints, skipped };
}

export function buildDuriDocumentReferencesFromDocuments(
  documents: readonly TravelDocument[],
): DuriDocumentReferenceWithExtraction[] {
  return documents.map((document) => ({
    id: document.id,
    kind: document.kind,
    itineraryItemIds: [...new Set(document.itineraryItemIds)],
    extractionStatus: document.extraction?.status ?? "not-requested",
    confirmedFactIds: document.extraction?.facts.filter((fact) => fact.reviewState === "confirmed").map((fact) => fact.id) ?? [],
    pendingReviewFactIds: document.extraction?.facts.filter((fact) => fact.reviewState === "suggested").map((fact) => fact.id) ?? [],
  }));
}

type UnknownRecord = Record<string, unknown>;
const reviewStates: readonly TravelDocumentFact["reviewState"][] = ["suggested", "confirmed", "rejected"];
const failureCodes: readonly TravelDocumentExtractionFailureCode[] = [
  "unsupported-runtime",
  "unsupported-file-type",
  "pdf-rendering-required",
  "file-unavailable",
  "timeout",
  "provider-failed",
  "empty-result",
  "unsafe-result",
  "interrupted",
];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function normalizeTravelDocumentFact(value: unknown): TravelDocumentFact | undefined {
  if (!isRecord(value) || !factKinds.includes(value.kind as TravelDocumentFactKind)) return undefined;
  const id = optionalText(value.id, 160);
  const label = optionalText(value.label, 80);
  if (!id || !label || !reviewStates.includes(value.reviewState as TravelDocumentFact["reviewState"]) || !isRecord(value.provenance)) return undefined;
  const provenanceSource = value.provenance.source === "ocr" || value.provenance.source === "manual" ? value.provenance.source : undefined;
  const providerId = optionalText(value.provenance.providerId, 100);
  const extractedAt = optionalText(value.provenance.extractedAt, 40);
  if (!provenanceSource || !providerId || !extractedAt || !Number.isFinite(Date.parse(extractedAt))) return undefined;
  const date = optionalText(value.date, 10);
  const startTime = optionalText(value.startTime, 5);
  const endTime = optionalText(value.endTime, 5);
  const rawFieldConfidence = isRecord(value.fieldConfidence) ? value.fieldConfidence : undefined;
  const fieldConfidence = rawFieldConfidence
    ? Object.fromEntries(["label", "date", "startTime", "endTime", "placeName"].flatMap((field) => {
      const confidence = rawFieldConfidence[field];
      return typeof confidence === "number" && Number.isFinite(confidence) ? [[field, clampConfidence(confidence)]] : [];
    })) as TravelDocumentFact["fieldConfidence"]
    : {};
  let reviewState = value.reviewState as TravelDocumentFact["reviewState"];
  let confirmedAt = optionalText(value.confirmedAt, 40);
  let confirmedByUserId = optionalText(value.confirmedByUserId, 160);
  if (reviewState === "confirmed" && (
    !date || !isIsoDate(date)
    || (startTime !== undefined && !isTime(startTime))
    || !confirmedAt || !Number.isFinite(Date.parse(confirmedAt))
    || !confirmedByUserId
    || (!optionalText(value.itineraryItemId, 160) && !optionalText(value.placeId, 160))
  )) {
    // 손상된 persisted data가 하드 제약으로 승격되지 않도록 재검토 상태로 낮춘다.
    reviewState = "suggested";
    confirmedAt = undefined;
    confirmedByUserId = undefined;
  }
  return {
    id,
    kind: value.kind as TravelDocumentFactKind,
    label,
    ...(date && isIsoDate(date) ? { date } : {}),
    ...(startTime && isTime(startTime) ? { startTime } : {}),
    ...(endTime && isTime(endTime) ? { endTime } : {}),
    ...(optionalText(value.placeName, 100) ? { placeName: optionalText(value.placeName, 100) } : {}),
    ...(optionalText(value.placeId, 160) ? { placeId: optionalText(value.placeId, 160) } : {}),
    ...(optionalText(value.itineraryItemId, 160) ? { itineraryItemId: optionalText(value.itineraryItemId, 160) } : {}),
    confidence: typeof value.confidence === "number" ? clampConfidence(value.confidence) : 0,
    fieldConfidence,
    reviewState,
    provenance: {
      source: provenanceSource,
      providerId,
      extractedAt,
      evidenceSnippets: Array.isArray(value.provenance.evidenceSnippets)
        ? uniqueEvidence(value.provenance.evidenceSnippets.filter((entry): entry is string => typeof entry === "string"))
        : [],
    },
    ...(confirmedAt ? { confirmedAt } : {}),
    ...(confirmedByUserId ? { confirmedByUserId } : {}),
  };
}

/** persisted OCR metadata를 보수적으로 복원한다. */
export function normalizeTravelDocumentExtraction(value: unknown): TravelDocumentExtraction | undefined {
  if (!isRecord(value)) return undefined;
  const providerId = optionalText(value.providerId, 100);
  const attemptedAt = optionalText(value.attemptedAt, 40);
  const mode = value.mode === "on-device" || value.mode === "manual" ? value.mode : undefined;
  if (!providerId || !attemptedAt || !Number.isFinite(Date.parse(attemptedAt)) || !mode) return undefined;
  const facts = Array.isArray(value.facts)
    ? value.facts.flatMap((fact) => {
      const normalized = normalizeTravelDocumentFact(fact);
      return normalized ? [normalized] : [];
    }).slice(0, 20)
    : [];
  const rawStatus = value.status;
  const failureCode = failureCodes.includes(value.failureCode as TravelDocumentExtractionFailureCode)
    ? value.failureCode as TravelDocumentExtractionFailureCode
    : undefined;
  const completedAt = optionalText(value.completedAt, 40);
  if (rawStatus === "processing") {
    return {
      status: "failed",
      providerId,
      mode,
      attemptedAt,
      completedAt: completedAt && Number.isFinite(Date.parse(completedAt)) ? completedAt : attemptedAt,
      failureCode: "interrupted",
      failureMessage: "앱이 종료되어 문자 인식이 중단됐어요. 문서와 일정은 그대로 유지돼요.",
      facts,
    };
  }
  if (facts.some((fact) => fact.reviewState === "suggested")) {
    return { status: "needs-review", providerId, mode, attemptedAt, ...(completedAt ? { completedAt } : {}), facts };
  }
  if (facts.length) {
    return { status: "confirmed", providerId, mode, attemptedAt, ...(completedAt ? { completedAt } : {}), facts };
  }
  if ((rawStatus === "unsupported" || rawStatus === "failed") && failureCode) {
    return {
      status: rawStatus,
      providerId,
      mode,
      attemptedAt,
      ...(completedAt ? { completedAt } : {}),
      failureCode,
      ...(optionalText(value.failureMessage, 240) ? { failureMessage: optionalText(value.failureMessage, 240) } : {}),
      facts: [],
    };
  }
  return undefined;
}

/** 일정 삭제/문서 연결 해제 뒤 OCR 사실이 고아 hard constraint가 되지 않게 한다. */
export function reconcileExtractionItineraryTargets(
  extraction: TravelDocumentExtraction | undefined,
  validItineraryItemIds: ReadonlySet<string>,
) {
  if (!extraction) return undefined;
  let changed = false;
  const facts = extraction.facts.map((fact) => {
    if (!fact.itineraryItemId || validItineraryItemIds.has(fact.itineraryItemId)) return fact;
    changed = true;
    const canRemainConfirmedByPlace = Boolean(fact.placeId);
    return {
      ...fact,
      itineraryItemId: undefined,
      ...(fact.reviewState === "confirmed" && !canRemainConfirmedByPlace
        ? { reviewState: "suggested" as const, confirmedAt: undefined, confirmedByUserId: undefined, confidence: Math.min(fact.confidence, 0.95) }
        : {}),
    };
  });
  if (!changed) return extraction;
  const status = facts.some((fact) => fact.reviewState === "suggested")
    ? "needs-review" as const
    : facts.length ? "confirmed" as const : extraction.status;
  return { ...extraction, status, facts };
}
