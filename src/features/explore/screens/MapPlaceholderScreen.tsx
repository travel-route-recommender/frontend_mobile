import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader, Card, Chip, Screen } from "../../../components/common";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { PlaceCard } from "../../places/components/PlaceCard";
import { AddCandidateTripPickerModal, ExploreSortMenu, ExploreViewToggle, FilterChips, PlaceFeedbackBanner, PlaceSearchInput } from "../../places/components/PlaceExploreControls";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { searchPlaces } from "../../places/logic/placeSearch";
import { buildPlaceCardViewModel } from "../../places/selectors/placeSelectors";
import { placeRepository } from "../../places/services/placeDataPolicy";
import { useExploreSearchStore } from "../store/useExploreSearchStore";

export function ExploreMapScreen() {
  const router = useRouter();
  const actions = usePlaceActions();
  const searchState = useExploreSearchStore();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const allPlaces = useMemo(() => Object.values(actions.source.placesById), [actions.source.placesById]);
  const savedIds = useMemo(() => new Set(actions.source.savedPlaceIdsByUserId[actions.source.currentUserId] ?? []), [actions.source.currentUserId, actions.source.savedPlaceIdsByUserId]);
  const categories = useMemo(() => [...new Set(allPlaces.map((place) => place.category.trim() || "기타"))].sort((left, right) => left.localeCompare(right, "ko")), [allPlaces]);
  const placesIgnoringRegion = useMemo(() => searchPlaces(allPlaces, { keyword: searchState.keyword, regionId: "all", category: searchState.selectedCategory, sort: searchState.sortOption }, actions.source.regionsById, savedIds), [actions.source.regionsById, allPlaces, savedIds, searchState.keyword, searchState.selectedCategory, searchState.sortOption]);
  const filteredPlaces = useMemo(() => searchPlaces(allPlaces, { keyword: searchState.keyword, regionId: searchState.selectedRegionId, category: searchState.selectedCategory, sort: searchState.sortOption }, actions.source.regionsById, savedIds), [actions.source.regionsById, allPlaces, savedIds, searchState.keyword, searchState.selectedCategory, searchState.selectedRegionId, searchState.sortOption]);
  const selectedPlace = filteredPlaces.find((place) => place.id === selectedPlaceId) ?? filteredPlaces[0];
  const selectedViewModel = selectedPlace ? buildPlaceCardViewModel(actions.source, selectedPlace.id) : null;
  const regionItems = [{ value: "all", label: "전체 지역" }, ...Object.values(actions.source.regionsById).map((region) => ({ value: region.id, label: region.shortName || region.name }))];
  const categoryItems = [{ value: "all", label: "전체" }, ...categories.map((category) => ({ value: category, label: category }))];
  const regionCounts = useMemo(() => Object.fromEntries(Object.keys(actions.source.regionsById).map((regionId) => [regionId, placesIgnoringRegion.filter((place) => place.regionId === regionId).length])), [actions.source.regionsById, placesIgnoringRegion]);

  if (!placeRepository.available) return <Screen><AppHeader title="지도 탐색" onBack={() => router.back()} /><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></Screen>;

  return <Screen testID="explore-map-fallback">
    <AppHeader title="지역 지도 탐색" subtitle="검색 조건은 목록과 함께 유지돼요" onBack={() => { searchState.setViewMode("list"); router.replace("/(tabs)/explore"); }} />
    <PlaceSearchInput value={searchState.keyword} onChangeText={searchState.setKeyword} onClear={() => searchState.setKeyword("")} placeholder="지역 보드에서 장소 검색" />
    <View style={styles.controlGap}><FilterChips label="카테고리" items={categoryItems} selected={searchState.selectedCategory} onSelect={searchState.setCategory} /></View>
    <View style={styles.toolbar}><ExploreSortMenu value={searchState.sortOption} onChange={searchState.setSort} /><ExploreViewToggle value="map" onChange={(mode) => { searchState.setViewMode(mode); if (mode === "list") router.replace("/(tabs)/explore"); }} /></View>
    <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />

    <Card style={styles.mapCard}>
      <View style={styles.mapHeading}><View style={styles.flex}><Text style={styles.sectionTitle}>지역별 장소 보드</Text><Text style={styles.body}>현재 Place에는 좌표가 없어 실제 지도 marker를 만들지 않았어요. 지역을 눌러 같은 검색 결과를 살펴볼 수 있어요.</Text></View><Chip label={`${filteredPlaces.length}곳`} selected /></View>
      <View accessibilityLabel="실제 좌표 지도가 아닌 지역별 장소 선택 보드" style={styles.board}>
        {Object.values(actions.source.regionsById).map((region, index) => { const selected = searchState.selectedRegionId === region.id; const count = regionCounts[region.id] ?? 0; return <Pressable key={region.id} accessibilityRole="button" accessibilityLabel={`${region.name} ${count}곳`} accessibilityState={{ selected }} onPress={() => searchState.setRegion(region.id)} style={[styles.regionNode, selected && styles.regionNodeSelected, index % 2 === 0 ? styles.nodeLeft : styles.nodeRight]}><Text style={[styles.regionName, selected && styles.regionNameSelected]}>{region.shortName || region.name}</Text><Text style={[styles.regionCount, selected && styles.regionNameSelected]}>{count}곳</Text></Pressable>; })}
      </View>
      <FilterChips label="지역 빠른 선택" items={regionItems} selected={searchState.selectedRegionId} onSelect={searchState.setRegion} />
    </Card>

    <View style={styles.section}><Text style={styles.sectionTitle}>{searchState.selectedRegionId === "all" ? "전체 지역 결과" : `${actions.source.regionsById[searchState.selectedRegionId]?.name ?? "선택 지역"} 결과`}</Text>{filteredPlaces.length ? <View style={styles.placeChoices}>{filteredPlaces.slice(0, 6).map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityState={{ selected: selectedPlace?.id === place.id }} onPress={() => setSelectedPlaceId(place.id)} style={[styles.placeChoice, selectedPlace?.id === place.id && styles.placeChoiceSelected]}><Text numberOfLines={1} style={styles.placeChoiceName}>{place.name}</Text><Text style={styles.placeChoiceMeta}>{place.category}</Text></Pressable>)}</View> : <EmptyState title="표시할 장소가 없어요" description="검색어나 필터를 바꿔 보세요." ctaLabel="조건 초기화" onPress={searchState.resetFilters} />}</View>
    {selectedViewModel ? <View style={styles.section}><Text style={styles.sectionTitle}>선택한 장소</Text><PlaceCard viewModel={selectedViewModel} onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: selectedViewModel.id } })} onToggleSaved={() => actions.toggleSaved(selectedViewModel.id)} onAddCandidate={() => actions.requestCandidate(selectedViewModel.id)} /></View> : null}

    <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={actions.source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
    {actions.memberGatePrompt}
  </Screen>;
}

export const MapPlaceholderScreen = ExploreMapScreen;

const styles = StyleSheet.create({
  controlGap: { marginTop: spacing.md }, toolbar: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.xs, marginVertical: spacing.md }, mapCard: { gap: spacing.md }, mapHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }, flex: { flex: 1 }, sectionTitle: { ...typography.subtitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary }, board: { minHeight: 280, justifyContent: "center", gap: spacing.xs, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.backgroundStrong }, regionNode: { minWidth: 92, minHeight: 52, alignItems: "center", justifyContent: "center", alignSelf: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, regionNodeSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, nodeLeft: { transform: [{ translateX: -42 }] }, nodeRight: { transform: [{ translateX: 42 }] }, regionName: { ...typography.bodyStrong, color: colors.text }, regionCount: { ...typography.caption, color: colors.textSecondary }, regionNameSelected: { color: colors.white },
  section: { gap: spacing.md, marginTop: spacing.xl }, placeChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, placeChoice: { width: "48%", minHeight: 58, justifyContent: "center", padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, placeChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, placeChoiceName: { ...typography.bodyStrong, color: colors.text }, placeChoiceMeta: { ...typography.caption, color: colors.textSecondary },
});
