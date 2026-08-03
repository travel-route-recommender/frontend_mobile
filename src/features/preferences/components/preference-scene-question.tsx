import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type {
  PreferenceMessageOption,
  PreferenceQuestionPresentation,
} from "../config/itinerary-message-questions";

type ScenePresentation = Exclude<PreferenceQuestionPresentation, { kind: "chat" }>;

type Props<OptionId extends string | number> = {
  presentation: ScenePresentation;
  message: string;
  options: readonly PreferenceMessageOption<OptionId>[];
  current: number;
  total: number;
  selectedOptionId?: OptionId;
  onSelect: (optionId: OptionId) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  completionMessage?: string;
};

export function PreferenceSceneQuestion<OptionId extends string | number>({
  presentation,
  message,
  options,
  current,
  total,
  selectedOptionId,
  onSelect,
  onPrevious,
  onNext,
  completionMessage,
}: Props<OptionId>) {
  const selectedOption = options.find((option) => option.id === selectedOptionId);
  const groupChoice = presentation.kind === "group-choice";

  return (
    <View style={styles.stage}>
      <View
        accessibilityLabel={`상황 질문 ${total}개 중 ${current}번째`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: current }}
        style={styles.progress}
      >
        {Array.from({ length: total }, (_, index) => (
          <View key={index} style={[styles.progressSegment, index < current && styles.progressSegmentActive]} />
        ))}
      </View>

      <View style={styles.sceneHeader}>
        <Text selectable style={styles.location}>{presentation.location}</Text>
        <Text accessibilityRole="header" selectable style={styles.title}>{presentation.title}</Text>
        <Text selectable style={styles.description}>{presentation.description}</Text>
        {groupChoice ? (
          <View accessibilityLabel="친구들과 함께 선택하는 상황" style={styles.groupPresence}>
            <View accessibilityElementsHidden style={styles.avatarRow}>
              <View style={[styles.avatar, styles.avatarFirst]}><Text style={styles.avatarText}>친</Text></View>
              <View style={[styles.avatar, styles.avatarSecond]}><Text style={styles.avatarText}>구</Text></View>
              <View style={[styles.avatar, styles.avatarThird]}><Text style={styles.avatarText}>나</Text></View>
            </View>
            <Text style={styles.groupLabel}>친구들과 함께 고르는 중</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.promptCard}>
        <Text style={styles.promptLabel}>{groupChoice ? "친구들이 당신에게 물어요" : "지금 이 장면에서"}</Text>
        <Text selectable style={styles.prompt}>{message}</Text>
      </View>

      <View style={styles.choicePanel}>
        <Text style={styles.choiceLabel}>{groupChoice ? "나는 이렇게 말할래" : "나는 이렇게 선택할래"}</Text>
        <View accessibilityLabel="상황 선택지" accessibilityRole="radiogroup" style={styles.optionList}>
          {options.map((option) => {
            const selected = option.id === selectedOptionId;
            return (
              <Pressable
                key={option.id}
                accessibilityLabel={`${option.meaning}. ${option.label}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onSelect(option.id)}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text selectable style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.navigation}>
          {onPrevious ? (
            <Pressable
              accessibilityRole="button"
              onPress={onPrevious}
              style={({ pressed }) => [styles.previousButton, pressed && styles.pressed]}
            >
              <Text style={styles.previousButtonText}>‹ 이전 질문</Text>
            </Pressable>
          ) : <View />}
          {selectedOption && onNext ? (
            <Pressable
              accessibilityRole="button"
              onPress={onNext}
              style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}
            >
              <Text style={styles.nextButtonText}>다음</Text>
            </Pressable>
          ) : null}
        </View>
        {selectedOption && !onNext ? (
          <Text accessibilityLiveRegion="polite" style={styles.completedHelper}>
            {completionMessage ?? `${total}개의 장면에 모두 답했어요. 아래의 ‘다음’을 눌러 계속해 주세요.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    overflow: "hidden",
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  progress: { flexDirection: "row", gap: spacing.xxs },
  progressSegment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  progressSegmentActive: { backgroundColor: colors.primary },
  sceneHeader: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  location: { ...typography.caption, color: colors.primary },
  title: { ...typography.title, color: colors.text },
  description: { ...typography.body, color: colors.textSecondary },
  groupPresence: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.xs },
  avatarRow: { width: 78, height: 32, flexDirection: "row", alignItems: "center" },
  avatar: {
    position: "absolute",
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
  },
  avatarFirst: { left: 0, backgroundColor: colors.primarySoft },
  avatarSecond: { left: 22, backgroundColor: colors.warningSoft },
  avatarThird: { left: 44, backgroundColor: colors.successSoft },
  avatarText: { ...typography.caption, color: colors.text },
  groupLabel: { ...typography.caption, color: colors.textSecondary },
  promptCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  promptLabel: { ...typography.caption, color: colors.textMuted },
  prompt: { ...typography.bodyStrong, color: colors.text },
  choicePanel: { gap: spacing.sm },
  choiceLabel: { ...typography.caption, color: colors.textSecondary },
  optionList: { gap: spacing.xs },
  option: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { ...typography.body, flex: 1, color: colors.textSecondary },
  optionTextSelected: { ...typography.bodyStrong, color: colors.primary },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  navigation: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  previousButton: { minHeight: 44, justifyContent: "center", borderRadius: radius.md, paddingHorizontal: spacing.sm },
  previousButtonText: { ...typography.caption, color: colors.textSecondary },
  nextButton: { minHeight: 44, justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  nextButtonText: { ...typography.bodyStrong, color: colors.white },
  completedHelper: { ...typography.caption, color: colors.success, textAlign: "center" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
