import { StyleSheet, Text, View } from "react-native";
import { SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function StaleSuggestionNotice({ onReanalyze }: { onReanalyze: () => void }) {
  return <View accessibilityRole="alert" style={styles.notice}><Text style={styles.title}>제안이 만들어진 뒤 일정이 변경되었어요</Text><Text style={styles.text}>현재 일정과 fingerprint가 달라 강제로 적용할 수 없어요. 현재 일정으로 다시 분석해 주세요.</Text><SecondaryButton label="다시 분석하기" onPress={onReanalyze} /></View>;
}

const styles = StyleSheet.create({ notice: { gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.warningSoft }, title: { ...typography.bodyStrong, color: colors.warning }, text: { ...typography.caption, color: colors.textSecondary } });
