import { Redirect } from "expo-router";
import { Screen } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { useAuthFlow } from "../hooks/useAuthFlow";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export function SessionBootstrapScreen() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const userId = useAuthSessionStore((state) => state.currentSessionUserId);
  const profileCompleted = useAuthSessionStore((state) => state.profileCompleted);
  const introSeen = useAuthSessionStore((state) => state.onboardingIntroSeen);
  const authHydrated = useAuthSessionStore((state) => state.isHydrated);
  const userExists = useDuriStore((state) => userId ? Boolean(state.usersById[userId]) : false);
  const { logout } = useAuthFlow();
  if (!authHydrated) return <Screen scroll={false}><LoadingState label="두리를 준비하고 있어요." /></Screen>;
  if (!sessionKind) return <Redirect href="/(auth)/login" />;
  if (sessionKind === "anonymous") return <Redirect href="/(auth)/login" />;
  if (!userExists) return <Screen scroll={false}><ErrorState message="저장된 세션과 사용자 정보가 일치하지 않아요." onRetry={logout} /></Screen>;
  if (!profileCompleted) return <Redirect href="/(onboarding)/profile" />;
  if (!introSeen) return <Redirect href="/(onboarding)/intro" />;
  return <Redirect href="/(tabs)/home" />;
}
