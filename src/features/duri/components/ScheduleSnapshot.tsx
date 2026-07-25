import { StyleSheet, Text, View } from "react-native";
import type { Place } from "../../../domain";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getEndTime, getTripDates } from "../../../utils/schedule";
import type { ItinerarySnapshotItem } from "../types";

export function ScheduleSnapshot({ label, items, placesById, startDate, endDate }: { label: string; items: ItinerarySnapshotItem[]; placesById: Record<string, Place>; startDate: string | null; endDate: string | null }) {
  return <View accessibilityLabel={label} style={styles.card}><Text style={styles.heading}>{label}</Text>{getTripDates(startDate, endDate).map((date) => {
    const dayItems = items.filter((item) => item.date === date);
    return <View key={date} style={styles.day}><Text style={styles.date}>{date}</Text>{dayItems.length ? dayItems.map((item) => <View key={item.id} style={styles.item}><Text style={styles.order}>{item.order + 1}</Text><View style={styles.copy}><Text style={styles.name}>{item.placeId ? placesById[item.placeId]?.name ?? "알 수 없는 장소" : item.note ?? "일정"}</Text><Text style={styles.time}>{item.startTime}~{getEndTime(item.startTime, item.durationMinutes)} · {item.durationMinutes}분</Text></View></View>) : <Text style={styles.empty}>일정 없음</Text>}</View>;
  })}</View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  heading: { ...typography.subtitle, color: colors.text },
  day: { gap: spacing.xs },
  date: { ...typography.caption, color: colors.primary },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  order: { width: 24, height: 24, textAlign: "center", textAlignVertical: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft, ...typography.caption, color: colors.primary },
  copy: { flex: 1, gap: spacing.xxs },
  name: { ...typography.bodyStrong, color: colors.text },
  time: { ...typography.caption, color: colors.textSecondary },
  empty: { ...typography.caption, color: colors.textMuted },
});
