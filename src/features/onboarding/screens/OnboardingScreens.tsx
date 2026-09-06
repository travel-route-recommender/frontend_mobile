import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AuthErrorBanner, AuthTextField, AvatarOption, OnboardingProgress } from "../../auth/components/AuthControls";
import { AuthLayout } from "../../auth/components/AuthLayout";
import { DuriLogo } from "../../auth/components/DuriLogo";
import { AVATAR_PRESETS } from "../../auth/config";
import { useAuthFlow } from "../../auth/hooks/useAuthFlow";
import { authService } from "../../auth/services/authService";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { validateNickname } from "../../auth/validation";

function useAndroidBack(onBack: () => void) {
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]));
}

export function ProfileSetupScreen() {
  const userId = useAuthSessionStore((state) => state.currentSessionUserId);
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const setProfileCompleted = useAuthSessionStore((state) => state.setProfileCompleted);
  const introSeen = useAuthSessionStore((state) => state.onboardingIntroSeen);
  const user = useDuriStore((state) => userId ? state.usersById[userId] : undefined);
  const updateProfile = useDuriStore((state) => state.updateCurrentUserProfile);
  const { logout } = useAuthFlow();
  const [nickname, setNickname] = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState(user?.initial ?? AVATAR_PRESETS[0]);
  const [error, setError] = useState<string>();
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const leave = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    void logout().then(() => router.replace("/(auth)/login"));
  }, [logout]);
  useAndroidBack(leave);

  if (!sessionKind || sessionKind === "anonymous") return <AuthLayout><ErrorState message="프로필을 만들려면 먼저 로그인하거나 초대 코드로 참여해 주세요." onRetry={() => router.replace("/(auth)/login")} /></AuthLayout>;
  if (!user) return <AuthLayout><ErrorState message="로그인 정보를 확인하지 못했어요. 로그아웃한 뒤 다시 시작해 주세요." onRetry={async () => { await logout(); router.replace("/(auth)/login"); }} /></AuthLayout>;

  const submit = async () => {
    const nextError = validateNickname(nickname); setError(nextError);
    if (nextError) { inputRef.current?.focus(); return; }
    setLoading(true); setServiceError(null);
    try {
      await authService.updateProfile({ nickname: nickname.trim() });
      if (!updateProfile({ name: nickname.trim(), avatar })) { setError("프로필을 저장하지 못했어요. 다시 시도해 주세요."); return; }
      setProfileCompleted(true); router.replace(introSeen ? "/(tabs)/home" : "/(onboarding)/intro");
    } catch (reason) {
      setServiceError(toUserFacingApiErrorMessage(reason, "프로필을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally { setLoading(false); }
  };

  return <AuthLayout title="나를 소개해 주세요" subtitle={sessionKind === "guest" ? "초대 여행방에서 친구들이 알아볼 프로필이에요." : "두리에서 사용할 프로필을 설정해요."} onBack={leave} footer={<PrimaryButton label="프로필 저장" loading={loading} onPress={submit} />}>
    <OnboardingProgress current={1} total={2} />
    <View style={styles.preview}><View style={styles.previewAvatar}><Text style={styles.previewEmoji}>{avatar}</Text></View><Text style={styles.previewName}>{nickname.trim() || "여행자"}</Text></View>
    <Text style={styles.label}>아바타 선택</Text>
    <View accessibilityRole="radiogroup" style={styles.avatarGrid}>{AVATAR_PRESETS.map((emoji) => <AvatarOption key={emoji} emoji={emoji} selected={avatar === emoji} onPress={() => setAvatar(emoji)} />)}</View>
    <AuthTextField ref={inputRef} label="닉네임" value={nickname} onChangeText={(value) => { setNickname(value); setError(undefined); }} error={error} helperText="2~12자로 입력해 주세요." maxLength={12} autoCapitalize="none" returnKeyType="done" onSubmitEditing={submit} />
    <AuthErrorBanner message={serviceError} />
  </AuthLayout>;
}

const introCards = [
  { emoji: "🧭", title: "내 여행 성향 파악", text: "일정 속도, 이동 방식, 식사와 활동 선호를 확인해요." },
  { emoji: "👥", title: "동행자 차이 이해", text: "공통 선호와 조율이 필요한 부분을 한눈에 비교해요." },
  { emoji: "✨", title: "두리와 함께 일정 조율", text: "모두가 납득할 수 있도록 일정 밀도와 동선을 조정해요." },
] as const;

export function OnboardingIntroScreen() {
  const setIntroSeen = useAuthSessionStore((state) => state.setOnboardingIntroSeen);
  const userId = useAuthSessionStore((state) => state.currentSessionUserId);
  const user = useDuriStore((state) => userId ? state.usersById[userId] : undefined);
  const name = useMemo(() => user?.name ?? "여행자", [user?.name]);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/profile");
  }, []);
  useAndroidBack(leave);
  const finish = async (destination: "/(tabs)/home" | "/(onboarding)/quick-test" | "/tests/personal") => {
    setServiceError(null);
    try {
      await authService.completeOnboarding();
      setIntroSeen(true);
      router.replace(destination);
    } catch (reason) {
      setServiceError(toUserFacingApiErrorMessage(reason, "온보딩 상태를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  };
  const skip = () => finish("/(tabs)/home");
  // 서버 모드에서는 상세 성향검사만 서버의 현재 quiz 계약으로 완전하게
  // 저장할 수 있다. 간단 검사 결과를 완료로 오인하지 않도록 바로 연결한다.
  //const startTest = () => finish(environment.dataSource === "mock" ? "/(onboarding)/quick-test" : "/tests/personal");
  const startTest=() => finish("/tests/personal");
  return <AuthLayout title={`${name}님, 두리와 여행을 시작해요`} subtitle="두리가 함께 여행하는 방법을 간단히 알려드릴게요." onBack={leave} footer={<View style={styles.footerGap}><PrimaryButton label="여행 성향 테스트 시작" onPress={startTest} /><SecondaryButton label="다음에 하기" onPress={skip} /></View>}>
    <DuriLogo compact />
    <OnboardingProgress current={2} total={2} />
    {introCards.map((card) => <View key={card.title} style={styles.introCard}><Text style={styles.introEmoji}>{card.emoji}</Text><View style={styles.introText}><Text style={styles.introTitle}>{card.title}</Text><Text style={styles.introBody}>{card.text}</Text></View></View>)}
    <AuthErrorBanner message={serviceError} />
    <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "service" } })}><Text style={styles.termsLink}>이용약관 확인하기</Text></Pressable>
  </AuthLayout>;
}

const styles = StyleSheet.create({
  preview: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  previewAvatar: { width: 88, height: 88, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  previewEmoji: { fontSize: 44 }, previewName: { ...typography.subtitle, color: colors.text },
  label: { ...typography.bodyStrong, color: colors.text },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  introCard: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background },
  introEmoji: { fontSize: 30 }, introText: { flex: 1, gap: spacing.xxs }, introTitle: { ...typography.subtitle, color: colors.text }, introBody: { ...typography.body, color: colors.textSecondary },
  footerGap: { gap: spacing.sm }, termsLink: { ...typography.caption, color: colors.primary, textAlign: "center", textDecorationLine: "underline" },
});
