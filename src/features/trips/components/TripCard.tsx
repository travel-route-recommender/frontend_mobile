import { Pressable, StyleSheet, Text, View } from "react-native";
import { RemoteImage } from "../../../components/common";
import { colors, radius, shadows } from "../../../theme/tokens";
import type { TripRoomCardViewModel } from "../types";

export function TripRoomCard({ viewModel, onPress }: { viewModel: TripRoomCardViewModel; onPress: () => void }) {
  const completed = viewModel.status === "completed";
  const nextAction = getNextAction(viewModel);
  const actionIcon = completed ? "▤" : viewModel.candidateCount === 0 ? "♡" : "▣";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${viewModel.statusLabel}, ${viewModel.title}, ${viewModel.destinationName}, ${viewModel.dateLabel}, ${viewModel.memberCount}명, ${viewModel.timingLabel ? `${viewModel.timingLabel}, ` : ""}${nextAction}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={styles.badges}>
            <View style={[styles.badge, statusSurfaceStyle(viewModel.status)]}>
              <Text style={[styles.badgeText, statusTextStyle(viewModel.status)]}>{viewModel.statusLabel}</Text>
            </View>
            {viewModel.isOwner ? <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>방장</Text></View> : null}
          </View>
          {viewModel.timingLabel ? <Text numberOfLines={1} style={styles.timing}>{viewModel.timingLabel}</Text> : null}
        </View>

        <View>
          <Text numberOfLines={2} style={styles.title}>{viewModel.title}</Text>
          <Text numberOfLines={1} style={styles.meta}>{viewModel.destinationName} · {viewModel.dateLabel} · {viewModel.memberCount}명</Text>
        </View>

        <RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.destinationName} 대표`} aspectRatio={3.2} />

        <View style={[styles.actionRow, completed ? styles.completedAction : viewModel.status === "drafting" ? styles.draftingAction : styles.ongoingAction]}>
          <View style={[styles.actionIcon, completed ? styles.completedActionIcon : viewModel.status === "drafting" ? styles.draftingActionIcon : styles.ongoingActionIcon]}>
            <Text style={[styles.actionIconText, completed ? styles.completedActionIconText : viewModel.status === "drafting" ? styles.draftingActionIconText : styles.ongoingActionIconText]}>{actionIcon}</Text>
          </View>
          <Text numberOfLines={1} style={styles.actionText}>{nextAction}</Text>
          <Text accessibilityElementsHidden style={styles.arrow}>›</Text>
        </View>

        {!completed ? <View style={styles.metrics}>
          <Text numberOfLines={1} style={styles.metricsText}>후보 <Text style={styles.metricValue}>{viewModel.candidateCount}</Text>  ·  일정 <Text style={styles.metricValue}>{viewModel.itineraryCount}</Text>  ·  응답 <Text style={styles.metricValue}>{viewModel.preferenceCompletedCount}/{viewModel.preferenceTotalCount}</Text></Text>
        </View> : null}
      </View>
    </Pressable>
  );
}

export const TripCard = TripRoomCard;

function getNextAction(viewModel: TripRoomCardViewModel) {
  if (viewModel.status === "completed") return "여행 기록 다시 보기";
  if (viewModel.candidateCount === 0) return "함께 가고 싶은 장소를 모아보세요";
  if (viewModel.itineraryCount === 0) return "첫 일정을 만들어보세요";
  return "일정을 계속 만들어보세요";
}

function statusSurfaceStyle(status: TripRoomCardViewModel["status"]) {
  if (status === "planning") return styles.planningBadge;
  if (status === "drafting") return styles.draftingBadge;
  if (status === "confirmed") return styles.confirmedBadge;
  return styles.completedBadge;
}

function statusTextStyle(status: TripRoomCardViewModel["status"]) {
  if (status === "planning") return styles.planningBadgeText;
  if (status === "drafting") return styles.draftingBadgeText;
  if (status === "confirmed") return styles.confirmedBadgeText;
  return styles.completedBadgeText;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.84 },
  card: { gap: 10, overflow: "hidden", borderRadius: 20, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: "#FFFFFF", padding: 14, ...shadows.card },
  statusRow: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  badges: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  badge: { minHeight: 24, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.pill },
  badgeText: { fontSize: 11, lineHeight: 16, fontWeight: "800" },
  planningBadge: { backgroundColor: "#F0EDFF" },
  planningBadgeText: { color: "#6758BE" },
  draftingBadge: { backgroundColor: "#FFF0E2" },
  draftingBadgeText: { color: "#D66C32" },
  confirmedBadge: { backgroundColor: "#EAF7EE" },
  confirmedBadgeText: { color: "#2E9B66" },
  completedBadge: { backgroundColor: "#EEF2F7" },
  completedBadgeText: { color: "#60719B" },
  roleBadge: { minHeight: 24, justifyContent: "center", paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: "#F3F1FF" },
  roleBadgeText: { color: "#615A9F", fontSize: 11, lineHeight: 16, fontWeight: "800" },
  timing: { flexShrink: 0, color: "#8290AE", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  title: { color: "#17265F", fontSize: 18, lineHeight: 24, fontWeight: "900" },
  meta: { marginTop: 2, color: "#60719B", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  actionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 10 },
  ongoingAction: { backgroundColor: "#F2F8FF" },
  draftingAction: { backgroundColor: "#FFF8F2" },
  completedAction: { backgroundColor: "#F1F8F5" },
  actionIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  ongoingActionIcon: { backgroundColor: "#DDEBFF" },
  draftingActionIcon: { backgroundColor: "#FFF0E2" },
  completedActionIcon: { backgroundColor: "#E2F4EA" },
  actionIconText: { fontSize: 17, lineHeight: 20, fontWeight: "800" },
  ongoingActionIconText: { color: colors.primary },
  draftingActionIconText: { color: "#E26E3B" },
  completedActionIconText: { color: "#2E9B66" },
  actionText: { flex: 1, color: "#17265F", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  arrow: { color: "#8290AE", fontSize: 26, lineHeight: 26, fontWeight: "500" },
  metrics: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE7F7", paddingTop: 10 },
  metricsText: { color: "#60719B", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  metricValue: { color: colors.primary, fontWeight: "900" },
});
