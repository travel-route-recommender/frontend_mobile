import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { SessionKind } from "../types";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function GuestPromptModal({ visible, sessionKind, actionLabel, guestUpgradeAvailable = false, onClose, onLogin, onSignup }: { visible: boolean; sessionKind: SessionKind | null; actionLabel?: string; guestUpgradeAvailable?: boolean; onClose: () => void; onLogin: () => void; onSignup: () => void }) {
  const guest = sessionKind === "guest";
  const canUpgradeGuest = guest && guestUpgradeAvailable;
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.emoji}>{guest ? "🧳" : "🔐"}</Text>
        <Text style={styles.title}>{guest ? "회원 계정이 필요해요" : "로그인하고 함께 계획해요"}</Text>
        <Text style={styles.description}>{guest ? `초대 여행은 둘러볼 수 있지만 ${actionLabel ?? "이 기능"}은 회원가입 후 사용할 수 있어요.${canUpgradeGuest ? " 현재 게스트 여행을 유지한 채 전환할 수 있어요." : " 새 계정에는 현재 게스트 여행이 자동으로 옮겨지지 않으니 필요한 내용을 먼저 확인해 주세요."}` : `${actionLabel ?? "이 기능"}은 로그인한 회원만 사용할 수 있어요. 지금 가입하면 저장한 여행 정보를 이어서 관리할 수 있어요.`}</Text>
        <View style={styles.actions}><PrimaryButton label={canUpgradeGuest ? "게스트 계정 업그레이드" : "회원가입"} onPress={onSignup} /><SecondaryButton label="로그인" onPress={onLogin} /><Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>나중에</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 560, alignSelf: "center", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  handle: { width: 42, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  emoji: { fontSize: 36, textAlign: "center", marginTop: spacing.lg },
  title: { ...typography.title, color: colors.text, textAlign: "center", marginTop: spacing.sm },
  description: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  closeButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { ...typography.bodyStrong, color: colors.textSecondary },
});
