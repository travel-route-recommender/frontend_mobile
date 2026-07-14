import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { Screen } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { placeRepository } from "../../places/services/placeDataPolicy";
import { buildPlaceCardViewModel, selectActiveCandidateTrip } from "../../places/selectors/placeSelectors";
import { searchPlaces } from "../../places/logic/placeSearch";
import { PlaceCard } from "../../places/components/PlaceCard";
import {
  ActiveTripBanner,
  ActiveTripSelectorModal,
  AddCandidateTripPickerModal,
  ExploreSortMenu,
  ExploreViewToggle,
  FilterChips,
  PlaceFeedbackBanner,
  PlaceSearchInput,
} from "../../places/components/PlaceExploreControls";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { useExploreSearchStore } from "../store/useExploreSearchStore";

export function ExploreScreen() {
  const router = useRouter();
  const actions = usePlaceActions();
  const searchState = useExploreSearchStore();
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const activeTrip = selectActiveCandidateTrip(actions.source);
  const places = useMemo(() => Object.values(actions.source.placesById), [actions.source.placesById]);
  const savedIds = useMemo(() => new Set(actions.source.savedPlaceIdsByUserId[actions.source.currentUserId] ?? []), [actions.source.currentUserId, actions.source.savedPlaceIdsByUserId]);
  const categories = useMemo(() => [...new Set(places.map((place) => place.category.trim() || "기타"))].sort((left, right) => left.localeCompare(right, "ko")), [places]);
  const filteredPlaces = useMemo(() => searchPlaces(places, { keyword: searchState.keyword, regionId: searchState.selectedRegionId, category: searchState.selectedCategory, sort: searchState.sortOption }, actions.source.regionsById, savedIds), [actions.source.regionsById, places, savedIds, searchState.keyword, searchState.selectedCategory, searchState.selectedRegionId, searchState.sortOption]);
  const cardsById = useMemo(() => Object.fromEntries(filteredPlaces.flatMap((place) => { const viewModel = buildPlaceCardViewModel(actions.source, place.id); return viewModel ? [[place.id, viewModel]] : []; })), [actions.source, filteredPlaces]);
  const hasFilters = Boolean(searchState.keyword || searchState.selectedRegionId !== "all" || searchState.selectedCategory !== "all" || searchState.sortOption !== "default");
  const regionItems = [{ value: "all", label: "전체 지역" }, ...Object.values(actions.source.regionsById).map((region) => ({ value: region.id, label: region.shortName || region.name }))];
  const categoryItems = [{ value: "all", label: "전체" }, ...categories.map((category) => ({ value: category, label: category }))];

  if (!placeRepository.available) return <Screen><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></Screen>;
  if (actions.source.currentUserId && !actions.source.usersById[actions.source.currentUserId]) return <Screen><ErrorState message="현재 사용자 정보를 찾을 수 없어 저장과 후보 관계를 불러오지 못했어요." /></Screen>;

  const header = <View style={styles.header}>
    <View style={styles.heading}><Text style={styles.title}>어디를 둘러볼까요?</Text><Text style={styles.subtitle}>지역과 취향에 맞는 장소를 찾아 여행 후보로 이어보세요.</Text></View>
    <PlaceSearchInput value={searchState.keyword} onChangeText={searchState.setKeyword} onClear={() => searchState.setKeyword("")} placeholder={activeTrip ? `${activeTrip.title} 후보 장소 검색` : "장소, 지역, 태그 검색"} />
    <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
    <ActiveTripBanner trip={activeTrip} region={activeTrip ? actions.source.regionsById[activeTrip.regionId] : undefined} onChange={() => setTripPickerOpen(true)} />
    <FilterChips label="지역" items={regionItems} selected={searchState.selectedRegionId} onSelect={searchState.setRegion} />
    <FilterChips label="카테고리" items={categoryItems} selected={searchState.selectedCategory} onSelect={searchState.setCategory} />
    <View style={styles.resultRow}><View><Text style={styles.resultTitle}>장소 목록</Text><Text style={styles.resultCount}>검색 결과 {filteredPlaces.length}곳</Text></View><View style={styles.resultActions}><ExploreSortMenu value={searchState.sortOption} onChange={searchState.setSort} /><ExploreViewToggle value="list" onChange={(mode) => { searchState.setViewMode(mode); if (mode === "map") router.push("/explore/map"); }} /></View></View>
    {hasFilters ? <Pressable accessibilityRole="button" accessibilityLabel="검색 조건 초기화" onPress={searchState.resetFilters} style={styles.reset}><Text style={styles.resetText}>검색 조건 초기화</Text></Pressable> : null}
  </View>;

  return <Screen scroll={false}><FlatList
    data={filteredPlaces}
    keyExtractor={(place) => place.id}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.list}
    ItemSeparatorComponent={() => <View style={styles.gap} />}
    ListHeaderComponent={header}
    ListEmptyComponent={<EmptyState title="검색 결과가 없어요" description="검색어나 지역·카테고리 조건을 바꿔 다시 찾아보세요." ctaLabel="조건 초기화" onPress={searchState.resetFilters} />}
    renderItem={({ item }) => { const viewModel = cardsById[item.id]; return viewModel ? <PlaceCard viewModel={viewModel} onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } })} onToggleSaved={() => actions.toggleSaved(item.id)} onAddCandidate={() => actions.requestCandidate(item.id)} /> : null; }}
  />
  <ActiveTripSelectorModal visible={tripPickerOpen} trips={actions.eligibleTrips} regionsById={actions.source.regionsById} activeTripId={actions.source.activeTripId} onSelect={(trip) => { actions.setActiveTrip(trip.id); searchState.setRegion(trip.regionId); setTripPickerOpen(false); }} onClose={() => setTripPickerOpen(false)} />
  <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={actions.source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
  {actions.memberGatePrompt}</Screen>;
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl }, header: { gap: spacing.md, marginBottom: spacing.lg }, heading: { gap: spacing.xs }, title: { ...typography.display, color: colors.text }, subtitle: { ...typography.body, color: colors.textSecondary }, gap: { height: spacing.md },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, resultTitle: { ...typography.subtitle, color: colors.text }, resultCount: { ...typography.caption, color: colors.textSecondary }, resultActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, reset: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primarySoft }, resetText: { ...typography.caption, color: colors.primary },
});
