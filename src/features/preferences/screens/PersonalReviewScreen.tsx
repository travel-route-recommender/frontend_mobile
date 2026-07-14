import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { personalTestQuestions, preferenceDimensionLabels } from "../../../duri/preferences";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import type { SessionKind } from "../../auth/types";
import { validatePreferenceAnswers } from "../logic/validatePreferenceAnswers";
import { preferenceSubmissionService } from "../services/preferenceSubmissionService";
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
  const setAnonymousResult = usePersonalPreferenceDraftStore((state) => state.setAnonymousResult);
  const saveResult = useDuriStore((state) => state.savePersonalPreferenceResult);
  const domainCurrentUserId = useDuriStore((state) => state.currentUserId);
  const currentUserExists = useDuriStore((state) => Boolean(state.usersById[state.currentUserId]));
  const setPreferenceCompleted = useAuthSessionStore((state) => state.setPreferenceTestCompleted);
  const setIntroSeen = useAuthSessionStore((state) => state.setOnboardingIntroSeen);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!owner) return <Screen><ErrorState message="테스트 세션을 확인할 수 없어요." onRetry={() => router.replace("/(auth)/login")} /></Screen>;
  if (!draft || !isSameDraftOwner(owner, draft.owner)) return <Screen><AppHeader title="답변 확인" onBack={() => router.back()} /><EmptyState title="검토할 답변이 없어요" description="테스트를 시작하고 모든 문항에 답해 주세요." ctaLabel="테스트 시작" onPress={() => router.replace("/tests/personal")} /></Screen>;

  const editQuestion = (index: number, error?: string) => { goToQuestion(index); router.push({ pathname: "/tests/personal", params: { edit: "1", ...(error ? { error } : {}) } }); };
  const submit = async () => {
    if (submitting) return;
    const validation = validatePreferenceAnswers(draft.answers, draft.configVersion);
    if (!validation.valid) {
      setErrorMessage(validation.message);
      if (validation.firstInvalidDimension) {
        const index = personalTestQuestions.findIndex((question) => question.dimension === validation.firstInvalidDimension);
        if (index >= 0) editQuestion(index, validation.message);
      }
      return;
    }
    setSubmitting(true); setErrorMessage(null);
    try {
      const completedAt = new Date().toISOString();
      const prepared = await preferenceSubmissionService.submit({ answers: validation.answers, completedAt });
      if (prepared.status === "error") { setErrorMessage(prepared.message); return; }
      if (sessionKind === "anonymous") {
        setAnonymousResult(prepared.result); resetDraft(); router.replace("/tests/personal/result"); return;
      }
      if (!sessionUserId || !currentUserExists || domainCurrentUserId !== sessionUserId) { setErrorMessage("현재 사용자 정보를 확인할 수 없어 결과를 저장하지 못했어요."); return; }
      const saved = saveResult(sessionUserId, validation.answers, completedAt);
      if (!saved) { setErrorMessage("기존 결과는 유지했지만 새 결과를 저장하지 못했어요. 다시 시도해 주세요."); return; }
      setPreferenceCompleted(true); setIntroSeen(true); resetDraft(); router.replace("/tests/personal/result");
    } finally { setSubmitting(false); }
  };

  return <Screen testID="personal-preference-review">
    <AppHeader title="답변 확인" subtitle="제출하기 전에 선택한 답변을 확인해 주세요." onBack={() => router.replace({ pathname: "/tests/personal", params: { resume: "1" } })} />
    <View style={styles.summary}><Text style={styles.summaryTitle}>{Object.keys(draft.answers).length} / {personalTestQuestions.length} 문항 응답</Text><Text style={styles.summaryText}>질문을 누르면 해당 답변을 수정할 수 있어요.</Text></View>
    <View style={styles.list}>{personalTestQuestions.map((question, index) => {
      const score = draft.answers[question.dimension];
      const choice = question.choices.find((entry) => entry.value === score);
      return <Pressable key={question.id} accessibilityRole="button" accessibilityLabel={`${preferenceDimensionLabels[question.dimension]}. ${choice?.label ?? "미응답"}. 답변 수정`} onPress={() => editQuestion(index)} style={({ pressed }) => [pressed && styles.pressed]}>
        <Card style={[styles.answerCard, choice ? undefined : styles.missingCard]}><View style={styles.answerCopy}><Text style={styles.dimension}>{preferenceDimensionLabels[question.dimension]}</Text><Text style={styles.question} numberOfLines={2}>{question.question}</Text><Text style={[styles.answer, !choice && styles.missing]}>{choice?.label ?? "아직 답하지 않았어요"}</Text></View><Text style={styles.edit}>수정 ›</Text></Card>
      </Pressable>;
    })}</View>
    {errorMessage ? <View accessibilityLiveRegion="assertive" style={styles.errorBanner}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
    <PrimaryButton label="결과 계산하고 저장하기" loading={submitting} onPress={submit} />
    <SecondaryButton label="답변으로 돌아가기" onPress={() => router.replace({ pathname: "/tests/personal", params: { resume: "1" } })} />
  </Screen>;
}

const styles = StyleSheet.create({
  summary: { borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: spacing.md }, summaryTitle: { ...typography.subtitle, color: colors.primary }, summaryText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  list: { gap: spacing.sm, marginVertical: spacing.lg }, pressed: { opacity: 0.82 }, answerCard: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: spacing.sm }, missingCard: { borderColor: colors.warning, backgroundColor: colors.warningSoft }, answerCopy: { flex: 1, minWidth: 0 }, dimension: { ...typography.caption, color: colors.primary }, question: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xxs }, answer: { ...typography.bodyStrong, color: colors.text, marginTop: spacing.xs }, missing: { color: colors.warning }, edit: { ...typography.caption, color: colors.primary },
  errorBanner: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.md, marginBottom: spacing.sm }, errorText: { ...typography.body, color: colors.danger },
});
