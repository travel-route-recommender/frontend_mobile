import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { ItineraryItemViewModel, WorkspaceDate } from "../types";
import { ItineraryTimelineItem } from "./ItineraryTimelineItem";

export function WorkspaceItinerary({
  date,
  items,
  unscheduledCandidateCount,
  canEdit,
  onAdd,
  onExplore,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
}: {
  date: WorkspaceDate;
  items: readonly ItineraryItemViewModel[];
  unscheduledCandidateCount: number;
  canEdit: boolean;
  onAdd: () => void;
  onExplore: () => void;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
  onEdit: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  return <View style={styles.section}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>{date.dayLabel} · {date.monthDayLabel} {date.weekdayLabel}</Text><Text style={styles.title}>이 날짜의 일정 {items.length}개</Text></View>{canEdit ? <View style={styles.add}><PrimaryButton label="일정 추가" onPress={onAdd} /></View> : null}</View>
    {items.length ? <View style={styles.list}>{items.map((item, index) => <ItineraryTimelineItem
      key={item.id}
      item={item}
      order={index + 1}
      first={index === 0}
      last={index === items.length - 1}
      canEdit={canEdit}
      onMoveUp={() => onMoveUp(item.id)}
      onMoveDown={() => onMoveDown(item.id)}
      onEdit={() => onEdit(item.id)}
      onRemove={() => onRemove(item.id)}
    />)}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>이 날짜의 일정이 아직 비어 있어요</Text><Text style={styles.body}>{unscheduledCandidateCount ? `미배치 후보 ${unscheduledCandidateCount}곳 중 하나를 일정에 넣어보세요.` : "후보 장소를 먼저 담으면 일정을 만들 수 있어요."}</Text>{canEdit ? unscheduledCandidateCount ? <PrimaryButton label="후보에서 일정 추가" onPress={onAdd} /> : <SecondaryButton label="장소 찾아보기" onPress={onExplore} /> : null}</View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text, marginTop: 2 },
  add: { minWidth: 112 },
  list: { gap: 0 },
  empty: { gap: spacing.md, alignItems: "center", borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: spacing.xl },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});

