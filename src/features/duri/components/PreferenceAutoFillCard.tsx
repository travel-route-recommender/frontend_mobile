import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, PrimaryButton, TextField } from "../../../components/common";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { environment } from "../../../config/environment";
import { getTripDates, minutesToTimeString, timeStringToMinutes } from "../../../utils/schedule";
import { WorkspaceTimeField } from "../../workspace/components/WorkspaceTimeField";
import {
  derivePreferenceAutoFillDefaults,
  type PreferenceAutoFillAssignment,
  type PreferenceAutoFillDurationEvidence,
  type PreferenceAutoFillPlan,
  type PreferenceAutoFillRequest,
} from "../logic/preferenceAutoFill";
import {
  PreferenceAutoFillRequestAbortedError,
  PreferenceAutoFillRequestTimeoutError,
  requestPreferenceAutoFillWithDeadline,
} from "../logic/preferenceAutoFillAsync";
import { createAbortableRequestGate } from "../logic/abortableRequestGate";
import { PreferenceAutoFillTechnicalModal } from "./PreferenceAutoFillTechnicalModal";
import { plainDuriUserText } from "../presentation/plainDuriUserText";

// UI가 영구 로딩에 빠지지 않게 하는 안전 한도일 뿐 일정 계산에는 사용하지 않는다.
const AUTO_FILL_TOTAL_REQUEST_TIMEOUT_MS = 25_000;
const AUTO_FILL_REVIEW_REQUEST_TIMEOUT_MS = 30_000;

const durationSourceLabel: Record<PreferenceAutoFillDurationEvidence["source"], string> = {
  "classification-level-3": "비슷한 세부 장소의 기존 체류시간",
  "classification-level-2": "비슷한 장소의 기존 체류시간",
  "content-type": "같은 관광 유형의 기존 체류시간",
  "activity-taxonomy": "같은 활동 유형의 기존 체류시간",
  "exact-category": "같은 카테고리의 기존 체류시간",
  "trip-visit-median": "이 여행에서 실제 사용한 체류시간",
  "group-schedule-consensus": "동행자들이 원하는 활동시간",
  "candidate-evidence-median": "근거가 확인된 다른 후보들의 체류시간",
  "tour-recommended-minimum": "한국관광공사 안내 최소 소요시간",
  "editable-template": "자료가 없을 때 쓰는 편집용 예비시간",
  "user-fallback": "직접 입력한 예비 체류시간",
};

function friendlyDurationSource(evidence: PreferenceAutoFillDurationEvidence) {
  const base = durationSourceLabel[evidence.source];
  return evidence.officialMinimumMinutes !== undefined && evidence.source !== "tour-recommended-minimum"
    ? `${base}과 공식 안내 최소시간`
    : base;
}

function friendlyDefaultSource(value: string) {
  const count = value.match(/(\d+)명/)?.[1] ?? "응답한";
  if (value.includes("첫·마지막 활동")) return `${count}명의 원하는 하루 시작·종료 시간대를 함께 반영`;
  if (value.includes("현재 일정") && value.includes("첫·마지막 배치")) {
    const dayCount = value.match(/(\d+)일/)?.[1] ?? "배치된";
    return `현재 일정 ${dayCount}일에서 실제로 사용한 활동 시간대를 반영`;
  }
  if (value.includes("비휴식 활동 블록")) return `${count}명의 원하는 활동 길이를 함께 반영`;
  if (value.includes("하루 일정량")) return `${count}명의 원하는 하루 일정량을 함께 반영`;
  if (value.includes("낮은 신뢰도 활동 창")) return "응답이 없는 날짜는 조정할 수 있는 10:00~20:00 일정으로 시작";
  if (value.includes("낮은 신뢰도 체류 블록")) return "장소별 자료가 없을 때만 조정 가능한 90분 일정으로 시작";
  return plainDuriUserText(value);
}

function friendlyLimitation(value: string) {
  return plainDuriUserText(value).replace(/planning/gi, "여행 기본 정보");
}

function friendlyRequestError(error: unknown, fallback: string) {
  return plainDuriUserText(toUserFacingApiErrorMessage(error, fallback));
}

