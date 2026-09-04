import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import type { PreferenceScore } from "../../../domain";
import { personalTestQuestions, preferenceDimensionLabels } from "../../../duri/preferences";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import type { SessionKind } from "../../auth/types";
import { DuriKoreanText } from "../../duri/components/DuriKoreanText";
import { PreferenceFlowHeader } from "../components/PreferenceFlowChrome";
import { PreferenceRestartModal } from "../components/PreferenceModals";
import { PreferenceResultSummary } from "../components/PreferenceResultSummary";
import { PreferenceSurveyResultDetails } from "../components/PreferenceSurveyResultDetails";
import { useApiPreferenceProfile } from "../hooks/useApiPreferenceProfile";
import { useTravelPreferenceSurveyResult } from "../hooks/useTravelPreferenceSurveyResult";
import type { ApiPreferenceProfile } from "../logic/apiPreferenceProfile";
import { calculateLegacyPreferenceProjection } from "../logic/calculate-travel-preference-result";
import { formatPreferenceCompletedAt } from "../logic/formatPreferenceResult";
import { resolvePreferenceResultPair } from "../logic/resolve-preference-result-pair";
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
  const apiMode = environment.dataSource !== "mock" && sessionKind !== "anonymous";
  const apiPreferenceProfile = useApiPreferenceProfile(sessionUserId, apiMode);
  const [restartVisible, setRestartVisible] = useState(params.retest === "1");
  const [detailsVisible, setDetailsVisible] = useState(false);
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
  const resultPair = useMemo(() => result ? resolvePreferenceResultPair(
    result,
    detailedResult,
    owner?.kind === "user" ? owner.userId : detailedResult?.userId,
  ) : null, [detailedResult, owner, result]);
  const serverProfile = apiMode ? apiPreferenceProfile.data : undefined;
  const presentation = apiMode
    ? serverProfile?.completed ? serverProfile.presentation : null
    : resultPair?.canonicalPresentation ?? null;
  const localResultMatchesServer = Boolean(
    result
      && (!apiMode || (serverProfile?.completedAt && result.completedAt === serverProfile.completedAt)),
  );

  const backDestination = sessionKind === "anonymous" ? "/(tabs)/home" : "/(tabs)/mypage";
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(backDestination);
  };
  const restart = () => {
    if (!owner) { setRestartVisible(false); router.replace("/(auth)/login"); return; }
    startTest(owner);
    setRestartVisible(false);
    router.replace({ pathname: "/tests/personal", params: { restart: "1" } });
  };

  if (apiMode && !sessionUserId) return <Screen><ErrorState message="현재 로그인 사용자를 확인할 수 없어요." onRetry={() => router.replace("/(auth)/login")} /></Screen>;
  if (apiMode && apiPreferenceProfile.isPending) return <Screen><LoadingState label="저장된 여행 성향을 확인하고 있어요" /></Screen>;
  if (apiMode && apiPreferenceProfile.isError) return <Screen><ErrorState message="여행 성향을 불러오지 못했어요. 이전 결과는 그대로 유지했어요." onRetry={() => { void apiPreferenceProfile.refetch(); }} /></Screen>;

  if (!presentation) return <Screen
    backgroundColor={colors.surface}
    header={<PreferenceFlowHeader onBack={leave} />}
  >
    <EmptyState title="아직 여행 성향 테스트를 완료하지 않았어요" description={sessionKind === "anonymous" ? "체험 결과는 앱을 다시 시작하면 사라질 수 있어요. 테스트를 완료해 결과를 확인해 보세요." : "모든 문항을 완료하면 저장된 결과를 이곳에서 다시 볼 수 있어요."} ctaLabel="테스트 시작" onPress={() => router.replace("/tests/personal")} />
  </Screen>;

  return <Screen
    backgroundColor={colors.surface}
    contentContainerStyle={styles.content}
    header={<PreferenceFlowHeader onBack={() => router.replace(backDestination)} />}
    testID="personal-preference-result"
  >
    <PreferenceResultSummary presentation={presentation} userName={sessionKind === "anonymous" ? undefined : user?.name} />

    <View style={styles.detailSection}>
      <Text style={styles.sectionTitle}>성향 상세</Text>
      <Pressable
        accessibilityLabel={detailsVisible ? "성향 상세 닫기" : "성향 상세 전체 보기"}
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsVisible }}
        onPress={() => setDetailsVisible((visible) => !visible)}
        style={({ pressed }) => [styles.detailDisclosure, pressed && styles.pressed]}
      >
        <View style={styles.detailIcon}><Text style={styles.detailIconText}>≡</Text></View>
        <View style={styles.detailCopy}>
          <Text style={styles.detailTitle}>{apiMode ? "계정에 저장된 여행 기준" : "내가 선택한 여행 기준"}</Text>
          <Text style={styles.detailMeta}>{serverProfile?.completedAt
            ? formatPreferenceCompletedAt(serverProfile.completedAt)
            : result?.completedAt ? formatPreferenceCompletedAt(result.completedAt) : "최근 완료한 결과"}</Text>
        </View>
        <Text style={styles.detailAction}>{detailsVisible ? "닫기" : "전체 보기"} ›</Text>
      </Pressable>

      {detailsVisible ? <View style={styles.details}>
        {apiMode && !localResultMatchesServer
          ? <ServerPreferenceDetails profile={serverProfile!} />
          : resultPair?.detailedResult ? <PreferenceSurveyResultDetails result={resultPair.detailedResult} /> : result ? <>
          <Text style={styles.detailCaption}>현재 저장된 결과와 일치하는 상세 응답이 없어, 같은 결과의 기본 여행 기준만 보여드려요.</Text>
          <Card style={styles.legacyCard}>{personalTestQuestions.map((question, index) => {
            const score = result.answers[question.dimension];
            const choice = question.choices.find((entry) => entry.value === score);
            const selectedIndex = question.choices.findIndex((entry) => entry.value === score);
            return <View key={question.id}>
              <View style={styles.responseRow}>
                <View style={styles.responseHeading}><Text style={styles.dimension}>{preferenceDimensionLabels[question.dimension]}</Text><DuriKoreanText style={styles.choice}>{choice?.label ?? "응답 없음"}</DuriKoreanText></View>
                <View accessibilityRole="progressbar" accessibilityLabel={`${preferenceDimensionLabels[question.dimension]} ${question.choices.length}단계 중 ${selectedIndex + 1}단계`} accessibilityValue={{ min: 1, max: question.choices.length, now: selectedIndex + 1 }} style={styles.scale}>{question.choices.map((entry) => <View key={entry.value} style={[styles.scaleSegment, isChoiceReached(entry.value, score) && styles.scaleSegmentActive]} />)}</View>
              </View>
              {index < personalTestQuestions.length - 1 ? <View style={styles.divider} /> : null}
            </View>;
          })}</Card>
        </> : <ServerPreferenceDetails profile={serverProfile!} />}
        {sessionKind === "anonymous" ? <View style={styles.anonymousNotice}><Text style={styles.anonymousTitle}>체험 결과는 영구 저장되지 않아요</Text><DuriKoreanText style={styles.noticeBody}>로그인하거나 가입한 뒤 테스트를 완료하면 새 결과를 여행방의 동행자 성향 비교에 활용할 수 있어요. 현재 체험 결과는 자동 이전되지 않아요.</DuriKoreanText></View> : null}
        {sessionKind === "guest" ? <View style={styles.guestNotice}><Text style={styles.guestTitle}>게스트 결과로 저장됐어요</Text><DuriKoreanText style={styles.noticeBody}>현재 초대 계정으로 다시 접속하면 이 결과를 확인할 수 있어요. 새 회원 계정을 만들더라도 게스트 여행과 검사 결과는 현재 초대 계정에 그대로 유지돼요.</DuriKoreanText></View> : null}
        {sessionKind !== "anonymous" && sessionUserId !== domainUserId ? <Pressable accessibilityRole="button" onPress={() => router.replace("/")}><Text style={styles.sessionWarning}>사용자 상태 다시 확인하기</Text></Pressable> : null}
      </View> : null}
    </View>

    <View style={styles.actionSection}>
      <Text style={styles.sectionTitle}>다음 여행 이어가기</Text>
      {sessionKind === "member" && environment.dataSource === "mock" ? <>
        <PrimaryButton label="친구와 궁합 보기" onPress={() => router.push("/tests/compatibility")} />
        <SecondaryButton label="홈으로 이동" onPress={() => router.replace("/(tabs)/home")} />
      </> : sessionKind === "member" ? <>
        <PrimaryButton label="홈으로 이동" onPress={() => router.replace("/(tabs)/home")} />
        <SecondaryButton label="마이페이지로 이동" onPress={() => router.replace("/(tabs)/mypage")} />
      </> : sessionKind === "anonymous" ? <>
        <PrimaryButton label="로그인하고 결과 저장하기" onPress={() => router.push("/(auth)/login")} />
        <SecondaryButton label="회원가입" onPress={() => router.push("/(auth)/signup-choice")} />
      </> : <PrimaryButton label="홈으로 이동" onPress={() => router.replace("/(tabs)/home")} />}
      <Pressable accessibilityRole="button" onPress={() => setRestartVisible(true)} style={({ pressed }) => [styles.retest, pressed && styles.pressed]}>
        <Text style={styles.retestText}>테스트 다시 하기</Text>
      </Pressable>
    </View>
    <PreferenceRestartModal visible={restartVisible} onRestart={restart} onCancel={() => setRestartVisible(false)} />
  </Screen>;
}

