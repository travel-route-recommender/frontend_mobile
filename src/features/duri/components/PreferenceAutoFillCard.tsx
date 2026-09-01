import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, PrimaryButton, TextField } from "../../../components/common";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { WorkspaceTimeField } from "../../workspace/components/WorkspaceTimeField";
import {
  derivePreferenceAutoFillDefaults,
  type PreferenceAutoFillDurationEvidence,
  type PreferenceAutoFillPlan,
  type PreferenceAutoFillRequest,
} from "../logic/preferenceAutoFill";
import { PreferenceAutoFillTechnicalModal } from "./PreferenceAutoFillTechnicalModal";

const durationSourceLabel: Record<PreferenceAutoFillDurationEvidence["source"], string> = {
  "classification-level-3": "비슷한 세부 장소의 기존 체류시간",
  "classification-level-2": "비슷한 장소의 기존 체류시간",
  "content-type": "같은 관광 유형의 기존 체류시간",
  "activity-taxonomy": "같은 활동 유형의 기존 체류시간",
  "exact-category": "같은 카테고리의 기존 체류시간",
  "group-schedule-consensus": "동행자들이 원하는 활동시간",
  "tour-recommended-minimum": "한국관광공사 안내 최소 소요시간",
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
  if (value.includes("비휴식 활동 블록")) return `${count}명의 원하는 활동 길이를 함께 반영`;
  if (value.includes("하루 일정량")) return `${count}명의 원하는 하루 일정량을 함께 반영`;
  return value.replace(/구간 minimax/g, "희망 범위를 고르게 맞춘 값");
}

function friendlyLimitation(value: string) {
  return value
    .replace(/Hard Constraint/gi, "꼭 지켜야 하는 조건")
    .replace(/fallback/gi, "예비 입력값")
    .replace(/planning/gi, "여행 기본 정보")
    .replace(/overlay/gi, "잠금 정보")
    .replace(/taxonomy/gi, "장소 분류")
    .replace(/local optimum/gi, "주변 선택지 중 최선")
    .replace(/adaptive beam/gi, "범위를 조절하는 제한 탐색")
    .replace(/bounded 1-swap/gi, "제한된 한 장소 교체 탐색");
}

type Props = {
  input: DuriAnalysisInput;
  disabled?: boolean;
  disabledReason?: string;
  onGenerate: (request: PreferenceAutoFillRequest) => PreferenceAutoFillPlan | undefined | Promise<PreferenceAutoFillPlan | undefined>;
};

