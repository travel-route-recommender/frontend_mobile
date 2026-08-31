import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { DuriKoreanText } from "./DuriKoreanText";
import { DuriPlanningIllustration } from "./DuriPlanningIllustration";

export function DuriAnalysisIntro({
  title,
  message,
  error,
  loading,
  disabled,
  onAnalyze,
  onWorkspace,
}: {
  title: string;
  message: string;
  error?: string;
  loading: boolean;
  disabled: boolean;
  onAnalyze: () => void | Promise<void>;
  onWorkspace: () => void;
}) {
  const { width } = useWindowDimensions();
  const compactHero = width <= 360;

  return <View style={styles.wrap}>
    <View style={styles.hero}>
      <View style={styles.copy}><Text style={styles.eyebrow}>DURI 일정 점검</Text><DuriKoreanText style={styles.title}>{title}</DuriKoreanText><DuriKoreanText style={styles.message}>{message}</DuriKoreanText></View>
      <DuriPlanningIllustration compact={compactHero} />
    </View>
    {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>일정을 점검하지 못했어요</Text><Text style={styles.errorText}>{error}</Text></View> : null}
    <PrimaryButton label={loading ? "점검 중" : "DURI 일정 점검하기"} loading={loading} disabled={disabled} onPress={onAnalyze} />
    <SecondaryButton label="워크스페이스로 돌아가기" onPress={onWorkspace} />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  hero: { minHeight: 220, flexDirection: "row", alignItems: "flex-end", overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#D9D5FF", backgroundColor: "#F3F1FF", paddingTop: spacing.xl, paddingLeft: spacing.lg, paddingRight: spacing.sm, ...shadows.card },
  copy: { flex: 1, alignSelf: "stretch", gap: spacing.sm, paddingBottom: spacing.xl, zIndex: 1 },
  eyebrow: { ...typography.caption, color: "#735BC4", fontWeight: "900" },
  title: { fontSize: 20, lineHeight: 27, fontWeight: "900", color: "#17265F" },
  message: { ...typography.caption, color: "#60719B" },
  error: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorTitle: { ...typography.bodyStrong, color: colors.danger },
  errorText: { ...typography.caption, color: colors.textSecondary },
});
