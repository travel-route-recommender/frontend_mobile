import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import type { PersonalPreferenceAnswers } from "../../../domain";
import {
  isCompletePersonalPreferenceAnswers,
  personalTestQuestions,
  preferenceDimensionLabels,
  type PersonalPreferenceDraft,
} from "../../../duri/preferences";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AuthLayout } from "../../auth/components/AuthLayout";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { PreferenceOptionCard } from "../../preferences/components/PreferenceOptionCard";
import { PreferenceProgressBar } from "../../preferences/components/PreferenceProgressBar";

export function OnboardingPreferenceTestScreen() {
  const sessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const setIntroSeen = useAuthSessionStore((state) => state.setOnboardingIntroSeen);
  const setPreferenceCompleted = useAuthSessionStore((state) => state.setPreferenceTestCompleted);
  const domainUserId = useDuriStore((state) => state.currentUserId);
  const currentUserExists = useDuriStore((state) => sessionUserId ? Boolean(state.usersById[sessionUserId]) : false);
  const saveResult = useDuriStore((state) => state.savePersonalPreferenceResult);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<PersonalPreferenceDraft>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const question = personalTestQuestions[questionIndex];
  const selectedValue = question ? answers[question.dimension] : undefined;
  const isLast = questionIndex === personalTestQuestions.length - 1;

  const skip = () => {
    setIntroSeen(true);
    router.replace("/(tabs)/home");
  };

  const goBack = () => {
    setErrorMessage(null);
    if (questionIndex > 0) {
      setQuestionIndex((current) => current - 1);
      return;
    }
    router.replace("/(onboarding)/intro");
  };

  const finish = (completedAnswers: PersonalPreferenceAnswers) => {
    if (!sessionUserId || !currentUserExists || domainUserId !== sessionUserId) {
      setErrorMessage("현재 사용자 정보를 확인할 수 없어 결과를 저장하지 못했어요.");
      return;
    }
    const saved = saveResult(sessionUserId, completedAnswers, new Date().toISOString());
    if (!saved) {
      setErrorMessage("여행 성향 결과를 저장하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    setPreferenceCompleted(true);
    setIntroSeen(true);
    router.replace("/(tabs)/home");
  };

  const moveNext = () => {
    if (selectedValue === undefined) return;
    setErrorMessage(null);
    if (!isLast) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    if (!isCompletePersonalPreferenceAnswers(answers)) {
      setErrorMessage("답하지 않은 문항이 있어요. 이전 문항을 확인해 주세요.");
      return;
    }
    finish(answers);
  };

  if (!question) {
    return (
      <AuthLayout title="간단 여행 성향 테스트" onBack={() => router.replace("/(onboarding)/intro")}>
        <View style={styles.errorBox}><Text style={styles.errorText}>간단 테스트 문항을 불러오지 못했어요.</Text></View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="간단 여행 성향 테스트"
      subtitle="6가지 질문으로 기본 여행 취향을 알려주세요. 상세 테스트는 마이페이지에서 다시 할 수 있어요."
      onBack={goBack}
      testID="onboarding-preference-test"
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label={isLast ? "테스트 완료" : "다음"}
            disabled={selectedValue === undefined}
            onPress={moveNext}
          />
          <SecondaryButton
            label={questionIndex === 0 ? "다음에 하기" : "이전"}
            onPress={questionIndex === 0 ? skip : goBack}
          />
        </View>
      }
    >
      <PreferenceProgressBar
        current={questionIndex + 1}
        total={personalTestQuestions.length}
        accessibilityLabel="회원가입 여행 성향 테스트 진행률"
      />
      <View style={styles.questionCard}>
        <Text style={styles.dimension}>{preferenceDimensionLabels[question.dimension]}</Text>
        <Text accessibilityRole="header" style={styles.question}>{question.question}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={question.question} style={styles.options}>
          {question.choices.map((choice) => (
            <PreferenceOptionCard
              key={choice.value}
              label={choice.label}
              description={choice.description}
              selected={selectedValue === choice.value}
              onPress={() => {
                setAnswers((current) => ({ ...current, [question.dimension]: choice.value }));
                setErrorMessage(null);
              }}
            />
          ))}
        </View>
      </View>
      {errorMessage ? <View accessibilityLiveRegion="assertive" style={styles.errorBox}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  questionCard: { gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.background, padding: spacing.md },
  dimension: { ...typography.caption, color: colors.primary, alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  question: { ...typography.title, color: colors.text },
  options: { gap: spacing.sm },
  footer: { gap: spacing.sm },
  errorBox: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorText: { ...typography.body, color: colors.danger },
});