function isChoiceReached(value: PreferenceScore, selected: PreferenceScore) { return value <= selected; }

function ServerPreferenceDetails({ profile }: { profile: ApiPreferenceProfile }) {
  const rows = profile.axes ? [
    { key: "density", label: "일정 밀도", value: profile.axes.scheduleDensity },
    { key: "landmark", label: "대표 명소 중요도", value: profile.axes.landmarkNecessity },
    { key: "local", label: "로컬 장소 관심도", value: profile.axes.localInterest },
    { key: "challenge", label: "새로운 경험 선호도", value: profile.axes.challenging },
  ] : [];
  return <>
    <Text style={styles.detailCaption}>계정에 저장된 최신 성향 축과 여행 유형을 표시해요. 설문에서 고른 개별 선택지는 이 화면에서 다시 보여드리지 않아요.</Text>
    {rows.length ? <Card style={styles.serverAxesCard}>{rows.map((row, index) => <View key={row.key}>
      <View style={styles.serverAxisRow}>
        <View style={styles.serverAxisHeading}><Text style={styles.dimension}>{row.label}</Text><Text style={styles.serverAxisValue}>{Math.round(row.value)} / 100</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel={`${row.label} ${Math.round(row.value)}점`} accessibilityValue={{ min: 0, max: 100, now: Math.round(row.value) }} style={styles.serverAxisTrack}>
          <View style={[styles.serverAxisFill, { width: `${row.value}%` }]} />
        </View>
      </View>
      {index < rows.length - 1 ? <View style={styles.divider} /> : null}
    </View>)}</Card> : <Card><Text style={styles.detailCaption}>이 검사 결과에는 여행 유형과 태그만 저장되어 있어요. 세부 성향 점수가 필요한 경우 테스트를 다시 완료해 주세요.</Text></Card>}
  </>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl, backgroundColor: colors.surface },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "800", color: "#17265F" },
  detailSection: { gap: spacing.sm },
  detailDisclosure: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, padding: spacing.md },
  detailIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: "#EAF2FF" },
  detailIconText: { fontSize: 22, lineHeight: 24, fontWeight: "800", color: colors.primary },
  detailCopy: { flex: 1, minWidth: 0, gap: 2 },
  detailTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: "#17265F" },
  detailMeta: { ...typography.caption, color: colors.textMuted },
  detailAction: { ...typography.caption, color: colors.primary },
  details: { gap: spacing.sm },
  detailCaption: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.md, backgroundColor: "#F7FAFF", padding: spacing.sm },
  legacyCard: { overflow: "hidden", gap: 0, paddingVertical: spacing.xs },
  serverAxesCard: { overflow: "hidden", gap: 0, paddingVertical: spacing.xs },
  serverAxisRow: { gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  serverAxisHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  serverAxisValue: { ...typography.bodyStrong, color: colors.primary },
  serverAxisTrack: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.border },
  serverAxisFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  responseRow: { gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  responseHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  dimension: { ...typography.caption, color: colors.textSecondary },
  choice: { ...typography.bodyStrong, color: "#17265F", flex: 1, textAlign: "right" },
  scale: { flexDirection: "row", gap: spacing.xs },
  scaleSegment: { flex: 1, height: 7, borderRadius: radius.pill, backgroundColor: colors.border },
  scaleSegmentActive: { backgroundColor: colors.primary },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.sm, backgroundColor: colors.border },
  actionSection: { gap: spacing.sm },
  retest: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  retestText: { ...typography.caption, color: colors.textSecondary, textDecorationLine: "underline" },
  anonymousNotice: { borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.md },
  anonymousTitle: { ...typography.bodyStrong, color: colors.warning },
  guestNotice: { borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.md },
  guestTitle: { ...typography.bodyStrong, color: colors.primary },
  noticeBody: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  sessionWarning: { ...typography.caption, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  pressed: { opacity: 0.78 },
});
