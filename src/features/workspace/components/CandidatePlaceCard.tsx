import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip, RemoteImage } from "../../../components/common";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import type { CandidatePlaceViewModel } from "../types";

function scheduleLabel(candidate: CandidatePlaceViewModel) {
  if (candidate.scheduleState === "unscheduled") return "미배치";
  if (candidate.scheduleState === "scheduled-on-selected-date") return candidate.scheduledCount > 1
    ? `선택 날짜 포함 ${candidate.scheduledCount}개 일정에 배치됨`
    : "선택 날짜에 배치됨";
  return `${candidate.scheduledCount}개 일정에 배치됨`;
}

export function CandidatePlaceCard({
  candidate,
  canEdit,
  compact = false,
  onPress,
  onPrimaryAction,
  onAddAnother,
  onRemove,
}: {
  candidate: CandidatePlaceViewModel;
  canEdit: boolean;
  compact?: boolean;
  onPress: () => void;
  onPrimaryAction: () => void;
  onAddAnother: () => void;
  onRemove: () => void;
}) {
  const scheduled = candidate.scheduleState !== "unscheduled";
  return <View style={[styles.card, compact && styles.cardCompact, scheduled && styles.cardScheduled]} accessibilityLabel={`${candidate.name}, ${scheduleLabel(candidate)}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.name} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.detail, compact && styles.detailCompact, pressed && styles.pressed]}>
      {compact ? <View style={styles.imageCompact}><RemoteImage uri={candidate.imageUrl} accessibilityLabel={candidate.name} aspectRatio={1} /></View> : <RemoteImage uri={candidate.imageUrl} accessibilityLabel={candidate.name} aspectRatio={1.6} />}
      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.heading}><View style={styles.copy}><Text numberOfLines={2} style={styles.name}>{candidate.name}</Text><Text numberOfLines={compact ? 1 : 2} style={styles.address}>{candidate.address}</Text></View>{!compact ? <Chip label={scheduleLabel(candidate)} selected={scheduled} /> : null}</View>
        <View style={styles.tags}>
          <Chip label={candidate.categoryLabel} />
          {candidate.tags.slice(0, compact ? 1 : 2).map((tag) => <Chip key={tag} label={tag} />)}
          {candidate.recommendedByDuri ? <View style={styles.duriChip}><Text style={styles.duriChipText}>두리 추천</Text></View> : null}
          {candidate.addedByCount > 1 ? <Chip label="공통 관심" /> : null}
        </View>
        <View style={styles.statusRow}><View style={[styles.statusPill, scheduled && styles.statusPillScheduled]}><Text style={[styles.statusText, scheduled && styles.statusTextScheduled]}>{scheduled ? `일정 포함 · ${candidate.scheduledCount}회` : "일정 전"}</Text></View><Text numberOfLines={1} style={styles.member}>{candidate.addedByCount > 1 ? `${candidate.addedByCount}명이 함께 담음` : "후보에 담음"}</Text></View>
        {scheduled ? <View style={styles.placements}>{candidate.scheduledPlacements.slice(0, 2).map((placement) => <Text key={placement.itemId} numberOfLines={1} style={styles.placementText}>{placement.dayLabel} · {placement.startTime}–{placement.endTime}</Text>)}</View> : null}
        {candidate.placeMissing ? <Text style={styles.warning}>연결된 장소 정보가 누락됐어요.</Text> : null}
      </View>
    </Pressable>
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canEdit && candidate.scheduleState === "unscheduled" || candidate.placeMissing }}
        disabled={!canEdit && candidate.scheduleState === "unscheduled" || candidate.placeMissing}
        onPress={onPrimaryAction}
        style={({ pressed }) => [styles.primaryAction, scheduled && styles.primaryActionScheduled, pressed && styles.pressed]}
      ><Text style={[styles.primaryActionText, scheduled && styles.primaryActionTextScheduled]}>{candidate.scheduleState === "unscheduled" ? "+ 일정에 추가" : "해당 일정 보기"}</Text></Pressable>
      {scheduled && canEdit && !candidate.placeMissing ? <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.name} 다른 시간에 일정 추가`} onPress={onAddAnother} style={({ pressed }) => [styles.repeat, pressed && styles.pressed]}>
        <Text style={styles.repeatText}>+ 다른 시간</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.name} 후보에서 제거`} accessibilityState={{ disabled: !canEdit }} disabled={!canEdit} onPress={onRemove} style={({ pressed }) => [styles.remove, !canEdit && styles.disabled, pressed && canEdit && styles.pressed]}>
        <Text style={styles.removeText}>빼기</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: 292, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, ...shadows.card },
  cardCompact: { width: "100%", backgroundColor: colors.surface },
  cardScheduled: { borderColor: colors.border, backgroundColor: colors.surface },
  detail: { gap: spacing.sm },
  detailCompact: { flexDirection: "row", alignItems: "center" },
  imageCompact: { width: 72, overflow: "hidden", borderRadius: radius.md },
  content: { gap: spacing.sm },
  contentCompact: { flex: 1, minWidth: 0 },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.subtitle, color: colors.text },
  address: { ...typography.caption, color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  duriChip: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: "#EEEAFE", borderWidth: 1, borderColor: "#D8D5F4" },
  duriChipText: { ...typography.caption, color: "#7569BE" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusPill: { borderRadius: radius.pill, backgroundColor: "#EEEAFE", paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusPillScheduled: { backgroundColor: "#D8F1E5" },
  statusText: { ...typography.caption, color: "#7569BE" },
  statusTextScheduled: { color: colors.success },
  member: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  placements: { gap: 1, paddingLeft: spacing.xs, borderLeftWidth: 2, borderLeftColor: "#8CCDB0" },
  placementText: { ...typography.caption, color: colors.success },
  warning: { ...typography.caption, color: colors.danger },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  primaryAction: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.sm },
  primaryActionScheduled: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  primaryActionText: { ...typography.bodyStrong, color: colors.white },
  primaryActionTextScheduled: { color: colors.primary },
  repeat: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  repeatText: { ...typography.caption, color: colors.primary, textAlign: "center" },
  remove: { minWidth: 46, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  removeText: { ...typography.caption, color: colors.danger },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.42 },
});
