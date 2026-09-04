import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SecondaryButton } from "../../../components/common";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import type { PreferenceAutoFillDurationEvidence, PreferenceAutoFillPlan } from "../logic/preferenceAutoFill";
import { DuriMathFormula } from "./DuriMathFormula";

const durationSourceLabel: Record<PreferenceAutoFillDurationEvidence["source"], string> = {
  "classification-level-3": "같은 세부 분류의 기존 일정 근거",
  "classification-level-2": "같은 중간 분류의 기존 일정 근거",
  "content-type": "같은 관광 콘텐츠 유형의 기존 일정 근거",
  "activity-taxonomy": "같은 활동 유형의 기존 일정 근거",
  "exact-category": "정확히 같은 카테고리의 기존 일정 근거",
  "trip-visit-median": "동일 여행 전체 방문시간 근거",
  "group-schedule-consensus": "동행자 활동시간 선호의 구간 합의",
  "candidate-evidence-median": "근거가 있는 다른 후보들의 중앙값",
  "tour-recommended-minimum": "한국관광공사 TourAPI 안내 소요시간 하한",
  "editable-template": "편집 가능한 cold-start 예비시간",
  "user-fallback": "사용자가 지정한 예비 체류시간",
};

function percent(value: number) {
  return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{description ? <Text style={styles.description}>{description}</Text> : null}{children}</View>;
}

function DurationRow({ evidence, placeName }: { evidence: PreferenceAutoFillDurationEvidence; placeName: string }) {
  return <View style={styles.row}>
    <View style={styles.rowHeading}><Text style={styles.rowTitle}>{placeName}</Text><Text style={styles.badge}>{evidence.durationMinutes}분</Text></View>
    <Text style={styles.description}>{durationSourceLabel[evidence.source]}</Text>
    {evidence.lowerBoundOnly
      ? <Text selectable style={styles.mono}>단방향 하한 [{evidence.officialMinimumMinutes ?? evidence.lowerMinutes}, ∞)분 · 15분 격자 배치값 {evidence.durationMinutes}분 · 통계 표본/상한 없음</Text>
      : evidence.rangeUnknown
        ? <Text selectable style={styles.mono}>배치 중심값 {evidence.durationMinutes}분 · 신뢰할 양방향 범위 없음 · 실제 표본 {evidence.sampleSize}개{evidence.officialMinimumMinutes === undefined ? "" : ` · 공식 하한 ${evidence.officialMinimumMinutes}분 반영`}</Text>
      : evidence.officialFloorExceededReferenceRange
        ? <Text selectable style={styles.mono}>범위 불일치 · 기존 추천 {evidence.preOfficialDurationMinutes}분, 기존 상한 {evidence.preOfficialUpperMinutes}분 &lt; 격자 공식 하한 {evidence.durationMinutes}분 · 결과 [{evidence.durationMinutes}, ∞)분</Text>
        : <Text selectable style={styles.mono}>경험적 참고 범위 [{evidence.lowerMinutes}, {evidence.upperMinutes}]분 · 실제 표본 {evidence.sampleSize}개 · 유효 표본 {evidence.effectiveSampleSize.toFixed(2)} · 관측 최대편차 {evidence.maximumObservedDeviationMinutes.toFixed(1)}분</Text>}
    {evidence.officialRecommendedDurationText ? <Text selectable style={styles.meta}>· TourAPI 원문: {evidence.officialRecommendedDurationText}{evidence.officialEvidenceFetchedAt ? ` · 조회 ${evidence.officialEvidenceFetchedAt}` : ""}</Text> : null}
    {evidence.officialMinimumMinutes !== undefined && !evidence.lowerBoundOnly ? <Text selectable style={styles.meta}>· 파싱한 공식 하한 {evidence.officialMinimumMinutes}분을 15분 단위로 올림해 경험적 추정의 최소값으로 적용</Text> : null}
    {evidence.components.map((component, index) => <Text key={`${component.source}-${index}`} selectable style={styles.meta}>· {durationSourceLabel[component.source]}: 중심 {component.centerMinutes.toFixed(1)}분 · 흩어짐 {component.dispersionMinutes.toFixed(1)}분 · 가중치 {percent(component.normalizedPrecisionWeight)} · 표본 {component.sampleSize}개</Text>)}
    {!evidence.lowerBoundOnly ? <Text style={styles.meta}>{evidence.rangeUnknown ? "한 개 표본이나 예비 입력의 중심값은 배치에만 사용하며, 분산 0을 정확한 체류시간으로 해석하지 않습니다." : evidence.shrinkageApplied ? "세부 표본 하나를 그대로 복사하지 않고 더 넓은 분류·설문 근거 쪽으로 수축했습니다." : "사용 가능한 경험적 근거가 하나여서 계층 수축은 적용하지 않았습니다."}</Text> : null}
    {evidence.supportingItemIds.length ? <Text selectable style={styles.meta}>사용 일정 ID · {evidence.supportingItemIds.join(", ")}</Text> : null}
  </View>;
}

