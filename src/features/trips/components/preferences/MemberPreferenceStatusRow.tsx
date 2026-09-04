import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../../../components/common";
import { colors, radius, spacing, typography } from "../../../../theme/tokens";
import type { MemberPreferenceStatus } from "../../selectors";

const statusMeta = {
  completed: { icon: "✓", label: "응답 완료", background: colors.successSoft, color: colors.success },
  pending: { icon: "…", label: "아직 응답 전", background: colors.warningSoft, color: colors.warning },
  invalid: { icon: "!", label: "응답 확인 필요", background: colors.dangerSoft, color: colors.danger },
} as const;

export function MemberPreferenceStatusRow({ member }: { member: MemberPreferenceStatus }) {
  const status = statusMeta[member.state];
  const detail = member.state === "completed"
    ? member.profileType ?? "여행 성향 결과 저장됨"
    : member.state === "invalid"
      ? member.invalidReason === "missing-user" ? "여행방 멤버 정보를 다시 확인해 주세요" : "저장된 응답을 확인할 수 없어 다시 응답해 주세요"
      : "완료 후 그룹 진단에 반영돼요";
  return <View accessibilityLabel={`${member.name}${member.role === "owner" ? ", 방장" : ""}, ${status.label}. ${detail}`} style={styles.row}>
    <Avatar name={member.initial || member.name} uri={member.profileImageUrl} />
    <View style={styles.copy}>
      <View style={styles.nameLine}><Text numberOfLines={1} style={styles.name}>{member.name}</Text>{member.role === "owner" ? <View style={styles.ownerBadge}><Text style={styles.ownerText}>방장</Text></View> : null}{member.isCurrentUser ? <Text style={styles.me}>나</Text> : null}</View>
      <Text style={styles.detail}>{detail}</Text>
    </View>
    <View style={[styles.status, { backgroundColor: status.background }]}><Text style={[styles.statusText, { color: status.color }]}>{status.icon} {status.label}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 0 },
  copy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minWidth: 0 },
  name: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  ownerBadge: { borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  ownerText: { ...typography.caption, color: colors.primary, fontSize: 10 },
  me: { ...typography.caption, color: colors.textMuted },
  detail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  status: { borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 5, maxWidth: 112 },
  statusText: { ...typography.caption, fontSize: 10, textAlign: "center" },
});
