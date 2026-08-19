import { timeStringToMinutes } from "../../../utils/schedule";
import type { PlaceCongestionEvidence, PlaceConstraintEvidence } from "../../../duri/duri-analysis";
import type { DuriAnalysisSnapshot, DuriReportIssue } from "../types";

type OperatingWindow = { startMinutes: number; endMinutes: number };
type ParsedOperatingWindows =
  | { status: "parsed"; windows: OperatingWindow[] }
  | { status: "unknown"; windows: [] };

const dayNames = ["일", "월", "화", "수", "목", "금", "토"] as const;
const ambiguousOperatingText = /문의|변동|상이|시즌|계절|동절기|하절기|성수기|비수기|일몰|날씨|탄력|현지\s*사정|전화\s*확인/i;
const nonOperatingRangeContext = /입장료|이용료|요금|가격|할인|\d[\d,]*\s*원(?:\s|$|[),])|점심\s*시간|브레이크\s*타임|휴게\s*시간|휴식\s*시간|운영\s*중단/i;

function normalizedText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function weekdayIndex(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.getUTCDay() : undefined;
}

function daySpecIn(segment: string) {
  const text = segment.trim();
  const spec = text.match(/^(?:평일|주말|매일|(?:월|화|수|목|금|토|일)(?:요일)?\s*[~～–—-]\s*(?:월|화|수|목|금|토|일)(?:요일)?|(?:월|화|수|목|금|토|일)(?:요일)?(?:\s*(?:[·,/]|및|과|와)\s*(?:월|화|수|목|금|토|일)(?:요일)?)+|(?:월|화|수|목|금|토|일)(?:요일)?)/)?.[0];
  if (!spec) return undefined;
  const remainder = text.slice(spec.length).trimStart();
  return /^(?:및|과|와|[월화수목금토일](?:요일)?)/.test(remainder) ? undefined : spec;
}

function daySpecApplies(spec: string, date: string) {
  const index = weekdayIndex(date);
  if (index === undefined) return false;
  if (spec.includes("매일")) return true;
  if (spec.includes("평일")) return index >= 1 && index <= 5;
  if (spec.includes("주말")) return index === 0 || index === 6;
  const range = spec.match(/([월화수목금토일])(?:요일)?\s*[~～–—-]\s*([월화수목금토일])/);
  if (range) {
    const start = dayNames.indexOf(range[1] as typeof dayNames[number]);
    const end = dayNames.indexOf(range[2] as typeof dayNames[number]);
    if (start < 0 || end < 0) return false;
    return start <= end ? index >= start && index <= end : index >= start || index <= end;
  }
  const target = dayNames[index];
  return new RegExp(`${target}(?:요일)?`).test(spec);
}

function clockMinutes(marker: string | undefined, hourText: string, colonMinute: string | undefined, koreanMinute: string | undefined) {
  let hour = Number(hourText);
  const minute = Number(colonMinute ?? koreanMinute ?? "0");
  const normalizedMarker = marker?.toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return undefined;
  if (normalizedMarker === "오전" || normalizedMarker === "am") {
    if (hour < 1 || hour > 12) return undefined;
    if (hour === 12) hour = 0;
  } else if (normalizedMarker === "오후" || normalizedMarker === "pm") {
    if (hour < 1 || hour > 12) return undefined;
    if (hour !== 12) hour += 12;
  } else if (hour < 0 || hour > 24 || (hour === 24 && minute !== 0)) {
    return undefined;
  }
  return hour * 60 + minute;
}

