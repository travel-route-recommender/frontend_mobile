import type { PropsWithChildren, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing } from "../../../theme/tokens";
import type { CreateTripStep } from "../types";
import { createTripColors } from "../presentation/createTripTheme";

const stepLabels = ["목적지", "날짜", "여행 정보", "멤버", "확인"] as const;

type ShellProps = PropsWithChildren<{
  activeStep: CreateTripStep;
  onBack(): void;
  onClose(): void;
  footer: ReactNode;
}>;

export function CreateTripWizardShell({ activeStep, onBack, onClose, footer, children }: ShellProps) {
  return <Screen
    backgroundColor={createTripColors.page}
    contentContainerStyle={styles.content}
    footer={footer}
    header={<View style={styles.fixedTop}><CreateTripHeader onBack={onBack} onClose={onClose} /><CreateTripProgress step={activeStep} /></View>}
    keyboardAware
    padded={false}
    scrollResetKey={activeStep}
    testID="create-trip-wizard"
  >
    {children}
  </Screen>;
}

function CreateTripHeader({ onBack, onClose }: { onBack(): void; onClose(): void }) {
  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={8} onPress={onBack} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><Text style={styles.backIcon}>←</Text></Pressable>
    <Text style={styles.headerTitle}>새 여행 만들기</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="여행 만들기 닫기" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><Text style={styles.closeIcon}>×</Text></Pressable>
  </View>;
}

function CreateTripProgress({ step }: { step: CreateTripStep }) {
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 5, now: step + 1, text: `5단계 중 ${step + 1}단계 ${stepLabels[step]}` }} style={styles.progress}>
    <View style={styles.progressRow}>{stepLabels.map((label, index) => {
      const active = index === step;
      const completed = index < step;
      return <View key={label} style={styles.progressItem}>
        <View style={styles.nodeRow}>
          <View style={[styles.connector, index === 0 && styles.connectorHidden, completed || active ? styles.connectorComplete : null]} />
          <View style={[styles.node, completed && styles.nodeComplete, active && styles.nodeActive]}><Text style={[styles.nodeText, completed && styles.nodeTextComplete, active && styles.nodeTextActive]}>{index + 1}</Text></View>
          <View style={[styles.connector, index === step && index < stepLabels.length - 1 ? styles.connectorCurrent : null, index < step ? styles.connectorComplete : null, index === stepLabels.length - 1 && styles.connectorHidden]} />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.progressLabel, active && styles.progressLabelActive]}>{label}</Text>
      </View>;
    })}</View>
  </View>;
}

export function CreateTripStepHeading({ title, description, editing = false }: { title: string; description: string; editing?: boolean }) {
  return <View style={styles.heading}>
    {editing ? <Text style={styles.editMetadata}>확인 화면에서 수정 중</Text> : null}
    <Text style={styles.stepTitle}>{title}</Text>
    <Text style={styles.stepDescription}>{description}</Text>
  </View>;
}

export function CreateTripFooter({ primaryLabel, onPrimary, primaryDisabled = false, primaryLoading = false, secondaryLabel, onSecondary }: { primaryLabel: string; onPrimary(): void | Promise<void>; primaryDisabled?: boolean; primaryLoading?: boolean; secondaryLabel?: string; onSecondary?(): void }) {
  return <View style={styles.footer}>
    {secondaryLabel && onSecondary ? <View style={styles.footerSecondary}><SecondaryButton label={secondaryLabel} onPress={onSecondary} /></View> : null}
    <View style={styles.footerPrimary}><PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} loading={primaryLoading} /></View>
  </View>;
}

export function CreateTripSection({ title, description, optional = false, children, style }: PropsWithChildren<{ title: string; description?: string; optional?: boolean; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.section, style]}>
    <View style={styles.sectionHeadingRow}><Text style={styles.sectionTitle}>{title}</Text>{optional ? <Text style={styles.optionalBadge}>선택 사항</Text> : null}</View>
    {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
    {children}
  </View>;
}

export function CreateTripSelectionCard({ label, description, selected, onPress, compact = false, style }: { label: string; description?: string; selected: boolean; onPress(): void; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.selectionCard, compact && styles.selectionCardCompact, style, selected && styles.selectionCardSelected, pressed && styles.pressed]}>
    <View style={styles.selectionCopy}><Text style={[styles.selectionLabel, selected && styles.selectionLabelSelected]}>{label}</Text>{description ? <Text style={styles.selectionDescription}>{description}</Text> : null}</View>
    <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
  </Pressable>;
}

