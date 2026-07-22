import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/tokens";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  scrollEnabled?: boolean;
  padded?: boolean;
  keyboardAware?: boolean;
  testID?: string;
}>;

export function Screen({ children, scroll = true, scrollEnabled = true, padded = true, keyboardAware = false, testID }: ScreenProps) {
  const contentStyle = [styles.content, padded && styles.padded];
  const body = scroll ? (
    <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={contentStyle}>{children}</View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea} testID={testID}>
      {keyboardAware ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          {body}
        </KeyboardAvoidingView>
      ) : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, width: "100%", alignSelf: "center" },
  padded: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
});
