import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { dateOnlyToLocalDate, dateToDateOnly } from "../../trips/utils/tripDateUtils";
import type { TripDatePickerProps } from "./TripDatePicker.types";

export function TripDatePicker({ label, value, minimumDate, onChange }: TripDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = dateOnlyToLocalDate(value);
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value} 선택`} onPress={() => setOpen(true)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.value}>{value}</Text><Text style={styles.calendar}>달력</Text>
    </Pressable>
    {open ? <DateTimePicker
      value={selectedDate}
      mode="date"
      display={Platform.OS === "ios" ? "inline" : "default"}
      minimumDate={minimumDate ? dateOnlyToLocalDate(minimumDate) : undefined}
      onChange={(event, date) => {
        if (Platform.OS === "android") setOpen(false);
        if (event.type === "set" && date) onChange(dateToDateOnly(date));
      }}
    /> : null}
    {open && Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}><Text style={styles.doneText}>선택 완료</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.bodyStrong, color: colors.text },
  button: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  value: { ...typography.body, color: colors.text },
  calendar: { ...typography.caption, color: colors.primary },
  done: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  doneText: { ...typography.bodyStrong, color: colors.primary },
  pressed: { opacity: 0.82 },
});

