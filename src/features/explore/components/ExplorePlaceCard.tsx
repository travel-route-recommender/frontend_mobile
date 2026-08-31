import { Pressable, StyleSheet, Text, View } from "react-native";
import { RemoteImage } from "../../../components/common";
import { colors, radius, shadows, spacing } from "../../../theme/tokens";
import type { PlaceCardViewModel } from "../../places/types";

const exploreColors = {
  text: "#17265F",
  textSecondary: "#60719B",
  textMuted: "#8290AE",
  border: "#DCE7F7",
  lavender: "#F0EDFF",
  lavenderBorder: "#D9D5FF",
  lavenderText: "#735BC4",
  mint: "#EAF7EE",
  mintBorder: "#CDEBDA",
  mintText: "#2E9B66",
  peach: "#FFF0E2",
  peachText: "#D67B24",
} as const;

type ExplorePlaceCardProps = {
  viewModel: PlaceCardViewModel;
  distanceProximityLabel?: string;
  onPress(): void;
  onToggleSaved?(): void;
  onAddCandidate?(): void;
};

function getCompactLocation(viewModel: PlaceCardViewModel) {
  const parts = viewModel.address.trim().split(/\s+/).filter(Boolean);
  const shortAddress = parts.slice(0, Math.min(2, parts.length)).join(" ");
  return shortAddress || viewModel.regionName;
}

