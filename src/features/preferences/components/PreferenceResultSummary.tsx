import { StyleSheet, Text, View } from "react-native";
import { Card, Chip } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  getChallengeStylePresentation,
  getPreferenceTypePresentation,
} from "../logic/formatPreferenceResult";
import type { ChallengeStylePreference, PreferencePreviewResult, ScheduleStylePreference } from "../types";

export function PreferenceResultSummary({ result, challengeStyle, scheduleStyle, userName, anonymous = false }: { result: PreferencePreviewResult; challengeStyle?: ChallengeStylePreference; scheduleStyle?: ScheduleStylePreference; userName?: string; anonymous?: boolean }) {
  const legacyPresentation = getPreferenceTypePresentation(result.profileType);
  const challengePresentation = challengeStyle ? getChallengeStylePresentation(challengeStyle.type) : null;
  const presentation = challengePresentation ?? legacyPresentation;
  const title = scheduleStyle ? `${scheduleStyle.modifier} ${presentation.title}` : presentation.title;
  const traits = challengePresentation?.traits ?? result.traits;
  return <>
    <Card style={styles.hero}>
      <Text style={styles.icon}>{presentation.icon}</Text>
      <Text style={styles.eyebrow}>두리 테스트 결과</Text>
      <Text style={styles.name}>{userName || "여행자"}님은</Text>
      <Text selectable style={styles.title}>“{title}”예요</Text>
      <Text style={styles.description}>{presentation.description}</Text>
      {challengeStyle ? <Text selectable style={styles.modelMeta}>분류 확률 {Math.round(challengeStyle.confidence * 100)}% · {challengeStyle.modelVersion}</Text> : null}
      <View accessibilityLabel={`주요 성향: ${traits.join(", ")}`} style={styles.traits}>{traits.map((trait) => <Chip key={trait} label={trait} selected />)}</View>
    </Card>
    <Card style={styles.insight}>
      <Text style={styles.insightTitle}>여행할 때 중요하게 여기는 요소</Text>
      <View style={styles.tags}>{result.preferredTags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>)}</View>
      <View style={styles.message}><Text style={styles.messageMark}>✦</Text><Text style={styles.messageText}>{presentation.planningMessage}</Text></View>
    </Card>
    {anonymous ? <View style={styles.anonymousNotice}><Text style={styles.anonymousTitle}>체험 결과는 영구 저장되지 않아요</Text><Text style={styles.anonymousText}>로그인하거나 가입한 뒤 테스트를 완료하면 새 결과를 여행방의 동행자 성향 비교에 활용할 수 있어요. 현재 체험 결과는 자동 이전되지 않아요.</Text></View> : null}
  </>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.xs },
  icon: { fontSize: 42 }, eyebrow: { ...typography.caption, color: colors.primary },
  name: { ...typography.subtitle, color: colors.text, marginTop: spacing.xs }, title: { ...typography.display, color: colors.primary, textAlign: "center" },
  description: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs },
  modelMeta: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  traits: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xs, marginTop: spacing.sm },
  insight: { gap: spacing.sm, marginTop: spacing.md }, insightTitle: { ...typography.subtitle, color: colors.text },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, tag: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 }, tagText: { ...typography.caption, color: colors.primary },
  message: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.background, padding: spacing.md }, messageMark: { color: colors.primary, fontSize: 22 }, messageText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  anonymousNotice: { borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md, marginTop: spacing.md }, anonymousTitle: { ...typography.bodyStrong, color: colors.warning }, anonymousText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
});
