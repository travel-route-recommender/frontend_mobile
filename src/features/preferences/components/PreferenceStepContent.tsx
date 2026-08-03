import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  accommodationAxes,
  accommodationScaleValues,
  budgetCategories,
  discoveryScenes,
  fourPointScaleValues,
  mobilityOptions,
  mobilitySections,
  staminaOptions,
} from "../config/travel-preference-test-config";
import { challengeStyleQuestions } from "../config/challenge-style-questions";
import { itineraryMessageQuestions } from "../config/itinerary-message-questions";
import { getBudgetRanking } from "../logic/travel-preference-survey";
import type {
  AccommodationScaleValue,
  BudgetCategory,
  ChallengeStyleQuestionId,
  FivePointScaleValue,
  FourPointScaleValue,
  ItineraryPreferenceLevel,
  MobilityMode,
  PersonalPreferenceDraftAnswers,
  PreferenceStepId,
} from "../types";
import { PreferenceMessageQuestion } from "./preference-message-question";
import { PreferenceSceneQuestion } from "./preference-scene-question";

type Props = {
  stepId: PreferenceStepId;
  answers: PersonalPreferenceDraftAnswers;
  onChange: (patch: Partial<PersonalPreferenceDraftAnswers>) => void;
  onComplete?: () => void;
};

export function PreferenceStepContent({ stepId, answers, onChange, onComplete }: Props) {
  switch (stepId) {
    case "challengeStyle":
    case "itinerary":
      return <StoryPreferenceStep answers={answers} onChange={onChange} onComplete={onComplete} />;
    case "mobility": return <MobilityStep answers={answers} onChange={onChange} />;
    case "accommodation": return <AccommodationStep answers={answers} onChange={onChange} />;
    case "adventure": return <AdventureStep answers={answers} onChange={onChange} />;
    case "stamina": return <StaminaStep answers={answers} onChange={onChange} />;
    case "budget": return <BudgetStep answers={answers} onChange={onChange} />;
    case "discovery": return <DiscoveryStep answers={answers} onChange={onChange} />;
  }
}

const storyQuestions = [
  ...challengeStyleQuestions.map((question) => ({ kind: "challenge" as const, question })),
  ...itineraryMessageQuestions.map((question) => ({ kind: "itinerary" as const, question })),
] as const;

function getFirstUnansweredStoryIndex(answers: PersonalPreferenceDraftAnswers) {
  const index = storyQuestions.findIndex((entry) => entry.kind === "challenge"
    ? !answers.challengeStyleAnswers?.[entry.question.id]
    : !answers.itineraryMessageAnswers?.[entry.question.id]);
  return index < 0 ? storyQuestions.length - 1 : index;
}

function StoryPreferenceStep({ answers, onChange, onComplete }: Omit<Props, "stepId">) {
  const [questionIndex, setQuestionIndex] = useState(() => getFirstUnansweredStoryIndex(answers));
  const entry = storyQuestions[questionIndex];
  const navigationProps = {
    current: questionIndex + 1,
    onNext: questionIndex < storyQuestions.length - 1 ? () => setQuestionIndex(questionIndex + 1) : onComplete,
    onPrevious: questionIndex > 0 ? () => setQuestionIndex(questionIndex - 1) : undefined,
    total: storyQuestions.length,
  };

  if (entry.kind === "challenge") {
    const question = entry.question;
    const selectOption = (value: FivePointScaleValue) => onChange({
      challengeStyleAnswers: {
        ...answers.challengeStyleAnswers,
        [question.id as ChallengeStyleQuestionId]: value,
      },
    });
    const questionProps = {
      ...navigationProps,
      message: question.message,
      onSelect: selectOption,
      options: question.options,
      selectedOptionId: answers.challengeStyleAnswers?.[question.id],
    };
    return question.presentation.kind === "chat"
      ? <PreferenceMessageQuestion {...questionProps} senderName={question.senderName} senderStatus={question.senderStatus} />
      : <PreferenceSceneQuestion {...questionProps} presentation={question.presentation} />;
  }

  const question = entry.question;
  const selectOption = (level: ItineraryPreferenceLevel) => onChange({
    itineraryMessageAnswers: {
      ...answers.itineraryMessageAnswers,
      [question.id]: level,
    },
  });
  const questionProps = {
    ...navigationProps,
    message: question.message,
    onSelect: selectOption,
    options: question.options,
    selectedOptionId: answers.itineraryMessageAnswers?.[question.id],
  };
  return question.presentation.kind === "chat"
    ? <PreferenceMessageQuestion {...questionProps} senderName={question.senderName} senderStatus={question.senderStatus} />
    : <PreferenceSceneQuestion {...questionProps} presentation={question.presentation} />;
}

