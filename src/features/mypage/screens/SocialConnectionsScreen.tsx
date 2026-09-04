import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AppHeader, Card, PrimaryButton, Screen } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AuthErrorBanner, KakaoButton } from "../../auth/components/AuthControls";
import { authCapabilities, authService } from "../../auth/services/authService";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";

export function SocialConnectionsScreen() {
  const provider = useAuthSessionStore((state) => state.provider);
  const [linked, setLinked] = useState(provider === "kakao");
  const [error, setError] = useState<string | null>(null);
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/mypage");
  };

  const linkKakao = async () => {
    setError(null);
    const result = await authService.linkSocialIdentity("kakao");
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setLinked(true);
  };

  if (!authCapabilities.socialIdentityLinking) {
    return (
      <Screen testID="social-connections-screen">
        <AppHeader title="로그인 수단" subtitle="현재 계정으로 로그인한 방법을 확인해요" onBack={leave} />
        <Card style={styles.providerCard}>
          <Text style={styles.providerName}>{provider === "kakao" ? "카카오 계정으로 로그인했어요" : "이메일로 로그인했어요"}</Text>
          <Text style={styles.noticeText}>로그아웃한 뒤에도 같은 방법으로 다시 로그인할 수 있어요.</Text>
          <PrimaryButton label="마이페이지로 돌아가기" onPress={leave} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="social-connections-screen">
      <AppHeader title="로그인 수단" subtitle="계정에 연결된 로그인 방법을 관리해요" onBack={leave} />
      <Card style={styles.providerCard}>
        <View style={styles.providerRow}>
          <View style={styles.kakaoMark}><Text style={styles.kakaoMarkText}>K</Text></View>
          <View style={styles.providerCopy}>
            <Text style={styles.providerName}>카카오</Text>
            <Text style={styles.providerDescription}>{linked ? "카카오 계정으로 로그인할 수 있어요." : "카카오 계정을 로그인 수단으로 추가할 수 있어요."}</Text>
          </View>
          <View style={[styles.status, linked && styles.statusLinked]}>
            <Text style={[styles.statusText, linked && styles.statusTextLinked]}>{linked ? "연결됨" : "미연결"}</Text>
          </View>
        </View>
        {linked
          ? <PrimaryButton label="마이페이지로 돌아가기" onPress={leave} />
          : <KakaoButton testID="link-kakao-button" label="카카오 계정 연결하기" onPress={linkKakao} />}
      </Card>
      <AuthErrorBanner message={error} />
      <View style={styles.notice}>
        <Text style={styles.noticeText}>다른 두리 계정에 이미 연결된 카카오 계정은 연결할 수 없어요.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  providerCard: { gap: spacing.lg },
  providerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kakaoMark: { width: 44, height: 44, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: "#FEE500" },
  kakaoMarkText: { ...typography.bodyStrong, color: "#191919" },
  providerCopy: { flex: 1, gap: spacing.xxs },
  providerName: { ...typography.subtitle, color: colors.text },
  providerDescription: { ...typography.caption, color: colors.textSecondary },
  status: { minWidth: 58, alignItems: "center", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surfaceMuted },
  statusLinked: { backgroundColor: colors.primarySoft },
  statusText: { ...typography.caption, color: colors.textSecondary },
  statusTextLinked: { color: colors.primary },
  notice: { borderRadius: radius.sm, padding: spacing.md, backgroundColor: colors.surfaceMuted },
  noticeText: { ...typography.caption, color: colors.textSecondary },
});
