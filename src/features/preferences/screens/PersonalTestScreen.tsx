import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import type { SessionKind } from "../../auth/types";
import { PreferenceFlowHeader, PreferenceQuestionIntro, PreferenceStickyFooter } from "../components/PreferenceFlowChrome";
import { PreferenceExitModal, PreferenceRestartModal } from "../components/PreferenceModals";
import { PreferenceProgressBar } from "../components/PreferenceProgressBar";
import { PreferenceStepContent } from "../components/PreferenceStepContent";
import { PreferenceTestIntro } from "../components/PreferenceTestIntro";
import { preferenceSteps } from "../config/travel-preference-test-config";
import {
  getFirstUnansweredStoryQuestionIndex,
  preferenceQuestionCount,
  preferenceStoryQuestions,
  resolvePreferenceScrollResetKey,
  resolvePreferenceTestProgress,
} from "../logic/resolve-preference-test-progress";
import { getCompletedPreferenceStepCount, isPreferenceStepComplete } from "../logic/travel-preference-survey";
import { isSameDraftOwner, usePersonalPreferenceDraftStore } from "../store/usePersonalPreferenceDraftStore";
import type { PersonalPreferenceDraftAnswers, PreferenceDraftOwner } from "../types";

function getDraftOwner(sessionKind: SessionKind | null, userId: string | null): PreferenceDraftOwner | null {
  if (sessionKind === "anonymous") return { kind: "anonymous" };
  if ((sessionKind === "member" || sessionKind === "guest") && userId) return { kind: "user", userId };
  return null;
}

function hasAnyPreferenceAnswer(answers: PersonalPreferenceDraftAnswers) {
  return Object.values(answers).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined;
  });
}

