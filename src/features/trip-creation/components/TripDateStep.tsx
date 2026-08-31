import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDurationLabel } from "../../trips/utils/tripDateUtils";
import { createTripColors } from "../presentation/createTripTheme";
import { TripDateRangeCalendar } from "./TripDateRangeCalendar";

type Props = {
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  onDateRangeChange(startDate: string | null, endDate: string | null): void;
  onDateUndecidedChange(value: boolean): void;
};

function formatSummaryDate(value: string | null) {
  if (!value) return "선택 전";
  const [, month, day] = value.split("-").map(Number);
  if (!month || !day) return "선택 전";
  return `${month}월 ${day}일`;
}

export function TripDateStep({ startDate, endDate, dateUndecided, onDateRangeChange, onDateUndecidedChange }: Props) {
  const hasRange = Boolean(startDate && endDate);
  return <View style={styles.stack}>
    <View style={[styles.summary, dateUndecided && styles.summaryUndecided]}>
      <View style={styles.dateColumn}><Text style={styles.dateLabel}>출발일</Text><Text style={styles.dateValue}>{dateUndecided ? "날짜 미정" : formatSummaryDate(startDate)}</Text></View>
      <Text style={styles.arrow}>→</Text>
      <View style={styles.dateColumn}><Text style={styles.dateLabel}>도착일</Text><Text style={styles.dateValue}>{dateUndecided ? "날짜 미정" : formatSummaryDate(endDate)}</Text></View>
      <View style={styles.durationPill}><Text style={styles.durationText}>{dateUndecided ? "Day 1부터 시작" : hasRange ? formatTripDurationLabel(startDate, endDate) : "기간 선택 전"}</Text></View>
    </View>
    <TripDateRangeCalendar startDate={startDate} endDate={endDate} disabled={dateUndecided} onChange={onDateRangeChange} />
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: dateUndecided }}
      onPress={() => onDateUndecidedChange(!dateUndecided)}
      style={({ pressed }) => [styles.undecided, dateUndecided && styles.undecidedSelected, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, dateUndecided && styles.checkboxSelected]}><Text style={styles.checkmark}>{dateUndecided ? "✓" : ""}</Text></View>
      <View style={styles.copy}><Text style={styles.bodyStrong}>아직 날짜를 정하지 않았어요</Text><Text style={styles.caption}>날짜 없이 Day 1부터 여행방을 준비할 수 있어요.</Text></View>
    </Pressable>
    <Text style={styles.guide}>첫 선택은 출발일, 두 번째 선택은 도착일이에요. 지난 여행 날짜도 선택할 수 있어요.</Text>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  summary: { position: "relative", minHeight: 106, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 38, borderWidth: 1, borderColor: createTripColors.blueBorder, borderRadius: 18, backgroundColor: createTripColors.blueSurface },
  summaryUndecided: { borderColor: createTripColors.lavenderBorder, backgroundColor: createTripColors.lavenderSurface },
  dateColumn: { flex: 1, gap: 3 },
  dateLabel: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: createTripColors.muted },
  dateValue: { fontSize: 15, lineHeight: 20, fontWeight: "800", color: createTripColors.text },
  arrow: { fontSize: 19, lineHeight: 22, fontWeight: "600", color: colors.primary },
  durationPill: { position: "absolute", left: spacing.md, bottom: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.white },
  durationText: { fontSize: 11, lineHeight: 15, fontWeight: "800", color: colors.primary },
  undecided: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: createTripColors.border, borderRadius: radius.md, backgroundColor: createTripColors.page, padding: spacing.md },
  undecidedSelected: { borderColor: colors.primary, backgroundColor: createTripColors.blueSurface },
  checkbox: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: createTripColors.border, borderRadius: 7 },
  checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: colors.white, fontWeight: "800" },
  copy: { flex: 1, gap: spacing.xxs },
  bodyStrong: { ...typography.bodyStrong, color: createTripColors.text },
  caption: { ...typography.caption, color: createTripColors.secondary },
  guide: { ...typography.caption, color: createTripColors.secondary, textAlign: "center" },
  pressed: { opacity: 0.84 },
});
