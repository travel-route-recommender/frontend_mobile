import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import type { ItineraryItemViewModel, WorkspaceDate } from "../types";

export function WorkspaceDayCanvas({
  date,
  items,
  onOpenItinerary,
  onOpenCandidates,
}: {
  date: WorkspaceDate;
  items: readonly ItineraryItemViewModel[];
  onOpenItinerary: () => void;
  onOpenCandidates: () => void;
}) {
  const previewItems = items.slice(0, 3);
  return <View style={styles.canvas} testID="workspace-day-canvas">
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>SELECTED DAY</Text>
        <Text style={styles.title}>{date.dayLabel}</Text>
        <Text style={styles.date}>{date.monthDayLabel} {date.weekdayLabel}</Text>
      </View>
      <View style={styles.badge}><Text style={styles.badgeValue}>{items.length}</Text><Text style={styles.badgeLabel}>일정</Text></View>
    </View>
    {previewItems.length ? <View style={styles.preview}>
      {previewItems.map((item, index) => <View key={item.id} style={styles.previewRow}>
        <View style={styles.timeRail}><Text style={styles.time}>{item.startTime}</Text>{index < previewItems.length - 1 ? <View style={styles.line} /> : null}</View>
        <View style={styles.itemCopy}><Text numberOfLines={1} style={styles.itemName}>{item.placeName}</Text><Text numberOfLines={1} style={styles.itemMeta}>{item.endTime} · {item.categoryLabel}</Text></View>
      </View>)}
      {items.length > previewItems.length ? <Text style={styles.more}>외 {items.length - previewItems.length}개 일정은 아래 일정 보드에서 확인하세요.</Text> : null}
    </View> : <View style={styles.empty}><Text style={styles.emptyTitle}>이 Day는 아직 비어 있어요</Text><Text style={styles.emptyText}>하단 후보 장소 보드에서 일정을 배치해보세요.</Text></View>}
    <View style={styles.actions}>
      <CanvasAction label="일정 보드 열기" primary onPress={onOpenItinerary} />
      <CanvasAction label="후보 장소 보기" onPress={onOpenCandidates} />
    </View>
  </View>;
}

function CanvasAction({ label, primary = false, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.pressed]}>
    <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  canvas: { gap: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg, ...shadows.card },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  headerCopy: { flex: 1 },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.title, color: colors.text, marginTop: 2 },
  date: { ...typography.body, color: colors.textSecondary },
  badge: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  badgeValue: { ...typography.subtitle, color: colors.primary },
  badgeLabel: { ...typography.caption, color: colors.primary },
  preview: { gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  previewRow: { minHeight: 48, flexDirection: "row", gap: spacing.md },
  timeRail: { width: 58, alignItems: "flex-end" },
  time: { ...typography.caption, color: colors.primary },
  line: { width: 2, flex: 1, marginTop: spacing.xxs, marginRight: spacing.md, backgroundColor: colors.borderStrong },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { ...typography.bodyStrong, color: colors.text },
  itemMeta: { ...typography.caption, color: colors.textSecondary },
  more: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  empty: { gap: spacing.xs, alignItems: "center", borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, padding: spacing.lg },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  actionPrimary: { backgroundColor: colors.primary },
  actionText: { ...typography.caption, color: colors.primary },
  actionTextPrimary: { color: colors.white },
  pressed: { opacity: 0.84 },
});
