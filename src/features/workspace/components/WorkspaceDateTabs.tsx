import { useEffect, useRef } from "react";
import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import type { WorkspaceDate } from "../types";

export function WorkspaceDateTabs({
  dates,
  selectedDate,
  onSelect,
  onAddDay,
  addDisabled = false,
}: {
  dates: readonly WorkspaceDate[];
  selectedDate: string;
  onSelect: (date: string) => void;
  onAddDay: () => void;
  addDisabled?: boolean;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    const selectedIndex = dates.findIndex((date) => date.date === selectedDate);
    if (selectedIndex < 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(selectedIndex * 120 - 16, 0), animated: true });
  }, [dates, selectedDate]);

  return <View accessibilityRole="tablist" style={styles.wrap}>
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {dates.map((date) => {
        const selected = date.date === selectedDate;
        return <Pressable
          key={date.date}
          testID={`workspace-day-tab-${date.date}`}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="마지막 Day 다음에 여행일 추가"
        accessibilityState={{ disabled: addDisabled }}
        disabled={addDisabled}
        onPress={onAddDay}
        testID="workspace-add-day"
        style={({ pressed }) => [styles.addTab, addDisabled && styles.disabled, pressed && !addDisabled && styles.pressed]}
      >
        <Text style={styles.addSymbol}>+</Text>
        <Text style={styles.addLabel}>DAY 추가</Text>
      </Pressable>
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
  addTab: { width: 82, minHeight: sizes.touch, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.primarySoft, gap: 2 },
  addSymbol: { fontSize: 22, lineHeight: 24, fontWeight: "900", color: colors.primary },
  addLabel: { ...typography.caption, color: colors.primary },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.82 },
});
