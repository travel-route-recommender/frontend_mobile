import { StyleSheet, Text, View } from "react-native";
import { SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function StaleSuggestionNotice({ variant = "suggestion", onReanalyze }: { variant?: "analysis" | "suggestion"; onReanalyze: () => void }) {
  const analysis = variant === "analysis";
  return <View accessibilityRole="alert" style={styles.notice}><Text style={styles.title}>{analysis ? "일정이 변경되어 다시 점검이 필요해요" : "이 제안을 만든 뒤 일정이 변경되었어요"}</Text><Text style={styles.text}>{analysis ? "이전 결과를 현재 일정의 결과처럼 보여주지 않아요. 최신 일정으로 다시 점검해 주세요." : "지금 보이는 변경은 현재 일정에 안전하게 적용할 수 없어요. 최신 일정으로 다시 점검해 주세요."}</Text><SecondaryButton label="다시 분석하기" onPress={onReanalyze} /></View>;
}

const styles = StyleSheet.create({ notice: { gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: "#F2D3AA", padding: spacing.md, backgroundColor: colors.warningSoft }, title: { ...typography.bodyStrong, color: colors.warning }, text: { ...typography.caption, color: colors.textSecondary } });
