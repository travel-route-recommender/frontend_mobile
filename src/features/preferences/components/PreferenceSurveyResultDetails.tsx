import { StyleSheet, Text, View } from "react-native";
import { Card, Chip } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  itineraryMessageQuestions,
  itineraryPreferenceLevelLabels,
} from "../config/itinerary-message-questions";
import {
  accommodationAxes,
  activityBlocks,
  budgetCategories,
  mobilityOptions,
  staminaOptions,
} from "../config/travel-preference-test-config";
import {
  getFilledItineraryCount,
  getItineraryDays,
  getItineraryMessageAnswerCount,
} from "../logic/travel-preference-survey";
import type { PersonalPreferenceDraftAnswers } from "../types";

function ScaleBar({ value, label, max }: { value?: number; label: string; max: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={`${label} ${max}단계 중 ${value ?? 0}단계`} accessibilityValue={{ min: 0, max, now: value ?? 0 }} style={styles.scale}>
    {Array.from({ length: max }, (_, index) => index + 1).map((score) => <View key={score} style={[styles.scaleSegment, Boolean(value && score <= value) && styles.scaleSegmentActive]} />)}
  </View>;
}

export function PreferenceSurveyResultDetails({ answers }: { answers: PersonalPreferenceDraftAnswers }) {
  const itineraryDays = getItineraryDays(answers);
  const hasMessageAnswers = getItineraryMessageAnswerCount(answers) > 0;
  const selectedMobility = mobilityOptions.filter((option) => answers.mobilityModes?.includes(option.id));
  const stamina = staminaOptions.find((option) => option.id === answers.stamina)?.label ?? "미응답";
  const maxBudget = Math.max(...budgetCategories.map((category) => answers.budgetAllocation?.[category.id] ?? 0), 1);

  return <View style={styles.sections}>
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

    <Text style={styles.sectionTitle}>이동과 숙소 기준</Text>
    <Card style={styles.cardGap}><Text style={styles.dimension}>선호 이동 방식</Text><View style={styles.chips}>{selectedMobility.map((option) => <Chip key={option.id} label={`${option.icon} ${option.label}`} selected />)}</View></Card>
    <Card style={styles.cardGap}>{accommodationAxes.map((axis) => <View key={axis.id} style={styles.axisResult}><View style={styles.axisLabels}><Text style={styles.axisLabel}>{axis.left}</Text><Text style={styles.axisLabelRight}>{axis.right}</Text></View><ScaleBar value={answers.accommodation?.[axis.id]} label={axis.helper} max={8} /></View>)}</Card>

    <Text style={styles.sectionTitle}>활동과 탐색 성향</Text>
    <Card style={styles.cardGap}>
      <View style={styles.heading}><Text style={styles.dimension}>도전 성향</Text><Text selectable style={styles.value}>{answers.adventure ?? 0} / 4</Text></View><ScaleBar value={answers.adventure} label="도전 성향" max={4} />
      <View style={styles.axisLabels}><Text style={styles.axisCaption}>검증된 곳</Text><Text style={styles.axisCaptionRight}>새로운 곳</Text></View><View style={styles.divider} />
      <View style={styles.heading}><Text style={styles.dimension}>체력 수준</Text><Text selectable style={styles.value}>{stamina}</Text></View>
    </Card>
    <Card style={styles.cardGap}>
      <View style={styles.heading}><Text style={styles.dimension}>유명 명소 필수도</Text><Text selectable style={styles.value}>{answers.landmarkImportance ?? 0} / 4</Text></View><ScaleBar value={answers.landmarkImportance} label="유명 명소 필수도" max={4} />
      <View style={styles.heading}><Text style={styles.dimension}>로컬 탐방 관심도</Text><Text selectable style={styles.value}>{answers.localInterest ?? 0} / 4</Text></View><ScaleBar value={answers.localInterest} label="로컬 탐방 관심도" max={4} />
    </Card>

    <Text style={styles.sectionTitle}>여행 코인 사용 방향</Text>
    <Card style={styles.cardGap}>{[...budgetCategories].sort((left, right) => (answers.budgetAllocation?.[right.id] ?? 0) - (answers.budgetAllocation?.[left.id] ?? 0)).map((category) => {
      const amount = answers.budgetAllocation?.[category.id] ?? 0;
      return <View key={category.id} style={styles.budgetRow}><Text style={styles.budgetIcon}>{category.icon}</Text><Text style={styles.budgetLabel}>{category.label}</Text><View style={styles.budgetTrack}><View style={[styles.budgetFill, { width: `${(amount / maxBudget) * 100}%` }]} /></View><Text selectable style={styles.budgetAmount}>{amount}</Text></View>;
    })}</Card>
  </View>;
}

const styles = StyleSheet.create({
  sections: { gap: spacing.sm }, sectionTitle: { ...typography.subtitle, color: colors.text, marginTop: spacing.lg }, cardGap: { gap: spacing.sm }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, dimension: { ...typography.caption, color: colors.textSecondary }, value: { ...typography.bodyStrong, color: colors.text, textAlign: "right" },
  preferenceRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, preferenceLabel: { ...typography.body, color: colors.text }, preferenceValue: { ...typography.caption, color: colors.textSecondary }, preferenceLike: { color: colors.primary }, preferenceDislike: { color: colors.danger },
  dayResult: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm }, dayTitle: { ...typography.caption, color: colors.primary }, itinerary: { gap: spacing.xs }, itineraryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, time: { width: 42, ...typography.caption, color: colors.textMuted, fontVariant: ["tabular-nums"] }, dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary }, itineraryTitle: { ...typography.body, color: colors.text, flex: 1 }, emptyDay: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, axisResult: { gap: spacing.xs }, axisLabels: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, axisLabel: { ...typography.caption, color: colors.text, flex: 1 }, axisLabelRight: { ...typography.caption, color: colors.text, flex: 1, textAlign: "right" }, scale: { flexDirection: "row", gap: spacing.xs }, scaleSegment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.border }, scaleSegmentActive: { backgroundColor: colors.primary }, axisCaption: { ...typography.caption, color: colors.textMuted }, axisCaptionRight: { ...typography.caption, color: colors.textMuted, textAlign: "right" }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, budgetIcon: { fontSize: 20 }, budgetLabel: { width: 42, ...typography.caption, color: colors.text }, budgetTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" }, budgetFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary }, budgetAmount: { width: 28, ...typography.caption, color: colors.text, textAlign: "right", fontVariant: ["tabular-nums"] },
});
