import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../../../theme/tokens";

export function DuriScrollPage({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  return <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea} testID={testID}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function DuriStickyPage({ children, footer, testID }: PropsWithChildren<{ footer: ReactNode; testID?: string }>) {
  const insets = useSafeAreaInsets();
  return <SafeAreaView edges={["top", "right", "left"]} style={styles.safeArea} testID={testID}>
    <View style={styles.fixed}>
      <ScrollView contentContainerStyle={styles.stickyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>{footer}</View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  fixed: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, backgroundColor: colors.surface },
  stickyContent: { flexGrow: 1, gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surface },
  footer: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
