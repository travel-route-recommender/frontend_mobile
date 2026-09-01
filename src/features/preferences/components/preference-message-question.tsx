import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../../../theme/tokens";
import { DuriKoreanText } from "../../duri/components/DuriKoreanText";
import type { PreferenceCharacterPresentation } from "../assets/preference-character-assets";
import type { PreferenceMessageOption } from "../config/itinerary-message-questions";
import { PreferenceCharacterAvatar } from "./preference-character-question";

type Props<OptionId extends string | number> = {
  senderName: string;
  senderStatus: string;
  character: PreferenceCharacterPresentation;
  message: string;
  options: readonly PreferenceMessageOption<OptionId>[];
  current: number;
  total: number;
  selectedOptionId?: OptionId;
  onSelect: (optionId: OptionId) => void;
};

export function PreferenceMessageQuestion<OptionId extends string | number>({
  senderName,
  senderStatus,
  character,
  message,
  options,
  current,
  total,
  selectedOptionId,
  onSelect,
}: Props<OptionId>) {
  return <View accessibilityLabel={`질문 ${total}개 중 ${current}번째`} style={styles.question}>
    <View style={styles.guideRow}>
      <PreferenceCharacterAvatar character={character} />
      <View style={styles.guideCopy}>
        <Text style={styles.guideName}>{senderName}의 질문을 함께 생각해봐요</Text>
        <DuriKoreanText style={styles.guideStatus}>{senderStatus}</DuriKoreanText>
      </View>
    </View>

    <DuriKoreanText accessibilityRole="header" selectable style={styles.title}>{message}</DuriKoreanText>
    <Text style={styles.prompt}>지금의 나와 가장 가까운 답을 골라 주세요.</Text>

    <View accessibilityLabel="답변 선택지" accessibilityRole="radiogroup" style={styles.optionList}>
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
          <View style={[styles.indicator, selected && styles.indicatorSelected]}>
            {selected ? <Text style={styles.check}>✓</Text> : null}
          </View>
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
