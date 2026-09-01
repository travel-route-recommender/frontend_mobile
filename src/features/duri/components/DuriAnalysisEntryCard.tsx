import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisSession } from "../types";
import type { DuriWorkspaceAction } from "../logic/duriWorkspaceAction";

export function DuriAnalysisEntryCard({
  itineraryCount,
  session,
  stale,
  loading,
  engineAvailable,
  engineMessage,
  action,
  onAction,
}: {
  itineraryCount: number;
  session?: DuriAnalysisSession;
  stale: boolean;
  loading: boolean;
  engineAvailable: boolean;
  engineMessage?: string;
  action: DuriWorkspaceAction;
  onAction: () => void;
}) {
  const blocked = !action.enabled;
  const actionableCount = session?.issues.filter((issue) => issue.severity !== "info").length ?? 0;
  const title = action.kind === "create_schedule"
    ? "일정을 추가하면 두리가 함께 점검해드려요"
    : stale
      ? "일정이 변경되어 다시 분석이 필요해요"
      : session
        ? `현재 분석에서 조율 항목 ${actionableCount}개를 찾았어요`
        : !engineAvailable
          ? "두리 엔진 연결을 확인해 주세요"
        : itineraryCount
          ? "현재 일정을 두리와 점검해보세요"
          : "일정을 추가하면 두리가 분석해드려요";
  const status = action.kind === "create_schedule"
    ? "일정을 만들면 동선과 속도를 점검해요"
    : stale
      ? "현재 일정으로 업데이트가 필요해요"
      : session
        ? `조율 항목 ${actionableCount}개 · 결과 저장됨`
        : !engineAvailable
          ? engineMessage ?? "분석 연결을 확인해 주세요"
          : "일정의 균형을 두리와 점검해보세요";
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${title}, ${action.label}`}
    accessibilityState={{ disabled: blocked }}
    disabled={blocked}
    onPress={onAction}
    style={({ pressed }) => [styles.card, blocked && styles.disabled, pressed && !blocked && styles.pressed]}
  >
    <View style={styles.icon}><Text style={styles.iconText}>✦</Text></View>
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>DURI</Text>
      <Text numberOfLines={1} style={styles.title}>{status}</Text>
    </View>
    <View style={styles.action}>{loading ? <ActivityIndicator color="#7569BE" /> : <Text numberOfLines={1} style={styles.actionText}>{action.label}</Text>}<Text style={styles.chevron}>›</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: "#D8D5F4", backgroundColor: "#F4F1FF", padding: spacing.sm },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "#E2DDFB" },
  iconText: { fontSize: 22, color: "#7569BE" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  eyebrow: { ...typography.caption, color: "#7569BE" },
  title: { ...typography.caption, color: colors.textSecondary },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xxs, maxWidth: 124 },
  actionText: { ...typography.caption, color: "#7569BE", flexShrink: 1 },
  chevron: { fontSize: 24, lineHeight: 28, color: "#7569BE" },
  disabled: { opacity: 0.58 },
  pressed: { opacity: 0.88 },
});