function MobilityStep({ answers, onChange }: Omit<Props, "stepId">) {
  const selected = answers.mobilityModes ?? [];
  const [expandedSections, setExpandedSections] = useState<("car" | "transit")[]>(() => mobilitySections.filter((section) => section.options.some((option) => selected.includes(option.id))).map((section) => section.id));
  const toggleMode = (mode: MobilityMode) => onChange({ mobilityModes: selected.includes(mode) ? selected.filter((entry) => entry !== mode) : [...selected, mode] });

  return <View style={styles.optionList}>
    {mobilitySections.map((section) => {
      const expanded = expandedSections.includes(section.id);
      const selectedCount = section.options.filter((option) => selected.includes(option.id)).length;
      const toggleExpanded = () => setExpandedSections(expanded ? expandedSections.filter((id) => id !== section.id) : [...expandedSections, section.id]);
      return <View key={section.id} style={[styles.mobilitySection, selectedCount > 0 && styles.multiOptionSelected]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggleExpanded} style={({ pressed }) => [styles.mobilityHeader, pressed && styles.pressed]}>
          <Text style={styles.optionIcon}>{section.icon}</Text><View style={styles.optionCopy}><Text style={[styles.optionTitle, selectedCount > 0 && styles.selectedText]}>{section.label}</Text><Text style={styles.optionDescription}>{selectedCount > 0 ? `${selectedCount}개 세부 수단 선택` : section.description}</Text></View><Text style={styles.disclosure}>{expanded ? "⌃" : "⌄"}</Text>
        </Pressable>
        {expanded ? <View accessibilityRole="list" style={styles.mobilityChoices}>{section.options.map((option) => {
          const checked = selected.includes(option.id);
          return <Pressable key={option.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleMode(option.id)} style={({ pressed }) => [styles.mobilityChoice, checked && styles.mobilityChoiceSelected, pressed && styles.pressed]}><View style={[styles.checkbox, checked && styles.checkboxSelected]}><Text style={styles.checkmark}>{checked ? "✓" : ""}</Text></View><Text style={[styles.choiceChipText, checked && styles.selectedText]}>{option.label}</Text></Pressable>;
        })}</View> : null}
      </View>;
    })}
    {(() => {
      const walk = mobilityOptions.find((option) => option.id === "walk")!;
      const checked = selected.includes(walk.id);
      return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleMode(walk.id)} style={({ pressed }) => [styles.multiOption, checked && styles.multiOptionSelected, pressed && styles.pressed]}><Text style={styles.optionIcon}>{walk.icon}</Text><View style={styles.optionCopy}><Text style={[styles.optionTitle, checked && styles.selectedText]}>{walk.label}</Text><Text style={styles.optionDescription}>걸어서 동네를 탐방해요</Text></View><View style={[styles.checkbox, checked && styles.checkboxSelected]}><Text style={styles.checkmark}>{checked ? "✓" : ""}</Text></View></Pressable>;
    })()}
    <Text style={styles.footnote}>자차와 대중교통 카드를 눌러 세부 수단을 열 수 있으며 모두 복수 선택할 수 있어요.</Text>
  </View>;
}

function ScaleSelector({ values, value, onChange, left, right, accessibilityLabel, largeLabels = false }: { values: readonly number[]; value?: number; onChange: (value: number) => void; left: string; right: string; accessibilityLabel: string; largeLabels?: boolean }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.scaleWrap}>
    <View style={styles.scaleLabels}><Text style={[styles.scaleLabel, largeLabels && styles.scaleLabelLarge]}>{left}</Text><Text style={[styles.scaleLabel, styles.scaleLabelRight, largeLabels && styles.scaleLabelLarge]}>{right}</Text></View>
    <View style={styles.scaleButtons}>{values.map((score) => {
      const selected = score === value;
      return <Pressable key={score} accessibilityLabel={`${accessibilityLabel} ${score}단계`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange(score)} style={({ pressed }) => [styles.scaleButton, selected && styles.scaleButtonSelected, pressed && styles.pressed]}><Text style={[styles.scaleNumber, selected && styles.scaleNumberSelected]}>{score}</Text></Pressable>;
    })}</View>
  </View>;
}

