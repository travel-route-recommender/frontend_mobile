import type { PropsWithChildren } from "react";
import { Redirect, router, usePathname } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { colors, spacing, typography } from "../../../theme/tokens";
import type { RestrictedFeature } from "../services/guestAccessPolicy";
import { restrictedFeatureMessage } from "../services/guestAccessPolicy";
import { authCapabilities } from "../services/authService";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

type MemberOnlyRouteProps = PropsWithChildren<{
  feature: RestrictedFeature;
  title?: string;
}>;

export function MemberOnlyRoute({ children, feature, title = "회원 전용 화면이에요" }: MemberOnlyRouteProps) {
  const pathname = usePathname();
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);

  if (sessionKind === "member") return children;
  if (sessionKind !== "guest") {
    return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo: pathname } }} />;
  }

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  };

  return (
    <Screen scroll={false} testID="member-only-route">
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{restrictedFeatureMessage("guest", feature)}</Text>
        <View style={styles.actions}>
          <PrimaryButton
            label={authCapabilities.guestUpgrade ? "게스트 계정 업그레이드" : "회원가입"}
            onPress={() => router.push(authCapabilities.guestUpgrade ? "/(auth)/guest-upgrade" as never : "/(auth)/signup-email")}
          />
          <SecondaryButton label="허용된 화면으로 돌아가기" onPress={leave} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  title: { ...typography.title, color: colors.text, textAlign: "center" },
  description: { ...typography.body, color: colors.textSecondary, textAlign: "center", maxWidth: 420 },
  actions: { width: "100%", maxWidth: 420, gap: spacing.sm, marginTop: spacing.lg },
});
