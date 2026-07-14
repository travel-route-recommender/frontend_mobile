import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Chip, RemoteImage } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { PlaceCardViewModel } from "../types";

export function PlaceCard({ viewModel, onPress, onToggleSaved, onAddCandidate }: { viewModel: PlaceCardViewModel; onPress(): void; onToggleSaved?(): void; onAddCandidate?(): void }) {
  const candidateLabel = viewModel.activeTripCandidateState === "scheduled"
    ? "후보 여행방 관리"
    : viewModel.activeTripCandidateState === "candidate"
      ? "후보 여행방 관리"
      : "여행방 후보 추가";
  return <Card style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name}, ${viewModel.regionName}, ${viewModel.categoryLabel} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.detail, pressed && styles.pressed]}>
      <RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 이미지`} aspectRatio={1.75} />
      <View style={styles.heading}><View style={styles.copy}><Text numberOfLines={2} style={styles.title}>{viewModel.name}</Text><Text numberOfLines={2} style={styles.address}>{viewModel.regionName} · {viewModel.address}</Text></View>{viewModel.activeTripCandidateState !== "not-added" ? <Chip label={candidateLabel} selected /> : null}</View>
      <View style={styles.metaRow}><Chip label={viewModel.categoryLabel} />{viewModel.rating !== undefined ? <Text style={styles.meta}>★ {viewModel.rating.toFixed(1)}</Text> : null}{viewModel.distanceLabel ? <Text style={styles.meta}>{viewModel.distanceLabel}</Text> : null}</View>
      <Text numberOfLines={2} style={styles.summary}>{viewModel.summary}</Text>
      <View style={styles.chips}>{viewModel.tags.map((tag) => <Chip key={tag} label={tag} />)}{viewModel.hiddenTagCount ? <Chip label={`+${viewModel.hiddenTagCount}`} /> : null}</View>
      {viewModel.candidateTripIds.length > 0 && viewModel.activeTripCandidateState === "not-added" ? <Text style={styles.relationNote}>다른 여행방 {viewModel.candidateTripIds.length}곳의 후보</Text> : null}
    </Pressable>
    <View style={styles.actions}>
      {onToggleSaved ? <Pressable accessibilityRole="button" accessibilityLabel={viewModel.isSaved ? `${viewModel.name} 저장 해제` : `${viewModel.name} 저장`} accessibilityState={{ selected: viewModel.isSaved }} onPress={onToggleSaved} style={[styles.action, viewModel.isSaved && styles.savedAction]}><Text style={[styles.actionText, viewModel.isSaved && styles.savedText]}>{viewModel.isSaved ? "♥ 저장됨" : "♡ 저장"}</Text></Pressable> : null}
      {onAddCandidate ? <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name} ${candidateLabel}`} onPress={onAddCandidate} style={[styles.action, styles.candidateAction]}><Text style={[styles.actionText, styles.candidateText]}>{candidateLabel}</Text></Pressable> : null}
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.sm, gap: spacing.sm }, detail: { gap: spacing.sm }, pressed: { opacity: 0.84 }, heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }, copy: { flex: 1 }, title: { ...typography.subtitle, color: colors.text }, address: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs }, metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }, meta: { ...typography.caption, color: colors.textSecondary }, summary: { ...typography.body, color: colors.textSecondary }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, relationNote: { ...typography.caption, color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.xs }, action: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, savedAction: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, candidateAction: { backgroundColor: colors.primary, borderColor: colors.primary }, actionText: { ...typography.caption, color: colors.textSecondary }, savedText: { color: colors.primary }, candidateText: { color: colors.white },
});
