import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AuthDivider, AuthErrorBanner, AuthTextField, KakaoButton, PasswordField, TermsCheckbox } from "../components/AuthControls";
import { AuthLayout } from "../components/AuthLayout";
import { DuriLogo } from "../components/DuriLogo";
import { DEMO_INVITE_CODE, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD } from "../config";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { authService } from "../services/authService";
import { normalizeEmail, normalizeInviteCode, validateEmail, validateInviteCode, validatePassword, validatePasswordConfirmation, validateRequiredAgreement } from "../validation";

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={styles.textLinkButton}><Text style={styles.textLink}>{label}</Text></Pressable>;
}

function Benefits() {
  return <View style={styles.benefits}><Text style={styles.benefitTitle}>두리와 함께하면</Text><Text style={styles.benefit}>✓ 여행지를 함께 저장하고 후보를 모을 수 있어요</Text><Text style={styles.benefit}>✓ 모두의 취향을 반영해 일정을 조율할 수 있어요</Text><Text style={styles.benefit}>✓ 초대 코드로 여행방에 바로 합류할 수 있어요</Text></View>;
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { applyAuthSuccess, browseAnonymously } = useAuthFlow();

  const finish = async (kind: "email" | "kakao") => {
    let normalizedEmail = email;
    if (kind === "email") {
      const nextEmailError = validateEmail(email);
      const nextPasswordError = validatePassword(password);
      setEmailError(nextEmailError); setPasswordError(nextPasswordError);
      if (nextEmailError) { emailRef.current?.focus(); return; }
      if (nextPasswordError) { passwordRef.current?.focus(); return; }
      normalizedEmail = normalizeEmail(email);
    }
    setLoading(true); setServiceError(null);
    try {
      const result = kind === "kakao" ? await authService.loginWithKakao() : await authService.login({ email: normalizedEmail, password });
      if (result.status === "error") { setServiceError(result.message); return; }
      applyAuthSuccess(result);
      router.replace(result.profileCompleted ? "/(tabs)/home" : "/(onboarding)/profile");
    } finally { setLoading(false); }
  };

  const useDemoAccount = () => { setEmail(DEMO_MEMBER_EMAIL); setPassword(DEMO_MEMBER_PASSWORD); setEmailError(undefined); setPasswordError(undefined); };
  const browse = () => { browseAnonymously(); router.replace("/(tabs)/home"); };

  return (
    <AuthLayout testID="login-screen">
      <DuriLogo />
      <View><Text style={styles.heroTitle}>여행의 시작을 함께해요</Text><Text style={styles.heroSubtitle}>로그인하고 친구들과 여행을 계획해 보세요.</Text></View>
      <KakaoButton disabled={loading} onPress={() => finish("kakao")} />
      <AuthDivider />
      <AuthTextField ref={emailRef} label="이메일" value={email} onChangeText={(value) => { setEmail(value); setEmailError(undefined); }} error={emailError} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
      <PasswordField ref={passwordRef} label="비밀번호" value={password} onChangeText={(value) => { setPassword(value); setPasswordError(undefined); }} error={passwordError} autoComplete="current-password" returnKeyType="done" onSubmitEditing={() => finish("email")} />
      <AuthErrorBanner message={serviceError} />
      {__DEV__ ? <Pressable accessibilityRole="button" onPress={useDemoAccount} style={styles.demoBox}><Text style={styles.demoTitle}>Mock 데모 계정 채우기</Text><Text style={styles.demoText}>{DEMO_MEMBER_EMAIL} · {DEMO_MEMBER_PASSWORD}</Text></Pressable> : null}
      <PrimaryButton label="이메일로 로그인" loading={loading} onPress={() => finish("email")} />
      <View style={styles.inlineLinks}><TextLink label="회원가입" onPress={() => router.push("/(auth)/signup-choice")} /><Text style={styles.dot}>·</Text><TextLink label="초대 코드로 참여" onPress={() => router.push("/(auth)/invite")} /></View>
      <SecondaryButton label="둘러보기" onPress={browse} />
      <View style={styles.inlineLinks}><TextLink label="서비스 이용약관" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "service" } })} /><Text style={styles.dot}>·</Text><TextLink label="개인정보 처리방침" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "privacy" } })} /></View>
    </AuthLayout>
  );
}

