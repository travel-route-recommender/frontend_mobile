import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function PreferenceOptionCard({ label, description, selected, onPress, disabled = false }: { label: string; description?: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={description ? `${label}. ${description}` : label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.card, selected && styles.selected, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Text style={styles.check}>✓</Text> : null}</View>
    <View style={styles.copy}><Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>{description ? <Text style={styles.description}>{description}</Text> : null}</View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  disabled: { opacity: 0.5 },
  radio: { width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  check: { color: colors.white, fontSize: 14, lineHeight: 16, fontWeight: "900" },
  copy: { flex: 1, minWidth: 0 },
  label: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  labelSelected: { color: colors.primary },
  description: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs, flexShrink: 1 },
});
