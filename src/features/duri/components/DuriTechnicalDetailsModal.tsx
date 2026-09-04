import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SecondaryButton } from "../../../components/common";
import type { AnalysisTechnicalDetails, AnalysisTechnicalVariable } from "../../../duri/duri-analysis";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisSession, DuriReportIssue, DuriReportIssueCategory } from "../types";
import { DuriMathFormula } from "./DuriMathFormula";

const dimensionLabel = {
  pace: "일정 속도",
  budget: "예산 사용",
  mobility: "이동 부담",
  activity: "활동량",
  mealStyle: "식사 방식",
  planningStyle: "계획 방식",
} as const;

const sourceLabel = {
  "web-engine": "기기 안의 두리 분석 엔진",
  "mobile-context": "여행방에 저장된 일정과 입력값",
  "external-evidence": "외부 API 또는 사용자가 확인한 자료",
} as const;

const confidenceExplanation = {
  high: "직접 입력하거나 확인한 사실, 또는 정확히 일치하는 계산값을 사용했습니다.",
  medium: "출처가 있는 정보지만 형식 해석이나 적용 범위에 불확실성이 있습니다.",
  low: "제한된 일정 패턴이나 일부 응답만으로 계산해 참고용으로만 사용합니다.",
  unknown: "신뢰도를 판정할 만큼 근거가 모이지 않았습니다.",
} as const;

const fallbackModel: Record<DuriReportIssueCategory, { model: string; formula: string; complexity: string }> = {
  route: { model: "연속 장소 공간 흐름", formula: String.raw`D = \sum_{i=1}^{n-1} d(p_i,p_{i+1})`, complexity: "일정 수 n에 대해 O(n)" },
  density: { model: "하루 활동량과 연속 활동 구간", formula: String.raw`T_d = \sum_{i \in d} duration_i`, complexity: "일정 수 n에 대해 O(n)" },
  meal: { model: "식사 시간대 겹침 검사", formula: String.raw`covered(w)=\exists i:\; start_i < end_w \land start_w < end_i`, complexity: "날짜별 일정 수와 식사창 수의 곱" },
  preference: { model: "동행자 성향 분산과 합의도", formula: String.raw`A = \frac{2}{n(n-1)}\sum_{i<j}\left(1-\frac{|x_i-x_j|}{2}\right)`, complexity: "응답자 수 n에 대해 O(n²)" },
  "time-conflict": { model: "일정 구간 겹침 검사", formula: String.raw`overlap = \max(0,\min(e_a,e_b)-\max(s_a,s_b))`, complexity: "날짜별 정렬 후 인접 일정 수에 대해 O(n)" },
  "day-balance": { model: "날짜별 일정량 비교", formula: String.raw`\Delta_d = |T_d - median(T)|`, complexity: "날짜 수 d와 일정 수 n에 대해 O(n+d\log d)" },
  "candidate-usage": { model: "후보 일정 반영률", formula: String.raw`C = \frac{N_{scheduled}}{N_{candidate}}`, complexity: "후보와 일정 수에 대해 O(n)" },
  "end-condition": { model: "마지막 일정과 복귀 시각 여유", formula: String.raw`slack = t_{return\ cutoff} - t_{last\ end}`, complexity: "마지막 날 일정 수 n에 대해 O(n)" },
  "confirmed-schedule": { model: "확정 일정 일치 검사", formula: String.raw`violation = 1[planned \neq confirmed]`, complexity: "확정 조건과 일정 수에 대해 O(n)" },
  "opening-hours": { model: "방문시간과 운영시간 교집합", formula: String.raw`valid = 1[start_i \geq open \land end_i \leq close]`, complexity: "운영시간이 확인된 일정 수에 대해 O(n)" },
  "recommended-duration": { model: "확인된 권장시간 대비 체류시간", formula: String.raw`\Delta t = t_{planned} - t_{recommended}`, complexity: "권장시간이 확인된 일정 수에 대해 O(n)" },
  "route-optimization": { model: "현재 순서와 검증된 대안 비교", formula: String.raw`saving = T_{current} - T_{alternative}`, complexity: "서버가 제공한 대안 수와 경로 구간 수에 비례" },
  "document-check": { model: "문서·예약과 일정 연결 무결성", formula: String.raw`linked = 1[document \rightarrow itinerary]`, complexity: "문서 참조 수에 대해 O(n)" },
  "duplicate-visit": { model: "같은 날짜·장소 중복 검사", formula: String.raw`duplicate(p,d)=1[count(p,d)>1]`, complexity: "일정 수 n에 대해 O(n)" },
  "overnight-recovery": { model: "날짜 사이 휴식 가능 구간", formula: String.raw`recovery_d = start_{d+1} - end_d`, complexity: "여행 날짜 수 d에 대해 O(d)" },
};