export function SignupChoiceScreen() {
  const [loading, setLoading] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const kakao = async () => {
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.loginWithKakao();
      if (result.status === "error") { setServiceError(result.message); return; }
      applyAuthSuccess(result); router.replace(result.profileCompleted ? "/(tabs)/home" : "/(onboarding)/profile");
    } finally { setLoading(false); }
  };
  return <AuthLayout title="두리 시작하기" subtitle="나에게 편한 방법으로 가입하세요." onBack={() => router.back()}>
    <DuriLogo compact />
    <KakaoButton disabled={loading} onPress={kakao} />
    <AuthDivider />
    <PrimaryButton label="이메일로 가입하기" onPress={() => router.push("/(auth)/signup-email")} />
    <AuthErrorBanner message={serviceError} />
    <View style={styles.inlineLinks}><Text style={styles.muted}>이미 계정이 있나요?</Text><TextLink label="로그인" onPress={() => router.replace("/(auth)/login")} /></View>
    <Benefits />
  </AuthLayout>;
}

export function SignupEmailScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [serviceAgreed, setServiceAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmation?: string; agreements?: string }>({});
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null); const passwordRef = useRef<TextInput>(null); const confirmationRef = useRef<TextInput>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const allAgreed = serviceAgreed && privacyAgreed;

  const submit = async () => {
    const next = { email: validateEmail(email), password: validatePassword(password), confirmation: validatePasswordConfirmation(password, confirmation), agreements: validateRequiredAgreement(allAgreed, "필수 약관") };
    setErrors(next);
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
    if (next.confirmation) { confirmationRef.current?.focus(); return; }
    if (next.agreements) return;
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.signup({ email: normalizeEmail(email), password });
      if (result.status === "error") { setServiceError(result.message); return; }
      applyAuthSuccess(result); router.replace("/(onboarding)/profile");
    } finally { setLoading(false); }
  };

  const toggleAll = () => { const checked = !allAgreed; setServiceAgreed(checked); setPrivacyAgreed(checked); setErrors((value) => ({ ...value, agreements: undefined })); };
  return <AuthLayout title="이메일로 가입하기" subtitle="가입 후 프로필과 여행 취향을 설정할 수 있어요." onBack={() => router.back()} footer={<PrimaryButton label="가입하고 계속하기" loading={loading} onPress={submit} />}>
    <AuthTextField ref={emailRef} label="이메일" value={email} onChangeText={(value) => { setEmail(value); setErrors((old) => ({ ...old, email: undefined })); }} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
    <PasswordField ref={passwordRef} label="비밀번호" value={password} onChangeText={(value) => { setPassword(value); setErrors((old) => ({ ...old, password: undefined })); }} error={errors.password} helperText="6자 이상 입력해 주세요." autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmationRef.current?.focus()} />
    <PasswordField ref={confirmationRef} label="비밀번호 확인" value={confirmation} onChangeText={(value) => { setConfirmation(value); setErrors((old) => ({ ...old, confirmation: undefined })); }} error={errors.confirmation} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} />
    <View style={styles.termsBox}>
      <TermsCheckbox checked={allAgreed} label="필수 약관 전체 동의" onToggle={toggleAll} />
      <View style={styles.rule} />
      <TermsCheckbox checked={serviceAgreed} label="[필수] 서비스 이용약관" onToggle={() => { setServiceAgreed((v) => !v); setErrors((old) => ({ ...old, agreements: undefined })); }} onView={() => router.push({ pathname: "/(auth)/terms", params: { type: "service" } })} />
      <TermsCheckbox checked={privacyAgreed} label="[필수] 개인정보 처리방침" onToggle={() => { setPrivacyAgreed((v) => !v); setErrors((old) => ({ ...old, agreements: undefined })); }} onView={() => router.push({ pathname: "/(auth)/terms", params: { type: "privacy" } })} />
      {errors.agreements ? <Text accessibilityLiveRegion="polite" style={styles.error}>{errors.agreements}</Text> : null}
    </View>
    <AuthErrorBanner message={serviceError} />
  </AuthLayout>;
}

