import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisSession } from "../types";

export function DuriAnalysisEntryCard({
  itineraryCount,
  session,
  stale,
  loading,
  engineAvailable,
  engineMessage,
  onOpen,
}: {
  itineraryCount: number;
  session?: DuriAnalysisSession;
  stale: boolean;
  loading: boolean;
  engineAvailable: boolean;
  engineMessage?: string;
  onOpen: () => void;
}) {
  const blocked = loading || !engineAvailable || itineraryCount === 0;
  const actionableCount = session?.issues.filter((issue) => issue.severity !== "info").length ?? 0;
  const title = !engineAvailable
    ? "두리 엔진 연결을 확인해 주세요"
    : stale
      ? "일정이 변경되어 다시 분석이 필요해요"
      : session
        ? `현재 분석에서 조율 항목 ${actionableCount}개를 찾았어요`
        : itineraryCount
          ? "현재 일정을 두리와 점검해보세요"
          : "일정을 추가하면 두리가 분석해드려요";
  const description = !engineAvailable
    ? engineMessage ?? "서버 엔진 계약이 아직 연결되지 않았어요."
    : stale
      ? "이전 리포트를 현재 결과처럼 사용하지 않아요. 현재 일정으로 다시 실행해 주세요."
      : session
        ? `${new Date(session.analyzedAt).toLocaleString("ko-KR")} 분석 · 리포트와 제안을 확인할 수 있어요.`
        : "분석은 일정 Store를 바꾸지 않으며, 제안도 미리보기와 확인 전에는 적용되지 않아요.";
  return <Card style={styles.card}>
    <View style={styles.icon}><Text style={styles.iconText}>✦</Text></View>
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>DURI ANALYSIS</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={stale ? "현재 일정 다시 분석하기" : session ? "두리 분석 리포트 보기" : "두리 분석 화면 열기"}
        disabled={blocked}
        onPress={onOpen}
        style={({ pressed }) => [styles.button, blocked && styles.disabled, pressed && !blocked && styles.pressed]}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : null}
        <Text style={styles.buttonText}>{loading ? "분석 중" : !engineAvailable ? "엔진 확인 필요" : itineraryCount === 0 ? "일정 추가 후 분석" : stale ? "다시 분석하기" : session ? "리포트 보기" : "분석하기"}</Text>
      </Pressable>
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl, backgroundColor: "#F8FBFF" },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  iconText: { fontSize: 25, color: colors.primary },
  copy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  button: { minHeight: 46, marginTop: spacing.xs, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.md },
  buttonText: { ...typography.bodyStrong, color: colors.white },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.88 },
});
