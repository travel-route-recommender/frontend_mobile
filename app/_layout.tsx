import { QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Screen } from "../src/components/common";
import { ErrorState, LoadingState } from "../src/components/feedback";
import { useAuthSessionHydration } from "../src/features/auth/hooks/useAuthSessionHydration";
import { useAuthSessionBootstrap } from "../src/features/auth/hooks/useAuthSessionBootstrap";
import { useAuthSessionStore } from "../src/features/auth/store/useAuthSessionStore";
import { usePreferenceDraftHydration } from "../src/features/preferences/hooks/usePreferenceDraftHydration";
import { useCreateTripDraftHydration } from "../src/features/trip-creation/hooks/useCreateTripDraftHydration";
import { normalizePreferenceResult } from "../src/duri/group-preferences";
import { queryClient } from "../src/query/queryClient";
import { useStoreHydration } from "../src/store/useStoreHydration";
import { useDuriStore } from "../src/store/useDuriStore";
import { colors } from "../src/theme/tokens";

export default function RootLayout() {
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><HydratedNavigator /></QueryClientProvider></SafeAreaProvider>;
}

function HydratedNavigator() {
  const domainHydration = useStoreHydration();
  const authHydration = useAuthSessionHydration();
  const preferenceDraftHydration = usePreferenceDraftHydration();
  const createTripDraftHydration = useCreateTripDraftHydration();
  const localHydrated = domainHydration.isHydrated && authHydration.isHydrated && preferenceDraftHydration.isHydrated && createTripDraftHydration.isHydrated;
  const sessionBootstrap = useAuthSessionBootstrap(localHydrated);
  const error = domainHydration.error ?? authHydration.error ?? preferenceDraftHydration.error ?? createTripDraftHydration.error ?? sessionBootstrap.error;
  if (error) return <Screen><ErrorState message={error.message} onRetry={() => { void Promise.all([domainHydration.retry(), authHydration.retry(), preferenceDraftHydration.retry(), createTripDraftHydration.retry()]); sessionBootstrap.retry(); }} /></Screen>;
  if (!localHydrated || !sessionBootstrap.isReady) return <View style={styles.loading}><LoadingState label="안전한 로그인 상태를 확인하고 있어요" /></View>;
  return <SessionAwareNavigator />;
}

function SessionAwareNavigator() {
  const pathname = usePathname();
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const sessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const preferenceTestCompleted = useAuthSessionStore((state) => state.preferenceTestCompleted);
  const setPreferenceTestCompleted = useAuthSessionStore((state) => state.setPreferenceTestCompleted);
  const domainUserId = useDuriStore((state) => state.currentUserId);
  const sessionUserExists = useDuriStore((state) => sessionUserId ? Boolean(state.usersById[sessionUserId]) : false);
  const hasSupportedPreferenceResult = useDuriStore((state) => sessionUserId ? Boolean(normalizePreferenceResult(state.preferenceResultsByUserId[sessionUserId], sessionUserId)) : false);
  const setCurrentUser = useDuriStore((state) => state.setCurrentUser);
  const expectedUserId = sessionKind === "member" || sessionKind === "guest" ? sessionUserId ?? "" : "";
  const shouldReconcile = domainUserId !== expectedUserId && (!expectedUserId || sessionUserExists);
  const shouldReconcilePreference = !shouldReconcile && Boolean(expectedUserId) && preferenceTestCompleted !== hasSupportedPreferenceResult;
  useEffect(() => { if (shouldReconcile) setCurrentUser(expectedUserId || null); }, [expectedUserId, setCurrentUser, shouldReconcile]);
  useEffect(() => { if (shouldReconcilePreference) setPreferenceTestCompleted(hasSupportedPreferenceResult); }, [hasSupportedPreferenceResult, setPreferenceTestCompleted, shouldReconcilePreference]);
  if (shouldReconcile || shouldReconcilePreference) return <View style={styles.loading}><LoadingState label="로그인과 성향 결과 상태를 맞추고 있어요" /></View>;
  const authenticated = sessionKind === "member" || sessionKind === "guest";
  const member = sessionKind === "member";
  const publicPath = pathname === "/" || pathname === "/login" || pathname === "/signup-choice" || pathname === "/signup-email" || pathname === "/terms" || pathname === "/invite" || pathname === "/guest-room-limit" || pathname.startsWith("/invite/") || pathname === "/+not-found";
  if (!authenticated && !publicPath) {
    return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo: pathname } }} />;
  }
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="(auth)" />
    <Stack.Screen name="invite/[code]" />
    <Stack.Protected guard={authenticated}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="tests" />
      <Stack.Screen name="trips/[tripId]" />
      <Stack.Screen name="explore" />
      <Stack.Screen name="places" />
    </Stack.Protected>
    <Stack.Protected guard={member}>
      <Stack.Screen name="trips/new" />
    </Stack.Protected>
  </Stack></>;
}
const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: colors.background } });
