import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Screen } from "../src/components/common";
import { ErrorState, LoadingState } from "../src/components/feedback";
import { useAuthSessionHydration } from "../src/features/auth/hooks/useAuthSessionHydration";
import { useAuthSessionStore } from "../src/features/auth/store/useAuthSessionStore";
import { usePreferenceDraftHydration } from "../src/features/preferences/hooks/usePreferenceDraftHydration";
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
  const error = domainHydration.error ?? authHydration.error ?? preferenceDraftHydration.error;
  if (error) return <Screen><ErrorState message={error.message} onRetry={() => { void Promise.all([domainHydration.retry(), authHydration.retry(), preferenceDraftHydration.retry()]); }} /></Screen>;
  if (!domainHydration.isHydrated || !authHydration.isHydrated || !preferenceDraftHydration.isHydrated) return <View style={styles.loading}><LoadingState label="두리와 여행 정보를 준비하고 있어요" /></View>;
  return <SessionAwareNavigator />;
}

function SessionAwareNavigator() {
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
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></>;
}
const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: colors.background } });
