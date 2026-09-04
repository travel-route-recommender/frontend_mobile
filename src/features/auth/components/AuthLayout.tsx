import type { PropsWithChildren, ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, sizes, spacing, typography } from "../../../theme/tokens";

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  footer?: ReactNode;
  overlay?: ReactNode;
  testID?: string;
}>;

export function AuthLayout({ children, title, subtitle, onBack, footer, overlay, testID }: Props) {
  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.safeArea} testID={testID}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.topBar}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={8} onPress={onBack} style={styles.backButton}>
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          ) : <View style={styles.backButton} />}
        </View>
        <ScrollView contentContainerStyle={[styles.content, footer ? styles.withFooter : undefined]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
        {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: sizes.touch, height: sizes.touch, alignItems: "center", justifyContent: "center" },
  backIcon: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: "300" },
  content: { flexGrow: 1, width: "100%", maxWidth: sizes.contentMaxWidth, alignSelf: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  withFooter: { paddingBottom: spacing.lg },
  title: { ...typography.display, color: colors.text, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  body: { flex: 1, marginTop: spacing.xl, gap: spacing.md },
  footer: { width: "100%", maxWidth: sizes.contentMaxWidth, alignSelf: "center", paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  overlay: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, zIndex: 20, alignItems: "center", paddingHorizontal: spacing.xl, pointerEvents: "box-none" },
});
