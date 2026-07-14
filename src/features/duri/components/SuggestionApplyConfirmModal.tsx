import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";

export function SuggestionApplyConfirmModal({ visible, title, affectedDates, loading, onCancel, onConfirm }: { visible: boolean; title: string; affectedDates: string[]; loading: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}><View style={styles.overlay}><Pressable accessibilityLabel="적용 확인 닫기" onPress={onCancel} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal accessibilityLabel="두리 제안 최종 적용 확인" style={styles.sheet}><Text style={styles.eyebrow}>FINAL CONFIRM</Text><Text style={styles.title}>이 제안을 일정에 반영할까요?</Text><Text style={styles.text}>{title}</Text><Text style={styles.dates}>영향 날짜 · {affectedDates.join(" · ") || "현재 일정"}</Text><Text style={styles.notice}>모든 변경을 먼저 검증하고 성공할 때만 일정 전체를 한 번에 교체합니다. 실패하면 일정은 전혀 바뀌지 않아요.</Text><PrimaryButton label="확인하고 적용" loading={loading} onPress={onConfirm} accessibilityLabel="두리 제안 최종 적용" /><SecondaryButton label="취소" disabled={loading} onPress={onCancel} /></View></View></Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  sheet: { gap: spacing.sm, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.xl, ...shadows.floating },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.title, color: colors.text },
  text: { ...typography.bodyStrong, color: colors.text },
  dates: { ...typography.caption, color: colors.primary },
  notice: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
});
