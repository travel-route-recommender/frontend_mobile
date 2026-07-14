import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getEndTime } from "../../../utils/schedule";
import type { ScheduleDiffItem } from "../types";

const kindLabel = { added: "추가", removed: "삭제", moved: "날짜 이동", "time-changed": "시간 변경", reordered: "순서 변경", unchanged: "유지" } as const;

function stateLabel(item: ScheduleDiffItem["before"]) {
  return item ? `${item.date} ${item.startTime}~${getEndTime(item.startTime, item.durationMinutes)} · ${item.order + 1}번째` : "해당 없음";
}

export function ScheduleDiffView({ diff }: { diff: ScheduleDiffItem[] }) {
  const changed = diff.filter((item) => item.kind !== "unchanged");
  return <View style={styles.wrap}><Text style={styles.heading}>날짜별 변경 diff</Text>{changed.length ? changed.map((item) => <View accessibilityLabel={`${kindLabel[item.kind]}, ${item.placeName}, 변경 전 ${stateLabel(item.before)}, 변경 후 ${stateLabel(item.after)}`} key={item.itemId} style={styles.item}><View style={styles.top}><Text style={styles.kind}>{kindLabel[item.kind]}</Text><Text style={styles.name}>{item.placeName}</Text></View><Text style={styles.state}>전 · {stateLabel(item.before)}</Text><Text style={styles.state}>후 · {stateLabel(item.after)}</Text></View>) : <Text style={styles.empty}>변경되는 일정이 없어요.</Text>}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  heading: { ...typography.subtitle, color: colors.text },
  item: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  top: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  kind: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  name: { ...typography.bodyStrong, color: colors.text },
  state: { ...typography.caption, color: colors.textSecondary },
  empty: { ...typography.caption, color: colors.textMuted },
});
