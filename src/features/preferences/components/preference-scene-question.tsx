import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../../../theme/tokens";
import { DuriKoreanText } from "../../duri/components/DuriKoreanText";
import type { PreferenceCharacterPresentation } from "../assets/preference-character-assets";
import type { PreferenceMessageOption, PreferenceQuestionPresentation } from "../config/itinerary-message-questions";
import { PreferenceCharacterAvatar } from "./preference-character-question";

type ScenePresentation = Exclude<PreferenceQuestionPresentation, { kind: "chat" }>;

type Props<OptionId extends string | number> = {
  presentation: ScenePresentation;
  character: PreferenceCharacterPresentation;
  message: string;
  options: readonly PreferenceMessageOption<OptionId>[];
  current: number;
  total: number;
  selectedOptionId?: OptionId;
  onSelect: (optionId: OptionId) => void;
};

export function PreferenceSceneQuestion<OptionId extends string | number>({
  presentation,
  character,
  message,
  options,
  current,
  total,
  selectedOptionId,
  onSelect,
}: Props<OptionId>) {
  const groupChoice = presentation.kind === "group-choice";
  return <View accessibilityLabel={`상황 질문 ${total}개 중 ${current}번째`} style={styles.question}>
    <View style={styles.guideRow}>
      <PreferenceCharacterAvatar character={character} />
      <View style={styles.guideCopy}>
        <Text style={styles.guideName}>두리와 함께 보는 여행 장면</Text>
        <Text style={styles.guideStatus}>{groupChoice ? "대화 속의 나를 떠올려 보세요" : "실제 여행의 나를 떠올려 보세요"}</Text>
      </View>
    </View>

    <View style={styles.sceneCard}>
      <View style={styles.locationPill}><Text style={styles.location}>{presentation.location}</Text></View>
      <DuriKoreanText style={styles.sceneTitle}>{presentation.title}</DuriKoreanText>
      <DuriKoreanText style={styles.sceneDescription}>{presentation.description}</DuriKoreanText>
    </View>

    <DuriKoreanText accessibilityRole="header" selectable style={styles.title}>{message}</DuriKoreanText>
    <Text style={styles.prompt}>{groupChoice ? "내가 실제로 할 말과 가까운 답을 골라 주세요." : "지금의 나와 가장 가까운 선택을 골라 주세요."}</Text>

    <View accessibilityLabel="상황 선택지" accessibilityRole="radiogroup" style={styles.optionList}>
      {options.map((option) => {
        const selected = option.id === selectedOptionId;
        return <Pressable
          key={option.id}
          accessibilityLabel={`${option.meaning}. ${option.label}`}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          onPress={() => onSelect(option.id)}
          style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
        >
          <DuriKoreanText selectable style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</DuriKoreanText>
          <View style={[styles.indicator, selected && styles.indicatorSelected]}>{selected ? <Text style={styles.check}>✓</Text> : null}</View>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  question: { gap: spacing.lg },
  guideRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  guideCopy: { flex: 1, minWidth: 0, gap: 1 },
  guideName: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: "#7569BE" },
  guideStatus: { fontSize: 11, lineHeight: 17, fontWeight: "500", color: colors.textMuted },
  sceneCard: { gap: spacing.xs, borderWidth: 1, borderColor: "#D9D5FF", borderRadius: 18, backgroundColor: "#F3F1FF", padding: spacing.md },
  locationPill: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  location: { fontSize: 10, lineHeight: 14, fontWeight: "800", color: "#7569BE" },
  sceneTitle: { fontSize: 16, lineHeight: 23, fontWeight: "800", color: "#17265F" },
  sceneDescription: { fontSize: 12, lineHeight: 19, fontWeight: "500", color: colors.textSecondary },
  title: { fontSize: 23, lineHeight: 32, fontWeight: "900", color: "#17265F" },
  prompt: { marginTop: -spacing.sm, fontSize: 13, lineHeight: 19, fontWeight: "500", color: colors.textSecondary },
  optionList: { gap: spacing.sm },
  option: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: "#F2F8FF" },
  optionText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "600", color: colors.textSecondary },
  optionTextSelected: { fontWeight: "800", color: "#17265F" },
  indicator: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.pill, backgroundColor: colors.surface },
  indicatorSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  check: { fontSize: 13, lineHeight: 16, fontWeight: "900", color: colors.white },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