export function InviteJoinScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const initialCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(normalizeInviteCode(initialCode ?? ""));
  const [error, setError] = useState<string>();
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const submit = async () => {
    const nextError = validateInviteCode(code); setError(nextError);
    if (nextError) { inputRef.current?.focus(); return; }
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.joinByInvite({ code: normalizeInviteCode(code) });
      if (result.status === "error") { setServiceError(result.message); return; }
      applyAuthSuccess(result); router.replace("/(onboarding)/profile");
    } finally { setLoading(false); }
  };
  return <AuthLayout title="초대받은 여행에 참여하기" subtitle="친구가 공유한 8자리 초대 코드를 입력하세요." onBack={() => router.back()} footer={<PrimaryButton label="여행방에 참여하기" loading={loading} onPress={submit} />}>
    <View style={styles.inviteHero}><Text style={styles.inviteEmoji}>✈️</Text><Text style={styles.inviteCopy}>프로필을 만든 뒤 초대받은 여행방을 확인할 수 있어요. 게스트는 장소 저장·새 여행 생성·후보 및 일정 수정 같은 회원 기능이 제한돼요.</Text></View>
    <AuthTextField ref={inputRef} label="초대 코드" value={code} onChangeText={(value) => { setCode(normalizeInviteCode(value)); setError(undefined); }} error={error} autoCapitalize="characters" autoCorrect={false} maxLength={8} returnKeyType="done" onSubmitEditing={submit} />
    {__DEV__ ? <Pressable accessibilityRole="button" onPress={() => { setCode(DEMO_INVITE_CODE); setError(undefined); }} style={styles.demoBox}><Text style={styles.demoTitle}>Mock 초대 코드 사용</Text><Text style={styles.demoText}>{DEMO_INVITE_CODE}</Text></Pressable> : null}
    <AuthErrorBanner message={serviceError} />
    <View style={styles.inlineLinks}><Text style={styles.muted}>이미 두리 회원인가요?</Text><TextLink label="로그인" onPress={() => router.replace("/(auth)/login")} /></View>
  </AuthLayout>;
}

export function TermsScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const type = (Array.isArray(params.type) ? params.type[0] : params.type) === "privacy" ? "privacy" : "service";
  const title = type === "privacy" ? "개인정보 처리방침" : "서비스 이용약관";
  return <AuthLayout title={title} subtitle="프로토타입 확인용 임시 문서입니다." onBack={() => router.back()} footer={<PrimaryButton label="확인" onPress={() => router.back()} />}>
    <View style={styles.legalBox}><Text style={styles.legalHeading}>1. 목적</Text><Text style={styles.legalBody}>두리는 함께 여행을 계획하는 사용자의 일정, 장소, 취향 정보를 화면에서 관리하기 위한 서비스입니다.</Text><Text style={styles.legalHeading}>2. 현재 구현 범위</Text><Text style={styles.legalBody}>이 앱은 프론트엔드 프로토타입이며 mock 모드의 인증 정보는 실제 계정이나 서버에 전송되지 않습니다.</Text><Text style={styles.legalHeading}>3. 정식 출시 전 교체</Text><Text style={styles.legalBody}>실제 서비스 약관, 개인정보의 수집 항목·보유 기간·파기 절차는 법무 및 개인정보 담당자의 검토를 거친 최종 문서로 교체해야 합니다.</Text></View>
    <Text style={styles.legalTodo}>TODO: 백엔드 인증 계약과 운영 정책 확정 후 정식 문서 및 버전 동의 이력을 연결하세요.</Text>
  </AuthLayout>;
}

const styles = StyleSheet.create({
  heroTitle: { ...typography.display, color: colors.text, marginTop: spacing.lg },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  textLinkButton: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  textLink: { ...typography.bodyStrong, color: colors.primary },
  inlineLinks: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  dot: { color: colors.textMuted }, muted: { ...typography.body, color: colors.textSecondary },
  demoBox: { borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  demoTitle: { ...typography.caption, color: colors.primary }, demoText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  benefits: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background },
  benefitTitle: { ...typography.subtitle, color: colors.text }, benefit: { ...typography.body, color: colors.textSecondary },
  termsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, error: { ...typography.caption, color: colors.danger },
  inviteHero: { alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.background, padding: spacing.xl },
  inviteEmoji: { fontSize: 44 }, inviteCopy: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  legalBox: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surfaceMuted },
  legalHeading: { ...typography.subtitle, color: colors.text, marginTop: spacing.sm }, legalBody: { ...typography.body, color: colors.textSecondary },
  legalTodo: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: spacing.sm },
});
