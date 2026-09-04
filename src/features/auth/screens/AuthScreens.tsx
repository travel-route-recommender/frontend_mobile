import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { AuthDivider, AuthErrorBanner, AuthErrorToast, AuthTextField, GoogleButton, KakaoButton, PasswordField, TermsCheckbox } from "../components/AuthControls";
import { AuthLayout } from "../components/AuthLayout";
import { DuriLogo } from "../components/DuriLogo";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { authCapabilities, authService } from "../services/authService";
import { buildInviteReturnPath, inviteErrorMessage, resolveAuthReturnTo } from "../services/inviteFlowPolicy";
import { useAuthSessionStore } from "../store/useAuthSessionStore";
import type { InvitePreview, SocialProvider } from "../types";
import { normalizeEmail, normalizeInviteCode, validateEmail, validateInviteCode, validateNickname, validatePassword, validatePasswordConfirmation, validateRequiredAgreement } from "../validation";

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={styles.textLinkButton}><Text style={styles.textLink}>{label}</Text></Pressable>;
}

function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function destinationAfterLogin(profileCompleted: boolean, onboardingIntroSeen: boolean, guest = false) {
  if (guest) return "/(tabs)/trips" as const;
  if (!profileCompleted) return "/(onboarding)/profile" as const;
  if (!onboardingIntroSeen) return "/(onboarding)/intro" as const;
  return "/(tabs)/home" as const;
}

export function LoginScreen() {
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const dismissServiceError = useCallback(() => setServiceError(null), []);

  const finishEmail = async () => {
    dismissServiceError();
    const nextEmailError = validateEmail(email);
    const nextPasswordError = password ? undefined : "비밀번호를 입력해 주세요.";
    setEmailError(nextEmailError); setPasswordError(nextPasswordError);
    if (nextEmailError) { emailRef.current?.focus(); return; }
    if (nextPasswordError) { passwordRef.current?.focus(); return; }
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.login({ email: normalizeEmail(email), password });
      if (result.status === "error") { setServiceError(result.message); return; }
      await applyAuthSuccess(result);
      router.replace((resolveAuthReturnTo(returnTo, false) ?? destinationAfterLogin(result.profileCompleted, result.onboardingIntroSeen)) as never);
    } finally { setLoading(false); }
  };

  const finishSocial = async (provider: SocialProvider) => {
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.loginWithSocial(provider);
      if (result.status === "error") { setServiceError(result.message); return; }
      await applyAuthSuccess(result);
      router.replace((resolveAuthReturnTo(returnTo, false) ?? destinationAfterLogin(result.profileCompleted, result.onboardingIntroSeen)) as never);
    } finally { setLoading(false); }
  };

  return <AuthLayout testID="login-screen" overlay={<AuthErrorToast message={serviceError} onDismiss={dismissServiceError} />}>
    <DuriLogo />
    <View><Text style={styles.heroTitle}>여행의 시작을 함께해요</Text><Text style={styles.heroSubtitle}>로그인하고 친구들과 여행을 계획해 보세요.</Text></View>
    {authCapabilities.googleLogin ? <GoogleButton disabled={loading} onPress={() => finishSocial("google")} /> : null}
    {authCapabilities.kakaoLogin ? <KakaoButton label="카카오로 계속하기" disabled={loading} onPress={() => finishSocial("kakao")} /> : null}
    {authCapabilities.googleLogin || authCapabilities.kakaoLogin ? <AuthDivider /> : null}
    <AuthTextField ref={emailRef} label="이메일" value={email} onChangeText={(value) => { setEmail(value); setEmailError(undefined); dismissServiceError(); }} error={emailError} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
    <PasswordField ref={passwordRef} label="비밀번호" value={password} onChangeText={(value) => { setPassword(value); setPasswordError(undefined); dismissServiceError(); }} error={passwordError} autoComplete="current-password" returnKeyType="done" onSubmitEditing={finishEmail} />
    <PrimaryButton label="이메일로 로그인" loading={loading} onPress={finishEmail} />
    <SecondaryButton label="게스트로 입장하기" disabled={loading} onPress={() => router.push((resolveAuthReturnTo(returnTo, false)?.startsWith("/invite/") ? returnTo : "/(auth)/invite") as never)} />
    <View style={styles.inlineLinks}><TextLink label="회원가입" onPress={() => router.push({ pathname: "/(auth)/signup-email", params: { ...(returnTo ? { returnTo } : {}) } })} /></View>
    <View style={styles.inlineLinks}><TextLink label="서비스 이용약관" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "service" } })} /><Text style={styles.dot}>·</Text><TextLink label="개인정보 처리방침" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "privacy" } })} /></View>
  </AuthLayout>;
}

