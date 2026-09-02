import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TextInputProps } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, shadows, sizes, spacing, typography } from "../../../theme/tokens";
import { toKoreanAuthErrorMessage } from "../services/authErrorMessage";

type AuthTextFieldProps = TextInputProps & { label: string; error?: string; helperText?: string; trailing?: ReactNode };

export const AuthTextField = forwardRef<TextInput, AuthTextFieldProps>(function AuthTextField({ label, error, helperText, trailing, style, ...props }, ref) {
  const helper = error ?? helperText;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, Boolean(error) && styles.inputError]}>
        <TextInput ref={ref} {...props} accessibilityLabel={props.accessibilityLabel ?? label} accessibilityHint={helper} placeholderTextColor={colors.textMuted} style={[styles.input, style]} />
        {trailing}
      </View>
      {helper ? <Text accessibilityLiveRegion="polite" style={[styles.helper, Boolean(error) && styles.errorText]}>{helper}</Text> : null}
    </View>
  );
});

export const PasswordField = forwardRef<TextInput, Omit<AuthTextFieldProps, "secureTextEntry" | "trailing">>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return <AuthTextField ref={ref} {...props} secureTextEntry={!visible} trailing={<Pressable accessibilityRole="button" accessibilityLabel={visible ? "비밀번호 숨기기" : "비밀번호 보기"} hitSlop={8} onPress={() => setVisible((value) => !value)} style={styles.trailingButton}><Text style={styles.trailingText}>{visible ? "숨김" : "보기"}</Text></Pressable>} />;
});

export function SocialButton({ provider, onPress, disabled = false, label: customLabel, testID }: { provider: "kakao" | "google"; onPress: () => void | Promise<void>; disabled?: boolean; label?: string; testID?: string }) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const label = customLabel ?? (provider === "kakao" ? "카카오로 계속하기" : "Google로 계속하기");
  const blocked = disabled || pending;
  const handlePress = async () => {
    if (blocked || lock.current) return;
    lock.current = true; setPending(true);
    try { await onPress(); } finally { setPending(false); lock.current = false; }
  };
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: blocked, busy: pending }} disabled={blocked} onPress={handlePress} style={({ pressed }) => [styles.social, provider === "kakao" ? styles.kakao : styles.google, blocked && styles.disabled, pressed && styles.pressed]}>{pending ? <ActivityIndicator color="#191919" /> : <Text style={[styles.socialMark, provider === "google" && styles.googleMark]}>{provider === "kakao" ? "●" : "G"}</Text>}<Text style={styles.socialText}>{label}</Text></Pressable>;
}

export function KakaoButton({ onPress, disabled = false, label, testID }: { onPress: () => void | Promise<void>; disabled?: boolean; label?: string; testID?: string }) {
  return <SocialButton provider="kakao" onPress={onPress} disabled={disabled} label={label} testID={testID} />;
}

export function GoogleButton({ onPress, disabled = false }: { onPress: () => void | Promise<void>; disabled?: boolean }) {
  return <SocialButton provider="google" onPress={onPress} disabled={disabled} />;
}

export function TermsCheckbox({ checked, label, onToggle, onView }: { checked: boolean; label: string; onToggle: () => void; onView?: () => void }) {
  return (
    <View style={styles.termsRow}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onToggle} style={styles.termsToggle}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}><Text style={styles.checkmark}>{checked ? "✓" : ""}</Text></View>
        <Text style={styles.termsLabel}>{label}</Text>
      </Pressable>
      {onView ? <Pressable accessibilityRole="button" accessibilityLabel={`${label} 보기`} hitSlop={8} onPress={onView}><Text style={styles.link}>보기</Text></Pressable> : null}
    </View>
  );
}

export function AuthDivider({ label = "또는" }: { label?: string }) {
  return <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>{label}</Text><View style={styles.divider} /></View>;
}

export function AuthErrorBanner({ message }: { message?: string | null }) {
  return message ? <View accessibilityLiveRegion="assertive" style={styles.errorBanner}><Text style={styles.errorBannerText}>{toKoreanAuthErrorMessage(message)}</Text></View> : null;
}

export function AuthErrorToast({ message, onDismiss, duration = 3000 }: { message?: string | null; onDismiss: () => void; duration?: number }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, message, onDismiss]);

  if (!message) return null;
  return <View testID="auth-error-toast" accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorToast}><Text style={styles.errorToastText}>{toKoreanAuthErrorMessage(message)}</Text><Pressable accessibilityRole="button" accessibilityLabel="오류 메시지 닫기" hitSlop={8} onPress={onDismiss} style={styles.errorToastClose}><Text style={styles.errorToastCloseText}>×</Text></Pressable></View>;
}

export function OnboardingProgress({ current, total }: { current: number; total: number }) {
  const ratio = Math.max(0, Math.min(1, current / total));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: current }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${ratio * 100}%` }]} /></View>;
}

export function AvatarOption({ emoji, selected, onPress }: { emoji: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${emoji} 아바타`} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.avatar, selected && styles.avatarSelected, pressed && styles.pressed]}><Text style={styles.avatarEmoji}>{emoji}</Text>{selected ? <View style={styles.avatarCheck}><Text style={styles.avatarCheckText}>✓</Text></View> : null}</Pressable>;
}

const styles = StyleSheet.create({
  fieldWrap: { gap: spacing.xs },
  fieldLabel: { ...typography.bodyStrong, color: colors.text },
  inputRow: { minHeight: 54, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 52, paddingHorizontal: spacing.md, ...typography.body, color: colors.text },
  inputError: { borderColor: colors.danger },
  helper: { ...typography.caption, color: colors.textSecondary },
  errorText: { color: colors.danger },
  trailingButton: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center", marginRight: spacing.xxs },
  trailingText: { ...typography.caption, color: colors.primary },
  social: { minHeight: 54, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  kakao: { backgroundColor: "#FEE500" },
  google: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  socialMark: { color: "#191919", fontSize: 13, fontWeight: "900" },
  googleMark: { color: "#4285F4", fontSize: 18 },
  socialText: { ...typography.button, color: "#191919" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  termsRow: { minHeight: sizes.touch, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  termsToggle: { flex: 1, minHeight: sizes.touch, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontWeight: "800" },
  termsLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  link: { ...typography.caption, color: colors.primary, textDecorationLine: "underline" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.textMuted },
  errorBanner: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.dangerSoft },
  errorBannerText: { ...typography.caption, color: colors.danger },
  errorToast: { width: "100%", maxWidth: sizes.contentMaxWidth, minHeight: sizes.touch, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.md, borderRadius: radius.md, backgroundColor: colors.danger, ...shadows.floating },
  errorToastText: { ...typography.bodyStrong, color: colors.white, flex: 1, paddingVertical: spacing.sm },
  errorToastClose: { width: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center" },
  errorToastCloseText: { color: colors.white, fontSize: 24, lineHeight: 26 },
  progressTrack: { width: "100%", height: 6, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  avatar: { width: 58, height: 58, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  avatarSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  avatarEmoji: { fontSize: 28 },
  avatarCheck: { position: "absolute", right: -2, bottom: -2, width: 20, height: 20, borderRadius: radius.pill, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarCheckText: { color: colors.white, fontSize: 11, lineHeight: 12, fontWeight: "800" },
});
