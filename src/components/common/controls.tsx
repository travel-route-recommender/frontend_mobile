import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { KeyboardTypeOptions, TextInputProps } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, sizes, spacing, typography } from "../../theme/tokens";

type ButtonProps = {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  icon?: ReactNode;
};

function ActionButton({ label, onPress, disabled = false, loading = false, accessibilityLabel, icon, secondary = false }: ButtonProps & { secondary?: boolean }) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  const blocked = disabled || busy;

  const handlePress = async () => {
    if (blocked || lock.current) return;
    lock.current = true;
    try {
      const result = onPress();
      if (result instanceof Promise) {
        setPending(true);
        await result;
      }
    } finally {
      setPending(false);
      lock.current = false;
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={handlePress}
      style={({ pressed }) => [styles.button, secondary ? styles.secondary : styles.primary, blocked && styles.disabled, pressed && !blocked && styles.pressed]}
    >
      {busy ? <ActivityIndicator color={secondary ? colors.primary : colors.white} /> : icon}
      <Text style={[styles.buttonLabel, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps) { return <ActionButton {...props} />; }
export function SecondaryButton(props: ButtonProps) { return <ActionButton {...props} secondary />; }

export function IconButton({ label, icon, onPress, disabled = false }: { label: string; icon: ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, pressed && styles.pressed]}>
      {icon}
    </Pressable>
  );
}

type FieldProps = Pick<TextInputProps, "autoCapitalize" | "autoComplete" | "multiline" | "maxLength" | "returnKeyType"> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  helperText?: string;
  accessibilityLabel?: string;
};

export function TextField({ label, error, helperText, accessibilityLabel, ...inputProps }: FieldProps) {
  const helper = error ?? helperText;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={helper}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, inputProps.multiline && styles.multiline, Boolean(error) && styles.inputError]}
      />
      {helper ? <Text style={[styles.helper, Boolean(error) && styles.error]}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.xs },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  buttonLabel: { ...typography.button, color: colors.white },
  secondaryLabel: { color: colors.primary },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  iconButton: { width: sizes.touch, height: sizes.touch, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  fieldWrap: { gap: spacing.xs },
  fieldLabel: { ...typography.bodyStrong, color: colors.text },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, ...typography.body },
  multiline: { minHeight: 104, paddingTop: spacing.md, textAlignVertical: "top" },
  inputError: { borderColor: colors.danger },
  helper: { ...typography.caption, color: colors.textSecondary },
  error: { color: colors.danger },
});
