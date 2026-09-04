import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { DuriGroupInsight } from "../types";
import { plainDuriUserText } from "../presentation/plainDuriUserText";

function friendlyCopy(value: string) {
  return plainDuriUserText(value
    .replace(/공유 파생 성향/g, "여행방에서 확인한 성향")
    .replace(/원본 상세 설문/g, "개별 설문 답변")
    .replace(/서버 파생 축/g, "여행방 성향 정보")
    .replace(/후보 직접 신호/g, "후보에 남긴 의견")
    .replace(/복원하지 않았고/g, "추측하지 않았고")
    .replace(/자동 삭제의 근거로 쓰지 않고/g, "일정을 자동으로 빼지 않고"));
}

export function GroupPreferenceInsightCard({ insight }: { insight: DuriGroupInsight }) {
  return <View style={styles.card}><Text style={styles.kind}>{insight.kind === "coordination" ? "함께 조율" : insight.kind === "common" ? "공통 성향" : insight.kind === "difference" ? "성향 차이" : "응답 범위"}</Text><Text style={styles.title}>{friendlyCopy(insight.title)}</Text><Text style={styles.description}>{friendlyCopy(insight.description)}</Text></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kind: { ...typography.caption, color: colors.primary },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
});