function fallbackDetails(issue: DuriReportIssue): AnalysisTechnicalDetails {
  const model = fallbackModel[issue.category];
  return {
    model: model.model,
    formulaLatex: model.formula,
    variables: issue.evidence.map((entry, index) => ({
      symbol: `e_${index + 1}`,
      label: entry.label,
      value: entry.value,
      formattedValue: entry.value,
      source: entry.source ?? sourceLabel[issue.source],
    })),
    steps: [
      "분석 시점의 일정 사본에서 이 항목과 관련된 일정·장소·동행자만 선택했습니다.",
      "확인 가능한 입력값에만 해당 판정식을 적용하고, 값이 없는 범위는 추정하지 않았습니다.",
      "판정 결과는 일정을 직접 바꾸지 않고 사용자에게 확인 항목으로 표시했습니다.",
    ],
    result: issue.summary,
    complexity: model.complexity,
    caveats: ["이 이슈는 이전 분석기 형식이라 세부 대입식이 저장되지 않았습니다. 아래 입력값과 판정 결과는 그대로 보존했습니다."],
  };
}

function formatNumber(value: number | undefined, digits = 2) {
  return value === undefined || !Number.isFinite(value) ? "계산 안 함" : value.toFixed(digits).replace(/\.00$/, "");
}

function TechnicalSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
    {description ? <Text style={styles.description}>{description}</Text> : null}
    {children}
  </View>;
}

function VariableTable({ variables }: { variables: readonly AnalysisTechnicalVariable[] }) {
  if (!variables.length) return <Text style={styles.description}>이 판정에는 따로 표시할 수치 변수가 없습니다.</Text>;
  return <View style={styles.table}>{variables.map((variable, index) => {
    const renderedValue = variable.formattedValue;
    return <View key={`${variable.symbol}-${index}`} style={styles.tableRow}>
      <View style={styles.symbolBox}><Text selectable style={styles.symbol}>{variable.symbol}</Text></View>
      <View style={styles.tableCopy}><Text style={styles.variableLabel}>{variable.label}</Text><Text selectable style={styles.variableValue}>{renderedValue}</Text>{variable.source ? <Text style={styles.variableSource}>출처 · {variable.source}</Text> : null}</View>
    </View>;
  })}</View>;
}

function IssueTechnicalDetails({ issue }: { issue: DuriReportIssue }) {
  const details = issue.technicalDetails ?? fallbackDetails(issue);
  const hasExactSubstitution = Boolean(details.substitutedLatex);
  return <>
    <View style={styles.focusCard}>
      <Text style={styles.eyebrow}>선택한 판정</Text>
      <Text style={styles.focusTitle}>{issue.title}</Text>
      <Text style={styles.description}>{details.model}</Text>
    </View>
    <TechnicalSection title="사용한 계산식" description="기호만 있는 일반식과 이번 일정의 실제 값을 나눠 보여줍니다.">
      <DuriMathFormula label="일반식" latex={details.formulaLatex} />
      {details.substitutedLatex ? <DuriMathFormula label="이번 일정의 실제 대입" latex={details.substitutedLatex} /> : null}
      {!hasExactSubstitution ? <Text style={styles.notice}>이전 형식으로 저장된 판정이라 완전한 대입식은 없어요. 아래에 당시 사용한 입력값을 빠짐없이 표시합니다.</Text> : null}
    </TechnicalSection>
    <TechnicalSection title="실제로 사용한 값"><VariableTable variables={details.variables} /></TechnicalSection>
    <TechnicalSection title="계산 순서">
      <View style={styles.steps}>{details.steps.map((step, index) => <View key={`${index}-${step}`} style={styles.step}><Text style={styles.stepNumber}>{index + 1}</Text><Text style={styles.stepText}>{step}</Text></View>)}</View>
    </TechnicalSection>
    <TechnicalSection title="계산 결과">
      <View style={styles.result}><Text style={styles.resultText}>{details.result}</Text></View>
    </TechnicalSection>
    <TechnicalSection title="신뢰 범위">
      <Text style={styles.description}>판정 근거 · {sourceLabel[issue.source]}</Text>
      <Text style={styles.description}>신뢰도 · {confidenceExplanation[issue.confidence]}</Text>
      {details.complexity ? <Text style={styles.description}>계산량 · {details.complexity}</Text> : null}
      {details.caveats.map((caveat, index) => <Text key={`${index}-${caveat}`} style={styles.caveat}>· {caveat}</Text>)}
    </TechnicalSection>
  </>;
}