export function SignupEmailScreen() {
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [serviceAgreed, setServiceAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [errors, setErrors] = useState<{ nickname?: string; email?: string; password?: string; confirmation?: string; agreements?: string }>({});
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nicknameRef = useRef<TextInput>(null); const emailRef = useRef<TextInput>(null); const passwordRef = useRef<TextInput>(null); const confirmationRef = useRef<TextInput>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const allAgreed = serviceAgreed && privacyAgreed;

  const validateEmailField = () => {
    const emailError = validateEmail(email);
    setErrors((old) => ({ ...old, email: emailError }));
    return emailError;
  };

  const submit = async () => {
    const next = { nickname: validateNickname(nickname), email: validateEmail(email), password: validatePassword(password), confirmation: validatePasswordConfirmation(password, confirmation), agreements: validateRequiredAgreement(allAgreed, "필수 약관") };
    setErrors(next);
    if (next.nickname) { nicknameRef.current?.focus(); return; }
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
    if (next.confirmation) { confirmationRef.current?.focus(); return; }
    if (next.agreements) return;
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.signup({ nickname: nickname.trim(), email: normalizeEmail(email), password });
      if (result.status === "error") {
        if (result.code === "account-exists") {
          setErrors((old) => ({ ...old, email: "이미 가입된 이메일이에요. 로그인해 주세요." }));
          emailRef.current?.focus();
        } else {
          setServiceError(result.message);
        }
        return;
      }
      await applyAuthSuccess(result);
      router.replace((resolveAuthReturnTo(returnTo, false) ?? destinationAfterLogin(result.profileCompleted, result.onboardingIntroSeen)) as never);
    } finally { setLoading(false); }
  };

  const toggleAll = () => { const checked = !allAgreed; setServiceAgreed(checked); setPrivacyAgreed(checked); setErrors((value) => ({ ...value, agreements: undefined })); };
  return <AuthLayout title="이메일로 가입하기" subtitle="안전한 계정을 만들고 여행을 시작하세요." onBack={goBackOrHome} footer={<PrimaryButton label="가입하고 계속하기" loading={loading} onPress={submit} />}>
    <AuthTextField ref={nicknameRef} label="닉네임" value={nickname} onChangeText={(value) => { setNickname(value); setErrors((old) => ({ ...old, nickname: undefined })); }} error={errors.nickname} maxLength={12} autoCapitalize="none" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
    <AuthTextField
      ref={emailRef}
      label="이메일"
      value={email}
      onChangeText={(value) => {
        setEmail(value);
        setServiceError(null);
        setErrors((old) => ({ ...old, email: old.email ? validateEmail(value) : undefined }));
      }}
      onBlur={validateEmailField}
      error={errors.email}
      keyboardType="email-address"
      autoCapitalize="none"
      autoComplete="email"
      returnKeyType="next"
      onSubmitEditing={() => passwordRef.current?.focus()}
    />
    <PasswordField ref={passwordRef} label="비밀번호" value={password} onChangeText={(value) => { setPassword(value); setErrors((old) => ({ ...old, password: undefined })); }} error={errors.password} helperText="12자 이상이며 이메일과 다른 비밀번호를 사용해 주세요." autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmationRef.current?.focus()} />
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
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const member = sessionKind === "member";
  const params = useLocalSearchParams<{
    code?: string | string[];
    tripId?: string | string[];
    revision?: string | string[];
  }>();
  const initialCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const routeTripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const routeRevision = Array.isArray(params.revision) ? params.revision[0] : params.revision;
  const sharedCode = normalizeInviteCode(initialCode ?? "");
  const [code, setCode] = useState(sharedCode);
  const [nickname, setNickname] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string>();
  const [nicknameError, setNicknameError] = useState<string>();
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const nicknameRef = useRef<TextInput>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const existingParticipant = member;

  const checkCode = async () => {
    const nextError = validateInviteCode(code); setError(nextError);
    if (nextError) { inputRef.current?.focus(); return; }
    setLoading(true); setServiceError(null);
    try {
      setPreview(await authService.previewInvite(code));
      requestAnimationFrame(() => nicknameRef.current?.focus());
    } catch (reason) { setServiceError(inviteErrorMessage(reason, sessionKind)); } finally { setLoading(false); }
  };

  const join = async () => {
    if (member) {
      setLoading(true); setServiceError(null);
      try {
        const roomId = await authService.acceptInvite(code);
        router.replace({ pathname: "/trips/[tripId]", params: { tripId: roomId } });
      } catch (reason) { setServiceError(inviteErrorMessage(reason, sessionKind)); } finally { setLoading(false); }
      return;
    }
    const nextError = validateNickname(nickname); setNicknameError(nextError);
    if (nextError) { nicknameRef.current?.focus(); return; }
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.joinByInvite({ code: normalizeInviteCode(code), nickname: nickname.trim() });
      if (result.status === "error") {
        if (result.code === "guest-room-limit") {
          router.replace({ pathname: "/(auth)/guest-room-limit", params: { ...(result.existingRoomId ? { existingRoomId: result.existingRoomId } : {}) } } as never);
          return;
        }
        setServiceError(result.message);
        return;
      }
      await applyAuthSuccess(result);
      router.replace(result.invitedTripId
        ? { pathname: "/trips/[tripId]", params: { tripId: result.invitedTripId } }
        : destinationAfterLogin(true, true, true));
    } finally { setLoading(false); }
  };

  return <AuthLayout title={preview ? (existingParticipant ? "초대받은 여행 확인" : "게스트 닉네임 설정") : "초대 코드 확인"} subtitle={preview ? (existingParticipant ? "현재 프로필로 여행방에 참여합니다." : "이 여행방에서 사용할 이름을 정해 주세요.") : "유효한 초대 코드를 확인한 뒤 여행방에 참여할 수 있어요."} onBack={() => preview ? setPreview(null) : goBackOrHome()} footer={<PrimaryButton label={preview ? (existingParticipant ? "여행방 참여하기" : "게스트로 참여하기") : "초대 코드 확인"} loading={loading} onPress={preview ? join : checkCode} />}>
    <View style={styles.inviteHero}><Text style={styles.inviteEmoji}>✈️</Text><Text style={styles.inviteCopy}>{existingParticipant ? "현재 프로필을 유지한 채 초대받은 여행방에 참여해요." : "게스트는 초대받은 여행을 확인하고 후보 장소를 함께 모을 수 있어요. 새 여행 만들기와 개인 저장은 회원가입 후 이용할 수 있어요."}</Text></View>
    {!preview ? <>
      <AuthTextField ref={inputRef} label="초대 코드" value={code} onChangeText={(value) => { setCode(normalizeInviteCode(value)); setError(undefined); setServiceError(null); }} error={error} autoCapitalize="characters" autoCorrect={false} maxLength={8} returnKeyType="done" onSubmitEditing={checkCode} />
    </> : <>
      <View style={styles.previewBox}><Text style={styles.previewTitle}>{preview.title}</Text><Text style={styles.previewMeta}>{[preview.destination, preview.startDate && preview.endDate ? formatTripDateRange(preview.startDate, preview.endDate) : undefined, `${preview.memberCount}명 참여 중`].filter(Boolean).join(" · ")}</Text></View>
      {!existingParticipant ? <AuthTextField ref={nicknameRef} label="게스트 닉네임" value={nickname} onChangeText={(value) => { setNickname(value); setNicknameError(undefined); }} error={nicknameError} helperText="이 여행방에서 다른 구성원에게 표시되는 이름이에요." maxLength={12} autoCapitalize="none" returnKeyType="done" onSubmitEditing={join} /> : null}
    </>}
    <AuthErrorBanner message={serviceError} />
    <View style={styles.inlineLinks}><Text style={styles.muted}>이미 두리 회원인가요?</Text><TextLink label="로그인" onPress={() => router.replace({ pathname: "/(auth)/login", params: { returnTo: buildInviteReturnPath({ code, tripId: routeTripId, revision: routeRevision }) } })} /></View>
  </AuthLayout>;
}

