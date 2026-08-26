import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { environment } from "../../../config/environment";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { resolveMockTripInvite } from "../../invitations/logic/tripInviteLinks";
import { useTripInviteHydrationState, useTripInviteStore } from "../../invitations/store/useTripInviteStore";
import { AuthDivider, AuthErrorBanner, AuthTextField, GoogleButton, KakaoButton, PasswordField, TermsCheckbox } from "../components/AuthControls";
import { AuthLayout } from "../components/AuthLayout";
import { DuriLogo } from "../components/DuriLogo";
import { DEMO_INVITE_CODE, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD } from "../config";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { authService } from "../services/authService";
import { buildInviteReturnPath, inviteErrorMessage, resolveAuthReturnTo } from "../services/inviteFlowPolicy";
import { useAuthSessionStore } from "../store/useAuthSessionStore";
import type { InvitePreview, SocialProvider } from "../types";
import { normalizeEmail, normalizeInviteCode, validateEmail, validateInviteCode, validateNickname, validatePassword, validatePasswordConfirmation, validateRequiredAgreement } from "../validation";

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={styles.textLinkButton}><Text style={styles.textLink}>{label}</Text></Pressable>;
}

function Benefits() {
  return <View style={styles.benefits}><Text style={styles.benefitTitle}>두리와 함께하면</Text><Text style={styles.benefit}>✓ 여행지를 함께 저장하고 후보를 모을 수 있어요</Text><Text style={styles.benefit}>✓ 모두의 취향을 반영해 일정을 조율할 수 있어요</Text><Text style={styles.benefit}>✓ 초대 코드로 여행방에 바로 합류할 수 있어요</Text></View>;
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

  const finishEmail = async () => {
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

  const useDemoAccount = () => { setEmail(DEMO_MEMBER_EMAIL); setPassword(DEMO_MEMBER_PASSWORD); setEmailError(undefined); setPasswordError(undefined); };

  return <AuthLayout testID="login-screen">
    <DuriLogo />
    <View><Text style={styles.heroTitle}>여행의 시작을 함께해요</Text><Text style={styles.heroSubtitle}>로그인하고 친구들과 여행을 계획해 보세요.</Text></View>
    <GoogleButton disabled={loading} onPress={() => finishSocial("google")} />
    <KakaoButton disabled={loading} onPress={() => finishSocial("kakao")} />
    <AuthDivider />
    <AuthTextField ref={emailRef} label="이메일" value={email} onChangeText={(value) => { setEmail(value); setEmailError(undefined); }} error={emailError} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
    <PasswordField ref={passwordRef} label="비밀번호" value={password} onChangeText={(value) => { setPassword(value); setPasswordError(undefined); }} error={passwordError} autoComplete="current-password" returnKeyType="done" onSubmitEditing={finishEmail} />
    <AuthErrorBanner message={serviceError} />
    {__DEV__ ? <Pressable accessibilityRole="button" onPress={useDemoAccount} style={styles.demoBox}><Text style={styles.demoTitle}>Mock 데모 계정 채우기</Text><Text style={styles.demoText}>{DEMO_MEMBER_EMAIL} · {DEMO_MEMBER_PASSWORD}</Text></Pressable> : null}
    <PrimaryButton label="이메일로 로그인" loading={loading} onPress={finishEmail} />
    <SecondaryButton label="게스트로 입장하기" disabled={loading} onPress={() => router.push((resolveAuthReturnTo(returnTo, false)?.startsWith("/invite/") ? returnTo : "/(auth)/invite") as never)} />
    <View style={styles.inlineLinks}><TextLink label="회원가입" onPress={() => router.push({ pathname: "/(auth)/signup-choice", params: { ...(returnTo ? { returnTo } : {}) } })} /></View>
    <View style={styles.inlineLinks}><TextLink label="서비스 이용약관" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "service" } })} /><Text style={styles.dot}>·</Text><TextLink label="개인정보 처리방침" onPress={() => router.push({ pathname: "/(auth)/terms", params: { type: "privacy" } })} /></View>
  </AuthLayout>;
}

