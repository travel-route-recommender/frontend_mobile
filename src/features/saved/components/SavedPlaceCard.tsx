import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import mediumSymbolWeight from "expo-symbols/androidWeights/medium";
import { RemoteImage } from "../../../components/common";
import { colors, radius, shadows, sizes, spacing, typography } from "../../../theme/tokens";
import type { PlaceCandidateState, PlaceCardViewModel } from "../../places/types";

const DURI_NO_PLAN = require("../../../../design/image/duri_no_plan.png");

const savedColors = {
  navy: "#17265F",
  secondary: "#60719B",
  muted: "#8290AE",
  lavender: "#F0EDFF",
  lavenderBorder: "#D9D5FF",
  lavenderText: "#735BC4",
  mint: "#EAF7EE",
  mintBorder: "#CDEBDA",
  mintText: "#2E9B66",
  pageSoft: "#F7FAFF",
} as const;

type SavedPlaceCardProps = {
  viewModel: PlaceCardViewModel;
  activeTripTitle?: string;
  onPress(): void;
  onUnsave(): void;
  onTravelAction(): void;
  onViewSchedule?(): void;
};

export function SavedPlaceCard({ viewModel, activeTripTitle, onPress, onUnsave, onTravelAction, onViewSchedule }: SavedPlaceCardProps) {
  const tags = viewModel.tags.slice(0, 2);
  const hiddenTagCount = Math.max(0, viewModel.tags.length - tags.length) + viewModel.hiddenTagCount;
  const location = getShortLocation(viewModel.address, viewModel.regionName);
  const state = viewModel.activeTripCandidateState;

  return <View style={styles.card}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${viewModel.name}, ${location}, ${viewModel.categoryLabel} 상세 보기`}
      onPress={onPress}
      style={({ pressed }) => [styles.detail, pressed && styles.pressed]}
    >
      <View style={styles.thumbnail}>
        <RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 이미지`} aspectRatio={1} />
      </View>
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.category}>{viewModel.categoryLabel}</Text>
        <Text numberOfLines={2} style={styles.placeName}>{viewModel.name}</Text>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={styles.location}>{location}</Text>
          {viewModel.rating !== undefined ? <Text accessibilityLabel={`평점 ${viewModel.rating.toFixed(1)}`} style={styles.rating}>★ {viewModel.rating.toFixed(1)}</Text> : null}
        </View>
        {tags.length ? <View style={styles.tags}>{tags.map((tag) => <View key={tag} style={styles.tag}><Text numberOfLines={1} style={styles.tagText}>{tag}</Text></View>)}{hiddenTagCount ? <Text style={styles.hiddenTags}>+{hiddenTagCount}</Text> : null}</View> : null}
        {state === "not-added" && viewModel.scheduledTripIds.length ? <Text numberOfLines={1} style={styles.otherScheduled}>다른 여행 일정 {viewModel.scheduledTripIds.length}</Text> : state === "not-added" && viewModel.candidateTripIds.length ? <Text numberOfLines={1} style={styles.otherTrip}>다른 여행 후보 {viewModel.candidateTripIds.length}</Text> : null}
      </View>
    </Pressable>

    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${viewModel.name} 저장 해제`}
      accessibilityHint="저장에서 삭제하며 실행 취소할 수 있어요"
      accessibilityState={{ selected: true }}
      hitSlop={8}
      onPress={onUnsave}
      style={({ pressed }) => [styles.heart, pressed && styles.heartPressed]}
    >
      <Text style={styles.heartText}>♥</Text>
    </Pressable>

    <TravelState
      state={state}
      activeTripTitle={activeTripTitle}
      placeName={viewModel.name}
      onAction={onTravelAction}
      onViewSchedule={onViewSchedule}
    />
  </View>;
}

function TravelState({ state, activeTripTitle, placeName, onAction, onViewSchedule }: { state: PlaceCandidateState; activeTripTitle?: string; placeName: string; onAction(): void; onViewSchedule?(): void }) {
  if (state === "candidate") {
    return <View style={[styles.travelState, styles.candidateState]}>
      <Text numberOfLines={1} style={[styles.travelLabel, styles.candidateLabel]}>✦ 현재 여행 후보{activeTripTitle ? ` · ${activeTripTitle}` : ""}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${placeName} 현재 여행 후보에서 해제`} hitSlop={8} onPress={onAction} style={styles.stateAction}><Text style={styles.candidateAction}>해제</Text></Pressable>
    </View>;
  }

  if (state === "scheduled") {
    return <View style={[styles.travelState, styles.scheduledState]}>
      <Text numberOfLines={1} style={[styles.travelLabel, styles.scheduledLabel]}>▣ 일정 포함됨{activeTripTitle ? ` · ${activeTripTitle}` : ""}</Text>
      {onViewSchedule ? <Pressable accessibilityRole="button" accessibilityLabel={`${activeTripTitle ?? "현재 여행"} 일정 보기`} hitSlop={8} onPress={onViewSchedule} style={styles.stateAction}><Text style={styles.scheduledAction}>일정 보기</Text></Pressable> : null}
    </View>;
  }

  return <View style={styles.defaultTravelRow}>
    <Text style={styles.travelPrompt}>여행 계획에 활용해보세요</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${placeName} 후보에 담기`} onPress={onAction} style={({ pressed }) => [styles.addCandidate, pressed && styles.addCandidatePressed]}><Text style={styles.addCandidateText}>후보에 담기 →</Text></Pressable>
  </View>;
}

export function SavedSearchInput({ value, onChangeText, onClear }: { value: string; onChangeText(value: string): void; onClear(): void }) {
  return <View style={styles.search}>
    <SymbolView name={{ ios: "magnifyingglass", android: "search", web: "search" }} tintColor={savedColors.muted} size={20} weight={{ ios: "medium", android: mediumSymbolWeight }} style={styles.searchIcon} />
    <TextInput accessibilityLabel="저장한 장소 검색" value={value} onChangeText={onChangeText} placeholder="저장한 장소 검색" placeholderTextColor={savedColors.muted} returnKeyType="search" autoCorrect={false} style={styles.searchInput} />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={onClear} style={styles.clearSearch}><Text style={styles.clearSearchText}>×</Text></Pressable> : null}
  </View>;
}

export function SavedFilterChips<T extends string>({ items, selected, onSelect }: { items: readonly { value: T; label: string }[]; selected: T; onSelect(value: T): void }) {
  return <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>{items.map((item) => {
    const isSelected = item.value === selected;
    return <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`카테고리 ${item.label}`} accessibilityState={{ selected: isSelected }} onPress={() => onSelect(item.value)} style={({ pressed }) => [styles.filterChip, isSelected && styles.filterChipSelected, pressed && styles.pressed]}><Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>{item.label}</Text></Pressable>;
  })}</ScrollView>;
}

export function SavedTrueEmpty({ onExplore }: { onExplore(): void }) {
  return <View style={styles.trueEmpty}>
    <Image source={DURI_NO_PLAN} resizeMode="contain" accessible={false} style={styles.emptyIllustration} />
    <Text style={styles.emptyTitle}>아직 저장한 장소가 없어요</Text>
    <Text style={styles.emptyBody}>마음에 드는 장소를 발견하면{`\n`}하트를 눌러 모아둘 수 있어요.</Text>
    <Pressable accessibilityRole="button" onPress={onExplore} style={({ pressed }) => [styles.exploreButton, pressed && styles.addCandidatePressed]}><Text style={styles.exploreButtonText}>장소 둘러보기</Text></Pressable>
  </View>;
}

export function SavedUndoBanner({ placeName, onUndo, onClose }: { placeName: string; onUndo(): void; onClose(): void }) {
  return <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.undoBanner}>
    <Text numberOfLines={2} style={styles.undoText}>{withObjectParticle(placeName)} 저장에서 삭제했어요.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${placeName} 저장 삭제 실행 취소`} onPress={onUndo} style={styles.undoAction}><Text style={styles.undoActionText}>실행 취소</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" hitSlop={8} onPress={onClose} style={styles.undoClose}><Text style={styles.undoCloseText}>×</Text></Pressable>
  </View>;
}

