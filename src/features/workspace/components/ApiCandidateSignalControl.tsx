import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedCandidateMemberSignal } from "../../../duri/duri-analysis";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";

type CandidateSignalPatch = {
  mustVisit?: boolean;
  avoid?: boolean;
  preferenceStrength?: 1 | 2 | 3 | 4 | 5;
};

const strengths = [1, 2, 3, 4, 5] as const;

export function ApiCandidateSignalControl({
  signal,
  disabled,
  onChange,
}: {
  signal?: SharedCandidateMemberSignal;
  disabled: boolean;
  onChange: (patch: CandidateSignalPatch) => void;
}) {
  return <View style={styles.wrap} accessibilityLabel="내 후보 의견">
    <View style={styles.row}>
      <Text style={styles.label}>내 의견</Text>
      <SignalButton
        label="꼭 가기"
        selected={signal?.mustVisit === true}
        disabled={disabled}
        onPress={() => onChange({
          mustVisit: signal?.mustVisit !== true,
          ...(signal?.mustVisit === true ? {} : { avoid: false }),
        })}
      />
      <SignalButton
        label="피하기"
        selected={signal?.avoid === true}
        danger
        disabled={disabled}
        onPress={() => onChange({
          avoid: signal?.avoid !== true,
          ...(signal?.avoid === true ? {} : { mustVisit: false }),
        })}
      />
    </View>
    <View style={styles.row}>
      <Text style={styles.label}>선호도</Text>
      {strengths.map((strength) => <Pressable
        key={strength}
        accessibilityRole="button"
        accessibilityLabel={`선호도 ${strength}점`}
        accessibilityState={{ selected: signal?.preferenceStrength === strength, disabled }}
        disabled={disabled}
        onPress={() => onChange({ preferenceStrength: strength })}
        style={({ pressed }) => [
          styles.strength,
          signal?.preferenceStrength === strength && styles.strengthSelected,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      ><Text style={[styles.strengthText, signal?.preferenceStrength === strength && styles.selectedText]}>{strength}</Text></Pressable>)}
    </View>
  </View>;
}

function SignalButton({
  label,
  selected,
  danger = false,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  danger?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.signal,
      selected && (danger ? styles.signalDanger : styles.signalSelected),
      pressed && styles.pressed,
      disabled && styles.disabled,
    ]}
  ><Text style={[styles.signalText, selected && (danger ? styles.dangerText : styles.selectedText)]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  row: { minHeight: sizes.touch, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  label: { width: 48, ...typography.caption, color: colors.textSecondary },
  signal: { minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  signalSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  signalDanger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  signalText: { ...typography.caption, color: colors.textSecondary },
  selectedText: { color: colors.white },
  dangerText: { color: colors.danger },
  strength: { width: 36, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  strengthSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  strengthText: { ...typography.caption, color: colors.textSecondary },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.45 },
});
