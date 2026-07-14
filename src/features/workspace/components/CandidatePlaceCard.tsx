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
  onPress,
  onPrimaryAction,
  onRemove,
}: {
  candidate: CandidatePlaceViewModel;
  canEdit: boolean;
  onPress: () => void;
  onPrimaryAction: () => void;
  onRemove: () => void;
}) {
  const scheduled = candidate.scheduleState !== "unscheduled";
  return <View style={styles.card} accessibilityLabel={`${candidate.name}, ${scheduleLabel(candidate)}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.name} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.detail, pressed && styles.pressed]}>
      <RemoteImage uri={candidate.imageUrl} accessibilityLabel={candidate.name} aspectRatio={1.6} />
      <View style={styles.heading}><View style={styles.copy}><Text numberOfLines={2} style={styles.name}>{candidate.name}</Text><Text numberOfLines={2} style={styles.address}>{candidate.address}</Text></View><Chip label={scheduleLabel(candidate)} selected={scheduled} /></View>
      <View style={styles.tags}><Chip label={candidate.categoryLabel} />{candidate.tags.slice(0, 2).map((tag) => <Chip key={tag} label={tag} />)}</View>
      <Text style={styles.member}>{candidate.addedByNames.length ? `${candidate.addedByNames.join(", ")} 님이 담았어요` : `담은 멤버 ${candidate.addedByCount}명`}</Text>
      {candidate.placeMissing ? <Text style={styles.warning}>연결된 장소 정보가 누락됐어요.</Text> : null}
    </Pressable>
    <View style={styles.actions}>
      <View style={styles.grow}><SecondaryButton
        label={candidate.scheduleState === "unscheduled" ? "일정에 추가" : candidate.scheduleState === "scheduled-on-selected-date" ? "이 날짜 일정 보기" : "배치 날짜 보기"}
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
  detail: { gap: spacing.sm },
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

