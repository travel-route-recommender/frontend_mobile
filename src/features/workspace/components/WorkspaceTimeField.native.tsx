import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { WORKSPACE_END_MINUTES } from "../../../data/workspaceSchedule";
import { formatMinutesToTime, parseTimeToMinutes } from "../logic/workspaceDateTime";
import type { WorkspaceTimeFieldProps } from "./WorkspaceTimeField.types";

function timeToDate(value: string, minuteInterval: 1 | 15) {
  const minutes = parseTimeToMinutes(value);
  const safeMinutes = minutes === null || minutes >= WORKSPACE_END_MINUTES
    ? WORKSPACE_END_MINUTES - minuteInterval
    : minutes;
  return new Date(2026, 0, 1, Math.floor(safeMinutes / 60), safeMinutes % 60, 0, 0);
}

function dateToSnappedTime(date: Date, minuteInterval: 1 | 15) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const snapped = Math.min(
    Math.round(minutes / minuteInterval) * minuteInterval,
    WORKSPACE_END_MINUTES,
  );
  return formatMinutesToTime(snapped) ?? "00:00";
}

export function WorkspaceTimeField({ label, value, onChange, error, allowEndOfDay = false, minuteInterval = 1 }: WorkspaceTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const maximum = allowEndOfDay ? "24:00" : "23:59";
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
      value={timeToDate(value, minuteInterval)}
      mode="time"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      is24Hour
      minuteInterval={minuteInterval}
      onChange={(event, date) => {
        if (Platform.OS === "android") setOpen(false);
        if (event.type === "set" && date) {
          onChange(dateToSnappedTime(date, minuteInterval));
        }
      }}
    /> : null}
    {open && Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}><Text style={styles.doneText}>선택 완료</Text></Pressable> : null}
    {allowEndOfDay ? <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: value === "24:00" }}
      accessibilityLabel="종료 시간을 24시 자정으로 설정"
      onPress={() => { onChange("24:00"); setOpen(false); }}
      style={({ pressed }) => [styles.endOfDay, value === "24:00" && styles.endOfDaySelected, pressed && styles.pressed]}
    ><Text style={[styles.endOfDayText, value === "24:00" && styles.endOfDayTextSelected]}>24:00 · 자정에 종료</Text></Pressable> : null}
    <Text style={[styles.helper, Boolean(error) && styles.error]}>{error ?? `00:00~${maximum} · ${minuteInterval}분 단위 직접 설정`}</Text>
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
  endOfDay: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  endOfDaySelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  endOfDayText: { ...typography.caption, color: colors.textSecondary },
  endOfDayTextSelected: { color: colors.primary },
  pressed: { opacity: 0.82 },
});
