import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriAnalysisSession } from "../types";
import { isDuriAnalysisEntryBlocked } from "../logic/analysisEntry";

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
  const canOpenExistingReport = Boolean(session);
  const blocked = isDuriAnalysisEntryBlocked({ loading, engineAvailable, hasExistingSession: canOpenExistingReport });
  const actionableCount = session?.issues.filter((issue) => issue.severity !== "info").length ?? 0;
  const title = !engineAvailable && !canOpenExistingReport
    ? "두리 분석 기능을 확인해 주세요"
    : stale
      ? "일정이 변경되어 다시 분석이 필요해요"
      : session
        ? `현재 일정에서 확인할 내용 ${actionableCount}개를 찾았어요`
        : itineraryCount
          ? "현재 일정을 두리와 점검해보세요"
          : "빈 일정도 참여자 성향으로 채워볼 수 있어요";
  const description = !engineAvailable && !canOpenExistingReport
    ? engineMessage ?? "지금은 일정 분석 기능을 사용할 수 없어요."
    : stale
      ? "이전 리포트를 현재 결과처럼 사용하지 않아요. 현재 일정으로 다시 실행해 주세요."
      : session
        ? `${new Date(session.analyzedAt).toLocaleString("ko-KR")} 기준으로 확인했어요. 일정이나 장소 정보가 바뀌었다면 다시 분석해 주세요.`
        : itineraryCount === 0
          ? "실제 성향 응답과 여행방 후보가 있으면 기존 일정을 만들지 않은 상태에서도 검토용 초안을 확인할 수 있어요."
          : "분석만으로 일정은 바뀌지 않아요. 개선안도 미리 확인한 뒤 직접 적용할 수 있어요.";
  return <Card style={styles.card}>
    <View style={styles.icon}><Text style={styles.iconText}>✦</Text></View>
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>두리 일정 도우미</Text>
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
        <Text style={styles.buttonText}>{loading ? "분석 중" : session && !engineAvailable ? "기존 리포트 보기" : !engineAvailable ? "엔진 확인 필요" : itineraryCount === 0 ? "성향 기반 초안 만들기" : stale ? "다시 분석하기" : session ? "리포트 보기" : "분석하기"}</Text>
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