type Props = {
  input: DuriAnalysisInput;
  disabled?: boolean;
  disabledReason?: string;
  onGenerate: (
    request: PreferenceAutoFillRequest,
    signal?: AbortSignal,
  ) => PreferenceAutoFillPlan | undefined | Promise<PreferenceAutoFillPlan | undefined>;
  onReviewPlan?: (
    plan: PreferenceAutoFillPlan,
    request: PreferenceAutoFillRequest,
    signal?: AbortSignal,
  ) => void | Promise<void>;
};

type SchedulePreviewEntry = {
  key: string;
  date: string;
  startMinute: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  title: string;
  badge: string;
  assignment?: PreferenceAutoFillAssignment;
};

export function PreferenceAutoFillCard({ input, disabled = false, disabledReason, onGenerate, onReviewPlan }: Props) {
  const defaults = useMemo(() => derivePreferenceAutoFillDefaults(input), [input]);
  const [startTime, setStartTime] = useState(defaults.dailyStartTime ?? "");
  const [endTime, setEndTime] = useState(defaults.dailyEndTime ?? "");
  const [duration, setDuration] = useState(defaults.proposedVisitDurationMinutes?.toString() ?? "");
  const [maxItems, setMaxItems] = useState(defaults.maxNewItems?.toString() ?? "");
  const [plan, setPlan] = useState<PreferenceAutoFillPlan>();
  const [generationError, setGenerationError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [lastRequest, setLastRequest] = useState<PreferenceAutoFillRequest>({});
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const requestRevision = useRef(0);
  const generationRequestGate = useMemo(() => createAbortableRequestGate(), []);
  const reviewRequestGate = useMemo(() => createAbortableRequestGate(), []);
  const memberNamesById = useMemo(() => Object.fromEntries(input.members.map((member) => [member.id, member.name])), [input.members]);
  const scheduleDays = useMemo(() => {
    if (!plan?.assignments.length) return [];
    const dates = getTripDates(input.trip.startDate, input.trip.endDate);
    const dayNumberByDate = new Map(dates.map((date, index) => [date, index + 1] as const));
    const existing: SchedulePreviewEntry[] = input.itinerary.map((item) => {
      const startMinute = timeStringToMinutes(item.startTime);
      const placeName = item.placeId ? input.placesById[item.placeId]?.name : undefined;
      return {
        key: `existing:${item.id}`,
        date: item.date,
        startMinute,
        startTime: item.startTime,
        endTime: minutesToTimeString(startMinute + item.durationMinutes),
        durationMinutes: item.durationMinutes,
        title: placeName ?? item.note?.trim() ?? (item.itemType === "reservation" ? "예약 일정" : "기존 일정"),
        badge: item.lockedForDuri ? "잠금 일정" : item.itemType === "reservation" ? "예약 일정" : "기존 일정",
      };
    });
    const suggested: SchedulePreviewEntry[] = plan.assignments.map((assignment) => {
      const startMinute = timeStringToMinutes(assignment.startTime);
      return {
        key: `suggested:${assignment.itemId}`,
        date: assignment.date,
        startMinute,
        startTime: assignment.startTime,
        endTime: minutesToTimeString(startMinute + assignment.durationMinutes),
        durationMinutes: assignment.durationMinutes,
        title: assignment.placeName,
        badge: "두리 제안",
        assignment,
      };
    });
    return dates.flatMap((date) => {
      const entries = [...existing, ...suggested]
        .filter((entry) => entry.date === date)
        .sort((left, right) => left.startMinute - right.startMinute || left.key.localeCompare(right.key));
      return entries.length ? [{ date, dayNumber: dayNumberByDate.get(date) ?? 1, entries }] : [];
    });
  }, [input.itinerary, input.placesById, input.trip.endDate, input.trip.startDate, plan]);

  useEffect(() => () => {
    requestRevision.current += 1;
    generationRequestGate.cancel();
    reviewRequestGate.cancel();
  }, [generationRequestGate, reviewRequestGate]);

  const updateField = (setter: (value: string) => void) => (value: string) => {
    requestRevision.current += 1;
    generationRequestGate.cancel();
    reviewRequestGate.cancel();
    setter(value);
    setPlan(undefined);
    setGenerationError("");
    setGenerating(false);
    setReviewing(false);
    setReviewError("");
    setDetailsOpen(false);
    setTechnicalOpen(false);
  };

  const generate = async () => {
    if (reviewRequestGate.isActive()) return;
    const controller = generationRequestGate.begin();
    if (!controller) return;
    const revision = requestRevision.current;
    setGenerating(true);
    try {
      const request: PreferenceAutoFillRequest = advancedOpen ? {
        ...(startTime.trim() ? { dailyStartTime: startTime } : {}),
        ...(endTime.trim() ? { dailyEndTime: endTime } : {}),
        ...(duration.trim() ? { proposedVisitDurationMinutes: Number(duration) } : {}),
        ...(maxItems.trim() ? { maxNewItems: Number(maxItems) } : {}),
      } : {};
      const result = await requestPreferenceAutoFillWithDeadline(
        (signal) => Promise.resolve(onGenerate(request, signal)),
        { timeoutMs: AUTO_FILL_TOTAL_REQUEST_TIMEOUT_MS, signal: controller.signal },
      );
      if (revision !== requestRevision.current || !generationRequestGate.isCurrent(controller)) return;
      if (!result) {
        setGenerationError("일정이나 분석 입력이 변경되어 초안을 만들지 않았어요. 최신 화면에서 다시 시도해 주세요.");
        return;
      }
      setGenerationError("");
      setReviewError("");
      setLastRequest(request);
      setPlan(result);
      setDetailsOpen(false);
      setTechnicalOpen(false);
      if (result.status === "invalid-request") setAdvancedOpen(true);
    } catch (error) {
      if (revision !== requestRevision.current || controller.signal.aborted || error instanceof PreferenceAutoFillRequestAbortedError) return;
      // 기기 내 탐색 실패가 분석 리포트 전체를 깨뜨리지 않도록 카드 안에서 격리한다.
      setGenerationError(error instanceof PreferenceAutoFillRequestTimeoutError
        ? "일정 정보를 확인하는 데 시간이 오래 걸려 이번 요청을 멈췄어요. 기존 일정은 바뀌지 않았습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        : friendlyRequestError(error, "초안 계산을 마치지 못했어요. 기존 일정은 변경되지 않았습니다."));
    } finally {
      const owned = generationRequestGate.finish(controller);
      if (owned && revision === requestRevision.current) setGenerating(false);
    }
  };

  const reviewPlan = async () => {
    if (!plan || !onReviewPlan || generationRequestGate.isActive()) return;
    const controller = reviewRequestGate.begin();
    if (!controller) return;
    const revision = requestRevision.current;
    setReviewing(true);
    setReviewError("");
    try {
      await requestPreferenceAutoFillWithDeadline(
        (signal) => Promise.resolve(onReviewPlan(plan, lastRequest, signal)),
        { timeoutMs: AUTO_FILL_REVIEW_REQUEST_TIMEOUT_MS, signal: controller.signal },
      );
    } catch (error) {
      if (revision !== requestRevision.current || controller.signal.aborted || error instanceof PreferenceAutoFillRequestAbortedError) return;
      setReviewError(error instanceof PreferenceAutoFillRequestTimeoutError
        ? "최신 일정 확인이 오래 걸려 멈췄어요. 일정은 바뀌지 않았습니다. 잠시 후 다시 시도해 주세요."
        : friendlyRequestError(error, "초안 검토 화면을 열지 못했어요. 일정은 바뀌지 않았습니다."));
    } finally {
      const owned = reviewRequestGate.finish(controller);
      if (owned && revision === requestRevision.current) setReviewing(false);
    }
  };

  return <Card style={styles.card}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>두리가 일정 초안 만들기</Text>
      <Text style={styles.title}>여행 흐름이 보이는 일정으로 짜드릴게요</Text>
      <Text style={styles.description}>후보 장소, 실제 빈 시간, 동행자 의견을 함께 비교하고 장소마다 필요한 체류시간도 따로 계산해요. 같은 날 앞뒤 장소의 좌표가 있으면 덜 벗어나는 빈 시간을 먼저 고르며, 기존 일정·잠금·확정 예약·티켓은 그대로 유지합니다.</Text>
    </View>

    {defaults.sources.length ? <View style={styles.evidence}>
      <Text style={styles.evidenceTitle}>자동으로 반영할 일행 정보</Text>
      {defaults.sources.map((source) => <Text key={source} style={styles.evidenceText}>• {friendlyDefaultSource(source)}</Text>)}
    </View> : <Text style={styles.helper}>일행의 활동 시간이나 하루 일정량을 알 수 있는 응답이 부족해요. 먼저 자동 생성을 시도하고, 꼭 필요한 값만 아래 ‘직접 제한 정하기’에서 요청할게요.</Text>}

    <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} onPress={() => setAdvancedOpen((open) => !open)} style={({ pressed }) => [styles.advancedButton, pressed && styles.pressed]}><View style={styles.advancedCopy}><Text style={styles.advancedTitle}>직접 제한 정하기</Text><Text style={styles.advancedDescription}>원할 때만 활동 시간·장소당 머무는 시간·추가할 장소 수를 정해요.</Text></View><Text style={styles.advancedChevron}>{advancedOpen ? "접기" : "열기"}</Text></Pressable>
    {advancedOpen ? <View style={styles.advancedPanel}>
      <Text style={styles.helper}>비워 두면 일행 응답과 기존 일정에서 자동으로 계산해요. 직접 제한하고 싶은 값만 입력해 주세요.</Text>
      <View style={styles.fieldRow}>
        <View style={styles.field}><WorkspaceTimeField label="하루 활동 시작 (선택)" value={startTime} onChange={updateField(setStartTime)} minuteInterval={15} /></View>
        <View style={styles.field}><WorkspaceTimeField label="하루 활동 종료 (선택)" value={endTime} onChange={updateField(setEndTime)} minuteInterval={15} allowEndOfDay /></View>
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.field}><TextField label="장소당 머무는 시간 (선택, 분)" value={duration} onChangeText={updateField(setDuration)} keyboardType="number-pad" placeholder="두리가 판단하기 어려울 때 사용" helperText="참고할 체류시간과 일행 응답이 모두 부족할 때만 이 값을 15분 단위로 사용해요." /></View>
        <View style={styles.field}><TextField label="초안에 추가할 장소 수 (선택)" value={maxItems} onChangeText={updateField(setMaxItems)} keyboardType="number-pad" placeholder="두리가 일정에 맞춰 자동 결정" helperText="직접 제한하고 싶을 때만 입력해 주세요." /></View>
      </View>
    </View> : null}

    {disabledReason ? <Text accessibilityRole="alert" style={styles.disabledReason}>{disabledReason}</Text> : null}
    {generationError ? <Text accessibilityRole="alert" style={styles.generationError}>{generationError}</Text> : null}
    <PrimaryButton label={generating ? "일정 초안을 구성하고 있어요" : "두리가 일정 초안 짜기"} loading={generating} disabled={disabled || generating || reviewing} onPress={generate} />

    {!disabled && plan ? <View accessibilityRole="summary" style={[styles.result, plan.status === "preview-only" ? styles.resultReady : styles.resultBlocked]}>
      <Text style={styles.resultTitle}>{plan.status === "preview-only" ? "확인할 일정 초안을 만들었어요" : "초안을 만들지 않았어요"}</Text>
      <Text style={styles.resultText}>{plainDuriUserText(plan.message)}</Text>
      {reviewError ? <Text accessibilityRole="alert" style={styles.generationError}>{reviewError}</Text> : null}
      {scheduleDays.map((day) => <View key={day.date} style={styles.scheduleDay}>
        <View style={styles.scheduleDayHeader}><Text style={styles.scheduleDayTitle}>DAY {day.dayNumber}</Text><Text style={styles.scheduleDate}>{day.date}</Text></View>
        {day.entries.map((entry) => <View key={entry.key} style={[styles.scheduleEntry, entry.assignment && styles.scheduleEntrySuggested]}>
          <View style={styles.scheduleTime}><Text style={styles.scheduleTimeStart}>{entry.startTime}</Text><Text style={styles.scheduleTimeEnd}>{entry.endTime}</Text></View>
          <View style={styles.scheduleEntryCopy}>
            <View style={styles.scheduleEntryHeading}><Text style={styles.assignmentTitle}>{entry.title}</Text><Text style={[styles.scheduleBadge, entry.assignment && styles.scheduleBadgeSuggested]}>{entry.badge}</Text></View>
            {entry.assignment ? <>
              <Text style={styles.assignmentText}>예상 체류 {entry.durationMinutes}분 · {friendlyDurationSource(entry.assignment.durationEvidence)} 기준</Text>
              <Text style={styles.assignmentMeta}>{entry.assignment.durationEvidence.lowerBoundOnly
                ? `안내된 최소 시간 ${entry.assignment.durationEvidence.officialMinimumMinutes}분을 반영했어요. 최대 소요시간은 확인되지 않았어요.`
                : entry.assignment.durationEvidence.rangeUnknown
                  ? `예상 체류 ${entry.durationMinutes}분 · 충분한 시간 자료는 아직 없어요${entry.assignment.durationEvidence.officialMinimumMinutes === undefined ? "." : `. 안내된 최소 ${entry.assignment.durationEvidence.officialMinimumMinutes}분을 반영했어요.`}`
                  : entry.assignment.durationEvidence.officialFloorExceededReferenceRange
                    ? `안내된 최소 시간 ${entry.assignment.durationEvidence.officialMinimumMinutes}분을 반영해 ${entry.durationMinutes}분으로 잡았어요. 최대 소요시간은 다시 확인해 주세요.`
                  : `참고 범위 ${entry.assignment.durationEvidence.lowerMinutes}~${entry.assignment.durationEvidence.upperMinutes}분${entry.assignment.durationEvidence.officialMinimumMinutes === undefined ? "" : ` · 안내 최소 ${entry.assignment.durationEvidence.officialMinimumMinutes}분 반영`} · ${entry.assignment.preferenceEvidence.length ? `의견 근거 ${entry.assignment.preferenceEvidence.length}명` : "선호 근거 없이 중립 배치"}`}</Text>
            </> : <Text style={styles.assignmentMeta}>{entry.durationMinutes}분 · 위치와 시간 유지</Text>}
          </View>
        </View>)}
      </View>)}
      {plan.status === "preview-only" ? <>
        <Text style={styles.certificate}>{plan.certificate.selectionExact
          ? `${plan.certificate.candidatePrefilter ? "이번에 비교한 후보 안에서 " : ""}${plan.certificate.evaluatedBundleCount}개 선택지를 모두 비교했어요${plan.certificate.minimumNormalizedSatisfaction === undefined ? "." : `. 가장 적게 반영된 동행자도 비교 가능한 선호 기준에서 ${Math.round(plan.certificate.minimumNormalizedSatisfaction * 100)}% 이상 반영되도록 골랐어요.`}`
          : `${plan.certificate.evaluatedBundleCount}개 선택지를 비교했어요. 후보가 많아 가능한 모든 조합을 확인하지는 못했어요.`}</Text>
        {plan.certificate.selectionBasis === "neutral-structural"
          ? <Text style={styles.coverage}>후보와 연결되는 선호 근거가 없어 장소 종류·실제 빈 시간·체류시간을 바탕으로 특정 취향에 치우치지 않은 초안을 만들었어요.</Text>
          : <Text style={styles.coverage}>일행 의견 반영 {plan.certificate.preferenceEvidenceMemberIds.length}/{input.trip.members.length}명 · 아직 응답하지 않은 사람 {plan.certificate.missingPreferenceMemberIds.length}명</Text>}
        {plan.certificate.feasibleCountRange ? <Text style={styles.coverage}>장소 수 자동 결정 · 필수 조건과 빈 시간을 지키며 {plan.certificate.feasibleCountRange.maximumCertified ? "배치 가능한 최대" : "확인한 범위에서 배치 가능한"} {plan.certificate.feasibleCountRange.selected}곳으로 구성했어요.</Text> : null}
        {plan.certificate.discoveryCandidatePlaceIds.length ? <Text style={styles.coverage}>새 장소 발견 · 기존 후보만으로 초안을 만들 수 없어 지역 장소 중 {plan.certificate.discoveryCandidatePlaceIds.length}곳을 검토용으로 골랐어요. 여행방에는 아직 저장하지 않았어요.</Text> : null}
        {plan.certificate.geographicPlacement ? <Text style={styles.coverage}>동선 순서 · 제안 {plan.certificate.geographicPlacement.comparableAssignmentCount}곳을 같은 시간 구간의 앞뒤 장소와 함께 비교했어요.</Text> : null}
        <Text style={styles.coverage}>장소 사이 여유 · {plan.certificate.transitionBuffer.minutes}분 ({plan.certificate.transitionBuffer.basis === "observed-route-duration" ? "이 여행에서 확인한 이동시간 기준" : "일정 사이 기본 여유"})</Text>
        {plan.certificate.provisionalRhythm ? <Text style={styles.coverage}>일정 호흡 · 정보가 없는 기본 시간창의 남는 시간을 {plan.certificate.provisionalRhythm.adjustedGapCount}개 구간에 고르게 나눴어요.</Text> : null}
        <Text style={styles.coverage}>운영시간 · 제안 {plan.assignments.length}곳 중 {plan.certificate.operatingFacts.checkedAssignmentCount}곳 확인{plan.certificate.operatingFacts.unknownAssignmentCount ? ` · ${plan.certificate.operatingFacts.unknownAssignmentCount}곳은 확인 필요` : ""}</Text>
        <Text style={styles.previewOnly}>{plan.certificate.localApplyEligible
          ? "적용 전에는 실제 길찾기와 최신 운영시간을 한 번 더 확인해 주세요. 내용을 확인한 뒤 이 초안을 일정에 적용할 수 있어요."
          : plan.certificate.discoveryCandidatePlaceIds.length
            ? "추천 장소를 여행방 후보에 먼저 담고 최신 일정·예약 상태를 다시 확인하면 이 초안을 적용할 수 있어요."
            : "잠금·예약·접근 조건처럼 먼저 확인해야 할 정보가 있어 초안만 보여드려요. 아래 확인할 점을 해결한 뒤 다시 만들어 주세요."}</Text>
        {onReviewPlan ? <PrimaryButton
          label={plan.certificate.discoveryCandidatePlaceIds.length ? "추천 장소를 후보에 담고 전체 초안 보기" : "전체 초안 검토하기"}
          loading={reviewing}
          disabled={reviewing || generating}
          onPress={reviewPlan}
        /> : null}
      </> : null}
      {(plan.limitations.length || plan.certificate.localApplyBlockReasons.length || plan.certificate.localApplyReviewWarnings.length || plan.certificate.assumptions.length) ? <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)} style={styles.detailsButton}>
          <Text style={styles.detailsButtonText}>{detailsOpen
            ? (plan.assignments.length ? "선정 이유 접기" : "확인할 점 접기")
            : (plan.assignments.length ? "선정 이유와 확인할 점 보기" : "왜 만들지 못했는지 보기")}</Text>
        </Pressable>
        {detailsOpen ? <View style={styles.details}>
          {plan.assignments.length ? <View style={styles.detailGroup}><Text style={styles.detailTitle}>장소를 고른 이유</Text>{plan.assignments.map((assignment) => {
            const names = assignment.preferredByUserIds.map((memberId) => memberNamesById[memberId] ?? memberId);
            const tags = [...new Set(assignment.preferenceEvidence.flatMap((entry) => entry.matchedTags))];
            const reason = names.length
              ? `${names.join(", ")}의 후보·선호 기록`
              : assignment.preferenceEvidence.length
                ? "확인된 일행 성향 기록"
                : "중립 후보의 장소 분류와 실제 빈 시간";
            return <Text key={assignment.itemId} style={styles.detailText}>• {assignment.placeName}: {reason}{tags.length ? ` · 맞는 관심사 ${tags.join(", ")}` : ""}</Text>;
          })}</View> : null}
          {plan.certificate.dayAllocations.length ? <View style={styles.detailGroup}><Text style={styles.detailTitle}>날짜별 배치</Text>{plan.certificate.dayAllocations.map((allocation) => <Text key={allocation.date} style={styles.detailText}>• {allocation.date}: 기존 일정 {allocation.existingMinutes}분 · 새 장소 {allocation.addedCount}개{allocation.preferredDailyScheduledMinutes === undefined ? "" : ` · 일행이 원하는 하루 일정량 약 ${Math.round(allocation.preferredDailyScheduledMinutes)}분`}</Text>)}</View> : null}
          {plan.certificate.localApplyBlockReasons.length ? <View style={styles.detailGroup}><Text style={styles.detailTitle}>먼저 해결할 점</Text>{[...new Set(plan.certificate.localApplyBlockReasons)].map((reason) => <Text key={reason} style={styles.detailText}>• {friendlyLimitation(reason)}</Text>)}</View> : null}
          {plan.certificate.localApplyReviewWarnings.length ? <View style={styles.detailGroup}><Text style={styles.detailTitle}>적용 전에 확인할 점</Text>{[...new Set(plan.certificate.localApplyReviewWarnings)].map((reason) => <Text key={reason} style={styles.detailText}>• {friendlyLimitation(reason)}</Text>)}</View> : null}
          <View style={styles.detailGroup}><Text style={styles.detailTitle}>이번 초안에서 확인하지 못한 것</Text>{[...new Set(plan.limitations)].slice(0, 6).map((limitation) => <Text key={limitation} style={styles.detailText}>• {friendlyLimitation(limitation)}</Text>)}</View>
        </View> : null}
      </> : null}
      {environment.showDuriDiagnostics ? <Pressable accessibilityRole="button" onPress={() => setTechnicalOpen(true)} style={({ pressed }) => [styles.technicalButton, pressed && styles.pressed]}><Text style={styles.technicalButtonText}>개발용 계산 기록 보기</Text></Pressable> : null}
    </View> : null}
    {environment.showDuriDiagnostics && plan ? <PreferenceAutoFillTechnicalModal visible={technicalOpen} input={input} plan={plan} onClose={() => setTechnicalOpen(false)} /> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, backgroundColor: "#F8FBFF" },
  heading: { gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  evidence: { gap: 3, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm },
  evidenceTitle: { ...typography.bodyStrong, color: colors.primary },
  evidenceText: { ...typography.caption, color: colors.textSecondary },
  helper: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  advancedButton: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm },
  advancedCopy: { flex: 1, gap: spacing.xxs },
  advancedTitle: { ...typography.bodyStrong, color: colors.text },
  advancedDescription: { ...typography.caption, color: colors.textSecondary },
  advancedChevron: { ...typography.caption, color: colors.primary },
  advancedPanel: { gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm },
  fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  field: { flexGrow: 1, flexBasis: 220 },
  disabledReason: { ...typography.caption, color: colors.warning },
  generationError: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
  result: { gap: spacing.xs, borderRadius: radius.md, padding: spacing.md },
  resultReady: { backgroundColor: colors.primarySoft },
  resultBlocked: { backgroundColor: colors.warningSoft },
  resultTitle: { ...typography.bodyStrong, color: colors.text },
  resultText: { ...typography.caption, color: colors.textSecondary },
  scheduleDay: { overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  scheduleDayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  scheduleDayTitle: { ...typography.bodyStrong, color: colors.navy },
  scheduleDate: { ...typography.caption, color: colors.textMuted },
  scheduleEntry: { flexDirection: "row", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: spacing.sm },
  scheduleEntrySuggested: { backgroundColor: colors.primarySoft },
  scheduleTime: { width: 48, alignItems: "center", gap: 2 },
  scheduleTimeStart: { ...typography.bodyStrong, color: colors.navy },
  scheduleTimeEnd: { ...typography.caption, color: colors.textMuted },
  scheduleEntryCopy: { flex: 1, gap: 2 },
  scheduleEntryHeading: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  scheduleBadge: { ...typography.caption, color: colors.textMuted, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  scheduleBadgeSuggested: { color: colors.primary, backgroundColor: colors.surface },
  assignmentTitle: { ...typography.bodyStrong, color: colors.text },
  assignmentText: { ...typography.caption, color: colors.textSecondary },
  assignmentMeta: { ...typography.caption, color: colors.textMuted },
  certificate: { ...typography.caption, color: colors.primary },
  coverage: { ...typography.caption, color: colors.textSecondary },
  previewOnly: { ...typography.caption, color: colors.warning },
  detailsButton: { minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  detailsButtonText: { ...typography.caption, color: colors.primary },
  details: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  detailGroup: { gap: 3 },
  detailTitle: { ...typography.bodyStrong, color: colors.text },
  detailText: { ...typography.caption, color: colors.textSecondary },
  technicalButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  technicalButtonText: { ...typography.caption, color: colors.primary },
  pressed: { opacity: 0.72 },
});
