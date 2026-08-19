import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";

export type DuriReportSection = "overview" | "checks" | "days" | "preferences" | "evidence" | "suggestions";

const sections: readonly { id: DuriReportSection; label: string }[] = [
  { id: "overview", label: "요약" },
  { id: "checks", label: "점검" },
  { id: "days", label: "날짜별" },
  { id: "preferences", label: "성향" },
  { id: "evidence", label: "근거·한계" },
  { id: "suggestions", label: "제안" },
];

export function DuriReportSectionTabs({
  value,
  issueCount,
  onChange,
}: {
  value: DuriReportSection;
  issueCount: number;
  onChange: (section: DuriReportSection) => void;
}) {
  return <ScrollView
    accessibilityRole="tablist"
    contentContainerStyle={styles.content}
    horizontal
    keyboardShouldPersistTaps="handled"
    showsHorizontalScrollIndicator={false}
  >
    {sections.map((section) => {
      const selected = section.id === value;
      const label = section.id === "checks" ? `${section.label} ${issueCount}` : section.label;
      return <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        key={section.id}
        onPress={() => onChange(section.id)}
        style={({ pressed }) => [styles.tab, selected && styles.selectedTab, pressed && styles.pressed]}
      >
        <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xs, paddingVertical: spacing.xxs, paddingRight: spacing.lg },
  tab: {
    minHeight: sizes.touch,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  selectedTab: { borderColor: colors.primary, backgroundColor: colors.primary },
  pressed: { opacity: 0.78 },
  label: { ...typography.caption, color: colors.textSecondary },
  selectedLabel: { color: colors.white },
});
