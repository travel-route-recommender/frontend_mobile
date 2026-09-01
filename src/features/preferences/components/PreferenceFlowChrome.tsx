import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, spacing, typography } from "../../../theme/tokens";
import { DuriKoreanText } from "../../duri/components/DuriKoreanText";

export function PreferenceFlowHeader({
  title = "여행 성향 알아보기",
  onBack,
  actionLabel,
  onAction,
}: {
  title?: string;
  onBack: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return <View style={styles.header}>
    <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" hitSlop={8} onPress={onBack} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <Text style={styles.backIcon}>‹</Text>
    </Pressable>
    <DuriKoreanText numberOfLines={1} style={styles.headerTitle}>{title}</DuriKoreanText>
    {actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <Text style={styles.headerActionLabel}>{actionLabel}</Text>
    </Pressable> : <View style={styles.headerAction} />}
  </View>;
}

export function PreferenceQuestionIntro({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return <View style={styles.questionIntro}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
    <DuriKoreanText accessibilityRole="header" selectable style={styles.questionTitle}>{title}</DuriKoreanText>
    <DuriKoreanText style={styles.questionDescription}>{description}</DuriKoreanText>
  </View>;
}

export function PreferenceStickyFooter({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  helper,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  helper?: ReactNode;
}) {
  return <View style={styles.footer}>
    {helper}
    <View style={styles.footerActions}>
      {secondaryLabel && onSecondary ? <View style={styles.secondaryButton}>
        <SecondaryButton disabled={secondaryDisabled} label={secondaryLabel} onPress={onSecondary} />
      </View> : null}
      <View style={styles.primaryButton}>
        <PrimaryButton disabled={primaryDisabled} label={primaryLabel} onPress={onPrimary} />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  headerAction: { width: 52, minHeight: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { marginTop: -2, fontSize: 34, lineHeight: 36, fontWeight: "400", color: colors.text },
  headerTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: "800", color: "#17265F", textAlign: "center" },
  headerActionLabel: { ...typography.caption, color: colors.textSecondary },
  questionIntro: { gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.primary },
  questionTitle: { fontSize: 23, lineHeight: 31, fontWeight: "900", color: "#17265F" },
  questionDescription: { fontSize: 13, lineHeight: 20, fontWeight: "500", color: colors.textSecondary },
  footer: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  footerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  secondaryButton: { width: 112 },
  primaryButton: { flex: 1 },
  pressed: { opacity: 0.72 },
});
