import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { formatTripDurationLabel } from "../../trips/utils/tripDateUtils";
import { TripDateRangeCalendar } from "./TripDateRangeCalendar";

type Props = {
  startDate: string | null;
  endDate: string | null;
  dateUndecided: boolean;
  onDateRangeChange(startDate: string | null, endDate: string | null): void;
  onDateUndecidedChange(value: boolean): void;
};

export function TripDateStep({ startDate, endDate, dateUndecided, onDateRangeChange, onDateUndecidedChange }: Props) {
  const hasRange = Boolean(startDate && endDate);
  return <View style={styles.stack}>
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: dateUndecided }}
      onPress={() => onDateUndecidedChange(!dateUndecided)}
      style={({ pressed }) => [styles.undecided, dateUndecided && styles.undecidedSelected, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, dateUndecided && styles.checkboxSelected]}><Text style={styles.checkmark}>{dateUndecided ? "✓" : ""}</Text></View>
      <View style={styles.copy}><Text style={styles.bodyStrong}>날짜는 아직 정하지 않았어요</Text><Text style={styles.caption}>여행방은 날짜 미정 Day 1부터 준비할 수 있어요.</Text></View>
    </Pressable>
    <TripDateRangeCalendar startDate={startDate} endDate={endDate} disabled={dateUndecided} onChange={onDateRangeChange} />
    <Card style={styles.summaryBox}>
      {dateUndecided ? <><Text style={styles.sectionTitle}>날짜 미정</Text><Text style={styles.body}>Day 1 하나로 시작하며 실제 날짜는 나중에 정할 수 있어요.</Text></>
        : hasRange ? <><Text style={styles.sectionTitle}>{formatTripDurationLabel(startDate, endDate)}</Text><Text style={styles.body}>{formatTripDateRange(startDate, endDate)}</Text></>
          : <><Text style={styles.sectionTitle}>여행 날짜를 선택해 주세요</Text><Text style={styles.body}>첫 선택은 시작일, 두 번째 선택은 종료일로 저장돼요.</Text></>}
    </Card>
    <Text style={styles.caption}>지난 여행 기록용 날짜도 선택할 수 있어요. 저장값은 시간대가 없는 YYYY-MM-DD 형식입니다.</Text>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  undecided: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md },
  undecidedSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  checkbox: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.borderStrong, borderRadius: 7 },
  checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: colors.white, fontWeight: "800" },
  copy: { flex: 1, gap: spacing.xxs },
  summaryBox: { backgroundColor: colors.primarySoft, gap: spacing.xxs },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
  bodyStrong: { ...typography.bodyStrong, color: colors.text },
  caption: { ...typography.caption, color: colors.textSecondary },
  pressed: { opacity: 0.84 },
});
