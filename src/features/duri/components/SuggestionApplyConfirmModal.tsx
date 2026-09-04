import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { plainDuriUserText } from "../presentation/plainDuriUserText";

export function SuggestionApplyConfirmModal({ visible, title, affectedDates, changeCount, reviewWarnings = [], loading, onCancel, onConfirm }: { visible: boolean; title: string; affectedDates: string[]; changeCount: number; reviewWarnings?: readonly string[]; loading: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const requiresWarningConfirmation = reviewWarnings.length > 0;
  const applyDisabled = loading || (requiresWarningConfirmation && !warningsConfirmed);
  const cancel = () => {
    if (loading) return;
    setWarningsConfirmed(false);
    onCancel();
  };
  const confirm = async () => {
    if (applyDisabled) return;
    setWarningsConfirmed(false);
    await onConfirm();
  };
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={cancel}><View style={styles.overlay}><Pressable accessibilityLabel="적용 확인 닫기" disabled={loading} onPress={cancel} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal accessibilityLabel="두리 제안 최종 적용 확인" style={styles.sheet}><Text style={styles.eyebrow}>마지막 확인</Text><Text style={styles.title}>이 제안을 일정에 적용할까요?</Text><Text style={styles.text}>{plainDuriUserText(title)}</Text><View style={styles.summary}><View style={styles.summaryItem}><Text style={styles.summaryLabel}>변경</Text><Text style={styles.summaryValue}>{changeCount}개</Text></View><View style={styles.summaryItem}><Text style={styles.summaryLabel}>영향 날짜</Text><Text style={styles.summaryValue}>{affectedDates.length}일</Text></View></View><Text style={styles.dates}>{affectedDates.join(" · ") || "현재 일정"}</Text>{requiresWarningConfirmation ? <View style={styles.warningBox}><Text style={styles.warningTitle}>아직 확인이 필요한 정보</Text>{reviewWarnings.map((warning) => <Text key={warning} style={styles.warningText}>• {plainDuriUserText(warning)}</Text>)}<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: warningsConfirmed }} onPress={() => setWarningsConfirmed((confirmed) => !confirmed)} style={({ pressed }) => [styles.confirmRow, pressed && styles.pressed]}><View style={[styles.checkbox, warningsConfirmed && styles.checkboxSelected]}><Text style={styles.checkboxMark}>{warningsConfirmed ? "✓" : ""}</Text></View><Text style={styles.confirmText}>위 내용을 확인했고, 필요하면 적용 후 시간을 조정할게요.</Text></Pressable></View> : null}<Text style={styles.notice}>{changeCount > 1 ? "모든 변경을 한 번에 확인하고 적용해요. " : "이 변경을 한 번에 적용해요. "}잠금·예약 조건이 하나라도 맞지 않으면 일정은 전혀 바뀌지 않아요.</Text><PrimaryButton label={requiresWarningConfirmation ? "확인하고 일정에 적용" : "일정에 적용"} loading={loading} disabled={applyDisabled} onPress={confirm} accessibilityLabel="두리 제안 최종 적용" /><SecondaryButton label="취소" disabled={loading} onPress={cancel} /></View></View></Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  sheet: { gap: spacing.sm, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.xl, ...shadows.floating },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.title, color: colors.text },
  text: { ...typography.bodyStrong, color: colors.text },
  summary: { flexDirection: "row", gap: spacing.sm },
  summaryItem: { flex: 1, gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm },
  summaryLabel: { ...typography.caption, color: colors.textSecondary },
  summaryValue: { ...typography.bodyStrong, color: colors.primary },
  dates: { ...typography.caption, color: colors.primary },
  notice: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  warningBox: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#F1C98E", backgroundColor: colors.warningSoft, padding: spacing.sm },
  warningTitle: { ...typography.bodyStrong, color: colors.warning },
  warningText: { ...typography.caption, color: colors.textSecondary },
  confirmRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  checkbox: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxMark: { ...typography.caption, color: colors.white },
  confirmText: { ...typography.caption, color: colors.text, flex: 1 },
  pressed: { opacity: 0.72 },
});