function rangesIn(value: string) {
  // 가격·날짜처럼 보이는 bare 숫자 범위와 실제로 문을 닫는 휴게시간을
  // 영업시간으로 승격하지 않는다. 한 문장에 영업시간과 예외가 섞인 경우에도
  // 일부만 추측하기보다 해당 원문 전체를 unknown으로 남긴다.
  if (nonOperatingRangeContext.test(value)) return [];
  if (/24\s*시간/.test(value)) {
    if (/24\s*시간\s*(?:운영|이용|개방)?\s*(?:하지\s*않|아님|불가)|24\s*시간.*(?:제외|휴무)/i.test(value)) return [];
    return [{ startMinutes: 0, endMinutes: 24 * 60 }];
  }
  const ranges: OperatingWindow[] = [];
  const rangePattern = /(오전|오후|am|pm)?\s*(\d{1,2})(?:(?::(\d{2}))|(?:(시)(?:\s*(\d{1,2})\s*분?)?))?\s*(?:~|～|〜|–|—|-|부터)\s*(오전|오후|am|pm)?\s*(\d{1,2})(?:(?::(\d{2}))|(?:(시)(?:\s*(\d{1,2})\s*분?)?))?/gi;
  let match: RegExpExecArray | null;
  while ((match = rangePattern.exec(value))) {
    const startMarker = match[1];
    const endMarker = match[6] ?? startMarker;
    const startHasClockSyntax = Boolean(startMarker || match[3] !== undefined || match[4]);
    const endHasClockSyntax = Boolean(match[6] || match[8] !== undefined || match[9]);
    // `1000~2000원`, `2026-07-18~20` 등을 00:00~20:00처럼
    // 해석하지 않도록 양 끝 모두 명시적인 시각 문법을 요구한다.
    if (!startHasClockSyntax || !endHasClockSyntax || (!startMarker && match[6])) continue;
    const start = clockMinutes(startMarker, match[2], match[3], match[5]);
    const end = clockMinutes(endMarker, match[7], match[8], match[10]);
    if (start === undefined || end === undefined || end <= start) continue;
    ranges.push({ startMinutes: start, endMinutes: end });
  }
  return ranges;
}

/** 모호한 문자열은 추정하지 않고 unknown으로 반환한다. */
export function parseOperatingWindows(value: string, date: string): ParsedOperatingWindows {
  const text = normalizedText(value);
  if (!text || ambiguousOperatingText.test(text)) return { status: "unknown", windows: [] };
  const segments = text.split(/\n|;|；|[,/]\s*(?=(?:평일|주말|매일|[월화수목금토일](?:요일)?))/).map((segment) => segment.trim()).filter(Boolean);
  const marked = segments.map((segment) => ({ segment, spec: daySpecIn(segment) })).filter((entry) => entry.spec);
  const selected = marked.length
    ? marked.filter((entry) => daySpecApplies(entry.spec as string, date)).map((entry) => entry.segment)
    : segments;
  if (!selected.length) return { status: "unknown", windows: [] };
  const windows = selected.flatMap(rangesIn).sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes);
  return windows.length ? { status: "parsed", windows } : { status: "unknown", windows: [] };
}

function parseExplicitWeeklyClosure(value: string, date: string) {
  const text = normalizedText(value);
  if (!text || weekdayIndex(date) === undefined) return { status: "unknown" as const };
  // `연중무휴(설날·추석 휴무)`처럼 예외가 붙은 문장을 무휴로 단정하지 않는다.
  if (/공휴일|대체휴일|경우|단(?:,|\s)|제외|명절|설날|추석|변동|상이|문의|매월|첫째|둘째|셋째|넷째|마지막/.test(text)) return { status: "unknown" as const };
  const exactNoClosure = text.replace(/[.!。]$/, "").trim();
  if (/^(?:연중\s*무휴|휴무\s*없음|무휴)$/.test(exactNoClosure)) return { status: "parsed" as const, closed: false };
  const weekly = text.match(/매주\s*([^\n.;]+)/);
  const closurePhrase = text.match(/^(.+?)\s*(?:휴무|휴관|휴점)$/);
  const exactDay = text.match(/^[월화수목금토일](?:요일)?$/)?.[0];
  const candidate = weekly?.[1] ?? closurePhrase?.[1] ?? exactDay ?? "";
  const spec = daySpecIn(candidate);
  const remainder = spec ? candidate.trim().slice(spec.length).trim() : "";
  if (remainder && !/^(?:휴무|휴관|휴점)$/.test(remainder)) return { status: "unknown" as const };
  return spec
    ? { status: "parsed" as const, closed: daySpecApplies(spec, date) }
    : { status: "unknown" as const };
}

function isExplicitWeeklyClosure(value: string, date: string) {
  const parsed = parseExplicitWeeklyClosure(value, date);
  return parsed.status === "parsed" && parsed.closed;
}

/** 해당 방문일에 실제 판정 가능한 운영 사실이 하나라도 있는지 보수적으로 확인한다. */
export function hasEvaluableOperatingFactForDate(
  evidence: Pick<PlaceConstraintEvidence, "operatingHoursText" | "restDateText" | "eventStartDate" | "eventEndDate">,
  date: string,
) {
  if (evidence.eventStartDate || evidence.eventEndDate) return true;
  if (evidence.operatingHoursText && parseOperatingWindows(evidence.operatingHoursText, date).status === "parsed") return true;
  return Boolean(evidence.restDateText && parseExplicitWeeklyClosure(evidence.restDateText, date).status === "parsed");
}