export function PreferenceAutoFillTechnicalModal({
  visible,
  input,
  plan,
  onClose,
}: {
  visible: boolean;
  input: DuriAnalysisInput;
  plan: PreferenceAutoFillPlan;
  onClose: () => void;
}) {
  const memberName = new Map(input.members.map((member) => [member.id, member.name] as const));
  const placeName = new Map(plan.assignments.map((assignment) => [assignment.placeId, assignment.placeName] as const));
  const satisfaction = Object.entries(plan.certificate.normalizedSatisfactionByMember);
  const scores = satisfaction.map(([, score]) => score);
  const minimum = plan.certificate.fairness?.minimumNormalizedSatisfaction
    ?? (scores.length ? Math.min(...scores) : undefined);
  const nashGeometricMean = plan.certificate.fairness?.nashWelfare ?? (scores.length && scores.every((score) => score > 0)
    ? Math.exp(scores.reduce((sum, score) => sum + Math.log(score), 0) / scores.length)
    : scores.length ? 0 : undefined);
  const sortedScores = [...scores].sort((left, right) => left - right);
  const neutralSelection = plan.certificate.selectionBasis === "neutral-structural";
  const countRange = plan.certificate.feasibleCountRange;
  const structural = plan.certificate.structuralSelection;
  const geographicPlacement = plan.certificate.geographicPlacement;
  const fairnessCertified = plan.certificate.fairnessNormalizationBasis === "feasible-schedule-exact";
  const method = plan.certificate.selectionExact
    ? "주어진 후보 조합과 체류시간 배치를 한도 안에서 모두 비교"
    : `adaptive beam ${plan.certificate.heuristicBeamWidth ?? "?"}개와 제한된 1-swap 탐색`;
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>개발·검증용</Text><Text accessibilityRole="header" style={styles.headerTitle}>일정 생성 계산 상세</Text></View><Pressable accessibilityRole="button" accessibilityLabel="일정 생성 계산 상세 닫기" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><Text style={styles.closeText}>닫기</Text></Pressable></View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
        <View style={styles.notice}><Text style={styles.noticeTitle}>이 화면은 선택 결과를 재현하기 위한 기록이에요</Text><Text style={styles.description}>{neutralSelection ? "선호 근거를 만들지 않고 사용한 장소 수 결정, 분류 다양성, 탐색 범위, 체류시간과 빈 시간 배치 계산을 표시합니다." : "일반 화면에서는 숨긴 효용 정규화, 공정성 목적함수, 탐색 범위, 체류시간 추정과 빈 시간 배치 계산을 표시합니다."}</Text></View>

        <Section title="장소 선택 목적함수" description={neutralSelection
          ? "후보와 연결되는 선호 기록이 없어 가상의 만족도를 넣지 않았습니다. 같은 수의 후보 중 장소 종류가 덜 겹치고, 모든 좌표가 확인된 경우 더 밀집된 묶음을 가중합 없이 차례로 비교합니다."
          : fairnessCertified
            ? "단위가 다른 응답을 임의의 큰 가중치로 더하지 않습니다. 각 사람에게 후보 근거를 중요도 순서대로 비교한 뒤 순위 효용으로 바꾸고, 같은 Hard Constraint에서 실제 배치 가능한 모든 묶음의 개인별 범위로 정규화합니다."
            : "단위가 다른 응답을 임의의 큰 가중치로 더하지 않습니다. 후보가 많아 실행 가능한 개인별 최선·최악을 모두 증명하지 못한 경우, 완화된 범위는 탐색 순서에만 쓰고 만족도 퍼센트로 표시하지 않습니다."}>
          {neutralSelection ? <>
            <DuriMathFormula label="확인 가능한 장소 분류 수" latex={String.raw`C(S)=|\{g(c)\mid c\in S,\;g(c)\neq unknown\}|`} />
            <DuriMathFormula label="같은 분류의 중복 쌍" latex={String.raw`P(S)=\sum_g\frac{n_g(S)(n_g(S)-1)}{2}`} />
            <DuriMathFormula label="좌표가 완전할 때의 지리적 밀집도" latex={String.raw`M(S)=\sum_{e\in MST(S)}d_{haversine}(e)`} />
            <DuriMathFormula label="가중치 없는 구조 비교" latex={String.raw`S^*=\arg\max_{S\in F}^{lex}\left(C(S),-P(S),-M(S)\right)`} />
            {!plan.certificate.selectionExact && structural?.comparableCoordinateCoverage ? <>
              <DuriMathFormula label="제한 탐색 중간 묶음의 빠른 응집도" latex={String.raw`D_{chord}(S)=\sum_{i<j}\lVert x_i-x_j\rVert^2=|S|^2-\left\lVert\sum_i x_i\right\rVert^2`} />
              <Text style={styles.description}>후보를 아직 채우는 중에는 위 단위구면 벡터 값을 선형 시간에 계산해 멀리 흩어진 묶음을 먼저 줄입니다. 완성된 후보 묶음과 마지막 한 장소 교체 비교에서는 다시 좌표상 직선거리 MST를 계산합니다.</Text>
            </> : null}
            <Text selectable style={styles.mono}>이번 결과 · 분류 {structural?.recognizedCategoryCount ?? 0}개 · 중복 쌍 {structural?.categoryConcentrationPairs ?? 0}개 · {structural?.comparableCoordinateCoverage ? `MST ${Math.round(structural.mstDistanceMeters ?? 0).toLocaleString()}m` : "좌표 불완전으로 거리 비교 제외"}</Text>
            <Text style={styles.warning}>이 기준은 개인 취향이 아니라 비슷한 장소만 반복되는 초안을 피하기 위한 중립 보조 기준입니다. 실제 도로 이동시간은 별도로 확인해야 합니다.</Text>
          </> : <>
            <DuriMathFormula label="근거 벡터와 후보 순위 효용" latex={String.raw`v_{mc}=(strength,added,tags,like-dislike,numeric),\quad r_{mc}=|\{d\mid v_{mc}\succ_{lex}v_{md}\}|`} />
            <DuriMathFormula label="참여자별 정규화" latex={String.raw`\tilde u_m(S)=\frac{U_m(S)-L_m}{H_m-L_m}`} />
            <DuriMathFormula label="사전식 공정성 선택" latex={String.raw`S^*=\arg\max_{S\in F}\left(\min_m\tilde u_m(S),\;\prod_m\tilde u_m(S),\;sort^{\uparrow}(\tilde u(S))\right)`} />
            {scores.length ? <DuriMathFormula label="이번 선택의 인증된 결과" latex={String.raw`\tilde u=[${scores.map((score) => score.toFixed(4)).join(",")}],\quad \min\tilde u=${minimum?.toFixed(4)},\quad NW^{1/M}=${nashGeometricMean?.toFixed(4)},\quad R_{max}=${plan.certificate.fairness?.maximumRegret.toFixed(4) ?? "?"}`} /> : plan.certificate.modeledMemberIds.length
              ? <Text style={styles.warning}>성향은 후보 비교에 반영했지만, 실행 가능한 개인별 최저·최고를 전부 증명하지 못해 만족도·후회값은 표시하지 않습니다.</Text>
              : <Text style={styles.warning}>비교 가능한 참여자 효용이 없어 공정성 목적값을 계산하지 않았습니다.</Text>}
            <Text style={styles.description}>근거 벡터는 후보 선호 강도 → 직접 담기 → 정확 태그 → 명시적 호감·불호 → 설문 배분량 순으로 비교합니다. 최종 묶음은 가장 낮은 만족도 → 전체 만족도의 곱 → 낮은 만족도부터 정렬한 벡터 순으로 비교합니다.</Text>
            {plan.certificate.fairness ? <Text style={styles.meta}>평균 후회값 {plan.certificate.fairness.meanRegret.toFixed(4)} · 평가한 후보 묶음 안에서 Pareto 효율 {plan.certificate.fairness.paretoEfficientWithinEvaluatedBundles ? "확인" : "미확인"} · 효용 모델 {plan.certificate.fairness.utilityModel}</Text> : null}
          </>}
        </Section>

        <Section title="추가할 장소 수 결정" description={countRange ? "하루 일정량을 관측하지 못한 경우 한 장소 추천으로 축소하지 않습니다. mustVisit을 포함하면서 실제 빈 구간과 후보별 체류시간을 만족하는 가장 큰 후보 묶음을 일정으로 구성합니다." : "사용자가 지정한 최대 개수 또는 일행의 하루 일정량 관측값을 실제 배치 가능성과 함께 적용했습니다."}>
          {countRange ? <>
            <DuriMathFormula
              label={countRange.maximumCertified ? "배치 가능한 최대 일정 크기" : "탐색에서 찾은 배치 가능 일정 크기"}
              latex={countRange.maximumCertified
                ? String.raw`K^*=\max\{|S|\mid M\subseteq S\subseteq C,\;S\text{ is packable}\}=${countRange.selected}`
                : String.raw`\hat K=|S_{found}|=${countRange.selected}`}
            />
            <Text style={styles.description}>확인 범위 · 필수 포함 최소 {countRange.minimum}곳, 배치 확인 {countRange.maximumConfirmed}곳{plan.certificate.candidatePrefilter ? " · 이번에 비교한 후보군 기준" : ""}</Text>
            <Text style={styles.description}>최대성 확인 · {countRange.maximumCertified ? "현재 비교 후보와 빈 시간 안에서 더 큰 묶음이 불가능함을 확인" : "기기 탐색 한도 때문에 더 큰 배치 가능 묶음이 남아 있을 수 있음"}</Text>
          </> : <Text style={styles.description}>개수 기준 · {plan.certificate.countBasis === "explicit-limit" ? "사용자가 지정한 최대 개수" : "관측된 하루 일정량의 남은 용량"}</Text>}
        </Section>

        <Section title="참여자별 계산 결과">
          {satisfaction.length ? <View style={styles.table}>{satisfaction.map(([memberId, score]) => <View key={memberId} style={styles.tableRow}><Text style={styles.tableLabel}>{memberName.get(memberId) ?? memberId}</Text><Text selectable style={styles.tableValue}>{percent(score)}</Text></View>)}</View> : plan.certificate.modeledMemberIds.length
            ? <Text style={styles.description}>참여자 성향은 선택에 반영했습니다. 다만 이 탐색에서는 실행 가능한 개인별 기준 범위를 인증하지 못해 퍼센트만 숨겼습니다.</Text>
            : <Text style={styles.description}>목적함수에 반영할 수 있는 직접 성향 근거가 없습니다.</Text>}
          {sortedScores.length ? <Text selectable style={styles.mono}>leximin 벡터 · [{sortedScores.map((score) => score.toFixed(4)).join(", ")}]</Text> : null}
          <Text style={styles.meta}>성향 근거가 있는 사람 {plan.certificate.preferenceEvidenceMemberIds.length}/{input.trip.members.length}명 · 목적함수 반영 {plan.certificate.modeledMemberIds.length}명 · 미응답 {plan.certificate.missingPreferenceMemberIds.length}명 · 후보 간 점수 차이가 없는 사람 {plan.certificate.unrepresentedPreferenceMemberIds.length}명</Text>
        </Section>

        <Section title="후보 탐색 범위" description="선택 가능한 조합이 작으면 모두 비교하고, 한도를 넘으면 계산량이 폭증하지 않도록 제한 탐색으로 전환합니다.">
          <DuriMathFormula label="완전 탐색 조합 수" latex={String.raw`N_{bundle}=\binom{N_{candidate}}{K}`} />
          <DuriMathFormula label="이번 실행" latex={String.raw`N=${plan.certificate.candidateCount},\quad K=${plan.certificate.selectedCount},\quad evaluated=${plan.certificate.evaluatedBundleCount}`} />
          <Text style={styles.description}>탐색 방식 · {method}</Text>
          <Text style={styles.description}>증명 범위 · {plan.certificate.exactScope === "candidate-bundle-and-duration-packing" ? "후보 선택과 체류시간 빈자리 배치 모두" : plan.certificate.exactScope === "candidate-bundle-only" ? "후보 선택만" : "전역 최적을 증명하지 않음"}</Text>
          <Text style={styles.description}>만족도 기준 · {fairnessCertified ? "실행 가능한 모든 일정의 참여자별 최저~최고" : plan.certificate.fairnessNormalizationBasis === "relaxed-candidate-bound" ? "탐색용 완화 범위, 사용자 퍼센트 비노출" : "성향 비교 없음"}</Text>
          <Text style={styles.description}>1-swap 이웃 검사 · {plan.certificate.localSearchConverged === undefined ? "완전 탐색이라 해당 없음" : plan.certificate.localSearchConverged ? "검사한 이웃에서 더 나은 안 없음" : "탐색 한도 전에 수렴하지 않음"}</Text>
        </Section>

        <Section title="장소별 체류시간" description="한 개의 고정 시간을 모든 장소에 쓰지 않습니다. 같은 여행의 세부 분류부터 더 넓은 분류까지 서로 겹치지 않는 실제 표본과 동행자 설문 구간을 결합합니다. 표본이 적거나 흩어질수록 그 근거의 영향이 자동으로 작아집니다.">
          <DuriMathFormula label="구성요소별 중심과 불확실성" latex={String.raw`c_j=median(D_j),\quad s_j=\max(MAD_j,MeanAD_j,s_{pool}),\quad p_j=\frac{n_j}{s_j^2}`} />
          <DuriMathFormula label="계층 수축과 15분 표시 격자" latex={String.raw`w_j=\frac{p_j}{\sum_k p_k},\quad \hat d_p=15\cdot round\left(\frac{\sum_j w_jc_j}{15}\right)`} />
          <DuriMathFormula label="설문 구간의 중심" latex={String.raw`c_{survey}=\arg\min_d\max_m dist(d,[l_m,r_m])`} />
          <DuriMathFormula label="공식 안내 하한 적용" latex={String.raw`d_p=\max\left(\hat d_p,15\left\lceil\frac{l_{Tour}}{15}\right\rceil\right)`} />
          <Text style={styles.description}>분산이 0인 단일 표본을 무한히 정확하다고 보지 않습니다. 같은 여행에서 관측된 전체 흩어짐과 설문 시간칸 폭을 함께 사용하며, 확률분포를 가정한 신뢰구간이라고 과장하지 않습니다. TourAPI 원문에서 하한만 해석된 경우에는 그보다 짧은 체류시간을 만들지 않지만, 알 수 없는 상한은 따로 생성하지 않습니다.</Text>
          <View style={styles.list}>{plan.certificate.durationEstimates.map((evidence) => <DurationRow key={evidence.placeId} evidence={evidence} placeName={placeName.get(evidence.placeId) ?? evidence.placeId} />)}</View>
        </Section>

        <Section title="빈 시간 배치와 방문 순서" description="각 장소의 서로 다른 체류시간을 실제 빈 구간에 넣고, 일정끼리 겹치지 않는 조합만 후보 선택 비교에 사용합니다. 좌표가 완전한 같은 구간은 앞뒤 기존 장소를 고정한 짧은 방문 순서로 다시 정렬합니다.">
          <DuriMathFormula label="겹침 금지" latex={String.raw`[s_i,e_i)\cap[s_j,e_j)=\emptyset\quad(i\neq j)`} />
          <Text style={styles.description}>장소 사이 전환 여유 · {plan.certificate.transitionBuffer.minutes}분 · {plan.certificate.transitionBuffer.basis === "observed-route-duration" ? "이 여행에서 조회된 경로시간 중앙값을 15분 단위로 올림" : "실제 경로 확인 전 편집 격자 한 칸"}</Text>
          {plan.certificate.provisionalRhythm ? <Text style={styles.description}>기본 시간창 여백 · {plan.certificate.provisionalRhythm.adjustedGapCount}개 빈 구간에서 남는 시간을 균등 분산 · 사용자가 시간대를 지정하면 적용하지 않음</Text> : null}
          <Text style={styles.description}>운영 사실 · 확인 {plan.certificate.operatingFacts.checkedAssignmentCount}곳 · 시간창 제한 {plan.certificate.operatingFacts.windowRestrictedAssignmentCount}곳 · 미확인 {plan.certificate.operatingFacts.unknownAssignmentCount}곳 · 휴무 날짜 제외 {plan.certificate.operatingFacts.excludedClosedPlaceDateCount}건</Text>
          {geographicPlacement ? <>
            <DuriMathFormula label="구간별 열린 경로" latex={String.raw`\pi^*=\arg\min_{\pi}\left[d_H(p,c_{\pi_1})+\sum_i d_H(c_{\pi_i},c_{\pi_{i+1}})+d_H(c_{\pi_k},n)\right]`} />
            <Text selectable style={styles.mono}>좌표 비교 가능 {geographicPlacement.comparableAssignmentCount}개 · 최적화 구간 {geographicPlacement.optimizedGapCount}개 · 경로 합계 {Math.round(geographicPlacement.totalPathDistanceMeters).toLocaleString()}m · 기존 양 끝 직선 대비 추가 {Math.round(geographicPlacement.totalInsertionDistanceMeters).toLocaleString()}m</Text>
            <Text style={styles.description}>순서 계산 · {geographicPlacement.exactSequence ? "각 구간을 Held-Karp 동적 계획법으로 전부 비교" : "큰 구간에 cheapest insertion 후 bounded 2-opt 적용"}</Text>
            <Text style={styles.warning}>이 값은 날짜 안에서 지리적으로 자연스러운 순서를 고르는 보조 기준입니다. 도로망, 교통수단, 소요시간을 반영한 실제 경로 최적값은 아닙니다.</Text>
          </> : <Text style={styles.warning}>앞뒤 일정과 후보를 연결할 좌표가 부족해 지리적 배치 비교는 생략했습니다.</Text>}
          <Text style={styles.description}>확장한 배치 상태 · {plan.certificate.durationPackingExpandedStates.toLocaleString()}개</Text>
          <Text style={styles.description}>배치 가능성 증명 · {plan.certificate.durationPackingExact ? "설정된 상태 한도 안에서 완료" : "상태 한도에 닿아 전체 최적을 증명하지 못함"}</Text>
          {plan.certificate.candidatePrefilter ? <Text style={styles.description}>후보 사전 축소 · {plan.certificate.candidatePrefilter.originalEligibleCount}곳 중 필수 후보를 보존하고 분류별 순환 선택으로 {plan.certificate.candidatePrefilter.consideredCount}곳 비교 · {plan.certificate.candidatePrefilter.omittedCount}곳은 이번 초안에서 제외</Text> : null}
          {plan.certificate.dayAllocations.map((allocation) => <Text key={allocation.date} style={styles.meta}>· {allocation.date}: 기존 {allocation.existingMinutes}분 · 새 장소 {allocation.addedCount}개 · 가능한 시작 슬롯 {allocation.slotCapacity}개</Text>)}
        </Section>

        <Section title="계산 가정과 한계">
          <View style={styles.list}>{plan.certificate.assumptions.map((assumption) => <Text key={assumption} style={styles.caveat}>가정 · {assumption}</Text>)}{plan.limitations.map((limitation) => <Text key={limitation} style={styles.warning}>한계 · {limitation}</Text>)}</View>
        </Section>
        <SecondaryButton label="계산 상세 닫기" onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xxs },
  eyebrow: { ...typography.caption, color: colors.primary },
  headerTitle: { ...typography.title, color: colors.text },
  close: { minWidth: 52, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  closeText: { ...typography.caption, color: colors.primary },
  scroll: { flex: 1 },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl },
  notice: { gap: spacing.xs, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, padding: spacing.md },
  noticeTitle: { ...typography.bodyStrong, color: colors.navy },
  section: { gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, ...shadows.card },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  list: { gap: spacing.xs },
  row: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  rowHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTitle: { flex: 1, ...typography.bodyStrong, color: colors.text },
  badge: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  mono: { ...typography.caption, color: colors.navy, fontFamily: "monospace" },
  meta: { ...typography.caption, color: colors.textMuted },
  table: { overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tableRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, padding: spacing.sm },
  tableLabel: { flex: 1, ...typography.caption, color: colors.textSecondary },
  tableValue: { ...typography.bodyStrong, color: colors.navy },
  caveat: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  warning: { ...typography.caption, color: colors.warning, borderRadius: radius.sm, backgroundColor: colors.warningSoft, padding: spacing.sm },
  pressed: { opacity: 0.72 },
});