function getShortLocation(address: string, fallback: string) {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  return tokens.slice(0, 2).join(" ") || fallback;
}

function withObjectParticle(value: string) {
  const lastCode = value.charCodeAt(value.length - 1);
  if (lastCode >= 0xac00 && lastCode <= 0xd7a3) return `${value}${(lastCode - 0xac00) % 28 ? "을" : "를"}`;
  return `${value}을(를)`;
}

const styles = StyleSheet.create({
  card: { position: "relative", gap: spacing.sm, padding: spacing.sm, borderRadius: 18, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.white, ...shadows.card },
  detail: { minHeight: 100, flexDirection: "row", gap: spacing.sm, paddingRight: 36 },
  thumbnail: { width: 92, height: 100, overflow: "hidden", borderRadius: 14, backgroundColor: colors.primarySoft },
  content: { flex: 1, minWidth: 0, gap: 2 },
  category: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: savedColors.secondary },
  placeName: { fontSize: 17, lineHeight: 22, fontWeight: "800", color: savedColors.navy },
  metaRow: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  location: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: "600", color: savedColors.secondary },
  rating: { flexShrink: 0, fontSize: 12, lineHeight: 18, fontWeight: "700", color: "#F2A43A" },
  tags: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  tag: { maxWidth: 72, minHeight: 24, justifyContent: "center", paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: "#F2F6FC" },
  tagText: { fontSize: 11, lineHeight: 16, fontWeight: "600", color: savedColors.secondary },
  hiddenTags: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: savedColors.muted },
  otherTrip: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: "700", color: savedColors.lavenderText },
  otherScheduled: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: "700", color: savedColors.mintText },
  heart: { position: "absolute", top: 8, right: 8, zIndex: 2, width: sizes.touch, height: sizes.touch, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  heartPressed: { backgroundColor: colors.primarySoft },
  heartText: { fontSize: 23, lineHeight: 28, color: colors.primary },
  travelState: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, paddingLeft: spacing.sm, paddingRight: spacing.xs, borderRadius: 12, borderWidth: 1 },
  travelLabel: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  candidateState: { borderColor: savedColors.lavenderBorder, backgroundColor: savedColors.lavender },
  candidateLabel: { color: savedColors.lavenderText },
  scheduledState: { borderColor: savedColors.mintBorder, backgroundColor: savedColors.mint },
  scheduledLabel: { color: savedColors.mintText },
  stateAction: { minWidth: 58, minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.72)" },
  candidateAction: { ...typography.caption, color: savedColors.lavenderText },
  scheduledAction: { ...typography.caption, color: savedColors.mintText },
  defaultTravelRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  travelPrompt: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: "600", color: savedColors.muted },
  addCandidate: { minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: colors.primary },
  addCandidatePressed: { backgroundColor: colors.primaryPressed },
  addCandidateText: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: colors.white },
  search: { minHeight: 48, flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.white },
  searchIcon: { width: 20, height: 20, marginLeft: spacing.sm },
  searchInput: { flex: 1, height: 48, paddingHorizontal: spacing.sm, paddingVertical: 12, fontSize: 14, lineHeight: 20, fontWeight: "500", color: savedColors.navy },
  clearSearch: { width: sizes.touch, height: sizes.touch, alignItems: "center", justifyContent: "center" },
  clearSearchText: { fontSize: 24, lineHeight: 26, color: savedColors.muted },
  filterList: { gap: spacing.xs, paddingRight: spacing.lg },
  filterChip: { minHeight: sizes.touch, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.white },
  filterChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterChipText: { ...typography.caption, color: savedColors.secondary },
  filterChipTextSelected: { color: colors.primary },
  trueEmpty: { alignItems: "center", marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, borderRadius: 22, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: savedColors.pageSoft },
  emptyIllustration: { width: 238, height: 154 },
  emptyTitle: { marginTop: spacing.xs, fontSize: 19, lineHeight: 26, fontWeight: "900", color: savedColors.navy, textAlign: "center" },
  emptyBody: { marginTop: spacing.xs, fontSize: 14, lineHeight: 21, fontWeight: "500", color: savedColors.secondary, textAlign: "center" },
  exploreButton: { minWidth: 164, minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: 14, backgroundColor: colors.primary },
  exploreButtonText: { ...typography.button, fontSize: 15, color: colors.white },
  undoBanner: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: sizes.tabBar + spacing.sm, zIndex: 40, minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.xs, borderRadius: 16, backgroundColor: savedColors.navy, ...shadows.floating },
  undoText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700", color: colors.white },
  undoAction: { minHeight: sizes.touch, justifyContent: "center", paddingHorizontal: spacing.xs },
  undoActionText: { fontSize: 13, lineHeight: 19, fontWeight: "900", color: "#AFCFFF" },
  undoClose: { width: 34, height: sizes.touch, alignItems: "center", justifyContent: "center" },
  undoCloseText: { fontSize: 22, lineHeight: 24, color: "#C9D4EA" },
  pressed: { opacity: 0.82 },
});