function operatingWindowLabel(window: OperatingWindow) {
  const label = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${label(window.startMinutes)}~${label(window.endMinutes)}`;
}

function trustedPlaceEvidence(snapshot: DuriAnalysisSnapshot, placeId: string, analyzedAt: string) {
  const analysisTime = Date.parse(analyzedAt);
  if (!Number.isFinite(analysisTime)) return undefined;
  return (snapshot.placeConstraintEvidence ?? [])
    .filter((evidence) => evidence.placeId === placeId
      && evidence.provider === "tour-api"
      && Number.isFinite(Date.parse(evidence.fetchedAt))
      && Date.parse(evidence.fetchedAt) <= analysisTime)
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];
}

function trustedCongestionEvidence(
  snapshot: DuriAnalysisSnapshot,
  placeId: string,
  date: string,
  analyzedAt: string,
): PlaceCongestionEvidence | undefined {
  const analysisTime = Date.parse(analyzedAt);
  if (!Number.isFinite(analysisTime)) return undefined;
  return (snapshot.placeCongestionEvidence ?? [])
    .filter((evidence) => evidence.placeId === placeId
      && evidence.date === date
      && evidence.provider === "tourism-data-lab"
      && Number.isFinite(evidence.rate)
      && evidence.rate >= 0
      && evidence.rate <= 100
      && Number.isInteger(evidence.forecastRank)
      && Number.isInteger(evidence.comparedDayCount)
      && evidence.forecastRank >= 1
      && evidence.forecastRank <= evidence.comparedDayCount
      && evidence.isForecastPeak === (evidence.forecastRank === 1)
      && Number.isFinite(Date.parse(evidence.fetchedAt))
      && Date.parse(evidence.fetchedAt) <= analysisTime)
    .sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];
}

function formattedCongestionRate(rate: number) {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1).replace(/\.0$/, "");
}

/**
 * 집중률은 절대 혼잡도·대기시간이 아니므로 하드 제약이나 자동 변경 근거로
 * 사용하지 않는다. API 응답 자체의 최고 수준 날짜만 Soft, 나머지는 정보로 남긴다.
 */
export function analyzePlaceCongestionConstraints(
  snapshot: DuriAnalysisSnapshot,
  analyzedAt: string,
): DuriReportIssue[] {
  const grouped = new Map<string, typeof snapshot.itinerary>();
  snapshot.itinerary.forEach((item) => {
    if (!item.placeId) return;
    const key = `${item.placeId}\u0000${item.date}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  return [...grouped.values()].flatMap((items) => {
    const first = items[0];
    if (!first?.placeId) return [];
    const place = snapshot.placesById[first.placeId];
    const evidence = trustedCongestionEvidence(snapshot, first.placeId, first.date, analyzedAt);
    if (!place || !evidence) return [];
    const rate = formattedCongestionRate(evidence.rate);
    const comparablePeak = evidence.isForecastPeak && evidence.comparedDayCount > 1;
    return [{
      id: `visitor-congestion-${first.placeId}-${first.date}`,
      category: "density" as const,
      severity: comparablePeak ? "low" as const : "info" as const,
      title: comparablePeak
        ? `${place.name} 방문일이 응답된 예측일 중 최고 집중률 수준이에요`
        : `${place.name} 방문일의 집중률 예측을 확인했어요`,
      summary: `방문일 ${first.date}의 예측 집중률은 ${rate}/100이며, 응답된 ${evidence.comparedDayCount}개 예측일 중 높은 순 ${evidence.forecastRank}위예요. 100은 이 관광지의 과거 가장 붐빈 시기 수준을 뜻해 장소 간 숫자를 직접 비교할 수 없고, 절대 방문자 수·대기시간·수용 한계도 뜻하지 않아요.${comparablePeak ? " 날짜를 바꿀 수 있다면 같은 장소의 다른 예측일도 비교하되 예약·운영시간·잠금 일정을 먼저 지켜 주세요." : " 이 값만으로 일정을 바꾸지는 않아요."}`,
      date: first.date,
      affectedItemIds: items.map((item) => item.id).sort(),
      affectedPlaceIds: [first.placeId],
      affectedMemberIds: [],
      evidence: [
        {
          label: "방문일 집중률",
          value: `${rate}/100 · 응답 ${evidence.comparedDayCount}일 중 높은 순 ${evidence.forecastRank}위`,
          source: "한국관광공사 관광지 집중률 방문자 추이 예측 정보",
          observedAt: evidence.fetchedAt,
          itemIds: items.map((item) => item.id).sort(),
          placeIds: [first.placeId],
        },
        {
          label: "수치 의미와 한계",
          value: "KT 이동통신 자료와 2018년 이후 패턴을 사용한 장소별 향후 예측 상대값이며, 장소 간 비교가 불가능하고 실제 현장 혼잡·시간대별 대기시간과 다를 수 있음",
        },
      ],
      suggestionSupported: false,
      constraintType: comparablePeak ? "soft" as const : "informational" as const,
      confidence: "medium" as const,
      source: "external-evidence" as const,
    }];
  });
}

