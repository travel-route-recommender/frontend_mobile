import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip, RemoteImage, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { CandidatePlaceViewModel } from "../types";

function scheduleLabel(candidate: CandidatePlaceViewModel) {
  if (candidate.scheduleState === "unscheduled") return "미배치";
  if (candidate.scheduleState === "scheduled-on-selected-date") return "선택 날짜에 배치됨";
  return `${candidate.scheduledDates.length}개 날짜에 배치됨`;
}

export function CandidatePlaceCard({
  candidate,
  canEdit,
  compact = false,
  onPress,
  onPrimaryAction,
  onRemove,
  extra,
}: {
  candidate: CandidatePlaceViewModel;
  canEdit: boolean;
  compact?: boolean;
  onPress: () => void;
  onPrimaryAction: () => void;
  onRemove: () => void;
  extra?: ReactNode;
}) {
  const scheduled = candidate.scheduleState !== "unscheduled";
  return <View style={[styles.card, compact && styles.cardCompact]} accessibilityLabel={`${candidate.name}, ${scheduleLabel(candidate)}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.name} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.detail, compact && styles.detailCompact, pressed && styles.pressed]}>
      {compact ? <View style={styles.imageCompact}><RemoteImage uri={candidate.imageUrl} accessibilityLabel={candidate.name} aspectRatio={1} /></View> : <RemoteImage uri={candidate.imageUrl} accessibilityLabel={candidate.name} aspectRatio={1.6} />}
      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.heading}><View style={styles.copy}><Text numberOfLines={2} style={styles.name}>{candidate.name}</Text><Text numberOfLines={compact ? 1 : 2} style={styles.address}>{candidate.address}</Text></View>{!compact ? <Chip label={scheduleLabel(candidate)} selected={scheduled} /> : null}</View>
        <View style={styles.tags}>
          <Chip label={candidate.categoryLabel} />
          {candidate.tags.slice(0, compact ? 1 : 2).map((tag) => <Chip key={tag} label={tag} />)}
          {candidate.recommendedByDuri ? <Chip label="두리 추천" selected /> : null}
          {candidate.addedByCount > 1 ? <Chip label="공통 관심" selected /> : null}
        </View>
        <Text numberOfLines={1} style={styles.member}>{compact ? scheduleLabel(candidate) : candidate.addedByNames.length ? `${candidate.addedByNames.join(", ")} 님이 담았어요` : `담은 멤버 ${candidate.addedByCount}명`}</Text>
        {candidate.placeMissing ? <Text style={styles.warning}>연결된 장소 정보가 누락됐어요.</Text> : null}
      </View>
    </Pressable>
    {extra}
    <View style={styles.actions}>
      <View style={styles.grow}><SecondaryButton
        label={candidate.scheduleState === "unscheduled" ? "+ 일정에 추가" : candidate.scheduleState === "scheduled-on-selected-date" ? "이 날짜 일정 보기" : "배치 날짜 보기"}
        onPress={onPrimaryAction}
        disabled={!canEdit && candidate.scheduleState === "unscheduled" || candidate.placeMissing}
      /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.name} 후보에서 제거`} onPress={onRemove} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
        <Text style={styles.removeText}>제거</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: 292, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardCompact: { width: "100%", backgroundColor: colors.surfaceMuted },
  detail: { gap: spacing.sm },
  detailCompact: { flexDirection: "row", alignItems: "center" },
  imageCompact: { width: 76 },
  content: { gap: spacing.sm },
  contentCompact: { flex: 1, minWidth: 0 },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  copy: { flex: 1, gap: 2 },
  name: { ...typography.subtitle, color: colors.text },
  address: { ...typography.caption, color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  member: { ...typography.caption, color: colors.textSecondary },
  warning: { ...typography.caption, color: colors.danger },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  remove: { minWidth: 52, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  removeText: { ...typography.caption, color: colors.danger },
  pressed: { opacity: 0.82 },
});
