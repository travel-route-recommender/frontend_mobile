import { useCallback, useRef } from "react";
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
  onMoveToIndex,
  onEdit,
  onRemove,
  onDragStateChange,
}: {
  date: WorkspaceDate;
  items: readonly ItineraryItemViewModel[];
  unscheduledCandidateCount: number;
  canEdit: boolean;
  onAdd: () => void;
  onExplore: () => void;
  onMoveUp: (itemId: string) => void;
  onMoveDown: (itemId: string) => void;
  onMoveToIndex: (itemId: string, targetIndex: number) => void;
  onEdit: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onDragStateChange: (itemId?: string) => void;
}) {
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const dropItem = useCallback((itemId: string, translationY: number) => {
    const source = layouts.current.get(itemId);
    if (!source) return;
    const targetCenter = source.y + source.height / 2 + translationY;
    let targetIndex = items.findIndex((item) => item.id === itemId);
    let closestDistance = Number.POSITIVE_INFINITY;
    items.forEach((item, index) => {
      const layout = layouts.current.get(item.id);
      if (!layout) return;
      const distance = Math.abs(layout.y + layout.height / 2 - targetCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        targetIndex = index;
      }
    });
    if (targetIndex >= 0) onMoveToIndex(itemId, targetIndex);
  }, [items, onMoveToIndex]);

  return <View style={styles.section}>
    <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>{date.dayLabel} · {date.monthDayLabel} {date.weekdayLabel}</Text><Text style={styles.title}>이 날짜의 일정 {items.length}개</Text>{items.length > 1 && canEdit ? <Text style={styles.dragGuide}>이동 핸들을 길게 눌러 순서를 바꿀 수 있어요.</Text> : null}</View>{canEdit ? <View style={styles.add}><PrimaryButton label="일정 추가" onPress={onAdd} /></View> : null}</View>
    {items.length ? <View style={styles.list}>{items.map((item, index) => <ItineraryTimelineItem
      key={item.id}
      item={item}
      order={index + 1}
      first={index === 0}
      last={index === items.length - 1}
      canEdit={canEdit}
      onMoveUp={() => onMoveUp(item.id)}
      onMoveDown={() => onMoveDown(item.id)}
      onMeasure={(layout) => layouts.current.set(item.id, layout)}
      onDragStateChange={(dragging) => onDragStateChange(dragging ? item.id : undefined)}
      onDrop={(translationY) => dropItem(item.id, translationY)}
      onEdit={() => onEdit(item.id)}
      onRemove={() => onRemove(item.id)}
    />)}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>이 날짜의 일정이 아직 비어 있어요</Text><Text style={styles.body}>{unscheduledCandidateCount ? `미배치 후보 ${unscheduledCandidateCount}곳 중 하나를 일정에 넣어보세요.` : "후보 장소를 먼저 담으면 일정을 만들 수 있어요."}</Text>{canEdit ? unscheduledCandidateCount ? <PrimaryButton label="후보에서 일정 추가" onPress={onAdd} /> : <SecondaryButton label="장소 찾아보기" onPress={onExplore} /> : null}</View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text, marginTop: 2 },
  dragGuide: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  add: { minWidth: 112 },
  list: { gap: 0 },
  empty: { gap: spacing.md, alignItems: "center", borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: spacing.xl },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});
