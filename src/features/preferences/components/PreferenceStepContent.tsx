import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  accommodationAxes,
  accommodationScaleValues,
  budgetCategories,
  fourPointScaleValues,
  mobilityOptions,
  mobilitySections,
  staminaOptions,
} from "../config/travel-preference-test-config";
import { itineraryMessageQuestions } from "../config/itinerary-message-questions";
import { getBudgetTotal } from "../logic/travel-preference-survey";
import type {
  AccommodationScaleValue,
  BudgetCategory,
  FourPointScaleValue,
  ItineraryPreferenceLevel,
  MobilityMode,
  PersonalPreferenceDraftAnswers,
  PreferenceStepId,
} from "../types";
import { PreferenceMessageQuestion } from "./preference-message-question";

type Props = {
  stepId: PreferenceStepId;
  answers: PersonalPreferenceDraftAnswers;
  onChange: (patch: Partial<PersonalPreferenceDraftAnswers>) => void;
};

export function PreferenceStepContent({ stepId, answers, onChange }: Props) {
  switch (stepId) {
    case "itinerary": return <ItineraryMessageStep answers={answers} onChange={onChange} />;
    case "mobility": return <MobilityStep answers={answers} onChange={onChange} />;
    case "accommodation": return <AccommodationStep answers={answers} onChange={onChange} />;
    case "adventure": return <AdventureStep answers={answers} onChange={onChange} />;
    case "stamina": return <StaminaStep answers={answers} onChange={onChange} />;
    case "budget": return <BudgetStep answers={answers} onChange={onChange} />;
    case "discovery": return <DiscoveryStep answers={answers} onChange={onChange} />;
  }
}

function getFirstUnansweredItineraryMessageIndex(answers: PersonalPreferenceDraftAnswers) {
  const index = itineraryMessageQuestions.findIndex((question) => !answers.itineraryMessageAnswers?.[question.id]);
  return index < 0 ? itineraryMessageQuestions.length - 1 : index;
}

function ItineraryMessageStep({ answers, onChange }: Omit<Props, "stepId">) {
  const [questionIndex, setQuestionIndex] = useState(() => getFirstUnansweredItineraryMessageIndex(answers));
  const question = itineraryMessageQuestions[questionIndex];
  const selectedOptionId = answers.itineraryMessageAnswers?.[question.id];

  const selectOption = (level: ItineraryPreferenceLevel) => {
    onChange({
      itineraryMessageAnswers: {
        ...answers.itineraryMessageAnswers,
        [question.id]: level,
      },
    });
  };

  return (
    <PreferenceMessageQuestion
      categoryIcon={question.categoryIcon}
      categoryLabel={question.categoryLabel}
      current={questionIndex + 1}
      message={question.message}
      onNext={questionIndex < itineraryMessageQuestions.length - 1 ? () => setQuestionIndex(questionIndex + 1) : undefined}
      onPrevious={questionIndex > 0 ? () => setQuestionIndex(questionIndex - 1) : undefined}
      onSelect={selectOption}
      options={question.options}
      selectedOptionId={selectedOptionId}
      senderName={question.senderName}
      senderStatus={question.senderStatus}
      total={itineraryMessageQuestions.length}
    />
  );
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

function AccommodationStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.axisList}>{accommodationAxes.map((axis) => <View key={axis.id} style={styles.axisCard}><Text style={styles.axisHelper}>{axis.helper}</Text><ScaleSelector accessibilityLabel={axis.helper} largeLabels left={axis.left} right={axis.right} values={accommodationScaleValues} value={answers.accommodation?.[axis.id]} onChange={(value) => onChange({ accommodation: { ...answers.accommodation, [axis.id]: value as AccommodationScaleValue } })} /></View>)}</View>;
}

function AdventureStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.sectionGap}><View style={styles.illustration}><Text style={styles.illustrationIcon}>🧭</Text><Text style={styles.illustrationText}>다른 여행자의 리뷰 수를 추천에 얼마나 반영할지 정하는 기준이 될 수 있어요.</Text></View><ScaleSelector accessibilityLabel="새로운 장소 도전 성향" largeLabels left="검증된 곳이 안심돼요" right="새로운 곳이 궁금해요" values={fourPointScaleValues} value={answers.adventure} onChange={(adventure) => onChange({ adventure: adventure as FourPointScaleValue })} /><View style={styles.scaleCaption}><Text style={styles.captionText}>리뷰와 평점 중시</Text><Text style={styles.captionText}>새로움과 발견 중시</Text></View></View>;
}

function StaminaStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View accessibilityRole="radiogroup" style={styles.optionList}>{staminaOptions.map((option) => {
    const selected = answers.stamina === option.id;
    return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChange({ stamina: option.id })} style={({ pressed }) => [styles.staminaOption, selected && styles.multiOptionSelected, pressed && styles.pressed]}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View><View style={styles.optionCopy}><Text style={[styles.optionTitle, selected && styles.selectedText]}>{option.label}</Text><Text style={styles.optionDescription}>{option.description}</Text></View></Pressable>;
  })}</View>;
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
  return <View style={styles.sectionGap}><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: total }} style={[styles.coinBanner, total === 100 && styles.coinBannerComplete]}><View><Text style={styles.metricLabel}>남은 코인</Text><Text selectable style={[styles.coinValue, total === 100 && styles.coinValueComplete]}>{remaining}개</Text></View><Text style={styles.coinTotal}>{total} / 100</Text></View><View style={styles.budgetList}>{budgetCategories.map((category) => {
    const amount = answers.budgetAllocation?.[category.id] ?? 0;
    return <View key={category.id} style={styles.budgetRow}><Text style={styles.budgetIcon}>{category.icon}</Text><View style={styles.budgetCopy}><Text style={styles.budgetTitle}>{category.label}</Text><Text style={styles.budgetParent}>{category.parent}</Text></View><RepeatPressButton label={`${category.label} 코인 5개 빼기. 길게 누르면 연속 감소`} disabled={amount === 0} onStep={() => adjust(category.id, -5)} symbol="−" /><Text selectable style={styles.budgetAmount}>{amount}</Text><RepeatPressButton label={`${category.label} 코인 5개 더하기. 길게 누르면 연속 증가`} disabled={remaining === 0} onStep={() => adjust(category.id, 5)} symbol="＋" /></View>;
  })}</View><Text style={styles.footnote}>현재는 목적지가 정해지기 전 사용하는 대표 상위 태그예요. 코인은 5개 단위로 배분할 수 있어요.</Text></View>;
}

function DiscoveryStep({ answers, onChange }: Omit<Props, "stepId">) {
  return <View style={styles.axisList}><View style={styles.axisCard}><Text style={styles.discoveryIcon}>🏛️</Text><Text style={styles.subsectionTitle}>유명 명소 필수도</Text><Text style={styles.axisHelper}>대표 명소를 일정에 꼭 포함하고 싶은 정도</Text><ScaleSelector accessibilityLabel="유명 명소 필수도" left="선택 사항" right="꼭 가고 싶어요" values={fourPointScaleValues} value={answers.landmarkImportance} onChange={(landmarkImportance) => onChange({ landmarkImportance: landmarkImportance as FourPointScaleValue })} /></View><View style={styles.axisCard}><Text style={styles.discoveryIcon}>🪴</Text><Text style={styles.subsectionTitle}>로컬 탐방 관심도</Text><Text style={styles.axisHelper}>관광지 밖 동네와 현지 문화를 경험하고 싶은 정도</Text><ScaleSelector accessibilityLabel="로컬 탐방 관심도" left="관심 적음" right="아주 궁금해요" values={fourPointScaleValues} value={answers.localInterest} onChange={(localInterest) => onChange({ localInterest: localInterest as FourPointScaleValue })} /></View></View>;
}

const styles = StyleSheet.create({
  sectionGap: { gap: spacing.md }, metricLabel: { ...typography.caption, color: colors.textSecondary },
  footnote: { ...typography.caption, color: colors.textMuted }, optionList: { gap: spacing.sm }, multiOption: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md }, multiOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] }, optionIcon: { fontSize: 30 }, optionCopy: { flex: 1, minWidth: 0 }, optionTitle: { ...typography.bodyStrong, color: colors.text }, optionDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs }, selectedText: { color: colors.primary },
  mobilitySection: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" }, mobilityHeader: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }, disclosure: { ...typography.subtitle, color: colors.primary }, mobilityChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, paddingTop: spacing.sm }, mobilityChoice: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.sm }, mobilityChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, checkbox: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, checkmark: { color: colors.white, fontWeight: "900" },
  scaleWrap: { gap: spacing.sm }, scaleLabels: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, scaleLabel: { ...typography.caption, color: colors.text, flex: 1 }, scaleLabelLarge: { fontSize: 16, lineHeight: 22, fontWeight: "700" }, scaleLabelRight: { textAlign: "right" }, scaleButtons: { flexDirection: "row", gap: spacing.xxs }, scaleButton: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, scaleButtonSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary }, scaleNumber: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: colors.textSecondary, fontVariant: ["tabular-nums"] }, scaleNumberSelected: { color: colors.white },
  axisList: { gap: spacing.md }, axisCard: { gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md }, axisHelper: { ...typography.caption, color: colors.textSecondary }, illustration: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, illustrationIcon: { fontSize: 32 }, illustrationText: { ...typography.body, color: colors.textSecondary, flex: 1 }, scaleCaption: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, captionText: { ...typography.caption, color: colors.textMuted }, subsectionTitle: { ...typography.bodyStrong, color: colors.text }, choiceChipText: { ...typography.bodyStrong, color: colors.textSecondary }, staminaOption: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }, radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: colors.primary }, radioDot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.primary },
  coinBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md }, coinBannerComplete: { backgroundColor: colors.successSoft }, coinValue: { ...typography.title, color: colors.warning, fontVariant: ["tabular-nums"], marginTop: spacing.xxs }, coinValueComplete: { color: colors.success }, coinTotal: { ...typography.subtitle, color: colors.text, fontVariant: ["tabular-nums"] }, budgetList: { gap: spacing.xs }, budgetRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm }, budgetIcon: { fontSize: 24 }, budgetCopy: { flex: 1, minWidth: 70 }, budgetTitle: { ...typography.bodyStrong, color: colors.text }, budgetParent: { ...typography.caption, color: colors.textMuted }, coinButton: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, coinButtonText: { color: colors.primary, fontSize: 20, fontWeight: "700" }, budgetAmount: { width: 32, ...typography.bodyStrong, color: colors.text, textAlign: "center", fontVariant: ["tabular-nums"] }, disabled: { opacity: 0.35 }, discoveryIcon: { fontSize: 30 },
});
