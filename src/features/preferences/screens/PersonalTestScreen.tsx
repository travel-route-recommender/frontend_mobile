import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { PersonalPreferenceAnswers, PreferenceDimension } from "../../../domain";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { personalTestQuestions } from "../../../duri/preferences";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";

export function PersonalTestScreen() {
  const router = useRouter();
  const saveResult = useDuriStore((state) => state.savePersonalPreferenceResult);
  const currentUserId = useDuriStore((state) => state.currentUserId);
  const setPreferenceCompleted = useAuthSessionStore((state) => state.setPreferenceTestCompleted);
  const setIntroSeen = useAuthSessionStore((state) => state.setOnboardingIntroSeen);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<PersonalPreferenceAnswers>>({});
  const question = personalTestQuestions[step];
  const selected = answers[question.dimension];
  const finish = () => { if (!isCompleteAnswers(answers)) return; const result = saveResult(currentUserId, answers); if (result) { setPreferenceCompleted(true); setIntroSeen(true); router.replace("/tests/personal/result"); } };
  return <Screen><AppHeader title="나의 여행 성향" subtitle={`${step + 1} / ${personalTestQuestions.length}`} onBack={() => step > 0 ? setStep((value) => value - 1) : router.back()} /><View style={styles.progress}><View style={[styles.progressValue, { width: `${((step + 1) / personalTestQuestions.length) * 100}%` }]} /></View><Text style={styles.question}>{question.question}</Text><View style={styles.choices}>{question.choices.map((choice) => { const active = selected === choice.value; return <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`${choice.label}. ${choice.description}`} onPress={() => setAnswers((current) => ({ ...current, [question.dimension]: choice.value }))}><Card style={[styles.choice, active && styles.choiceActive]}><View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View><View style={styles.choiceCopy}><Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{choice.label}</Text><Text style={styles.choiceDescription}>{choice.description}</Text></View></Card></Pressable>; })}</View><PrimaryButton label={step === personalTestQuestions.length - 1 ? "결과 보기" : "다음 질문"} disabled={selected === undefined} onPress={() => step === personalTestQuestions.length - 1 ? finish() : setStep((value) => value + 1)} />{step > 0 ? <SecondaryButton label="이전 질문" onPress={() => setStep((value) => value - 1)} /> : null}</Screen>;
}
const dimensions: PreferenceDimension[] = ["pace", "budget", "mobility", "activity", "mealStyle", "planningStyle"];
function isCompleteAnswers(value: Partial<PersonalPreferenceAnswers>): value is PersonalPreferenceAnswers { return dimensions.every((dimension) => { const score = value[dimension]; return score === 0 || score === 1 || score === 2; }); }
const styles = StyleSheet.create({ progress: { height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden", marginBottom: spacing.xl }, progressValue: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary }, question: { ...typography.title, color: colors.text, marginBottom: spacing.lg }, choices: { gap: spacing.sm, marginBottom: spacing.xl }, choice: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }, radioActive: { borderColor: colors.primary }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }, choiceCopy: { flex: 1 }, choiceLabel: { ...typography.bodyStrong, color: colors.text }, choiceLabelActive: { color: colors.primary }, choiceDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs } });
