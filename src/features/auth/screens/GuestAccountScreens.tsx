import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Card, PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AuthErrorBanner, AuthTextField, PasswordField } from "../components/AuthControls";
import { AuthLayout } from "../components/AuthLayout";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { authCapabilities, authService } from "../services/authService";
import { useAuthSessionStore } from "../store/useAuthSessionStore";
import { useDuriStore } from "../../../store/useDuriStore";
import { normalizeEmail, validateEmail, validatePassword, validatePasswordConfirmation } from "../validation";

export function GuestRoomLimitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ existingRoomId?: string | string[] }>();
  const existingRoomId = Array.isArray(params.existingRoomId) ? params.existingRoomId[0] : params.existingRoomId;
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const canContinueGuest = sessionKind === "guest" && Boolean(existingRoomId);

  return <AuthLayout title="이미 참여 중인 여행이 있어요" subtitle="게스트는 진행 중인 여행방 하나에만 참여할 수 있어요." onBack={() => router.back()} testID="guest-room-limit-screen">
    <Card style={styles.notice}>
      <Text style={styles.emoji}>🧳</Text>
      <Text style={styles.noticeTitle}>새 초대는 아직 참여하지 않았어요</Text>
      <Text style={styles.noticeBody}>기존 여행을 계속 보거나, 회원 계정으로 로그인하거나, 현재 게스트 데이터를 유지한 채 계정을 업그레이드할 수 있어요.</Text>
    </Card>
    <View style={styles.actions}>
      <PrimaryButton
        label="진행 중인 기존 방으로 이동"
        disabled={!canContinueGuest}
        onPress={() => router.replace({ pathname: "/trips/[tripId]", params: { tripId: existingRoomId! } })}
      />
      {!canContinueGuest ? <Text style={styles.helper}>기존 방 정보가 없거나 게스트 로그인 정보가 만료됐어요. 먼저 로그인해 주세요.</Text> : null}
      <SecondaryButton label="회원 계정으로 로그인" onPress={() => router.push("/(auth)/login")} />
      {authCapabilities.guestUpgrade ? <SecondaryButton label="게스트 계정 업그레이드" disabled={sessionKind !== "guest"} onPress={() => router.push("/(auth)/guest-upgrade" as never)} /> : null}
    </View>
  </AuthLayout>;
}

export function GuestUpgradeScreen() {
  const router = useRouter();
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const currentUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const nickname = useDuriStore((state) => currentUserId ? state.usersById[currentUserId]?.name ?? "여행자" : "여행자");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmation?: string }>({});
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);
  const { applyAuthSuccess } = useAuthFlow();

  const submit = async () => {
    const next = {
      email: validateEmail(email),
      password: validatePassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setErrors(next);
    if (next.email) { emailRef.current?.focus(); return; }
    if (next.password) { passwordRef.current?.focus(); return; }
    if (next.confirmation) { confirmationRef.current?.focus(); return; }
    setLoading(true);
    setServiceError(null);
    try {
      const result = await authService.upgradeGuestWithPassword({ email: normalizeEmail(email), password, nickname });
      if (result.status === "error") { setServiceError(result.message); return; }
      await applyAuthSuccess(result, { verifiedGuestUpgrade: true });
      router.replace("/(tabs)/trips");
    } finally {
      setLoading(false);
    }
  };

  if (sessionKind !== "guest") {
    return <AuthLayout title="게스트 계정 업그레이드" onBack={() => router.back()}>
      <Card style={styles.notice}><Text style={styles.noticeTitle}>게스트 세션이 필요해요</Text><Text style={styles.noticeBody}>{sessionKind === "member" ? "이미 회원 계정으로 이용 중이에요." : "참여 중인 게스트 데이터를 유지하려면 해당 게스트 세션으로 먼저 접속해 주세요."}</Text></Card>
      <PrimaryButton label={sessionKind === "member" ? "여행 목록으로 이동" : "로그인"} onPress={() => router.replace(sessionKind === "member" ? "/(tabs)/trips" : "/(auth)/login")} />
    </AuthLayout>;
  }

  if (!authCapabilities.guestUpgrade) {
    return <AuthLayout title="게스트 계정 업그레이드" onBack={() => router.back()}>
      <Card style={styles.notice}>
        <Text style={styles.noticeTitle}>현재 서버에서는 지원하지 않아요</Text>
        <Text style={styles.noticeBody}>게스트 데이터를 유지한 회원 전환 API가 추가된 뒤 사용할 수 있어요. 지금은 별도 회원 계정으로 로그인하거나 가입해 주세요.</Text>
      </Card>
      <PrimaryButton label="회원가입" onPress={() => router.replace("/(auth)/signup-choice")} />
      <SecondaryButton label="로그인" onPress={() => router.replace("/(auth)/login")} />
    </AuthLayout>;
  }

  return <AuthLayout title="게스트 계정 업그레이드" subtitle="현재 여행방과 후보 데이터를 유지하면서 이메일 회원으로 전환해요." onBack={() => router.back()} footer={<PrimaryButton label="데이터 유지하고 회원 전환" loading={loading} onPress={submit} />} testID="guest-upgrade-screen">
    <Card style={styles.summary}><Text style={styles.summaryTitle}>{nickname}님의 참여 데이터는 그대로 유지돼요</Text><Text style={styles.noticeBody}>전환 후 여행방 생성, 일정 편집, 저장 장소, 두리 분석을 이용할 수 있어요.</Text></Card>
    <AuthTextField ref={emailRef} label="이메일" value={email} onChangeText={(value) => { setEmail(value); setErrors((old) => ({ ...old, email: undefined })); }} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
    <PasswordField ref={passwordRef} label="새 비밀번호" value={password} onChangeText={(value) => { setPassword(value); setErrors((old) => ({ ...old, password: undefined })); }} error={errors.password} helperText="12자 이상이며 이메일과 다른 비밀번호를 사용해 주세요." autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmationRef.current?.focus()} />
    <PasswordField ref={confirmationRef} label="새 비밀번호 확인" value={confirmation} onChangeText={(value) => { setConfirmation(value); setErrors((old) => ({ ...old, confirmation: undefined })); }} error={errors.confirmation} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} />
    <AuthErrorBanner message={serviceError} />
  </AuthLayout>;
}

const styles = StyleSheet.create({
  notice: { gap: spacing.sm, alignItems: "center", backgroundColor: colors.primarySoft },
  emoji: { fontSize: 40 },
  noticeTitle: { ...typography.subtitle, color: colors.text, textAlign: "center" },
  noticeBody: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  actions: { gap: spacing.sm },
  helper: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  summary: { gap: spacing.xs, backgroundColor: colors.successSoft },
  summaryTitle: { ...typography.bodyStrong, color: colors.success, textAlign: "center" },
});
