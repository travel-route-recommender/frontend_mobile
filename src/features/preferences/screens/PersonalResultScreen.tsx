import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState } from "../../../components/feedback";
import type { PreferenceScore } from "../../../domain";
import { personalTestQuestions, preferenceDimensionLabels } from "../../../duri/preferences";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import type { SessionKind } from "../../auth/types";
import { PreferenceRestartModal } from "../components/PreferenceModals";
import { PreferenceResultSummary } from "../components/PreferenceResultSummary";
import { PreferenceSurveyResultDetails } from "../components/PreferenceSurveyResultDetails";
import { useTravelPreferenceSurveyResult } from "../hooks/useTravelPreferenceSurveyResult";
import { calculateLegacyPreferenceProjection } from "../logic/calculate-travel-preference-result";
import { formatPreferenceCompletedAt } from "../logic/formatPreferenceResult";
import { usePersonalPreferenceDraftStore } from "../store/usePersonalPreferenceDraftStore";
import type { PreferenceDraftOwner, PreferencePreviewResult } from "../types";

function getOwner(sessionKind: SessionKind | null, userId: string | null): PreferenceDraftOwner | null {
  if (sessionKind === "anonymous") return { kind: "anonymous" };
  if ((sessionKind === "member" || sessionKind === "guest") && userId) return { kind: "user", userId };
  return null;
}

export function PersonalResultScreen() {
  const params = useLocalSearchParams<{ retest?: string }>();
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const sessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const domainUserId = useDuriStore((state) => state.currentUserId);
  const user = useDuriStore((state) => state.usersById[state.currentUserId]);
  const persistentResult = useDuriStore((state) => state.preferenceResultsByUserId[state.currentUserId]);
  const startTest = usePersonalPreferenceDraftStore((state) => state.startTest);
  const owner = useMemo(() => getOwner(sessionKind, sessionUserId), [sessionKind, sessionUserId]);
  const detailedResult = useTravelPreferenceSurveyResult(owner);
  const [restartVisible, setRestartVisible] = useState(params.retest === "1");
  const anonymousPreview = useMemo(() => {
    if (!detailedResult || sessionKind !== "anonymous") return undefined;
    const { userId: _userId, ...preview } = calculateLegacyPreferenceProjection(
      detailedResult.userId,
      detailedResult.answers,
      detailedResult.completedAt,
    );
    return preview;
  }, [detailedResult, sessionKind]);
  const result: PreferencePreviewResult | undefined = sessionKind === "anonymous" ? anonymousPreview : persistentResult;
  const detailedAnswers = owner && detailedResult && detailedResult.completedAt === result?.completedAt
    ? detailedResult.answers
    : null;

  const restart = () => {
    if (!owner) { setRestartVisible(false); router.replace("/(auth)/login"); return; }
    startTest(owner); setRestartVisible(false); router.replace({ pathname: "/tests/personal", params: { restart: "1" } });
  };

  if (!result) return <Screen><AppHeader title="여행 성향 결과" onBack={() => router.back()} /><EmptyState title="아직 여행 성향 테스트를 완료하지 않았어요" description={sessionKind === "anonymous" ? "체험 결과는 앱을 다시 시작하면 사라질 수 있어요. 테스트를 완료해 결과를 확인해 보세요." : "모든 문항을 완료하면 저장된 결과를 이곳에서 다시 볼 수 있어요."} ctaLabel="테스트 시작" onPress={() => router.replace("/tests/personal")} /></Screen>;

  return <Screen testID="personal-preference-result">
    <AppHeader title="내 여행 성향 결과" subtitle={`개인 결과 · v${result.version}`} onBack={() => router.replace(sessionKind === "anonymous" ? "/(tabs)/home" : "/(tabs)/mypage")} />
    <PreferenceResultSummary result={result} userName={sessionKind === "anonymous" ? undefined : user?.name} anonymous={sessionKind === "anonymous"} />
    <Text style={styles.completed}>{formatPreferenceCompletedAt(result.completedAt)}</Text>
    {detailedAnswers ? <PreferenceSurveyResultDetails answers={detailedAnswers} /> : <>
      <Text style={styles.sectionTitle}>내가 선택한 여행 기준</Text>
      <View style={styles.responses}>{personalTestQuestions.map((question) => {
        const score = result.answers[question.dimension];
        const choice = question.choices.find((entry) => entry.value === score);
        return <Card key={question.id} style={styles.responseCard}><View style={styles.responseHeading}><Text style={styles.dimension}>{preferenceDimensionLabels[question.dimension]}</Text><Text style={styles.choice}>{choice?.label ?? "응답 없음"}</Text></View><View accessibilityRole="progressbar" accessibilityLabel={`${preferenceDimensionLabels[question.dimension]} ${question.choices.length}단계 중 ${question.choices.findIndex((entry) => entry.value === score) + 1}단계`} accessibilityValue={{ min: 1, max: question.choices.length, now: question.choices.findIndex((entry) => entry.value === score) + 1 }} style={styles.scale}>{question.choices.map((entry) => <View key={entry.value} style={[styles.scaleSegment, isChoiceReached(entry.value, score) && styles.scaleSegmentActive]} />)}</View></Card>;
      })}</View>
    </>}
    <View style={styles.actions}><PrimaryButton label="테스트 다시 하기" onPress={() => setRestartVisible(true)} />{sessionKind === "anonymous" ? <><SecondaryButton label="로그인하기" onPress={() => router.push("/(auth)/login")} /><SecondaryButton label="회원가입" onPress={() => router.push("/(auth)/signup-choice")} /></> : <SecondaryButton label="마이페이지에서 결과 보기" onPress={() => router.replace("/(tabs)/mypage")} />}<SecondaryButton label="홈으로 이동" onPress={() => router.replace("/(tabs)/home")} /></View>
    {sessionKind === "guest" ? <View style={styles.guestNotice}><Text style={styles.guestTitle}>게스트 결과로 저장됐어요</Text><Text style={styles.guestText}>현재 초대 계정에서 확인할 수 있어요. 정식 계정으로 결과를 옮기는 기능은 아직 제공하지 않아요.</Text></View> : null}
    {sessionKind !== "anonymous" && sessionUserId !== domainUserId ? <Pressable accessibilityRole="button" onPress={() => router.replace("/")}><Text style={styles.sessionWarning}>사용자 상태 다시 확인하기</Text></Pressable> : null}
    <PreferenceRestartModal visible={restartVisible} onRestart={restart} onCancel={() => setRestartVisible(false)} />
  </Screen>;
}

function isChoiceReached(value: PreferenceScore, selected: PreferenceScore) { return value <= selected; }

const styles = StyleSheet.create({
  completed: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm }, responses: { gap: spacing.sm }, responseCard: { gap: spacing.sm }, responseHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm }, dimension: { ...typography.caption, color: colors.textSecondary }, choice: { ...typography.bodyStrong, color: colors.text, flex: 1, textAlign: "right" },
  scale: { flexDirection: "row", gap: spacing.xs }, scaleSegment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.border }, scaleSegmentActive: { backgroundColor: colors.primary },
  actions: { gap: spacing.sm, marginTop: spacing.xl }, guestNotice: { borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.md, marginTop: spacing.md }, guestTitle: { ...typography.bodyStrong, color: colors.primary }, guestText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs }, sessionWarning: { ...typography.caption, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
});