export function analyzePlaceOperatingConstraints(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  return snapshot.itinerary.flatMap((item) => {
    const place = item.placeId ? snapshot.placesById[item.placeId] : undefined;
    const placeEvidence = item.placeId ? trustedPlaceEvidence(snapshot, item.placeId, analyzedAt) : undefined;
    if (!place || !placeEvidence) return [];
    const issues: DuriReportIssue[] = [];
    const common = {
      date: item.date,
      affectedItemIds: [item.id],
      affectedPlaceIds: [place.id],
      affectedMemberIds: [] as string[],
      suggestionSupported: false,
      constraintType: "hard" as const,
      confidence: "medium" as const,
      source: "external-evidence" as const,
    };

    if ((placeEvidence.eventStartDate && item.date < placeEvidence.eventStartDate) || (placeEvidence.eventEndDate && item.date > placeEvidence.eventEndDate)) {
      issues.push({
        ...common,
        id: `event-period-${item.id}`,
        category: "opening-hours",
        severity: "high",
        title: "행사 기간과 방문 날짜가 맞지 않아요",
        summary: `${place.name}의 TourAPI 행사 기간 밖에 일정이 배치되어 있어요. 행사 날짜를 다시 확인해 주세요.`,
        evidence: [{ label: "행사 기간", value: `${placeEvidence.eventStartDate ?? "시작일 미상"}~${placeEvidence.eventEndDate ?? "종료일 미상"}`, source: "한국관광공사 TourAPI", observedAt: placeEvidence.fetchedAt }, { label: "현재 방문일", value: item.date }],
      });
    }

    const restDate = placeEvidence.restDateText;
    if (restDate && isExplicitWeeklyClosure(restDate, item.date)) {
      issues.push({
        ...common,
        id: `closed-day-${item.id}`,
        category: "opening-hours",
        severity: "high",
        title: "정기 휴무일에 일정이 배치되어 있어요",
        summary: `${place.name}의 명시된 정기 휴무 요일과 현재 방문일이 겹쳐요. 임시 변경 여부는 장소에 다시 확인해 주세요.`,
        evidence: [{ label: "TourAPI 휴무일 원문", value: normalizedText(restDate), source: "한국관광공사 TourAPI", observedAt: placeEvidence.fetchedAt }, { label: "현재 방문일", value: item.date }],
      });
    }

    const operatingValue = placeEvidence.operatingHoursText;
    if (operatingValue) {
      const parsed = parseOperatingWindows(operatingValue, item.date);
      if (parsed.status === "parsed") {
        const start = timeStringToMinutes(item.startTime);
        const end = start + item.durationMinutes;
        const fits = parsed.windows.some((window) => start >= window.startMinutes && end <= window.endMinutes);
        if (!fits) {
          issues.push({
            ...common,
            id: `opening-hours-${item.id}`,
            category: "opening-hours",
            severity: "high",
            title: "운영시간 안에 방문을 마치기 어려워요",
            summary: `${place.name}의 명확히 해석된 운영시간과 현재 ${item.startTime}부터 ${item.durationMinutes}분 일정이 맞지 않아요. 마지막 입장·라스트 오더는 제공 데이터에 없어 별도로 추정하지 않았어요.`,
            evidence: [
              { label: "해석한 운영시간", value: parsed.windows.map(operatingWindowLabel).join(" / "), source: "한국관광공사 TourAPI", observedAt: placeEvidence.fetchedAt },
              { label: "TourAPI 원문", value: normalizedText(operatingValue) },
            ],
          });
        }
      }
    }
    return issues;
  });
}