export type ReviewAction = { label: string; accessibilityLabel: string; onPress(): void };

export function CreateTripReviewSection({ title, actions, children }: PropsWithChildren<{ title: string; actions: ReviewAction[] }>) {
  return <View style={styles.reviewSection}>
    <View style={styles.reviewHeader}><Text style={styles.reviewTitle}>{title}</Text><View style={styles.reviewActions}>{actions.map((action) => <Pressable key={action.accessibilityLabel} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} hitSlop={6} style={({ pressed }) => [styles.reviewAction, pressed && styles.pressed]}><Text style={styles.reviewActionText}>{action.label} ›</Text></Pressable>)}</View></View>
    <View style={styles.reviewBody}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  fixedTop: { backgroundColor: createTripColors.page, borderBottomWidth: 1, borderBottomColor: createTripColors.border },
  header: { minHeight: 58, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  backIcon: { fontSize: 23, lineHeight: 27, color: createTripColors.text, fontWeight: "700" },
  closeIcon: { fontSize: 29, lineHeight: 31, color: createTripColors.text, fontWeight: "300" },
  headerTitle: { fontSize: 17, lineHeight: 23, fontWeight: "800", color: createTripColors.text },
  progress: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  progressRow: { flexDirection: "row" },
  progressItem: { flex: 1, alignItems: "center", gap: 5 },
  nodeRow: { width: "100%", flexDirection: "row", alignItems: "center" },
  connector: { flex: 1, height: 1.5, backgroundColor: createTripColors.border },
  connectorHidden: { opacity: 0 },
  connectorComplete: { backgroundColor: colors.primary },
  connectorCurrent: { backgroundColor: createTripColors.blueBorder },
  node: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: createTripColors.border, backgroundColor: createTripColors.page },
  nodeComplete: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  nodeActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  nodeText: { fontSize: 11, lineHeight: 14, fontWeight: "800", color: createTripColors.muted },
  nodeTextComplete: { color: colors.primary },
  nodeTextActive: { color: colors.white },
  progressLabel: { width: "100%", textAlign: "center", fontSize: 9, lineHeight: 12, fontWeight: "700", color: createTripColors.muted },
  progressLabelActive: { color: colors.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  heading: { gap: 6, marginBottom: spacing.xl },
  editMetadata: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: createTripColors.lavenderSurface, color: colors.primary, fontSize: 10, lineHeight: 14, fontWeight: "800" },
  stepTitle: { fontSize: 23, lineHeight: 31, fontWeight: "900", color: createTripColors.text, letterSpacing: -0.4 },
  stepDescription: { fontSize: 13, lineHeight: 19, fontWeight: "500", color: createTripColors.secondary },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: createTripColors.border, backgroundColor: createTripColors.page },
  footerSecondary: { width: 112 },
  footerPrimary: { flex: 1 },
  section: { gap: spacing.sm },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", color: createTripColors.text },
  sectionDescription: { marginTop: -4, fontSize: 12, lineHeight: 18, fontWeight: "500", color: createTripColors.secondary },
  optionalBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: createTripColors.lavenderSurface, color: createTripColors.secondary, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  selectionCard: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: createTripColors.border, borderRadius: 16, padding: spacing.md, backgroundColor: createTripColors.page },
  selectionCardCompact: { minHeight: 56, paddingVertical: spacing.sm },
  selectionCardSelected: { borderColor: colors.primary, backgroundColor: createTripColors.blueSurface },
  selectionCopy: { flex: 1, gap: 2 },
  selectionLabel: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: createTripColors.text },
  selectionLabelSelected: { color: colors.primary },
  selectionDescription: { fontSize: 11, lineHeight: 16, fontWeight: "500", color: createTripColors.secondary },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: createTripColors.border, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  reviewSection: { overflow: "hidden", borderWidth: 1, borderColor: createTripColors.border, borderRadius: 18, backgroundColor: createTripColors.page },
  reviewHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: createTripColors.border },
  reviewTitle: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: "800", color: createTripColors.text },
  reviewActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  reviewAction: { minHeight: 36, justifyContent: "center" },
  reviewActionText: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: colors.primary },
  reviewBody: { padding: spacing.md, gap: spacing.sm },
  pressed: { opacity: 0.76 },
});
