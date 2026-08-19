import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import type { SessionKind } from "../../auth/types";
import { preferenceSteps } from "../config/travel-preference-test-config";
import { buildDuriPreferenceSignals, calculateLegacyPreferenceProjection } from "../logic/calculate-travel-preference-result";
import {
  formatPreferenceStepAnswer,
  getCompletedPreferenceStepCount,
  isPreferenceStepComplete,
  validateTravelPreferenceSurvey,
} from "../logic/travel-preference-survey";
import { preferenceResultService } from "../services/preferenceSubmissionService";
import { isSameDraftOwner, usePersonalPreferenceDraftStore } from "../store/usePersonalPreferenceDraftStore";
import type { PreferenceDraftOwner } from "../types";

function getOwner(sessionKind: SessionKind | null, userId: string | null): PreferenceDraftOwner | null {
  if (sessionKind === "anonymous") return { kind: "anonymous" };
  if ((sessionKind === "member" || sessionKind === "guest") && userId) return { kind: "user", userId };
  return null;
}

export function PersonalReviewScreen() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const sessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const owner = useMemo(() => getOwner(sessionKind, sessionUserId), [sessionKind, sessionUserId]);
  const draft = usePersonalPreferenceDraftStore((state) => state.draft);
  const goToQuestion = usePersonalPreferenceDraftStore((state) => state.goToQuestion);
  const resetDraft = usePersonalPreferenceDraftStore((state) => state.resetDraft);
  const setCompletedSurvey = usePersonalPreferenceDraftStore((state) => state.setCompletedSurvey);
  const saveResult = useDuriStore((state) => state.savePersonalPreferenceResult);
  const domainCurrentUserId = useDuriStore((state) => state.currentUserId);
  const currentUserExists = useDuriStore((state) => Boolean(state.usersById[state.currentUserId]));
  const setPreferenceCompleted = useAuthSessionStore((state) => state.setPreferenceTestCompleted);
  const setIntroSeen = useAuthSessionStore((state) => state.setOnboardingIntroSeen);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!owner) return <Screen><ErrorState message="테스트 세션을 확인할 수 없어요." onRetry={() => router.replace("/(auth)/login")} /></Screen>;
  if (!draft || !isSameDraftOwner(owner, draft.owner)) return <Screen><AppHeader title="답변 확인" onBack={() => router.back()} /><EmptyState title="검토할 답변이 없어요" description="테스트를 시작하고 모든 항목에 답해 주세요." ctaLabel="테스트 시작" onPress={() => router.replace("/tests/personal")} /></Screen>;

  const editQuestion = (index: number, error?: string) => {
    goToQuestion(index);
    router.push({ pathname: "/tests/personal", params: { edit: "1", ...(error ? { error } : {}) } });
  };

  const submit = async () => {
    if (submitting) return;
    const validation = validateTravelPreferenceSurvey(draft.answers);
    if (!validation.valid) {
      setErrorMessage(validation.message);
      editQuestion(validation.firstInvalidStepIndex, validation.message);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const completedAt = new Date().toISOString();
      const submissionUserId = sessionKind === "anonymous" ? "anonymous-preview" : sessionUserId ?? "";
      const prepared = await preferenceResultService.calculate({ userId: submissionUserId, answers: validation.answers, completedAt });
      if (prepared.status === "error") { setErrorMessage(prepared.message); return; }
      if (sessionKind === "anonymous") {
        setCompletedSurvey({ owner, answers: validation.answers, completedAt });
        resetDraft();
        router.replace("/tests/personal/result");
        return;
      }
      if (!sessionUserId || !currentUserExists || domainCurrentUserId !== sessionUserId) {
        setErrorMessage("현재 사용자 정보를 확인할 수 없어 결과를 저장하지 못했어요.");
        return;
      }
      const legacyProjection = calculateLegacyPreferenceProjection(sessionUserId, prepared.result.answers, completedAt);
      const saved = saveResult(sessionUserId, legacyProjection.answers, completedAt, buildDuriPreferenceSignals(prepared.result));
      if (!saved) { setErrorMessage("기존 결과는 유지했지만 새 결과를 저장하지 못했어요. 다시 시도해 주세요."); return; }
      setCompletedSurvey({ owner, answers: validation.answers, completedAt });
      setPreferenceCompleted(true);
      setIntroSeen(true);
      resetDraft();
      router.replace("/tests/personal/result");
    } finally {
      setSubmitting(false);
    }
  };

  const completedCount = getCompletedPreferenceStepCount(draft.answers);
  return <Screen testID="personal-preference-review">
    <AppHeader title="답변 확인" subtitle="제출하기 전에 입력한 여행 기준을 확인해 주세요." onBack={() => router.replace({ pathname: "/tests/personal", params: { resume: "1" } })} />
    <View style={styles.summary}><Text selectable style={styles.summaryTitle}>{completedCount} / {preferenceSteps.length}개 항목 응답</Text><Text style={styles.summaryText}>항목을 누르면 해당 답변을 수정할 수 있어요.</Text></View>
    <View style={styles.list}>{preferenceSteps.map((step, index) => {
      const complete = isPreferenceStepComplete(step.id, draft.answers);
      const answer = formatPreferenceStepAnswer(step.id, draft.answers);
      return <Pressable key={step.id} accessibilityRole="button" accessibilityLabel={`${step.title}. ${answer}. 답변 수정`} onPress={() => editQuestion(index)} style={({ pressed }) => [pressed && styles.pressed]}>
        <Card style={[styles.answerCard, !complete && styles.missingCard]}>
          <View style={styles.answerCopy}><Text style={styles.question} numberOfLines={2}>{step.title}</Text><Text selectable style={[styles.answer, !complete && styles.missing]}>{answer}</Text></View>
          <Text style={styles.edit}>수정 ›</Text>
        </Card>
      </Pressable>;
    })}</View>
    {errorMessage ? <View accessibilityLiveRegion="assertive" style={styles.errorBanner}><Text selectable style={styles.errorText}>{errorMessage}</Text></View> : null}
    <PrimaryButton label="결과 계산하고 저장하기" loading={submitting} onPress={submit} />
    <SecondaryButton label="답변으로 돌아가기" onPress={() => router.replace({ pathname: "/tests/personal", params: { resume: "1" } })} />
  </Screen>;
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: spacing.md }, summaryTitle: { ...typography.subtitle, color: colors.primary }, summaryText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  list: { gap: spacing.sm, marginVertical: spacing.lg }, pressed: { opacity: 0.82 }, answerCard: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: spacing.sm }, missingCard: { borderColor: colors.warning, backgroundColor: colors.warningSoft }, answerCopy: { flex: 1, minWidth: 0 }, question: { ...typography.body, color: colors.textSecondary }, answer: { ...typography.bodyStrong, color: colors.text, marginTop: spacing.xs }, missing: { color: colors.warning }, edit: { ...typography.caption, color: colors.primary },
  errorBanner: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.md, marginBottom: spacing.sm }, errorText: { ...typography.body, color: colors.danger },
});