function SceneBanner({ icon, title, description }: { icon: string; title: string; description: string }) {
  return <View style={styles.sceneBanner}>
    <Text style={styles.sceneIcon}>{icon}</Text>
    <View style={styles.sceneCopy}>
      <Text style={styles.sceneTitle}>{title}</Text>
      <Text style={styles.sceneDescription}>{description}</Text>
    </View>
  </View>;
}

function AccommodationStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.axisList}>{accommodationAxes.map((axis) => <View key={axis.id} style={styles.axisCard}>
    <SceneBanner icon={axis.icon} title={axis.sceneTitle} description={axis.helper} />
    <View style={styles.pairedCards}>
      <View style={styles.endpointCard}><Text style={styles.endpointLabel}>A</Text><Text style={styles.endpointTitle}>{axis.left}</Text><Text style={styles.endpointNote}>{axis.leftNote}</Text></View>
      <View style={styles.endpointCard}><Text style={styles.endpointLabel}>B</Text><Text style={styles.endpointTitle}>{axis.right}</Text><Text style={styles.endpointNote}>{axis.rightNote}</Text></View>
    </View>
    <Text style={styles.degreePrompt}>어느 쪽에 얼마나 가까운가요?</Text>
    <ScaleSelector accessibilityLabel={axis.helper} left="A에 가까워요" right="B에 가까워요" values={accommodationScaleValues} value={answers.accommodation?.[axis.id]} onChange={(value) => onChange({ accommodation: { ...answers.accommodation, [axis.id]: value as AccommodationScaleValue } })} />
  </View>)}</View>;
}

function AdventureStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.sectionGap}><View style={styles.illustration}><Text style={styles.illustrationIcon}>🧭</Text><Text style={styles.illustrationText}>다른 여행자의 리뷰 수를 추천에 얼마나 반영할지 정하는 기준이 될 수 있어요.</Text></View><ScaleSelector accessibilityLabel="새로운 장소 도전 성향" largeLabels left="검증된 곳이 안심돼요" right="새로운 곳이 궁금해요" values={fourPointScaleValues} value={answers.adventure} onChange={(adventure) => onChange({ adventure: adventure as FourPointScaleValue })} /><View style={styles.scaleCaption}><Text style={styles.captionText}>리뷰와 평점 중시</Text><Text style={styles.captionText}>새로움과 발견 중시</Text></View></View>;
}

function StaminaStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.sectionGap}>
    <SceneBanner icon="🌇" title="아침부터 도시를 걷고 어느새 오후 5시" description="저녁 전에 보고 싶은 장소가 하나 더 남아 있어요. 평소의 나라면 어떻게 할까요?" />
    <View accessibilityRole="radiogroup" style={styles.optionList}>{staminaOptions.map((option) => {
    const selected = answers.stamina === option.id;
    return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange({ stamina: option.id })} style={({ pressed }) => [styles.staminaOption, selected && styles.multiOptionSelected, pressed && styles.pressed]}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View><View style={styles.optionCopy}><Text style={[styles.optionTitle, selected && styles.selectedText]}>{option.label}</Text><Text style={styles.optionDescription}>{option.description}</Text></View></Pressable>;
    })}</View>
  </View>;
}

