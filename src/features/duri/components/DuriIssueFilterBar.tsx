import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import type { DuriConstraintType, DuriReportIssue } from "../types";

export type DuriIssueFilter = "all" | DuriConstraintType;

const labels: Record<DuriIssueFilter, string> = {
  all: "전체",
  hard: "필수 확인",
  soft: "조율",
  informational: "참고",
};

export function DuriIssueFilterBar({
  issues,
  value,
  onChange,
}: {
  issues: readonly DuriReportIssue[];
  value: DuriIssueFilter;
  onChange: (filter: DuriIssueFilter) => void;
}) {
  const filters: DuriIssueFilter[] = ["all", "hard", "soft", "informational"];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
    {filters.map((filter) => {
      const selected = filter === value;
      const count = filter === "all" ? issues.length : issues.filter((issue) => issue.constraintType === filter).length;
      return <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        key={filter}
        onPress={() => onChange(filter)}
        style={({ pressed }) => [styles.filter, selected && styles.selected, pressed && styles.pressed]}
      >
        <Text style={[styles.label, selected && styles.selectedLabel]}>{labels[filter]} {count}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xs, paddingRight: spacing.md },
  filter: {
    minHeight: sizes.touch,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.navy, borderColor: colors.navy },
  label: { ...typography.caption, color: colors.textSecondary },
  selectedLabel: { color: colors.white },
  pressed: { opacity: 0.78 },
});
