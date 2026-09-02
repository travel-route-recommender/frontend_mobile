import { useEffect, useRef } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../../theme/tokens";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  scrollEnabled?: boolean;
  padded?: boolean;
  keyboardAware?: boolean;
  includeBottomSafeArea?: boolean;
  scrollResetKey?: string | number;
  header?: ReactNode;
  footer?: ReactNode;
  backgroundColor?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function Screen({ children, scroll = true, scrollEnabled = true, padded = true, keyboardAware = false, includeBottomSafeArea = true, scrollResetKey, header, footer, backgroundColor, contentContainerStyle, testID }: ScreenProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { height: windowHeight } = useWindowDimensions();
  const hasFixedFrame = Boolean(header || footer);

  useEffect(() => {
    if (!scroll || scrollResetKey === undefined) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scroll, scrollResetKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || !hasFixedFrame || typeof document === "undefined") return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    globalThis.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      globalThis.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    };
  }, [hasFixedFrame]);

  const contentStyle = [styles.content, !scroll && styles.fixedContent, padded && styles.padded, contentContainerStyle];
  const body = scroll ? (
    <ScrollView ref={scrollRef} style={header || footer ? styles.flex : undefined} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );
  const framedBody = header || footer ? <View style={styles.flex}>{header}{body}{footer}</View> : body;

  return (
    <SafeAreaView edges={includeBottomSafeArea ? ["top", "right", "bottom", "left"] : ["top", "right", "left"]} style={[styles.safeArea, Platform.OS === "web" && hasFixedFrame ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, height: windowHeight, maxHeight: windowHeight, overflow: "hidden" } : null, backgroundColor ? { backgroundColor } : null]} testID={testID}>
      {keyboardAware ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
          {framedBody}
        </KeyboardAvoidingView>
      ) : framedBody}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, minHeight: 0, backgroundColor: colors.background },
  flex: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1, width: "100%", alignSelf: "center" },
  fixedContent: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
});
