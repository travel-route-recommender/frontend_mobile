import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Chip, RemoteImage } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { PlaceCardViewModel } from "../types";

type PlaceCardProps = {
  viewModel: PlaceCardViewModel;
  distanceProximityLabel?: string;
  onPress(): void;
  onToggleSaved?(): void;
  onAddCandidate?(): void;
};

export function PlaceCard({ viewModel, distanceProximityLabel, onPress, onToggleSaved, onAddCandidate }: PlaceCardProps) {
  const candidateAction = viewModel.activeTripCandidateState === "scheduled"
    ? { label: "일정 포함", disabled: true, selected: true }
    : viewModel.activeTripCandidateState === "candidate"
      ? { label: "후보 해제", disabled: false, selected: true }
      : { label: "여행방 후보 추가", disabled: false, selected: false };
  const hasTags = viewModel.tags.length > 0 || viewModel.hiddenTagCount > 0;
  return <Card style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name}, ${viewModel.regionName}, ${viewModel.categoryLabel} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.detail, pressed && styles.pressed]}>
      <View style={styles.thumbnail}><RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 이미지`} aspectRatio={1} /></View>
      <View style={styles.content}>
        <View style={styles.heading}><View style={styles.copy}><Text numberOfLines={2} style={styles.title}>{viewModel.name}</Text><Text numberOfLines={2} style={styles.address}>{viewModel.regionName} · {viewModel.address}</Text></View></View>
        <View style={styles.metaRow}><Chip label={viewModel.categoryLabel} />{distanceProximityLabel ? <Text numberOfLines={1} style={styles.proximity}>{distanceProximityLabel}</Text> : null}</View>
        {hasTags ? <View style={styles.chips}>{viewModel.tags.map((tag) => <Chip key={tag} label={tag} />)}{viewModel.hiddenTagCount ? <Chip label={`+${viewModel.hiddenTagCount}`} /> : null}</View> : null}
        {viewModel.summary ? <Text numberOfLines={1} style={styles.summary}>{viewModel.summary}</Text> : null}
      </View>
      {viewModel.candidateTripIds.length > 0 && viewModel.activeTripCandidateState === "not-added" ? <Text style={styles.relationNote}>다른 여행방 {viewModel.candidateTripIds.length}곳의 후보</Text> : null}
    </Pressable>
    <View style={styles.actions}>
      {onToggleSaved ? <Pressable accessibilityRole="button" accessibilityLabel={viewModel.isSaved ? `${viewModel.name} 저장 해제` : `${viewModel.name} 저장`} accessibilityState={{ selected: viewModel.isSaved }} onPress={onToggleSaved} style={[styles.action, viewModel.isSaved && styles.savedAction]}><View style={styles.saveContent}><Text style={[styles.heartText, viewModel.isSaved && styles.savedText]}>{viewModel.isSaved ? "♥" : "♡"}</Text><Text style={[styles.actionText, viewModel.isSaved && styles.savedText]}>{viewModel.isSaved ? "저장됨" : "저장"}</Text></View></Pressable> : null}
      {onAddCandidate ? <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name} ${candidateAction.label}`} accessibilityState={{ disabled: candidateAction.disabled, selected: candidateAction.selected }} disabled={candidateAction.disabled} onPress={onAddCandidate} style={[styles.action, candidateAction.disabled ? styles.candidateDisabledAction : candidateAction.selected ? styles.candidateSelectedAction : styles.candidateAction]}><Text style={[styles.actionText, candidateAction.disabled ? styles.candidateDisabledText : candidateAction.selected ? styles.candidateSelectedText : styles.candidateText]}>{candidateAction.label}</Text></Pressable> : null}
    </View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { padding: spacing.sm, gap: spacing.sm }, detail: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }, pressed: { opacity: 0.84 }, thumbnail: { width: 88, height: 88, overflow: "hidden", borderRadius: radius.md, backgroundColor: colors.primarySoft }, content: { flex: 1, minHeight: 88, gap: spacing.xs }, heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }, copy: { flex: 1 }, title: { ...typography.subtitle, color: colors.text }, address: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs }, metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }, proximity: { ...typography.caption, color: colors.primary, flexShrink: 1 }, summary: { ...typography.caption, color: colors.textSecondary }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, relationNote: { ...typography.caption, color: colors.primary, alignSelf: "flex-end" },
  actions: { flexDirection: "row", gap: spacing.xs }, action: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, savedAction: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, candidateAction: { backgroundColor: colors.primary, borderColor: colors.primary }, candidateSelectedAction: { backgroundColor: colors.primarySoft, borderColor: colors.primary }, candidateDisabledAction: { backgroundColor: colors.surfaceMuted, borderColor: colors.border }, saveContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs }, heartText: { fontSize: 24, lineHeight: 28, color: colors.textSecondary }, actionText: { ...typography.caption, color: colors.textSecondary }, savedText: { color: colors.primary }, candidateText: { color: colors.white }, candidateSelectedText: { color: colors.primary }, candidateDisabledText: { color: colors.textMuted },
});