function isStoryQuestionAnswered(answers: PersonalPreferenceDraftAnswers, questionIndex: number) {
  const entry = preferenceStoryQuestions[Math.max(0, Math.min(questionIndex, preferenceStoryQuestions.length - 1))];
  return entry.kind === "challenge"
    ? Boolean(answers.challengeStyleAnswers?.[entry.question.id])
    : Boolean(answers.itineraryMessageAnswers?.[entry.question.id]);
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
  const ownedDraftKey = draft && ownedDraft
    ? `${draft.owner.kind}:${draft.owner.kind === "user" ? draft.owner.userId : "anonymous"}:${draft.startedAt}`
    : null;
  const savedAnswerCount = ownedDraft && draft ? getCompletedPreferenceStepCount(draft.answers) : 0;
  const [resumeAccepted, setResumeAccepted] = useState(() => params.resume === "1" || params.restart === "1" || params.edit === "1" || savedAnswerCount === 0);
  const [introAccepted, setIntroAccepted] = useState(() => params.resume === "1" || params.restart === "1" || params.edit === "1");
  const [storyCursor, setStoryCursor] = useState(() => ({
    draftKey: ownedDraftKey,
    questionIndex: draft && ownedDraft ? getFirstUnansweredStoryQuestionIndex(draft.answers) : 0,
  }));
  const storyQuestionIndex = storyCursor.draftKey === ownedDraftKey
    ? storyCursor.questionIndex
    : draft && ownedDraft ? getFirstUnansweredStoryQuestionIndex(draft.answers) : 0;
  const setStoryQuestionIndex = (questionIndex: number) => setStoryCursor({ draftKey: ownedDraftKey, questionIndex });
  const [exitVisible, setExitVisible] = useState(false);
  const [restartVisible, setRestartVisible] = useState(false);
  const editingFromReview = params.edit === "1";
  const exitTest = useCallback(() => { setExitVisible(false); router.replace("/(tabs)/home"); }, []);
  const requestExit = useCallback(() => {
    if (draft && getCompletedPreferenceStepCount(draft.answers) > 0) setExitVisible(true);
    else exitTest();
  }, [draft, exitTest]);

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

  const restart = () => {
    setStoryQuestionIndex(0);
    startTest(owner);
    setIntroAccepted(true);
    setResumeAccepted(true);
    setRestartVisible(false);
  };

  if (!resumeAccepted && savedAnswerCount > 0) {
    return <Screen
      backgroundColor={colors.surface}
      contentContainerStyle={styles.resumeContent}
      header={<PreferenceFlowHeader onBack={() => router.back()} />}
    >
      <Card style={styles.resumeCard}>
        <View style={styles.resumeIcon}><Text style={styles.resumeIconText}>✓</Text></View>
        <Text style={styles.resumeEyebrow}>답변 자동 저장됨</Text>
        <Text style={styles.resumeTitle}>진행 중인 테스트가 있어요</Text>
        <Text style={styles.resumeDescription}>{savedAnswerCount}개 챕터의 응답이 저장되어 있어요. {draft.currentQuestionIndex + 1}번째 챕터부터 이어갈 수 있어요.</Text>
        <View style={styles.resumeActions}><PrimaryButton label="이어하기" onPress={() => setResumeAccepted(true)} /><SecondaryButton label="처음부터 다시 하기" onPress={() => setRestartVisible(true)} /></View>
      </Card>
      <PreferenceRestartModal visible={restartVisible} onRestart={restart} onCancel={() => setRestartVisible(false)} />
    </Screen>;
  }

  if (!introAccepted && !hasAnyPreferenceAnswer(draft.answers)) {
    return <>
      <PreferenceTestIntro
        chapterCount={preferenceSteps.length}
        onBack={requestExit}
        onExit={requestExit}
        onStart={() => setIntroAccepted(true)}
        questionCount={preferenceQuestionCount}
      />
      <PreferenceExitModal visible={exitVisible} onExit={exitTest} onContinue={() => setExitVisible(false)} />
    </>;
  }

  const isLastChapter = draft.currentQuestionIndex === preferenceSteps.length - 1;
  const isStoryStep = step.id === "challengeStyle";
  const storyAnswered = isStoryStep && isStoryQuestionAnswered(draft.answers, storyQuestionIndex);
  const stepComplete = isPreferenceStepComplete(step.id, draft.answers);
  const canContinue = isStoryStep ? storyAnswered : stepComplete;
  const progress = resolvePreferenceTestProgress({
    answers: draft.answers,
    chapterIndex: draft.currentQuestionIndex,
    stepId: step.id,
    storyQuestionIndex,
  });
  const scrollResetKey = resolvePreferenceScrollResetKey({
    answers: draft.answers,
    stepId: step.id,
    storyQuestionIndex,
  });

  const moveNextChapter = () => {
    if (!stepComplete) return;
    if (editingFromReview) { router.replace("/tests/personal/review"); return; }
    if (isLastChapter) { router.push("/tests/personal/review"); return; }
    goNext();
  };

  const moveNextAtomic = () => {
    if (!canContinue) return;
    if (isStoryStep && storyQuestionIndex < preferenceStoryQuestions.length - 1) {
      setStoryQuestionIndex(storyQuestionIndex + 1);
      return;
    }
    moveNextChapter();
  };

  const previousDisabled = draft.currentQuestionIndex === 0 && (!isStoryStep || storyQuestionIndex === 0);
  const movePreviousAtomic = () => {
    if (isStoryStep && storyQuestionIndex > 0) {
      setStoryQuestionIndex(storyQuestionIndex - 1);
      return;
    }
    if (draft.currentQuestionIndex > 0) goPrevious();
  };

  const returningToReview = editingFromReview && (!isStoryStep || storyQuestionIndex === preferenceStoryQuestions.length - 1);
  const primaryLabel = returningToReview
    ? "답변 검토로 돌아가기"
    : isLastChapter && !isStoryStep ? "답변 확인" : "다음";

  return <Screen
    backgroundColor={colors.surface}
    contentContainerStyle={styles.questionContent}
    footer={<PreferenceStickyFooter
      helper={!canContinue ? <Text style={styles.footerHint}>현재 질문에 답하면 다음으로 이동할 수 있어요.</Text> : undefined}
      onPrimary={moveNextAtomic}
      onSecondary={movePreviousAtomic}
      primaryDisabled={!canContinue}
      primaryLabel={primaryLabel}
      secondaryDisabled={previousDisabled}
      secondaryLabel="이전"
    />}
    header={<View>
      <PreferenceFlowHeader
        actionLabel="나가기"
        onAction={requestExit}
        onBack={() => editingFromReview ? router.replace("/tests/personal/review") : draft.currentQuestionIndex > 0 ? goPrevious() : requestExit()}
      />
      <PreferenceProgressBar
        accessibilityLabel={`${progress.chapterLabel}, ${progress.innerProgressLabel}`}
        current={progress.innerIndex}
        detailLabel={progress.innerProgressLabel}
        label={step.progressTitle}
        total={progress.innerCount}
        valueLabel={progress.chapterLabel}
      />
    </View>}
    keyboardAware
    scrollResetKey={scrollResetKey}
    testID="personal-preference-test"
  >
    {draftNotice ? <View style={styles.notice}><Text style={styles.noticeText}>{draftNotice}</Text><Pressable accessibilityRole="button" onPress={acknowledgeDraftNotice}><Text style={styles.noticeAction}>확인</Text></Pressable></View> : null}
    {params.error ? <View accessibilityLiveRegion="assertive" style={styles.errorBanner}><Text selectable style={styles.errorText}>{params.error}</Text></View> : null}
    {!isStoryStep ? <PreferenceQuestionIntro description={step.description} eyebrow={`CHAPTER ${progress.chapterIndex}`} title={step.title} /> : null}
    <PreferenceStepContent answers={draft.answers} onChange={updateAnswers} stepId={step.id} storyQuestionIndex={storyQuestionIndex} />
    <PreferenceExitModal visible={exitVisible} onExit={exitTest} onContinue={() => setExitVisible(false)} />
  </Screen>;
}

const styles = StyleSheet.create({
  questionContent: { gap: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl, backgroundColor: colors.surface },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  noticeText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  noticeAction: { ...typography.caption, color: colors.warning },
  errorBanner: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.sm },
  errorText: { ...typography.caption, color: colors.danger },
  footerHint: { fontSize: 11, lineHeight: 16, fontWeight: "600", color: colors.textMuted, textAlign: "center" },
  resumeContent: { justifyContent: "center", paddingTop: spacing.xl, paddingBottom: spacing.xl, backgroundColor: colors.surface },
  resumeCard: { alignItems: "center", gap: spacing.sm, borderRadius: 22, paddingVertical: spacing.xl },
  resumeIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "#EAF7EE" },
  resumeIconText: { fontSize: 23, lineHeight: 28, fontWeight: "900", color: colors.success },
  resumeEyebrow: { ...typography.caption, color: colors.success },
  resumeTitle: { ...typography.title, color: "#17265F", textAlign: "center" },
  resumeDescription: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.sm },
  resumeActions: { alignSelf: "stretch", gap: spacing.sm },
});