export function SignupChoiceScreen() {
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const [loading, setLoading] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const { applyAuthSuccess } = useAuthFlow();
  const social = async (provider: SocialProvider) => {
    setLoading(true); setServiceError(null);
    try {
      const result = await authService.loginWithSocial(provider);
      if (result.status === "error") { setServiceError(result.message); return; }
      await applyAuthSuccess(result);
      router.replace((resolveAuthReturnTo(returnTo, false) ?? destinationAfterLogin(result.profileCompleted, result.onboardingIntroSeen)) as never);
    } finally { setLoading(false); }
  };
  return <AuthLayout title="두리 시작하기" subtitle="나에게 편한 방법으로 가입하세요." onBack={() => router.back()}>
    <DuriLogo compact />
    <GoogleButton disabled={loading} onPress={() => social("google")} />
    <KakaoButton disabled={loading} onPress={() => social("kakao")} />
    <AuthDivider />
    <PrimaryButton label="이메일로 가입하기" onPress={() => router.push({ pathname: "/(auth)/signup-email", params: { ...(returnTo ? { returnTo } : {}) } })} />
    <AuthErrorBanner message={serviceError} />
    <View style={styles.inlineLinks}><Text style={styles.muted}>이미 계정이 있나요?</Text><TextLink label="로그인" onPress={() => router.replace({ pathname: "/(auth)/login", params: { ...(returnTo ? { returnTo } : {}) } })} /></View>
    <Benefits />
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
      if (result.status === "error") { setServiceError(result.message); return; }
      await applyAuthSuccess(result);
      router.replace((resolveAuthReturnTo(returnTo, false) ?? destinationAfterLogin(result.profileCompleted, result.onboardingIntroSeen)) as never);
    } finally { setLoading(false); }
  };

  const toggleAll = () => { const checked = !allAgreed; setServiceAgreed(checked); setPrivacyAgreed(checked); setErrors((value) => ({ ...value, agreements: undefined })); };
  return <AuthLayout title="이메일로 가입하기" subtitle="안전한 계정을 만들고 여행을 시작하세요." onBack={() => router.back()} footer={<PrimaryButton label="가입하고 계속하기" loading={loading} onPress={submit} />}>
    <AuthTextField ref={nicknameRef} label="닉네임" value={nickname} onChangeText={(value) => { setNickname(value); setErrors((old) => ({ ...old, nickname: undefined })); }} error={errors.nickname} maxLength={12} autoCapitalize="none" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
    <AuthTextField ref={emailRef} label="이메일" value={email} onChangeText={(value) => { setEmail(value); setErrors((old) => ({ ...old, email: undefined })); }} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
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
  const currentUserId = useDuriStore((state) => state.currentUserId);
  const regionsById = useDuriStore((state) => state.regionsById);
  const usersById = useDuriStore((state) => state.usersById);
  const addTripMember = useDuriStore((state) => state.addTripMember);
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const inviteStoreHydrated = useTripInviteHydrationState((state) => state.isHydrated);
  const localUser = usersById[currentUserId];
  const existingParticipant = environment.dataSource === "mock" ? Boolean(localUser) : member;

  const currentMockRouteInput = () => {
    const normalizedCode = normalizeInviteCode(code);
    const usesSharedLinkMetadata = Boolean(
      routeTripId && routeRevision && sharedCode && normalizedCode === sharedCode,
    );
    return {
      code: normalizedCode,
      tripId: usesSharedLinkMetadata ? routeTripId : undefined,
      revision: usesSharedLinkMetadata ? routeRevision : undefined,
    };
  };

  const checkCode = async () => {
    const nextError = validateInviteCode(code); setError(nextError);
    if (nextError) { inputRef.current?.focus(); return; }
    setLoading(true); setServiceError(null);
    try {
      if (environment.dataSource === "mock") {
        if (!useTripInviteHydrationState.getState().isHydrated) {
          setServiceError("저장된 초대 링크를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.");
          return;
        }
        const resolution = resolveMockTripInvite(
          currentMockRouteInput(),
          useDuriStore.getState().tripsById,
          useTripInviteStore.getState().linksByTripId,
        );
        if (resolution.status !== "success") {
          setPreview(null);
          setServiceError(resolution.message);
          return;
        }
        const trip = resolution.trip;
        setPreview({
          roomId: trip.id,
          title: trip.title,
          destination: regionsById[trip.regionId]?.name,
          startDate: trip.startDate ?? undefined,
          endDate: trip.endDate ?? undefined,
          memberCount: trip.members.length,
        });
        if (!localUser) requestAnimationFrame(() => nicknameRef.current?.focus());
        return;
      }
      setPreview(await authService.previewInvite(code));
      requestAnimationFrame(() => nicknameRef.current?.focus());
    } catch (reason) { setServiceError(inviteErrorMessage(reason, sessionKind)); } finally { setLoading(false); }
  };

  const join = async () => {
    if (environment.dataSource === "mock") {
      if (!preview) return;
      if (!localUser) {
        const nextError = validateNickname(nickname); setNicknameError(nextError);
        if (nextError) { nicknameRef.current?.focus(); return; }
      }
      setLoading(true); setServiceError(null);
      try {
        const resolution = resolveMockTripInvite(
          currentMockRouteInput(),
          useDuriStore.getState().tripsById,
          useTripInviteStore.getState().linksByTripId,
        );
        if (resolution.status !== "success") {
          setPreview(null);
          setServiceError(resolution.message);
          return;
        }

        const latestState = useDuriStore.getState();
        const existingUser = latestState.usersById[latestState.currentUserId];
        if (existingUser) {
          addTripMember(resolution.trip.id, existingUser.id);
        } else {
          const result = await authService.joinByInvite({
            code: normalizeInviteCode(code),
            nickname: nickname.trim(),
            tripId: resolution.trip.id,
          });
          if (result.status === "error") { setServiceError(result.message); return; }
          await applyAuthSuccess(result);
        }

        const joinedState = useDuriStore.getState();
        const joinedUserId = existingUser?.id ?? joinedState.currentUserId;
        const joined = joinedState.tripsById[resolution.trip.id]?.members.some(
          (tripMember) => tripMember.userId === joinedUserId,
        );
        if (!joined) {
          setServiceError("여행방 참여 상태를 저장하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        setActiveTrip(resolution.trip.id);
        router.replace({ pathname: "/trips/[tripId]", params: { tripId: resolution.trip.id } });
      } finally { setLoading(false); }
      return;
    }

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

  return <AuthLayout title={preview ? (existingParticipant ? "초대받은 여행 확인" : "게스트 닉네임 설정") : "초대 코드 확인"} subtitle={preview ? (existingParticipant ? "현재 프로필로 여행방에 참여합니다." : "이 여행방에서 사용할 이름을 정해주세요.") : "유효한 초대 코드를 확인한 뒤 여행방에 참여할 수 있어요."} onBack={() => preview ? setPreview(null) : router.back()} footer={<PrimaryButton label={preview ? (existingParticipant ? "여행방 참여하기" : "게스트로 참여하기") : "초대 코드 확인"} loading={loading} disabled={environment.dataSource === "mock" && !inviteStoreHydrated} onPress={preview ? join : checkCode} />}>
    <View style={styles.inviteHero}><Text style={styles.inviteEmoji}>✈️</Text><Text style={styles.inviteCopy}>{existingParticipant ? "현재 프로필을 유지한 채 초대받은 여행방에 참여해요." : "게스트는 초대받은 여행방 조회와 허용된 참여 기능만 이용할 수 있어요. 여행방 생성·저장 등 회원 기능은 서버에서도 차단됩니다."}</Text></View>
    {!preview ? <>
      <AuthTextField ref={inputRef} label="초대 코드" value={code} onChangeText={(value) => { setCode(normalizeInviteCode(value)); setError(undefined); setServiceError(null); }} error={error} autoCapitalize="characters" autoCorrect={false} maxLength={8} returnKeyType="done" onSubmitEditing={checkCode} />
      {__DEV__ ? <Pressable accessibilityRole="button" onPress={() => { setCode(DEMO_INVITE_CODE); setError(undefined); }} style={styles.demoBox}><Text style={styles.demoTitle}>Mock 초대 코드 사용</Text><Text style={styles.demoText}>{DEMO_INVITE_CODE}</Text></Pressable> : null}
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
  return <AuthLayout title={title} subtitle="운영 정책 확정 전 개발용 요약 문서입니다." onBack={() => router.back()} footer={<PrimaryButton label="확인" onPress={() => router.back()} />}>
    <View style={styles.legalBox}><Text style={styles.legalHeading}>1. 목적</Text><Text style={styles.legalBody}>두리는 함께 여행을 계획하는 사용자의 일정, 장소, 취향 정보를 관리합니다.</Text><Text style={styles.legalHeading}>2. 인증 정보</Text><Text style={styles.legalBody}>비밀번호는 HTTPS로 서버에 전송되고 서버에서 단방향 해시로 보관합니다. 모바일 Refresh Token은 운영체제 보안 저장소에 저장합니다.</Text><Text style={styles.legalHeading}>3. 정식 출시 전</Text><Text style={styles.legalBody}>수집 항목·보유 기간·파기 절차와 약관 버전 동의 이력은 법무 및 개인정보 담당자 검토 후 최종 문서로 교체해야 합니다.</Text></View>
  </AuthLayout>;
}

const styles = StyleSheet.create({
  heroTitle: { ...typography.display, color: colors.text, marginTop: spacing.lg }, heroSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  textLinkButton: { minHeight: 36, alignItems: "center", justifyContent: "center" }, textLink: { ...typography.bodyStrong, color: colors.primary },
  inlineLinks: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: spacing.xs }, dot: { color: colors.textMuted }, muted: { ...typography.body, color: colors.textSecondary },
  demoBox: { borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }, demoTitle: { ...typography.caption, color: colors.primary }, demoText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  benefits: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.background }, benefitTitle: { ...typography.subtitle, color: colors.text }, benefit: { ...typography.body, color: colors.textSecondary },
  termsBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }, rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, error: { ...typography.caption, color: colors.danger },
  inviteHero: { alignItems: "center", gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.background, padding: spacing.xl }, inviteEmoji: { fontSize: 44 }, inviteCopy: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  previewBox: { gap: spacing.xs, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.primarySoft }, previewTitle: { ...typography.subtitle, color: colors.text }, previewMeta: { ...typography.caption, color: colors.textSecondary },
  legalBox: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surfaceMuted }, legalHeading: { ...typography.subtitle, color: colors.text, marginTop: spacing.sm }, legalBody: { ...typography.body, color: colors.textSecondary },
});