function BudgetStep({ answers, onChange }: Omit<Props, "stepId">) {
  const ranking = getBudgetRanking(answers);
  const remainingCategories = budgetCategories.filter((category) => !ranking.includes(category.id));
  const complete = ranking.length === budgetCategories.length;
  const rankPrompts = [
    "가장 예산을 많이 쓰고 싶은 항목은?",
    "그다음으로 예산을 쓰고 싶은 항목은?",
    "세 번째로 중요하게 쓰고 싶은 항목은?",
    "네 번째 우선순위를 골라주세요",
    "마지막으로 남길 예산 항목을 골라주세요",
  ] as const;
  const choose = (categoryId: BudgetCategory) => onChange({
    budgetRanking: [...ranking, categoryId],
    budgetAllocation: undefined,
  });
  const undoLast = () => onChange({ budgetRanking: ranking.slice(0, -1), budgetAllocation: undefined });
  const resetRanking = () => onChange({ budgetRanking: [], budgetAllocation: undefined });

  return <View style={styles.sectionGap}>
    <SceneBanner icon="👛" title="여행 예산의 순서를 정해요" description="많이 쓰고 싶은 항목부터 하나씩 고르면, 선택한 항목을 제외하고 다음 순위를 이어서 물어볼게요." />
    <View
      accessibilityLabel={`예산 우선순위 ${budgetCategories.length}개 중 ${ranking.length}개 선택`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: budgetCategories.length, now: ranking.length }}
      style={styles.budgetProgress}
    >
      <View style={styles.budgetProgressCopy}>
        <Text style={styles.budgetProgressLabel}>우선순위 정하는 중</Text>
        <Text selectable style={styles.budgetProgressValue}>{ranking.length} / {budgetCategories.length}</Text>
      </View>
      <View style={styles.budgetProgressTrack}>
        <View style={[styles.budgetProgressFill, { width: `${(ranking.length / budgetCategories.length) * 100}%` }]} />
      </View>
    </View>

    {!complete ? <View style={styles.budgetQuestion}>
      <Text style={styles.budgetQuestionRank}>{ranking.length + 1}순위 선택</Text>
      <Text accessibilityRole="header" selectable style={styles.budgetQuestionTitle}>{rankPrompts[ranking.length]}</Text>
      <View accessibilityLabel={`${ranking.length + 1}순위 예산 항목`} accessibilityRole="radiogroup" style={styles.budgetList}>
        {remainingCategories.map((category) => <Pressable
          key={category.id}
          accessibilityLabel={`${ranking.length + 1}순위로 ${category.label} 선택`}
          accessibilityRole="radio"
          accessibilityState={{ selected: false }}
          onPress={() => choose(category.id)}
          style={({ pressed }) => [styles.budgetChoice, pressed && styles.pressed]}
        >
          <Text style={styles.budgetIcon}>{category.icon}</Text>
          <View style={styles.budgetCopy}>
            <Text selectable style={styles.budgetTitle}>{category.label}</Text>
            <Text style={styles.budgetParent}>{category.parent}</Text>
          </View>
          <Text style={styles.budgetChoose}>선택 ›</Text>
        </Pressable>)}
      </View>
    </View> : <View accessibilityLiveRegion="polite" style={styles.budgetComplete}>
      <Text style={styles.budgetCompleteTitle}>예산 우선순위를 모두 정했어요</Text>
      <Text style={styles.budgetCompleteDescription}>아래 순서가 실제 여행에서 돈을 쓰고 싶은 방향과 맞는지 확인해 주세요.</Text>
    </View>}

    {ranking.length ? <View style={styles.rankingSection}>
      <Text style={styles.rankingTitle}>지금까지 정한 순서</Text>
      <View style={styles.rankingList}>{ranking.map((categoryId, index) => {
        const category = budgetCategories.find((entry) => entry.id === categoryId);
        if (!category) return null;
        return <View key={category.id} style={styles.rankingRow}>
          <View style={styles.rankNumber}><Text selectable style={styles.rankNumberText}>{index + 1}</Text></View>
          <Text style={styles.rankingIcon}>{category.icon}</Text>
          <Text selectable style={styles.rankingLabel}>{category.label}</Text>
          <Text style={styles.rankingParent}>{category.parent}</Text>
        </View>;
      })}</View>
      <View style={styles.rankingActions}>
        <Pressable accessibilityRole="button" onPress={undoLast} style={({ pressed }) => [styles.rankingAction, pressed && styles.pressed]}><Text style={styles.rankingActionText}>직전 선택 취소</Text></Pressable>
        {ranking.length > 1 ? <Pressable accessibilityRole="button" onPress={resetRanking} style={({ pressed }) => [styles.rankingAction, pressed && styles.pressed]}><Text style={styles.rankingActionText}>처음부터 다시</Text></Pressable> : null}
      </View>
    </View> : null}
  </View>;
}

function DiscoveryStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.axisList}>
    <SceneBanner icon="🧳" title="여행 가방에 두 칸이 남았어요" description="명소와 로컬은 서로 반대가 아니에요. 두 장면을 각각 얼마나 담고 싶은지 골라 주세요." />
    {discoveryScenes.map((scene) => {
      const value = scene.id === "landmarkImportance" ? answers.landmarkImportance : answers.localInterest;
      const update = (score: number) => scene.id === "landmarkImportance"
        ? onChange({ landmarkImportance: score as FourPointScaleValue })
        : onChange({ localInterest: score as FourPointScaleValue });
      return <View key={scene.id} style={styles.axisCard}>
        <Text style={styles.discoveryIcon}>{scene.icon}</Text>
        <Text style={styles.subsectionTitle}>{scene.sceneTitle}</Text>
        <Text style={styles.axisHelper}>{scene.description}</Text>
        <ScaleSelector accessibilityLabel={scene.sceneTitle} left={scene.left} right={scene.right} values={fourPointScaleValues} value={value} onChange={update} />
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  sectionGap: { gap: spacing.md },
  footnote: { ...typography.caption, color: colors.textMuted }, optionList: { gap: spacing.sm }, multiOption: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md }, multiOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] }, optionIcon: { fontSize: 30 }, optionCopy: { flex: 1, minWidth: 0 }, optionTitle: { ...typography.bodyStrong, color: colors.text }, optionDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs }, selectedText: { color: colors.primary },
  mobilitySection: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" }, mobilityHeader: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }, disclosure: { ...typography.subtitle, color: colors.primary }, mobilityChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, paddingTop: spacing.sm }, mobilityChoice: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.sm }, mobilityChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, checkmark: { color: colors.white, fontWeight: "900" },
  scaleWrap: { gap: spacing.sm }, scaleLabels: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, scaleLabel: { ...typography.caption, color: colors.text, flex: 1 }, scaleLabelLarge: { fontSize: 16, lineHeight: 22, fontWeight: "700" }, scaleLabelRight: { textAlign: "right" }, scaleButtons: { flexDirection: "row", gap: spacing.xxs }, scaleButton: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, scaleButtonSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary }, scaleNumber: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.textSecondary, fontVariant: ["tabular-nums"] }, scaleNumberSelected: { color: colors.white },
  axisList: { gap: spacing.md }, axisCard: { gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md }, axisHelper: { ...typography.caption, color: colors.textSecondary }, sceneBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, sceneIcon: { fontSize: 34 }, sceneCopy: { flex: 1, minWidth: 0, gap: spacing.xxs }, sceneTitle: { ...typography.bodyStrong, color: colors.text }, sceneDescription: { ...typography.caption, color: colors.textSecondary }, pairedCards: { flexDirection: "row", gap: spacing.sm }, endpointCard: { flex: 1, minWidth: 0, gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm }, endpointLabel: { ...typography.caption, color: colors.primary }, endpointTitle: { ...typography.bodyStrong, color: colors.text }, endpointNote: { ...typography.caption, color: colors.textMuted }, degreePrompt: { ...typography.caption, color: colors.textSecondary, textAlign: "center" }, illustration: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, illustrationIcon: { fontSize: 32 }, illustrationText: { ...typography.body, color: colors.textSecondary, flex: 1 }, scaleCaption: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, captionText: { ...typography.caption, color: colors.textMuted }, subsectionTitle: { ...typography.bodyStrong, color: colors.text }, choiceChipText: { ...typography.bodyStrong, color: colors.textSecondary }, staminaOption: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }, radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: colors.primary }, radioDot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.primary },
  budgetProgress: { gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.md },
  budgetProgressCopy: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  budgetProgressLabel: { ...typography.caption, color: colors.textSecondary },
  budgetProgressValue: { ...typography.subtitle, color: colors.primary, fontVariant: ["tabular-nums"] },
  budgetProgressTrack: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.surface },
  budgetProgressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  budgetQuestion: { gap: spacing.sm },
  budgetQuestionRank: { ...typography.caption, color: colors.primary },
  budgetQuestionTitle: { ...typography.subtitle, color: colors.text },
  budgetList: { gap: spacing.xs },
  budgetChoice: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  budgetIcon: { fontSize: 24 },
  budgetCopy: { flex: 1, minWidth: 70 },
  budgetTitle: { ...typography.bodyStrong, color: colors.text },
  budgetParent: { ...typography.caption, color: colors.textMuted },
  budgetChoose: { ...typography.caption, color: colors.primary },
  budgetComplete: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.successSoft, padding: spacing.md },
  budgetCompleteTitle: { ...typography.bodyStrong, color: colors.success },
  budgetCompleteDescription: { ...typography.caption, color: colors.textSecondary },
  rankingSection: { gap: spacing.sm },
  rankingTitle: { ...typography.bodyStrong, color: colors.text },
  rankingList: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  rankingRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  rankNumber: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  rankNumberText: { ...typography.caption, color: colors.primary, fontVariant: ["tabular-nums"] },
  rankingIcon: { fontSize: 21 },
  rankingLabel: { ...typography.bodyStrong, flex: 1, color: colors.text },
  rankingParent: { ...typography.caption, color: colors.textMuted },
  rankingActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  rankingAction: { minHeight: 44, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm },
  rankingActionText: { ...typography.caption, color: colors.textSecondary },
  discoveryIcon: { fontSize: 30 },
});
