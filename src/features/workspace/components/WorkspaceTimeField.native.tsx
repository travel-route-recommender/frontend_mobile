import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { parseTimeToMinutes } from "../logic/workspaceDateTime";
import type { WorkspaceTimeFieldProps } from "./WorkspaceTimeField.types";

function timeToDate(value: string) {
  const minutes = parseTimeToMinutes(value);
  const safeMinutes = minutes === null || minutes >= 24 * 60 ? 23 * 60 + 30 : minutes;
  return new Date(2026, 0, 1, Math.floor(safeMinutes / 60), safeMinutes % 60, 0, 0);
}

export function WorkspaceTimeField({ label, value, onChange, error }: WorkspaceTimeFieldProps) {
  const [open, setOpen] = useState(false);
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value} 선택`}
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.button, Boolean(error) && styles.buttonError, pressed && styles.pressed]}
    >
      <Text style={styles.value}>{value}</Text><Text style={styles.action}>시간 선택</Text>
    </Pressable>
    {open ? <DateTimePicker
      value={timeToDate(value)}
      mode="time"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      is24Hour
      minuteInterval={30}
      onChange={(event, date) => {
        if (Platform.OS === "android") setOpen(false);
        if (event.type === "set" && date) {
          onChange(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
        }
      }}
    /> : null}
    {open && Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}><Text style={styles.doneText}>선택 완료</Text></Pressable> : null}
    <Text style={[styles.helper, Boolean(error) && styles.error]}>{error ?? "08:00~24:00 · 30분 단위"}</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.bodyStrong, color: colors.text },
  button: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  buttonError: { borderColor: colors.danger },
  value: { ...typography.body, color: colors.text },
  action: { ...typography.caption, color: colors.primary },
  helper: { ...typography.caption, color: colors.textSecondary },
  error: { color: colors.danger },
  done: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  doneText: { ...typography.bodyStrong, color: colors.primary },
  pressed: { opacity: 0.82 },
});

