import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Card, Chip, RemoteImage } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { TripRoomCardViewModel } from "../types";

export function TripRoomCard({ viewModel, onPress }: { viewModel: TripRoomCardViewModel; onPress: () => void }) {
  const progress = Math.round(viewModel.preparation.rate * 100);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.title}, ${viewModel.destinationName}, ${viewModel.dateLabel} 여행방 열기`} onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card style={styles.card}>
        <RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.destinationName} 대표`} aspectRatio={2.25} />
        <View style={styles.chips}><Chip label={viewModel.statusLabel} selected={viewModel.status !== "completed"} />{viewModel.timingLabel ? <Chip label={viewModel.timingLabel} /> : null}{viewModel.isOwner ? <Chip label="내가 방장" /> : null}</View>
        <View style={styles.row}><View style={styles.copy}><Text style={styles.title}>{viewModel.title}</Text><Text style={styles.meta}>{viewModel.destinationName} · {viewModel.dateLabel}</Text></View><Text style={styles.arrow}>›</Text></View>
        <View style={styles.memberRow}><View style={styles.avatarStack}>{viewModel.members.slice(0, 4).map((member, index) => <View key={member.userId} style={[styles.avatarSlot, index > 0 && styles.avatarOverlap]}><Avatar name={member.name || member.initial} uri={member.profileImageUrl} size={32} /></View>)}</View><Text style={styles.memberLabel}>{viewModel.memberCount}명</Text></View>
        <View style={styles.metrics}><Metric label="후보" value={viewModel.candidateCount} /><Metric label="일정" value={viewModel.itineraryCount} /><Metric label="성향 응답" value={`${viewModel.preferenceCompletedCount}/${viewModel.preferenceTotalCount}`} /></View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress, text: `여행 준비 ${progress}%` }} style={styles.progressRow}><Text style={styles.progressLabel}>여행 준비</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Text style={styles.progressValue}>{progress}%</Text></View>
      </Card>
    </Pressable>
  );
}

export const TripCard = TripRoomCard;

function Metric({ label, value }: { label: string; value: string | number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.86 }, card: { gap: spacing.md, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center" }, copy: { flex: 1 },
  title: { ...typography.subtitle, color: colors.text }, meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xxs }, arrow: { fontSize: 32, color: colors.primary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, avatarStack: { flexDirection: "row" }, avatarSlot: { borderWidth: 2, borderColor: colors.surface, borderRadius: radius.pill }, avatarOverlap: { marginLeft: -8 }, memberLabel: { ...typography.caption, color: colors.textSecondary },
  metrics: { flexDirection: "row", borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingVertical: spacing.sm }, metric: { flex: 1, alignItems: "center", gap: spacing.xxs }, metricValue: { ...typography.bodyStrong, color: colors.primary }, metricLabel: { ...typography.caption, color: colors.textSecondary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, progressLabel: { ...typography.caption, color: colors.textSecondary }, progressTrack: { flex: 1, height: 7, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.border }, progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary }, progressValue: { ...typography.caption, color: colors.primary },
});
