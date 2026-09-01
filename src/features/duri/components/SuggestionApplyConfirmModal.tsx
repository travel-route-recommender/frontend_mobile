import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";

export function SuggestionApplyConfirmModal({ visible, title, affectedDates, changeCount, loading, onCancel, onConfirm }: { visible: boolean; title: string; affectedDates: string[]; changeCount: number; loading: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}><View style={styles.overlay}><Pressable accessibilityLabel="적용 확인 닫기" onPress={onCancel} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal accessibilityLabel="두리 제안 최종 적용 확인" style={styles.sheet}><Text style={styles.eyebrow}>DURI FINAL CHECK</Text><Text style={styles.title}>이 제안을 일정에 적용할까요?</Text><Text style={styles.text}>{title}</Text><View style={styles.summary}><View style={styles.summaryItem}><Text style={styles.summaryLabel}>변경</Text><Text style={styles.summaryValue}>{changeCount}개</Text></View><View style={styles.summaryItem}><Text style={styles.summaryLabel}>영향 날짜</Text><Text style={styles.summaryValue}>{affectedDates.length}일</Text></View></View><Text style={styles.dates}>{affectedDates.join(" · ") || "현재 일정"}</Text><Text style={styles.notice}>{changeCount > 1 ? "모든 변경을 한 번에 확인하고 적용해요. " : "이 변경을 한 번에 적용해요. "}조건이 하나라도 맞지 않으면 일정은 전혀 바뀌지 않아요.</Text><PrimaryButton label="일정에 적용" loading={loading} onPress={onConfirm} accessibilityLabel="두리 제안 최종 적용" /><SecondaryButton label="취소" disabled={loading} onPress={onCancel} /></View></View></Modal>;
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
});
