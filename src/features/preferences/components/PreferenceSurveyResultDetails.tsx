import { StyleSheet, Text, View } from "react-native";
import { Card } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  itineraryMessageQuestions,
  itineraryPreferenceLevelLabels,
} from "../config/itinerary-message-questions";
import {
  accommodationAxes,
  activityBlocks,
  budgetCategories,
  staminaOptions,
} from "../config/travel-preference-test-config";
import {
  getFilledItineraryCount,
  getItineraryDays,
  getItineraryMessageAnswerCount,
} from "../logic/travel-preference-survey";
import type { TravelPreferenceSurveyResult } from "../types";

function ScaleBar({ value, label, max }: { value?: number; label: string; max: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={`${label} ${max}단계 중 ${value ?? 0}단계`} accessibilityValue={{ min: 0, max, now: value ?? 0 }} style={styles.scale}>
    {Array.from({ length: max }, (_, index) => index + 1).map((score) => <View key={score} style={[styles.scaleSegment, Boolean(value && score <= value) && styles.scaleSegmentActive]} />)}
  </View>;
}

function PercentBar({ value, label }: { value: number; label: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={`${label} ${value}점`} accessibilityValue={{ min: 0, max: 100, now: value }} style={styles.percentTrack}>
    <View style={[styles.percentFill, { width: `${value}%` }]} />
  </View>;
}

export function PreferenceSurveyResultDetails({ result }: { result: TravelPreferenceSurveyResult }) {
  const { answers, challengeStylePreference } = result;
  const itineraryDays = getItineraryDays(answers);
  const hasMessageAnswers = getItineraryMessageAnswerCount(answers) > 0;
  const stamina = staminaOptions.find((option) => option.id === answers.stamina)?.resultLabel ?? "미응답";

  return <View style={styles.sections}>
    <Text style={styles.sectionTitle}>새로운 경험 접근 점수</Text>
    <Card style={styles.cardGap}>
      {[
        ["다양성 선호", challengeStylePreference.scores.opennessToVariety],
        ["흥미·자극 선호", challengeStylePreference.scores.excitementSeeking],
        ["신중성", challengeStylePreference.scores.cautiousness],
      ].map(([label, value]) => <View key={String(label)} style={styles.scoreResult}>
        <View style={styles.heading}><Text style={styles.dimension}>{label}</Text><Text selectable style={styles.value}>{value}점</Text></View>
        <PercentBar label={String(label)} value={Number(value)} />
      </View>)}
      <Text style={styles.modelNotice}>이 점수와 유형은 12문항 군집을 6문항으로 재현한 초기 모델 결과이며 실제 여행 행동을 확정하지 않아요.</Text>
    </Card>

    <Text style={styles.sectionTitle}>{hasMessageAnswers ? "여행 활동 선호" : "내가 만든 여행 일정"}</Text>
    {hasMessageAnswers ? (
      <Card style={styles.cardGap}>
        {itineraryMessageQuestions.map((question, index) => {
          const level = answers.itineraryMessageAnswers?.[question.id];
          return <View key={question.id}>
            <View style={styles.preferenceRow}>
              <Text style={styles.preferenceLabel}>{question.categoryIcon} {question.categoryLabel}</Text>
              <Text selectable style={[styles.preferenceValue, level === "like" && styles.preferenceLike, level === "dislike" && styles.preferenceDislike]}>
                {level ? itineraryPreferenceLevelLabels[level] : "미응답"}
              </Text>
            </View>
            {index < itineraryMessageQuestions.length - 1 ? <View style={styles.divider} /> : null}
          </View>;
        })}
      </Card>
    ) : (
      <Card style={styles.cardGap}>
        <View style={styles.heading}><Text style={styles.dimension}>일정 밀도</Text><Text selectable style={styles.value}>{itineraryDays.length}일 · {getFilledItineraryCount(answers)}시간</Text></View>
        {itineraryDays.map((day, dayIndex) => {
          const sortedBlocks = [...day.blocks].sort((left, right) => left.startSlot.localeCompare(right.startSlot));
          return <View key={day.id} style={styles.dayResult}><Text style={styles.dayTitle}>DAY {dayIndex + 1}</Text>{sortedBlocks.length ? <View style={styles.itinerary}>{sortedBlocks.map((block) => {
            const activity = activityBlocks.find((entry) => entry.id === block.activityId);
            return <View key={block.id} style={styles.itineraryRow}><Text style={styles.time}>{block.startSlot}</Text><View style={[styles.dot, activity && { backgroundColor: activity.color }]} /><Text selectable style={styles.itineraryTitle}>{activity?.icon} {activity?.label} · {block.durationHours}시간</Text></View>;
          })}</View> : <Text style={styles.emptyDay}>배치한 일정이 없어요</Text>}</View>;
        })}
      </Card>
    )}

    <Text style={styles.sectionTitle}>숙소 기준</Text>
    <Card style={styles.cardGap}>{accommodationAxes.map((axis) => <View key={axis.id} style={styles.axisResult}><View style={styles.axisLabels}><Text style={styles.axisLabel}>{axis.left}</Text><Text style={styles.axisLabelRight}>{axis.right}</Text></View><ScaleBar value={answers.accommodation?.[axis.id]} label={axis.helper} max={8} /></View>)}</Card>

    <Text style={styles.sectionTitle}>여행 체력</Text>
    <Card style={styles.cardGap}>
      <View style={styles.heading}><Text style={styles.dimension}>체력 수준</Text><Text selectable style={styles.value}>{stamina}</Text></View>
    </Card>
    <Card style={styles.cardGap}>
      <View style={styles.heading}><Text style={styles.dimension}>유명 명소 필수도</Text><Text selectable style={styles.value}>{answers.landmarkImportance ?? 0} / 4</Text></View><ScaleBar value={answers.landmarkImportance} label="유명 명소 필수도" max={4} />
      <View style={styles.heading}><Text style={styles.dimension}>로컬 탐방 관심도</Text><Text selectable style={styles.value}>{answers.localInterest ?? 0} / 4</Text></View><ScaleBar value={answers.localInterest} label="로컬 탐방 관심도" max={4} />
    </Card>

    <Text style={styles.sectionTitle}>여행 예산 우선순위</Text>
    <Card style={styles.cardGap}>{result.spendingPriority.ranking.map((categoryId, index) => {
      const category = budgetCategories.find((entry) => entry.id === categoryId);
      if (!category) return null;
      return <View key={category.id} style={styles.budgetRow}><View style={styles.budgetRank}><Text selectable style={styles.budgetRankText}>{index + 1}</Text></View><Text style={styles.budgetIcon}>{category.icon}</Text><Text selectable style={styles.budgetLabel}>{category.label}</Text><Text style={styles.budgetParent}>{category.parent}</Text></View>;
    })}</Card>
  </View>;
}

const styles = StyleSheet.create({
  sections: { gap: spacing.sm }, sectionTitle: { ...typography.subtitle, color: colors.text, marginTop: spacing.lg }, cardGap: { gap: spacing.sm }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, dimension: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.bodyStrong, color: colors.text, textAlign: "right" },
  preferenceRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, preferenceLabel: { ...typography.body, color: colors.text }, preferenceValue: { ...typography.caption, color: colors.textSecondary }, preferenceLike: { color: colors.primary }, preferenceDislike: { color: colors.danger },
  dayResult: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm }, dayTitle: { ...typography.caption, color: colors.primary }, itinerary: { gap: spacing.xs }, itineraryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, time: { width: 42, ...typography.caption, color: colors.textMuted, fontVariant: ["tabular-nums"] }, dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary }, itineraryTitle: { ...typography.body, color: colors.text, flex: 1 }, emptyDay: { ...typography.caption, color: colors.textMuted },
  scoreResult: { gap: spacing.xs }, percentTrack: { height: 10, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.border }, percentFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary }, modelNotice: { ...typography.caption, color: colors.textMuted },
  axisResult: { gap: spacing.xs }, axisLabels: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, axisLabel: { ...typography.caption, color: colors.text, flex: 1 }, axisLabelRight: { ...typography.caption, color: colors.text, flex: 1, textAlign: "right" }, scale: { flexDirection: "row", gap: spacing.xs }, scaleSegment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.border }, scaleSegmentActive: { backgroundColor: colors.primary }, axisCaption: { ...typography.caption, color: colors.textMuted }, axisCaptionRight: { ...typography.caption, color: colors.textMuted, textAlign: "right" }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  budgetRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.xs }, budgetRank: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft }, budgetRankText: { ...typography.caption, color: colors.primary, fontVariant: ["tabular-nums"] }, budgetIcon: { fontSize: 20 }, budgetLabel: { ...typography.bodyStrong, color: colors.text, flex: 1 }, budgetParent: { ...typography.caption, color: colors.textMuted },
});