export function PreferenceAutoFillCard({ input, disabled = false, disabledReason, onGenerate }: Props) {
  const defaults = useMemo(() => derivePreferenceAutoFillDefaults(input), [input]);
  const [startTime, setStartTime] = useState(defaults.dailyStartTime ?? "");
  const [endTime, setEndTime] = useState(defaults.dailyEndTime ?? "");
  const [duration, setDuration] = useState(defaults.proposedVisitDurationMinutes?.toString() ?? "");
  const [maxItems, setMaxItems] = useState(defaults.maxNewItems?.toString() ?? "");
  const [plan, setPlan] = useState<PreferenceAutoFillPlan>();
  const [generationError, setGenerationError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const requestRevision = useRef(0);
  const memberNamesById = useMemo(() => Object.fromEntries(input.members.map((member) => [member.id, member.name])), [input.members]);

  const updateField = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPlan(undefined);
    setGenerationError("");
    setGenerating(false);
    setDetailsOpen(false);
    setTechnicalOpen(false);
    requestRevision.current += 1;
  };

  const generate = async () => {
    if (generating) return;
    const revision = requestRevision.current;
    setGenerating(true);
    try {
      const request: PreferenceAutoFillRequest = advancedOpen ? {
        ...(startTime.trim() ? { dailyStartTime: startTime } : {}),
        ...(endTime.trim() ? { dailyEndTime: endTime } : {}),
        ...(duration.trim() ? { proposedVisitDurationMinutes: Number(duration) } : {}),
        ...(maxItems.trim() ? { maxNewItems: Number(maxItems) } : {}),
      } : {};
      const result = await onGenerate(request);
      if (revision !== requestRevision.current) return;
      if (!result) {
        setGenerationError("일정이나 분석 입력이 변경되어 초안을 만들지 않았어요. 최신 화면에서 다시 시도해 주세요.");
        return;
      }
      setGenerationError("");
      setPlan(result);
      setDetailsOpen(false);
      setTechnicalOpen(false);
      if (result.status === "invalid-request") setAdvancedOpen(true);
    } catch (error) {
      if (revision !== requestRevision.current) return;
      // 기기 내 탐색 실패가 분석 리포트 전체를 깨뜨리지 않도록 카드 안에서 격리한다.
      setGenerationError(error instanceof Error && error.message.trim()
        ? error.message
        : "기기에서 초안 계산을 마치지 못했어요. 기존 일정은 변경되지 않았습니다.");
    } finally {
      if (revision === requestRevision.current) setGenerating(false);
    }
  };

  return <Card style={styles.card}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>두리가 일정 초안 만들기</Text>
      <Text style={styles.title}>비어 있는 일정은 두리가 채워드릴게요</Text>
      <Text style={styles.description}>후보 장소, 실제 빈 시간, 동행자 의견을 함께 비교하고 장소마다 필요한 체류시간도 따로 계산해요. 공식 안내 소요시간이 있으면 그보다 짧게 잡지 않으며, 기존 일정·잠금·확정 예약·티켓은 그대로 유지합니다.</Text>
    </View>

    {defaults.sources.length ? <View style={styles.evidence}>
      <Text style={styles.evidenceTitle}>자동으로 반영할 일행 정보</Text>
      {defaults.sources.map((source) => <Text key={source} style={styles.evidenceText}>• {friendlyDefaultSource(source)}</Text>)}
    </View> : <Text style={styles.helper}>일행의 활동 시간이나 하루 일정량을 알 수 있는 응답이 부족해요. 먼저 자동 생성을 시도하고, 꼭 필요한 값만 아래 ‘직접 제한 정하기’에서 요청할게요.</Text>}

    <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} onPress={() => setAdvancedOpen((open) => !open)} style={({ pressed }) => [styles.advancedButton, pressed && styles.pressed]}><View style={styles.advancedCopy}><Text style={styles.advancedTitle}>직접 제한 정하기</Text><Text style={styles.advancedDescription}>원할 때만 활동 시간·예비 체류시간·최대 장소 수를 정해요.</Text></View><Text style={styles.advancedChevron}>{advancedOpen ? "접기" : "열기"}</Text></Pressable>
    {advancedOpen ? <View style={styles.advancedPanel}>
      <Text style={styles.helper}>비워 두면 일행 응답과 기존 일정에서 자동으로 계산해요. 근거가 전혀 없는 값만 직접 입력해 주세요.</Text>
      <View style={styles.fieldRow}>
        <View style={styles.field}><WorkspaceTimeField label="하루 활동 시작 (선택)" value={startTime} onChange={updateField(setStartTime)} minuteInterval={15} /></View>
        <View style={styles.field}><WorkspaceTimeField label="하루 활동 종료 (선택)" value={endTime} onChange={updateField(setEndTime)} minuteInterval={15} allowEndOfDay /></View>
      </View>
      <View style={styles.fieldRow}>
        <View style={styles.field}><TextField label="예비 체류시간 (선택, 분)" value={duration} onChangeText={updateField(setDuration)} keyboardType="number-pad" placeholder="자동 계산 실패 때만 사용" helperText="장소별 표본과 일행 응답이 모두 없을 때만 쓰는 15분 단위 예비값" /></View>
        <View style={styles.field}><TextField label="최대 추가 장소 수 (선택)" value={maxItems} onChangeText={updateField(setMaxItems)} keyboardType="number-pad" placeholder="일행의 하루 일정량으로 자동" helperText="자동으로 정할 근거가 없을 때만 입력" /></View>
      </View>
    </View> : null}

    {disabledReason ? <Text accessibilityRole="alert" style={styles.disabledReason}>{disabledReason}</Text> : null}
    {generationError ? <Text accessibilityRole="alert" style={styles.generationError}>{generationError}</Text> : null}
    <PrimaryButton label={generating ? "최신 일정과 의견 확인 중" : "두리가 일정 초안 짜기"} loading={generating} disabled={disabled || generating} onPress={() => { void generate(); }} />

    {!disabled && plan ? <View accessibilityRole="summary" style={[styles.result, plan.status === "preview-only" ? styles.resultReady : styles.resultBlocked]}>
      <Text style={styles.resultTitle}>{plan.status === "preview-only" ? "검토용 초안을 만들었어요" : "초안을 만들지 않았어요"}</Text>
      <Text style={styles.resultText}>{plan.message}</Text>
      {plan.assignments.map((assignment) => <View key={assignment.itemId} style={styles.assignment}>
        <Text style={styles.assignmentTitle}>{assignment.date} {assignment.startTime} · {assignment.placeName}</Text>
        <Text style={styles.assignmentText}>예상 체류 {assignment.durationMinutes}분 · {friendlyDurationSource(assignment.durationEvidence)} 기준</Text>
        <Text style={styles.assignmentMeta}>{assignment.durationEvidence.lowerBoundOnly
          ? `안내된 최소 ${assignment.durationEvidence.officialMinimumMinutes}분을 15분 배치 단위로 올림 · 상한 정보 없음`
          : assignment.durationEvidence.officialFloorExceededReferenceRange
            ? `안내 최소 ${assignment.durationEvidence.officialMinimumMinutes}분이 기존 참고 상한 ${assignment.durationEvidence.preOfficialUpperMinutes}분보다 길어 ${assignment.durationMinutes}분으로 올림 · 상한 판단 보류`
            : `참고 범위 ${assignment.durationEvidence.lowerMinutes}~${assignment.durationEvidence.upperMinutes}분${assignment.durationEvidence.officialMinimumMinutes === undefined ? "" : ` · 안내 최소 ${assignment.durationEvidence.officialMinimumMinutes}분 반영`} · 의견 근거 ${assignment.preferenceEvidence.length}명`}</Text>
      </View>)}
      {plan.status === "preview-only" ? <>
        <Text style={styles.certificate}>{plan.certificate.selectionExact
          ? `${plan.certificate.evaluatedBundleCount}개 선택지를 모두 비교했어요${plan.certificate.minimumNormalizedSatisfaction === undefined ? "." : `. 가장 불리한 동행자의 예상 만족도도 ${Math.round(plan.certificate.minimumNormalizedSatisfaction * 100)}% 이상이 되도록 골랐어요.`}`
          : `${plan.certificate.evaluatedBundleCount}개 선택지를 비교했어요. 후보가 많아 가능한 모든 조합을 확인하지는 못했어요.`}</Text>
        <Text style={styles.coverage}>일행 의견 반영 {plan.certificate.preferenceEvidenceMemberIds.length}/{input.trip.members.length}명 · 아직 응답하지 않은 사람 {plan.certificate.missingPreferenceMemberIds.length}명</Text>
        <Text style={styles.previewOnly}>새 장소의 실제 이동시간과 운영시간을 모두 확인하기 전이라 자동 적용하지 않고 먼저 보여드려요.</Text>
      </> : null}
      {(plan.limitations.length || plan.certificate.localApplyBlockReasons.length || plan.certificate.assumptions.length) ? <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)} style={styles.detailsButton}>
          <Text style={styles.detailsButtonText}>{detailsOpen ? "선정 이유 접기" : "선정 이유와 확인할 점 보기"}</Text>
        </Pressable>
        {detailsOpen ? <View style={styles.details}>
          {plan.assignments.length ? <View style={styles.detailGroup}><Text style={styles.detailTitle}>장소를 고른 이유</Text>{plan.assignments.map((assignment) => {
            const names = assignment.preferredByUserIds.map((memberId) => memberNamesById[memberId] ?? memberId);
            const tags = [...new Set(assignment.preferenceEvidence.flatMap((entry) => entry.matchedTags))];
            return <Text key={assignment.itemId} style={styles.detailText}>• {assignment.placeName}: {names.length ? `${names.join(", ")}의 후보·선호 기록` : "일행의 후보와 성향 기록"}{tags.length ? ` · 맞는 관심사 ${tags.join(", ")}` : ""}</Text>;
          })}</View> : null}
          {plan.certificate.dayAllocations.length ? <View style={styles.detailGroup}><Text style={styles.detailTitle}>날짜별 배치</Text>{plan.certificate.dayAllocations.map((allocation) => <Text key={allocation.date} style={styles.detailText}>• {allocation.date}: 기존 일정 {allocation.existingMinutes}분 · 새 장소 {allocation.addedCount}개{allocation.preferredDailyScheduledMinutes === undefined ? "" : ` · 일행이 원하는 하루 일정량 약 ${Math.round(allocation.preferredDailyScheduledMinutes)}분`}</Text>)}</View> : null}
          <View style={styles.detailGroup}><Text style={styles.detailTitle}>바로 적용하지 않는 이유</Text>{[...new Set(plan.certificate.localApplyBlockReasons)].map((reason) => <Text key={reason} style={styles.detailText}>• {friendlyLimitation(reason)}</Text>)}</View>
          <View style={styles.detailGroup}><Text style={styles.detailTitle}>이번 초안에서 확인하지 못한 것</Text>{[...new Set(plan.limitations)].slice(0, 6).map((limitation) => <Text key={limitation} style={styles.detailText}>• {friendlyLimitation(limitation)}</Text>)}</View>
        </View> : null}
      </> : null}
      <Pressable accessibilityRole="button" onPress={() => setTechnicalOpen(true)} style={({ pressed }) => [styles.technicalButton, pressed && styles.pressed]}><Text style={styles.technicalButtonText}>선정 수식과 체류시간 계산 보기</Text></Pressable>
    </View> : null}
    {plan ? <PreferenceAutoFillTechnicalModal visible={technicalOpen} input={input} plan={plan} onClose={() => setTechnicalOpen(false)} /> : null}
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
  assignment: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
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
