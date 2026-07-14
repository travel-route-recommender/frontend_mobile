import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import type { WorkspaceDate } from "../types";

export function WorkspaceDateTabs({
  dates,
  selectedDate,
  onSelect,
}: {
  dates: readonly WorkspaceDate[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  return <View accessibilityRole="tablist" style={styles.wrap}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {dates.map((date) => {
        const selected = date.date === selectedDate;
        return <Pressable
          key={date.date}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          accessibilityLabel={`${date.dayLabel} ${date.monthDayLabel} ${date.weekdayLabel}, 일정 ${date.itineraryCount}개`}
          onPress={() => onSelect(date.date)}
          style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}
        >
          <Text style={[styles.day, selected && styles.textSelected]}>{date.dayLabel}</Text>
          <Text style={[styles.date, selected && styles.textSelected]}>{date.monthDayLabel} {date.weekdayLabel}</Text>
          <Text style={[styles.count, selected && styles.countSelected]}>{date.itineraryCount}개 일정</Text>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.lg },
  content: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  tab: { minWidth: 112, minHeight: sizes.touch, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  day: { ...typography.caption, color: colors.primary },
  date: { ...typography.bodyStrong, color: colors.text },
  count: { ...typography.caption, color: colors.textMuted },
  countSelected: { color: colors.primarySoft },
  textSelected: { color: colors.white },
  pressed: { opacity: 0.82 },
});

