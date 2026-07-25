import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  buildCalendarMonth,
  formatCalendarMonth,
  getInitialCalendarMonth,
  isDateInSelectedRange,
  moveCalendarMonth,
  selectTripDateRange,
} from "../logic/tripDateRange";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

type Props = {
  startDate: string | null;
  endDate: string | null;
  disabled?: boolean;
  onChange(startDate: string | null, endDate: string | null): void;
};

export function TripDateRangeCalendar({ startDate, endDate, disabled = false, onChange }: Props) {
  const [monthKey, setMonthKey] = useState(() => getInitialCalendarMonth(startDate));
  const cells = useMemo(() => buildCalendarMonth(monthKey), [monthKey]);

  return <View accessibilityLabel="여행 날짜 범위 달력" style={[styles.calendar, disabled && styles.disabled]}>
    <View style={styles.monthHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 달" disabled={disabled} onPress={() => setMonthKey((value) => moveCalendarMonth(value, -1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable>
      <Text style={styles.monthTitle}>{formatCalendarMonth(monthKey)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다음 달" disabled={disabled} onPress={() => setMonthKey((value) => moveCalendarMonth(value, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable>
    </View>
    <View style={styles.weekRow}>{weekdays.map((weekday, index) => <Text key={weekday} style={[styles.weekday, index === 0 && styles.sunday]}>{weekday}</Text>)}</View>
    <View style={styles.dayGrid}>{cells.map((cell, index) => {
      if (!cell.date || cell.dayNumber === null) return <View key={cell.key} style={styles.dayCell} />;
      const selected = cell.date === startDate || cell.date === endDate;
      const inRange = isDateInSelectedRange(cell.date, startDate, endDate);
      return <Pressable
        key={cell.key}
        accessibilityRole="button"
        accessibilityLabel={`${cell.date}${selected ? " 선택됨" : " 선택"}`}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => {
          const range = selectTripDateRange(startDate, endDate, cell.date ?? "");
          onChange(range.startDate, range.endDate);
        }}
        style={({ pressed }) => [styles.dayCell, inRange && styles.rangeDay, selected && styles.selectedDay, pressed && !disabled && styles.pressed]}
      ><Text style={[styles.dayText, index % 7 === 0 && styles.sunday, selected && styles.selectedDayText]}>{cell.dayNumber}</Text></Pressable>;
    })}</View>
    <Text style={styles.guide}>{!startDate ? "시작일을 선택해 주세요." : !endDate ? "종료일을 선택해 주세요. 같은 날을 누르면 당일치기예요." : "새 날짜를 누르면 범위를 다시 선택할 수 있어요."}</Text>
  </View>;
}

const styles = StyleSheet.create({
  calendar: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md },
  disabled: { opacity: 0.45 },
  monthHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  monthButtonText: { fontSize: 28, lineHeight: 30, color: colors.primary },
  monthTitle: { ...typography.subtitle, color: colors.text },
  weekRow: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", ...typography.caption, color: colors.textSecondary },
  dayGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  rangeDay: { backgroundColor: colors.primarySoft },
  selectedDay: { backgroundColor: colors.primary },
  dayText: { ...typography.body, color: colors.text },
  selectedDayText: { color: colors.white, fontWeight: "800" },
  sunday: { color: colors.danger },
  pressed: { opacity: 0.75 },
  guide: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
});