export function TermsScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const type = (Array.isArray(params.type) ? params.type[0] : params.type) === "privacy" ? "privacy" : "service";
  const title = type === "privacy" ? "개인정보 처리방침" : "서비스 이용약관";
  const sections = type === "privacy" ? [
    ["1. 이용하는 정보", "계정 생성과 로그인을 위해 이메일과 닉네임을 이용합니다. 사용자가 입력한 여행 일정, 장소, 성향 응답과 직접 첨부한 문서는 여행 계획 기능을 제공하는 데 사용합니다."],
    ["2. 안전한 보관", "로그인 정보는 암호화된 통신으로 전송되며, 모바일 로그인 토큰은 운영체제의 보안 저장소에 보관합니다. 여행방 정보는 참여자에게만 표시합니다."],
    ["3. 사용자의 선택", "프로필과 여행 정보는 앱에서 확인하고 수정할 수 있습니다. 공용 기기에서는 이용 후 로그아웃하고, 초대 링크는 함께 여행할 사람에게만 공유해 주세요."],
  ] : [
    ["1. 서비스 목적", "두리는 동행자와 여행 장소를 모으고 일정을 함께 계획하도록 돕는 서비스입니다."],
    ["2. 이용 시 확인 사항", "교통편, 예약 시간, 운영시간과 요금처럼 바뀔 수 있는 정보는 출발 전에 해당 제공처에서 다시 확인해 주세요. 두리의 분석과 제안은 여행 결정을 돕는 참고 정보입니다."],
    ["3. 계정과 여행방", "계정과 초대 링크는 본인이 안전하게 관리해 주세요. 여행방의 일정과 첨부 정보는 함께 참여한 사람에게 표시될 수 있으므로 민감한 정보는 공유 전에 확인해 주세요."],
  ];
  return <AuthLayout title={title} subtitle="두리 이용에 필요한 내용을 안내해요." onBack={goBackOrHome} footer={<PrimaryButton label="확인" onPress={goBackOrHome} />}>
    <View style={styles.legalBox}>{sections.map(([heading, body]) => <View key={heading} style={styles.legalSection}><Text style={styles.legalHeading}>{heading}</Text><Text style={styles.legalBody}>{body}</Text></View>)}</View>
  </AuthLayout>;
}

const styles = StyleSheet.create({
  heroTitle: { ...typography.display, color: colors.text, marginTop: spacing.lg }, heroSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  textLinkButton: { minHeight: 36, alignItems: "center", justifyContent: "center" }, textLink: { ...typography.bodyStrong, color: colors.primary },
  inlineLinks: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: spacing.xs }, dot: { color: colors.textMuted }, muted: { ...typography.body, color: colors.textSecondary },
  termsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }, rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, error: { ...typography.caption, color: colors.danger },
  inviteHero: { alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.background, padding: spacing.xl }, inviteEmoji: { fontSize: 44 }, inviteCopy: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  previewBox: { gap: spacing.xs, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.primarySoft }, previewTitle: { ...typography.subtitle, color: colors.text }, previewMeta: { ...typography.caption, color: colors.textSecondary },
  legalBox: { gap: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surfaceMuted }, legalSection: { gap: spacing.xs }, legalHeading: { ...typography.subtitle, color: colors.text }, legalBody: { ...typography.body, color: colors.textSecondary },
});