function OverallTechnicalDetails({ session }: { session: DuriAnalysisSession }) {
  const highCount = session.issues.filter((issue) => issue.severity === "high").length;
  const mediumCount = session.issues.filter((issue) => issue.severity === "medium").length;
  const lowCount = session.issues.filter((issue) => issue.severity === "low").length;
  const hardCount = session.issues.filter((issue) => issue.constraintType === "hard").length;
  const diagnosis = session.snapshot.groupPreferenceDiagnosis;
  const route = session.snapshot.evidenceCollection?.route;
  const place = session.snapshot.evidenceCollection?.placeDetails;
  const congestion = session.snapshot.evidenceCollection?.congestion;
  const dimensions = (Object.keys(dimensionLabel) as (keyof typeof dimensionLabel)[])
    .map((key) => ({ key, value: diagnosis.dimensions[key] }))
    .filter((entry) => entry.value.responses.length > 0);
  const memberName = new Map(session.snapshot.members.map((member) => [member.id, member.name] as const));
  return <>
    <TechnicalSection title="최종 상태 결정" description="여러 점수를 평균내 중요한 경고가 희석되지 않도록, 가장 먼저 확인해야 할 판정을 우선합니다.">
      <DuriMathFormula label="상태 집계식" latex={String.raw`R=\max(3\cdot 1[n_{high}>0],\;2\cdot 1[n_{medium}>0],\;1\cdot 1[n_{low}>0],\;R_{insufficient})`} />
      <DuriMathFormula label="이번 리포트" latex={String.raw`n_{high}=${highCount},\;n_{medium}=${mediumCount},\;n_{low}=${lowCount},\;n_{hard}=${hardCount},\;R=${session.overallStatus}`} />
      <Text style={styles.description}>높은 위험 항목, 중간 위험 항목, 낮은 위험 항목 순으로 우선합니다. 확인 가능한 문제가 없고 핵심 입력도 부족할 때만 ‘정보 부족’으로 표시합니다.</Text>
    </TechnicalSection>
    <TechnicalSection title="분석에 들어온 정보량" description="확인하지 못한 값을 0으로 바꾸지 않고, 계산 범위에서 제외합니다.">
      <View style={styles.coverageGrid}>
        <CoverageMetric label="성향 응답" value={`${diagnosis.completedMemberCount}/${diagnosis.totalMemberCount}명`} />
        <CoverageMetric label="실제 경로" value={route ? `${route.analyzedLegCount}/${route.requiredLegCount}구간` : "수집 정보 없음"} />
        <CoverageMetric label="장소 운영정보" value={place ? `${place.usablePlaceCount}/${place.scheduledPlaceCount}곳` : "수집 정보 없음"} />
        <CoverageMetric label="혼잡 예측" value={congestion ? `${congestion.matchedPlaceDateCount}/${congestion.scheduledPlaceDateCount}건` : "수집 정보 없음"} />
        <CoverageMetric label="예약·문서" value={`${session.snapshot.documentReferences?.length ?? 0}건`} />
        <CoverageMetric label="분석 일정" value={`${session.result.analyzedItemCount}개`} />
      </View>
      <DuriMathFormula label="범위 계산" latex={String.raw`coverage=\frac{N_{usable}}{N_{required}}`} />
    </TechnicalSection>
    <TechnicalSection title="동행자 성향 계산" description="응답 점수는 0~2 범위입니다. 평균만 보지 않고 사람 사이의 차이와 쌍별 합의도를 함께 계산합니다.">
      <DuriMathFormula label="평균과 흩어진 정도" latex={String.raw`\mu=\frac{1}{n}\sum_{i=1}^{n}x_i,\quad \sigma=\sqrt{\frac{1}{n}\sum_{i=1}^{n}(x_i-\mu)^2}`} />
      <DuriMathFormula label="두 사람씩 비교한 합의도" latex={String.raw`A=\frac{2}{n(n-1)}\sum_{i<j}\left(1-\frac{|x_i-x_j|}{2}\right)`} />
      {dimensions.length ? <View style={styles.dimensionList}>{dimensions.map(({ key, value }) => <View key={key} style={styles.dimensionCard}>
        <View style={styles.dimensionHeading}><Text style={styles.variableLabel}>{dimensionLabel[key]}</Text><Text style={styles.dimensionStatus}>{value.status === "common" ? "의견 같음" : value.status === "compatible" ? "차이 작음" : value.status === "needs-tuning" ? "조율 필요" : "응답 부족"}</Text></View>
        <Text selectable style={styles.dimensionScores}>{value.responses.map((response) => `${memberName.get(response.userId) ?? response.userId}: ${response.score}`).join(" · ")}</Text>
        <Text style={styles.description}>평균 {formatNumber(value.average)} · 중앙값 {formatNumber(value.median)} · 표준편차 {formatNumber(value.standardDeviation)} · 합의도 {value.pairwiseAgreement === undefined ? "계산 안 함" : `${Math.round(value.pairwiseAgreement * 100)}%`}</Text>
      </View>)}</View> : <Text style={styles.notice}>성향 계산에 사용할 직접 응답이 아직 없습니다.</Text>}
    </TechnicalSection>
    <TechnicalSection title="재현 정보">
      <Text selectable style={styles.description}>알고리즘 버전 · {session.algorithmVersion}</Text>
      <Text selectable style={styles.description}>분석 시점 · {new Date(session.analyzedAt).toISOString()}</Text>
      <Text selectable style={styles.description}>입력 지문 · {session.inputFingerprint}</Text>
      <Text style={styles.caveat}>· 같은 입력 지문과 알고리즘 버전으로 결과를 비교해야 합니다.</Text>
      <Text style={styles.caveat}>· 외부 경로·운영정보는 조회 시각과 유효 범위가 맞는 값만 사용합니다.</Text>
    </TechnicalSection>
  </>;
}

function CoverageMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.coverageMetric}><Text style={styles.coverageLabel}>{label}</Text><Text selectable style={styles.coverageValue}>{value}</Text></View>;
}

export function DuriTechnicalDetailsModal({
  visible,
  session,
  issue,
  onClose,
}: {
  visible: boolean;
  session: DuriAnalysisSession;
  issue?: DuriReportIssue;
  onClose: () => void;
}) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.headerEyebrow}>개발·검증용</Text><Text accessibilityRole="header" style={styles.headerTitle}>{issue ? "판정 계산 상세" : "두리 분석 계산 상세"}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="계산 상세 닫기" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><Text style={styles.closeText}>닫기</Text></Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
        <View style={styles.devNotice}><Text style={styles.devNoticeTitle}>일반 리포트와 분리된 계산 기록이에요</Text><Text style={styles.description}>아래에는 모델 이름, 수식, 실제 대입값, 계산 순서와 한계를 그대로 표시합니다. 분석 결과가 나온 과정을 자세히 확인할 때 사용해 주세요.</Text></View>
        {issue ? <IssueTechnicalDetails issue={issue} /> : <OverallTechnicalDetails session={session} />}
        <SecondaryButton label="계산 상세 닫기" onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xxs },
  headerEyebrow: { ...typography.caption, color: colors.primary },
  headerTitle: { ...typography.title, color: colors.text },
  close: { minWidth: 52, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  closeText: { ...typography.caption, color: colors.primary },
  scroll: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl },
  devNotice: { gap: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, padding: spacing.md },
  devNoticeTitle: { ...typography.bodyStrong, color: colors.navy },
  focusCard: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.navy, padding: spacing.lg, ...shadows.card },
  eyebrow: { ...typography.caption, color: colors.primarySoft },
  focusTitle: { ...typography.subtitle, color: colors.white },
  section: { gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, ...shadows.card },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  notice: { ...typography.caption, color: colors.warning, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  table: { overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tableRow: { flexDirection: "row", alignItems: "stretch", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  symbolBox: { width: 76, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  symbol: { ...typography.caption, color: colors.navy, fontFamily: "monospace" },
  tableCopy: { flex: 1, gap: spacing.xxs, padding: spacing.sm },
  variableLabel: { ...typography.bodyStrong, color: colors.text },
  variableValue: { ...typography.caption, color: colors.navy },
  variableSource: { ...typography.caption, color: colors.textMuted },
  steps: { gap: spacing.sm },
  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  stepNumber: { width: 24, height: 24, textAlign: "center", textAlignVertical: "center", borderRadius: radius.pill, ...typography.caption, color: colors.white, backgroundColor: colors.primary },
  stepText: { flex: 1, ...typography.caption, color: colors.textSecondary },
  result: { borderLeftWidth: 4, borderLeftColor: colors.success, borderRadius: radius.sm, backgroundColor: colors.successSoft, padding: spacing.md },
  resultText: { ...typography.bodyStrong, color: colors.text },
  caveat: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  coverageGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  coverageMetric: { flexGrow: 1, flexBasis: "30%", minWidth: 132, gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  coverageLabel: { ...typography.caption, color: colors.textMuted },
  coverageValue: { ...typography.bodyStrong, color: colors.navy },
  dimensionList: { gap: spacing.sm },
  dimensionCard: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  dimensionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  dimensionStatus: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  dimensionScores: { ...typography.caption, color: colors.navy },
  pressed: { opacity: 0.72 },
});
