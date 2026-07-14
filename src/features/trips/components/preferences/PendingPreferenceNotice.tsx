import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../../theme/tokens";
import type { MemberPreferenceStatus } from "../../selectors";

export function PendingPreferenceNotice({ members }: { members: MemberPreferenceStatus[] }) {
  if (!members.length) return null;
  const names = members.map((member) => member.name).join(", ");
  const invalidCount = members.filter((member) => member.state === "invalid").length;
  return <View accessibilityLabel={`아직 그룹 진단에 반영되지 않은 멤버: ${names}`} style={styles.notice}>
    <Text style={styles.title}>아직 반영되지 않은 멤버</Text>
    <Text style={styles.text}>{names}</Text>
    {invalidCount ? <Text style={styles.helper}>응답 확인 필요 {invalidCount}명은 결과 또는 사용자 연결을 다시 확인해야 해요.</Text> : <Text style={styles.helper}>응답이 완료되면 이 화면의 진단이 자동으로 다시 계산돼요.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  notice: { borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm, gap: 2 },
  title: { ...typography.caption, color: colors.warning },
  text: { ...typography.bodyStrong, color: colors.text },
  helper: { ...typography.caption, color: colors.textSecondary },
});
