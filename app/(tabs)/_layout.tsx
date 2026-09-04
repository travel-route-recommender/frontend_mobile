import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, sizes, typography } from "../../src/theme/tokens";
import { useAuthSessionStore } from "../../src/features/auth/store/useAuthSessionStore";
import { useDuriStore } from "../../src/store/useDuriStore";

const icons = {
  home: ["⌂", "⌂"], explore: ["○", "●"], trips: ["▢", "▣"], saved: ["♡", "♥"], mypage: ["○", "●"],
} as const;

function TabIcon({ name, focused, color }: { name: keyof typeof icons; focused: boolean; color: ColorValue }) { return <Text accessibilityElementsHidden style={[styles.icon, { color }]}>{icons[name][focused ? 1 : 0]}</Text>; }

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const currentSessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const profileCompleted = useAuthSessionStore((state) => state.profileCompleted);
  const onboardingIntroSeen = useAuthSessionStore((state) => state.onboardingIntroSeen);
  const sessionUserExists = useDuriStore((state) => currentSessionUserId ? Boolean(state.usersById[currentSessionUserId]) : false);
  if (!sessionKind) return <Redirect href="/(auth)/login" />;
  if (sessionKind !== "anonymous" && !currentSessionUserId) return <Redirect href="/" />;
  if (sessionKind !== "anonymous" && !sessionUserExists) return <Redirect href="/" />;
  if (sessionKind !== "anonymous" && !profileCompleted) return <Redirect href="/(onboarding)/profile" />;
  if (sessionKind !== "anonymous" && !onboardingIntroSeen) return <Redirect href="/(onboarding)/intro" />;
  return <Tabs initialRouteName="home" screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarHideOnKeyboard: true, tabBarLabelStyle: styles.label, tabBarStyle: [styles.bar, { height: sizes.tabBar + insets.bottom, paddingBottom: insets.bottom }] }}>
    <Tabs.Screen name="home" options={{ title: "홈", tabBarAccessibilityLabel: "홈 탭", tabBarIcon: (props) => <TabIcon name="home" {...props} /> }} />
    <Tabs.Screen name="explore" options={{ title: "탐색", tabBarAccessibilityLabel: "탐색 탭", tabBarIcon: (props) => <TabIcon name="explore" {...props} /> }} />
    <Tabs.Screen name="trips" options={{ title: "여행", tabBarAccessibilityLabel: "여행 탭", tabBarIcon: (props) => <TabIcon name="trips" {...props} /> }} />
    <Tabs.Screen name="saved" options={{ title: "저장", href: sessionKind === "guest" ? null : undefined, tabBarAccessibilityLabel: "저장 탭", tabBarIcon: (props) => <TabIcon name="saved" {...props} /> }} />
    <Tabs.Screen name="mypage" options={{ title: "마이", tabBarAccessibilityLabel: "마이 탭", tabBarIcon: (props) => <TabIcon name="mypage" {...props} /> }} />
  </Tabs>;
}
const styles = StyleSheet.create({ icon: { fontSize: 22, lineHeight: 24, fontWeight: "800" }, label: { ...typography.caption, fontSize: 11 }, bar: { paddingTop: 6, backgroundColor: colors.surface, borderTopColor: colors.border } });
