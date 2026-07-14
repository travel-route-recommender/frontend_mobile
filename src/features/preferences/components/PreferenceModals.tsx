import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

function ConfirmationModal({ visible, icon, title, description, confirmLabel, cancelLabel, onConfirm, onCancel }: { visible: boolean; icon: string; title: string; description: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View accessibilityViewIsModal style={styles.dialog}>
        <Text style={styles.icon}>{icon}</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text>
        <View style={styles.actions}><PrimaryButton label={confirmLabel} onPress={onConfirm} /><SecondaryButton label={cancelLabel} onPress={onCancel} /></View>
      </View>
    </View>
  </Modal>;
}

export function PreferenceExitModal({ visible, onExit, onContinue }: { visible: boolean; onExit: () => void; onContinue: () => void }) {
  return <ConfirmationModal visible={visible} icon="📝" title="테스트를 나갈까요?" description="지금까지 선택한 답변은 이 기기에 저장돼요. 다음에 다시 열면 이어서 진행할 수 있어요." confirmLabel="나가기" cancelLabel="테스트 계속하기" onConfirm={onExit} onCancel={onContinue} />;
}

export function PreferenceRestartModal({ visible, onRestart, onCancel }: { visible: boolean; onRestart: () => void; onCancel: () => void }) {
  return <ConfirmationModal visible={visible} icon="↻" title="테스트를 다시 시작할까요?" description="기존 완료 결과는 새 테스트를 제출하기 전까지 유지됩니다. 진행 중인 답변만 처음부터 시작해요." confirmLabel="처음부터 다시 시작" cancelLabel="현재 결과 유지" onConfirm={onRestart} onCancel={onCancel} />;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  dialog: { width: "100%", maxWidth: 460, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.xl },
  icon: { fontSize: 38, textAlign: "center" },
  title: { ...typography.title, color: colors.text, textAlign: "center", marginTop: spacing.sm },
  description: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