function parseDurationPart(value: string) {
  const hour = value.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minute = value.match(/(\d+)\s*분/);
  if (!hour && !minute) return undefined;
  const result = (hour ? Number(hour[1]) * 60 : 0) + (minute ? Number(minute[1]) : 0);
  return Number.isFinite(result) && result > 0 ? Math.round(result) : undefined;
}

/** TourAPI의 명시적 소요시간에서 보수적으로 하한만 추출한다. */
export function parseRecommendedDurationMinutes(value: string) {
  const text = normalizedText(value);
  if (!text || /문의|상이|개인차|코스에\s*따라|이내|최대|까지/.test(text)) return undefined;
  const sameUnitRange = text.match(/(\d+(?:\.\d+)?)\s*(?:~|～|–|—|-)\s*(\d+(?:\.\d+)?)\s*(시간|분)/);
  if (sameUnitRange) {
    const lower = Math.min(Number(sameUnitRange[1]), Number(sameUnitRange[2]));
    return Math.round(lower * (sameUnitRange[3] === "시간" ? 60 : 1));
  }
  const parts = text.split(/(?:~|～|–|—)/).map(parseDurationPart).filter((minutes): minutes is number => minutes !== undefined);
  if (parts.length) return Math.min(...parts);
  return parseDurationPart(text);
}

export function analyzeRecommendedDurations(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  return snapshot.itinerary.flatMap((item) => {
    const place = item.placeId ? snapshot.placesById[item.placeId] : undefined;
    const placeEvidence = item.placeId ? trustedPlaceEvidence(snapshot, item.placeId, analyzedAt) : undefined;
    const raw = placeEvidence?.recommendedDurationText;
    const recommendedMinutes = raw ? parseRecommendedDurationMinutes(raw) : undefined;
    if (!place || !raw || recommendedMinutes === undefined || item.durationMinutes >= recommendedMinutes) return [];
    return [{
      id: `recommended-duration-${item.id}`,
      category: "recommended-duration" as const,
      severity: "medium" as const,
      title: `${place.name}의 안내 소요시간보다 짧아요`,
      summary: `TourAPI에 명시된 소요시간의 하한은 ${recommendedMinutes}분이지만 현재 체류시간은 ${item.durationMinutes}분이에요. 일반 장소나 음식점에 임의의 고정 체류시간은 적용하지 않았어요.`,
      date: item.date,
      affectedItemIds: [item.id],
      affectedPlaceIds: [place.id],
      affectedMemberIds: [],
      evidence: [{ label: "TourAPI 소요시간 원문", value: normalizedText(raw), source: "한국관광공사 TourAPI", observedAt: placeEvidence.fetchedAt }, { label: "현재 체류시간", value: `${item.durationMinutes}분` }],
      suggestionSupported: false,
      constraintType: "soft" as const,
      confidence: "medium" as const,
      source: "external-evidence" as const,
    }];
  });
}

export function parseExplicitParkingAvailability(value: string): "available" | "unavailable" | "unknown" {
  const text = normalizedText(value).replace(/\s+/g, " ");
  if (!text || /문의|상이|현지\s*사정|인근\s*확인/i.test(text)) return "unknown";
  if (/^(?:없음|불가|불가능)$|주차(?:장|시설)?\s*(?:없음|불가|불가능)|주차\s*할\s*수\s*없/i.test(text)) return "unavailable";
  if (/주차(?:장|시설)?\s*(?:있음|가능)|주차\s*가능|무료\s*주차|유료\s*주차/i.test(text)) return "available";
  return "unknown";
}

function parseSingleClockMinutes(value: string) {
  const text = normalizedText(value);
  if (!text || ambiguousOperatingText.test(text)) return undefined;
  const matches = [...text.matchAll(/(오전|오후|am|pm)?\s*(\d{1,2})(?:(?::(\d{2}))|(?:시(?:\s*(\d{1,2})\s*분?)?))/gi)]
    .flatMap((match) => {
      const minutes = clockMinutes(match[1], match[2], match[3], match[4]);
      return minutes === undefined ? [] : [minutes];
    });
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : undefined;
}

function memberNameFor(snapshot: DuriAnalysisSnapshot, userId: string) {
  return snapshot.members.find((member) => member.id === userId)?.name ?? "참여자";
}

