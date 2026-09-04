import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useFriendCompatibilityStore } from "../store/use-friend-compatibility-store";
import type { CompatibilityCategoryStatus } from "../types";

const statusColors: Record<CompatibilityCategoryStatus, { backgroundColor: string; color: string }> = {
  ALIGNED: { backgroundColor: colors.successSoft, color: colors.success },
  COMPLEMENTARY: { backgroundColor: colors.primarySoft, color: colors.primaryPressed },
  ADJUSTABLE: { backgroundColor: colors.warningSoft, color: colors.warning },
  NEEDS_COORDINATION: { backgroundColor: colors.dangerSoft, color: colors.danger },
};

export function CompatibilityResultScreen() {
  const result = useFriendCompatibilityStore((state) => state.latestResult);
  const usersById = useDuriStore((state) => state.usersById);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/tests/compatibility");
  };

  if (environment.dataSource !== "mock") return <Redirect href="/(tabs)/mypage" />;

  if (!result) return <Screen><AppHeader title="궁합도 결과" onBack={leave} /><EmptyState title="아직 계산한 궁합 결과가 없어요" description="함께 여행할 친구를 선택하면 궁합 점수를 확인할 수 있어요." ctaLabel="친구 선택하기" onPress={() => router.replace("/tests/compatibility")} /></Screen>;
  const friendNames = result.friendUserIds.map((friendId) => usersById[friendId]?.name).filter(Boolean).join(", ");

  return <Screen testID="compatibility-result">
    <AppHeader title="궁합도 결과" subtitle={`${friendNames || "선택한 친구"}와의 여행 궁합`} onBack={() => router.replace("/tests/compatibility")} />
    <Card style={styles.hero}>
      <Text style={styles.sparkle}>✦</Text>
      <Text style={styles.eyebrow}>여행 궁합 점수</Text>
      <Text selectable style={styles.score}>{result.score}<Text style={styles.scoreUnit}>점</Text></Text>
      <Text selectable style={styles.type}>{result.dynamics.label}</Text>
      <Text selectable style={styles.description}>{result.dynamics.description}</Text>
      <Text selectable style={styles.tier}>궁합 등급 · {result.type.label}</Text>
      <View accessibilityRole="progressbar" accessibilityLabel={`여행 궁합 ${result.score}점`} accessibilityValue={{ min: 0, max: 100, now: result.score }} style={styles.scoreTrack}><View style={[styles.scoreFill, { width: `${result.score}%` }]} /></View>
    </Card>
    <SecondaryButton label={detailsVisible ? "상세 결과 닫기" : "카테고리별 상세 보기"} onPress={() => setDetailsVisible((visible) => !visible)} />
    {detailsVisible ? <View style={styles.details}>
      <Text style={styles.sectionTitle}>카테고리별 궁합</Text>
      <Text style={styles.sectionDescription}>비슷한 정도뿐 아니라 서로 보완되는지, 여행 전에 조율이 필요한지도 함께 봤어요.</Text>
      {result.categories.map((category) => <Card key={category.id} style={styles.categoryCard}>
        <View style={styles.categoryHeading}>
          <View style={styles.categoryCopy}>
            <Text selectable style={styles.categoryLabel}>{category.label}</Text>
            <Text selectable style={styles.categoryDescription}>{category.description}</Text>
          </View>
          <View style={styles.categoryMeta}>
            <View accessibilityLabel={`${category.label} ${category.statusLabel}`} style={[styles.statusBadge, { backgroundColor: statusColors[category.status].backgroundColor }]}>
              <Text style={[styles.statusLabel, { color: statusColors[category.status].color }]}>{category.statusLabel}</Text>
            </View>
            <Text selectable style={styles.categoryScore}>{category.score}점</Text>
          </View>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel={`${category.label} 궁합 ${category.score}점`} accessibilityValue={{ min: 0, max: 100, now: category.score }} style={styles.categoryTrack}><View style={[styles.categoryFill, { width: `${category.score}%` }]} /></View>
      </Card>)}
    </View> : null}
    <View style={styles.actions}><PrimaryButton label="홈으로 돌아가기" onPress={() => router.replace("/(tabs)/home")} /><SecondaryButton label="친구 다시 선택하기" onPress={() => router.replace("/tests/compatibility")} /></View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  sparkle: { fontSize: 34, color: colors.primary },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  score: { fontSize: 54, lineHeight: 62, fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] },
  scoreUnit: { fontSize: 22, lineHeight: 30 },
  type: { ...typography.title, color: colors.text, textAlign: "center" },
  description: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  tier: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xxs },
  scoreTrack: { width: "100%", height: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: "hidden", marginTop: spacing.md },
  scoreFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  details: { gap: spacing.sm, marginTop: spacing.lg },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  sectionDescription: { ...typography.body, color: colors.textSecondary },
  categoryCard: { gap: spacing.sm },
  categoryHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryLabel: { ...typography.bodyStrong, color: colors.text },
  categoryDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  categoryMeta: { alignItems: "flex-end", gap: spacing.xs },
  statusBadge: { minHeight: 24, justifyContent: "center", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  statusLabel: { ...typography.caption },
  categoryScore: { ...typography.subtitle, color: colors.primary, fontVariant: ["tabular-nums"] },
  categoryTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" },
  categoryFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
