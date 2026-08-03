import { useEffect, useRef, useState } from "react";
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
import { getBudgetTotal } from "../logic/travel-preference-survey";
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

function RepeatPressButton({ label, disabled, onStep, symbol }: { label: string; disabled: boolean; onStep: () => void; symbol: string }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatedRef = useRef(false);
  const stopRepeating = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };
  const startRepeating = () => {
    if (disabled) return;
    repeatedRef.current = true;
    onStep();
    intervalRef.current = setInterval(onStep, 90);
  };
  useEffect(() => () => stopRepeating(), []);
  return <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    delayLongPress={350}
    disabled={disabled}
    onLongPress={startRepeating}
    onPress={() => { if (repeatedRef.current) { repeatedRef.current = false; return; } onStep(); }}
    onPressOut={stopRepeating}
    style={({ pressed }) => [styles.coinButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
  ><Text style={styles.coinButtonText}>{symbol}</Text></Pressable>;
}

function BudgetStep({ answers, onChange }: Omit<Props, "stepId">) {
  const total = getBudgetTotal(answers);
  const remaining = 100 - total;
  const allocationRef = useRef(Object.fromEntries(budgetCategories.map((category) => [category.id, answers.budgetAllocation?.[category.id] ?? 0])) as Record<BudgetCategory, number>);
  useEffect(() => {
    allocationRef.current = Object.fromEntries(budgetCategories.map((category) => [category.id, answers.budgetAllocation?.[category.id] ?? 0])) as Record<BudgetCategory, number>;
  }, [answers.budgetAllocation]);
  const adjust = (id: BudgetCategory, delta: number) => {
    const currentAllocation = allocationRef.current;
    const current = currentAllocation[id];
    const currentTotal = budgetCategories.reduce((sum, category) => sum + currentAllocation[category.id], 0);
    if (current + delta < 0 || currentTotal + delta > 100) return;
    const nextAllocation = { ...currentAllocation, [id]: current + delta };
    allocationRef.current = nextAllocation;
    onChange({ budgetAllocation: nextAllocation });
  };
  return <View style={styles.sectionGap}><SceneBanner icon="👛" title="여행 지갑에는 코인 100개가 있어요" description="정답은 없어요. 더 좋은 기억으로 남기고 싶은 곳에 마음 가는 만큼 나눠보세요." /><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: total }} style={[styles.coinBanner, total === 100 && styles.coinBannerComplete]}><View><Text style={styles.metricLabel}>지갑에 남은 코인</Text><Text selectable style={[styles.coinValue, total === 100 && styles.coinValueComplete]}>{remaining}개</Text></View><Text style={styles.coinTotal}>{total} / 100</Text></View><View style={styles.budgetList}>{budgetCategories.map((category) => {
    const amount = answers.budgetAllocation?.[category.id] ?? 0;
    return <View key={category.id} style={styles.budgetRow}><Text style={styles.budgetIcon}>{category.icon}</Text><View style={styles.budgetCopy}><Text style={styles.budgetTitle}>{category.label}</Text><Text style={styles.budgetParent}>{category.parent}</Text></View><RepeatPressButton label={`${category.label} 코인 5개 빼기. 길게 누르면 연속 감소`} disabled={amount === 0} onStep={() => adjust(category.id, -5)} symbol="−" /><Text selectable style={styles.budgetAmount}>{amount}</Text><RepeatPressButton label={`${category.label} 코인 5개 더하기. 길게 누르면 연속 증가`} disabled={remaining === 0} onStep={() => adjust(category.id, 5)} symbol="＋" /></View>;
  })}</View><Text style={styles.footnote}>코인은 5개 단위로 움직여요. 길게 누르면 빠르게 담거나 뺄 수 있어요.</Text></View>;
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
  sectionGap: { gap: spacing.md }, metricLabel: { ...typography.caption, color: colors.textSecondary },
  footnote: { ...typography.caption, color: colors.textMuted }, optionList: { gap: spacing.sm }, multiOption: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md }, multiOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] }, optionIcon: { fontSize: 30 }, optionCopy: { flex: 1, minWidth: 0 }, optionTitle: { ...typography.bodyStrong, color: colors.text }, optionDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs }, selectedText: { color: colors.primary },
  mobilitySection: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" }, mobilityHeader: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }, disclosure: { ...typography.subtitle, color: colors.primary }, mobilityChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, paddingTop: spacing.sm }, mobilityChoice: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.sm }, mobilityChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, checkmark: { color: colors.white, fontWeight: "900" },
  scaleWrap: { gap: spacing.sm }, scaleLabels: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, scaleLabel: { ...typography.caption, color: colors.text, flex: 1 }, scaleLabelLarge: { fontSize: 16, lineHeight: 22, fontWeight: "700" }, scaleLabelRight: { textAlign: "right" }, scaleButtons: { flexDirection: "row", gap: spacing.xxs }, scaleButton: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, scaleButtonSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary }, scaleNumber: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.textSecondary, fontVariant: ["tabular-nums"] }, scaleNumberSelected: { color: colors.white },
  axisList: { gap: spacing.md }, axisCard: { gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md }, axisHelper: { ...typography.caption, color: colors.textSecondary }, sceneBanner: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, sceneIcon: { fontSize: 34 }, sceneCopy: { flex: 1, minWidth: 0, gap: spacing.xxs }, sceneTitle: { ...typography.bodyStrong, color: colors.text }, sceneDescription: { ...typography.caption, color: colors.textSecondary }, pairedCards: { flexDirection: "row", gap: spacing.sm }, endpointCard: { flex: 1, minWidth: 0, gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.sm }, endpointLabel: { ...typography.caption, color: colors.primary }, endpointTitle: { ...typography.bodyStrong, color: colors.text }, endpointNote: { ...typography.caption, color: colors.textMuted }, degreePrompt: { ...typography.caption, color: colors.textSecondary, textAlign: "center" }, illustration: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, illustrationIcon: { fontSize: 32 }, illustrationText: { ...typography.body, color: colors.textSecondary, flex: 1 }, scaleCaption: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, captionText: { ...typography.caption, color: colors.textMuted }, subsectionTitle: { ...typography.bodyStrong, color: colors.text }, choiceChipText: { ...typography.bodyStrong, color: colors.textSecondary }, staminaOption: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }, radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: colors.primary }, radioDot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.primary },
  coinBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md }, coinBannerComplete: { backgroundColor: colors.successSoft }, coinValue: { ...typography.title, color: colors.warning, fontVariant: ["tabular-nums"], marginTop: spacing.xxs }, coinValueComplete: { color: colors.success }, coinTotal: { ...typography.subtitle, color: colors.text, fontVariant: ["tabular-nums"] }, budgetList: { gap: spacing.xs }, budgetRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm }, budgetIcon: { fontSize: 24 }, budgetCopy: { flex: 1, minWidth: 70 }, budgetTitle: { ...typography.bodyStrong, color: colors.text }, budgetParent: { ...typography.caption, color: colors.textMuted }, coinButton: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, coinButtonText: { color: colors.primary, fontSize: 20, fontWeight: "700" }, budgetAmount: { width: 32, ...typography.bodyStrong, color: colors.text, textAlign: "center", fontVariant: ["tabular-nums"] }, disabled: { opacity: 0.35 }, discoveryIcon: { fontSize: 30 },
});
