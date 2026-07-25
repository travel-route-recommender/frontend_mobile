import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { SessionKind } from "../../auth/types";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { PreferenceExitModal, PreferenceRestartModal } from "../components/PreferenceModals";
import { PreferenceProgressBar } from "../components/PreferenceProgressBar";
import { PreferenceStepContent } from "../components/PreferenceStepContent";
import { preferenceSteps } from "../config/travel-preference-test-config";
import { getCompletedPreferenceStepCount, isPreferenceStepComplete } from "../logic/travel-preference-survey";
import { isSameDraftOwner, usePersonalPreferenceDraftStore } from "../store/usePersonalPreferenceDraftStore";
import type { PreferenceDraftOwner } from "../types";

function getDraftOwner(sessionKind: SessionKind | null, userId: string | null): PreferenceDraftOwner | null {
  if (sessionKind === "anonymous") return { kind: "anonymous" };
  if ((sessionKind === "member" || sessionKind === "guest") && userId) return { kind: "user", userId };
  return null;
}

export function PersonalTestScreen() {
  const params = useLocalSearchParams<{ resume?: string; restart?: string; edit?: string; error?: string }>();
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const sessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const owner = useMemo(() => getDraftOwner(sessionKind, sessionUserId), [sessionKind, sessionUserId]);
  const draft = usePersonalPreferenceDraftStore((state) => state.draft);
  const draftNotice = usePersonalPreferenceDraftStore((state) => state.draftNotice);
  const startTest = usePersonalPreferenceDraftStore((state) => state.startTest);
  const updateAnswers = usePersonalPreferenceDraftStore((state) => state.updateAnswers);
  const goNext = usePersonalPreferenceDraftStore((state) => state.goNext);
  const goPrevious = usePersonalPreferenceDraftStore((state) => state.goPrevious);
  const acknowledgeDraftNotice = usePersonalPreferenceDraftStore((state) => state.acknowledgeDraftNotice);
  const ownedDraft = Boolean(owner && draft && isSameDraftOwner(owner, draft.owner));
  const savedAnswerCount = ownedDraft && draft ? getCompletedPreferenceStepCount(draft.answers) : 0;
  const [resumeAccepted, setResumeAccepted] = useState(() => params.resume === "1" || params.restart === "1" || params.edit === "1" || savedAnswerCount === 0);
  const [exitVisible, setExitVisible] = useState(false);
  const [restartVisible, setRestartVisible] = useState(false);
  const editingFromReview = params.edit === "1";
  const exitTest = useCallback(() => { setExitVisible(false); router.replace("/(tabs)/home"); }, []);
  const requestExit = useCallback(() => { if (draft && getCompletedPreferenceStepCount(draft.answers) > 0) setExitVisible(true); else exitTest(); }, [draft, exitTest]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (editingFromReview) router.replace("/tests/personal/review");
      else requestExit();
      return true;
    });
    return () => subscription.remove();
  }, [editingFromReview, requestExit]));

  useEffect(() => {
    if (owner && !ownedDraft) startTest(owner);
  }, [ownedDraft, owner, startTest]);

  if (!owner) return <Screen><ErrorState message="여행 성향 테스트를 시작하려면 로그인하거나 ‘둘러보기’를 먼저 선택해 주세요." onRetry={() => router.replace("/(auth)/login")} /></Screen>;
  if (!preferenceSteps.length) return <Screen><AppHeader title="여행 성향 테스트" onBack={() => router.back()} /><ErrorState message="여행 성향 항목을 불러오지 못했어요." /></Screen>;
  if (!draft || !ownedDraft) return <Screen scroll={false}><LoadingState label="여행 성향 테스트를 준비하고 있어요." /></Screen>;

  const step = preferenceSteps[draft.currentQuestionIndex];
  if (!step) return <Screen><ErrorState message="현재 항목을 찾을 수 없어요. 테스트를 처음부터 다시 시작해 주세요." onRetry={() => startTest(owner)} /></Screen>;
  const isLast = draft.currentQuestionIndex === preferenceSteps.length - 1;
  const stepComplete = isPreferenceStepComplete(step.id, draft.answers);
  const isMessageStep = step.id === "itinerary";

  const restart = () => { startTest(owner); setResumeAccepted(true); setRestartVisible(false); };
  const moveNext = () => {
    if (!stepComplete) return;
    if (editingFromReview) { router.replace("/tests/personal/review"); return; }
    if (isLast) { router.push("/tests/personal/review"); return; }
    goNext();
  };

  if (!resumeAccepted && savedAnswerCount > 0) {
    return <Screen>
      <AppHeader title="여행 성향 테스트" onBack={() => router.back()} />
      <Card style={styles.resumeCard}><Text style={styles.resumeIcon}>📝</Text><Text style={styles.resumeTitle}>진행 중인 테스트가 있어요</Text><Text style={styles.resumeDescription}>{savedAnswerCount}개 항목의 응답이 저장되어 있어요. {draft.currentQuestionIndex + 1}번째 항목부터 이어갈 수 있어요.</Text><PrimaryButton label="이어하기" onPress={() => setResumeAccepted(true)} /><SecondaryButton label="처음부터 다시 하기" onPress={() => setRestartVisible(true)} /></Card>
      <PreferenceRestartModal visible={restartVisible} onRestart={restart} onCancel={() => setRestartVisible(false)} />
    </Screen>;
  }

  return <Screen keyboardAware testID="personal-preference-test">
    <AppHeader
      title="여행 성향 테스트"
      subtitle="정답은 없어요. 실제 여행을 떠올리며 답해 주세요."
      onBack={() => editingFromReview ? router.replace("/tests/personal/review") : draft.currentQuestionIndex > 0 ? goPrevious() : requestExit()}
      action={<Pressable accessibilityRole="button" accessibilityLabel="테스트 나가기" onPress={requestExit} style={styles.closeButton}><Text style={styles.closeText}>나가기</Text></Pressable>}
    />
    {draftNotice ? <View style={styles.notice}><Text style={styles.noticeText}>{draftNotice}</Text><Pressable accessibilityRole="button" onPress={acknowledgeDraftNotice}><Text style={styles.noticeAction}>확인</Text></Pressable></View> : null}
    {params.error ? <View accessibilityLiveRegion="assertive" style={styles.errorBanner}><Text selectable style={styles.errorText}>{params.error}</Text></View> : null}
    {!isMessageStep ? <PreferenceProgressBar current={draft.currentQuestionIndex + 1} total={preferenceSteps.length} /> : null}
    {isMessageStep ? (
      <View style={styles.messageStage}>
        <View style={styles.messageIntro}>
          <Text style={styles.dimension}>{step.eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.question}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>
        </View>
        <PreferenceStepContent stepId={step.id} answers={draft.answers} onChange={updateAnswers} />
      </View>
    ) : (
      <Card style={styles.questionCard}>
        <Text style={styles.dimension}>{step.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.question}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
        <PreferenceStepContent stepId={step.id} answers={draft.answers} onChange={updateAnswers} />
      </Card>
    )}
    <View style={styles.navigation}>
      {!editingFromReview ? <SecondaryButton label="이전" disabled={draft.currentQuestionIndex === 0} onPress={goPrevious} /> : null}
      <PrimaryButton label={editingFromReview ? "답변 검토로 돌아가기" : isLast ? "답변 확인" : "다음"} disabled={!stepComplete} onPress={moveNext} />
      {!stepComplete ? <Text style={styles.completionHint}>{isMessageStep ? "9개의 대화 질문에 모두 답하면 다음 항목으로 이동할 수 있어요." : "이 항목의 응답을 완료하면 다음으로 이동할 수 있어요."}</Text> : null}
    </View>
    <PreferenceExitModal visible={exitVisible} onExit={exitTest} onContinue={() => setExitVisible(false)} />
  </Screen>;
}

const styles = StyleSheet.create({
  closeButton: { minWidth: 52, minHeight: 44, alignItems: "center", justifyContent: "center" }, closeText: { ...typography.caption, color: colors.textSecondary },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm }, noticeText: { ...typography.caption, color: colors.textSecondary, flex: 1 }, noticeAction: { ...typography.caption, color: colors.warning },
  errorBanner: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.sm }, errorText: { ...typography.caption, color: colors.danger },
  questionCard: { gap: spacing.md, marginTop: spacing.lg },
  messageStage: { gap: spacing.md, marginTop: spacing.lg },
  messageIntro: { gap: spacing.sm },
  dimension: { ...typography.caption, color: colors.primary, alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  question: { ...typography.title, color: colors.text }, description: { ...typography.body, color: colors.textSecondary }, navigation: { gap: spacing.sm, marginTop: spacing.md }, completionHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  resumeCard: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl }, resumeIcon: { fontSize: 42 }, resumeTitle: { ...typography.title, color: colors.text, textAlign: "center" }, resumeDescription: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.sm },
});