/** TourAPI 상세의 주차·요금·숙소 체크인 사실을 추정값 없이 보수적으로 안내한다. */
export function analyzePlacePracticalConstraints(snapshot: DuriAnalysisSnapshot, analyzedAt: string): DuriReportIssue[] {
  const budgetSensitiveMemberIds = Object.values(snapshot.preferenceResults)
    .filter((result) => result.answers.budget === 0)
    .map((result) => result.userId)
    .sort();
  return snapshot.itinerary.flatMap((item) => {
    const place = item.placeId ? snapshot.placesById[item.placeId] : undefined;
    const evidence = item.placeId ? trustedPlaceEvidence(snapshot, item.placeId, analyzedAt) : undefined;
    if (!place || !evidence) return [];
    const issues: DuriReportIssue[] = [];
    const common = {
      date: item.date,
      affectedItemIds: [item.id],
      affectedPlaceIds: [place.id],
      suggestionSupported: false,
      source: "external-evidence" as const,
    };

    if (snapshot.trip.transport === "car"
      && evidence.parkingText
      && parseExplicitParkingAvailability(evidence.parkingText) === "unavailable") {
      issues.push({
        ...common,
        id: `parking-unavailable-${item.id}`,
        category: "route",
        severity: "medium",
        title: `${place.name}의 주차 가능 여부를 다시 확인해 주세요`,
        summary: "여행방은 자동차 이동 기준이지만 TourAPI 원문에는 이 장소의 주차가 불가능하다고 명시되어 있어요. 인근 주차장이나 다른 이동수단은 자동으로 가정하지 않았어요.",
        affectedMemberIds: [],
        evidence: [{ label: "TourAPI 주차 원문", value: normalizedText(evidence.parkingText), source: "한국관광공사 TourAPI", observedAt: evidence.fetchedAt }],
        constraintType: "soft",
        confidence: "medium",
      });
    }

    const checkInMinutes = evidence.checkInTimeText ? parseSingleClockMinutes(evidence.checkInTimeText) : undefined;
    const currentStart = timeStringToMinutes(item.startTime);
    if (checkInMinutes !== undefined && Number.isFinite(currentStart) && currentStart < checkInMinutes) {
      issues.push({
        ...common,
        id: `accommodation-check-in-${item.id}`,
        category: "opening-hours",
        severity: "low",
        title: `${place.name} 체크인 시각보다 일정이 빨라요`,
        summary: "짐 보관이나 조기 체크인이 가능할 수도 있어 자동 변경하지 않아요. 숙소에 확인할 Soft 제약으로만 안내해요.",
        affectedMemberIds: [],
        evidence: [
          { label: "TourAPI 체크인 원문", value: normalizedText(evidence.checkInTimeText as string), source: "한국관광공사 TourAPI", observedAt: evidence.fetchedAt },
          { label: "현재 일정 시작", value: item.startTime, itemIds: [item.id] },
        ],
        constraintType: "soft",
        confidence: "medium",
      });
    }

    const feeEvidence = [
      evidence.usageFeeText ? { label: "TourAPI 이용요금 원문", value: evidence.usageFeeText } : undefined,
      evidence.parkingFeeText ? { label: "TourAPI 주차요금 원문", value: evidence.parkingFeeText } : undefined,
    ]
      .filter((entry): entry is { label: string; value: string } => Boolean(entry))
      .filter((entry) => !/무료|없음|해당\s*없음/i.test(entry.value));
    if (budgetSensitiveMemberIds.length && feeEvidence.length) {
      issues.push({
        ...common,
        id: `place-fee-budget-${item.id}`,
        category: "preference",
        severity: "low",
        title: `${place.name}의 이용·주차 요금을 미리 확인해 보세요`,
        summary: `${budgetSensitiveMemberIds.map((userId) => memberNameFor(snapshot, userId)).join(", ")}님의 직접 응답은 절약 우선이에요. 원문 금액을 임의로 숫자로 환산하지 않고 결제 전 확인 항목으로만 안내해요.`,
        affectedMemberIds: budgetSensitiveMemberIds,
        evidence: feeEvidence.map((entry) => ({
          label: entry.label,
          value: normalizedText(entry.value),
          source: "한국관광공사 TourAPI",
          observedAt: evidence.fetchedAt,
          memberIds: budgetSensitiveMemberIds,
        })),
        constraintType: "soft",
        confidence: "medium",
      });
    }
    return issues;
  });
}