export function ExplorePlaceCard({ viewModel, distanceProximityLabel, onPress, onToggleSaved, onAddCandidate }: ExplorePlaceCardProps) {
  const visibleTags = viewModel.tags.slice(0, 2);
  const hiddenTagCount = Math.max(0, viewModel.tags.length - visibleTags.length);
  const compactLocation = getCompactLocation(viewModel);
  const scheduled = viewModel.activeTripCandidateState === "scheduled";
  const candidate = viewModel.activeTripCandidateState === "candidate";
  const candidateControl = onAddCandidate ? scheduled ? <View accessibilityRole="text" accessibilityLabel={`${viewModel.name} 일정에 포함됨`} style={[styles.stateBar, styles.scheduledBar]}>
    <Text style={styles.scheduledIcon}>▣</Text><Text style={styles.scheduledText}>일정 포함됨</Text>
  </View> : candidate ? <View style={[styles.stateBar, styles.candidateBar]}>
    <View style={styles.stateLabel}><Text style={styles.candidateIcon}>✦</Text><Text style={styles.candidateText}>현재 여행 후보</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name} 후보 해제`} accessibilityState={{ selected: true }} onPress={onAddCandidate} style={({ pressed }) => [styles.releaseButton, pressed && styles.pressed]}><Text style={styles.releaseText}>해제</Text></Pressable>
  </View> : <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name} 후보에 담기`} onPress={onAddCandidate} style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryActionPressed]}><Text style={styles.primaryActionText}>후보에 담기</Text><Text style={styles.primaryActionArrow}>→</Text></Pressable> : null;

  return <View testID={`explore-place-card-${viewModel.id}`} style={styles.card}>
    <View style={styles.detail}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name}, ${compactLocation}, ${viewModel.categoryLabel} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.thumbnailPressable, pressed && styles.pressed]}><View style={styles.thumbnail}>
        <RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 이미지`} aspectRatio={0.65} />
      </View></Pressable>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.categoryBadge}><Text numberOfLines={1} style={styles.categoryText}>{viewModel.categoryLabel}</Text></View>
          {onToggleSaved ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={viewModel.isSaved ? `${viewModel.name} 저장 해제` : `${viewModel.name} 저장`}
            accessibilityState={{ selected: viewModel.isSaved }}
            hitSlop={8}
            onPress={onToggleSaved}
            style={({ pressed }) => [styles.heartButton, pressed && styles.pressed]}
          ><Text style={[styles.heart, viewModel.isSaved && styles.heartSaved]}>{viewModel.isSaved ? "♥" : "♡"}</Text></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.infoPressable, pressed && styles.pressed]}>
          <Text numberOfLines={2} style={styles.title}>{viewModel.name}</Text>
          <Text numberOfLines={1} style={styles.meta}>{compactLocation} · {viewModel.categoryLabel}</Text>
          <View style={styles.metadataRow}>
            {typeof viewModel.rating === "number" ? <View style={styles.rating}><Text style={styles.ratingStar}>★</Text><Text style={styles.ratingText}>{viewModel.rating.toFixed(1)}</Text></View> : null}
            {distanceProximityLabel ? <Text numberOfLines={1} style={styles.distance}>{distanceProximityLabel}</Text> : null}
            {visibleTags.map((tag, index) => <View key={tag} style={[styles.tag, index === 1 && styles.tagAlternate]}><Text numberOfLines={1} style={styles.tagText}>{tag}</Text></View>)}
            {hiddenTagCount ? <Text style={styles.hiddenTag}>+{hiddenTagCount}</Text> : null}
          </View>
          {viewModel.candidateTripIds.length > 0 && viewModel.activeTripCandidateState === "not-added" ? <Text numberOfLines={1} style={styles.otherTripNote}>다른 여행 후보 {viewModel.candidateTripIds.length}</Text> : null}
        </Pressable>
        <View style={styles.actionSlot}>{candidateControl}</View>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.sm, borderRadius: 18, borderWidth: 1, borderColor: exploreColors.border, backgroundColor: colors.white, ...shadows.card },
  detail: { minHeight: 160, flexDirection: "row", alignItems: "stretch", gap: spacing.sm },
  thumbnailPressable: { width: 104, alignSelf: "stretch" },
  pressed: { opacity: 0.78 },
  thumbnail: { width: 104, height: 160, overflow: "hidden", borderRadius: 14, backgroundColor: colors.primarySoft },
  content: { flex: 1, minWidth: 0, minHeight: 160, gap: 3 },
  infoPressable: { gap: 3 },
  topRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  categoryBadge: { maxWidth: "72%", minHeight: 26, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: exploreColors.peach },
  categoryText: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: exploreColors.peachText },
  heartButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  heart: { fontSize: 27, lineHeight: 30, color: exploreColors.textSecondary },
  heartSaved: { color: colors.primary },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "800", color: exploreColors.text },
  meta: { fontSize: 11, lineHeight: 16, fontWeight: "600", color: exploreColors.textSecondary },
  metadataRow: { minHeight: 24, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 2 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingStar: { fontSize: 14, lineHeight: 18, color: "#F6B83F" },
  ratingText: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: exploreColors.textSecondary },
  distance: { fontSize: 10, lineHeight: 15, fontWeight: "700", color: colors.primary },
  tag: { maxWidth: 70, minHeight: 23, justifyContent: "center", paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  tagAlternate: { backgroundColor: exploreColors.mint },
  tagText: { fontSize: 10, lineHeight: 15, fontWeight: "700", color: exploreColors.textSecondary },
  hiddenTag: { fontSize: 10, lineHeight: 15, fontWeight: "800", color: exploreColors.textMuted },
  otherTripNote: { marginTop: 1, fontSize: 10, lineHeight: 15, fontWeight: "700", color: exploreColors.textMuted },
  actionSlot: { marginTop: "auto" },
  stateBar: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 12, borderWidth: 1 },
  stateLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  primaryAction: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: 12, backgroundColor: colors.primary },
  primaryActionPressed: { backgroundColor: colors.primaryPressed },
  primaryActionText: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: colors.white },
  primaryActionArrow: { fontSize: 18, lineHeight: 20, fontWeight: "700", color: colors.white },
  candidateBar: { borderColor: exploreColors.lavenderBorder, backgroundColor: exploreColors.lavender },
  candidateIcon: { fontSize: 16, lineHeight: 20, color: exploreColors.lavenderText },
  candidateText: { fontSize: 12, lineHeight: 17, fontWeight: "800", color: exploreColors.lavenderText },
  releaseButton: { minWidth: 52, minHeight: 34, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderLeftWidth: 1, borderLeftColor: exploreColors.lavenderBorder },
  releaseText: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: exploreColors.lavenderText },
  scheduledBar: { borderColor: exploreColors.mintBorder, backgroundColor: exploreColors.mint },
  scheduledIcon: { fontSize: 14, lineHeight: 18, color: exploreColors.mintText },
  scheduledText: { fontSize: 12, lineHeight: 17, fontWeight: "800", color: exploreColors.mintText },
});
