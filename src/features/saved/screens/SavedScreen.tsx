import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { Screen } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { PlaceCard } from "../../places/components/PlaceCard";
import { AddCandidateTripPickerModal, FilterChips, PlaceFeedbackBanner, PlaceSearchInput } from "../../places/components/PlaceExploreControls";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { filterPlaces } from "../../places/logic/placeSearch";
import { buildPlaceCardViewModel, selectResolvedSavedPlaces } from "../../places/selectors/placeSelectors";
import { placeRepository } from "../../places/services/placeDataPolicy";

export function SavedScreen() {
  const router = useRouter();
  const actions = usePlaceActions();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const resolved = useMemo(() => selectResolvedSavedPlaces(actions.source), [actions.source]);
  const categories = useMemo(() => [...new Set(resolved.places.map((place) => place.category.trim() || "기타"))].sort((left, right) => left.localeCompare(right, "ko")), [resolved.places]);
  const normalizedCategory = category === "all" || categories.includes(category) ? category : "all";
  const filtered = useMemo(() => filterPlaces(resolved.places, { keyword, regionId: "all", category: normalizedCategory }, actions.source.regionsById), [actions.source.regionsById, keyword, normalizedCategory, resolved.places]);
  const cardsById = useMemo(() => Object.fromEntries(filtered.flatMap((place) => { const card = buildPlaceCardViewModel(actions.source, place.id); return card ? [[place.id, card]] : []; })), [actions.source, filtered]);
  const categoryItems = [{ value: "all", label: "전체" }, ...categories.map((item) => ({ value: item, label: item }))];
  const hasFilters = Boolean(keyword || normalizedCategory !== "all");

  if (!placeRepository.available) return <Screen><ErrorState message={placeRepository.message ?? "저장 장소 데이터를 사용할 수 없어요."} /></Screen>;
  if (actions.sessionKind !== "member") return <Screen><View style={styles.header}><Text style={styles.title}>저장한 장소</Text><Text style={styles.subtitle}>{actions.sessionKind === "guest" ? "초대 게스트의 개인 저장은 정식 계정 전환 후 사용할 수 있어요. 참여 여행방 후보 추가는 탐색에서 계속 가능해요." : "탐색은 자유롭게 할 수 있고, 로그인하면 장소를 개인 목록에 저장할 수 있어요."}</Text></View><EmptyState title="회원 전용 저장 공간이에요" description="로그인하거나 가입하면 가고 싶은 장소를 안전하게 모을 수 있어요." ctaLabel="로그인 또는 가입" onPress={() => actions.requestMember("저장한 장소 보기")} />{actions.memberGatePrompt}</Screen>;

  const header = <View style={styles.header}>
    <View style={styles.hero}><View><Text style={styles.heroEyebrow}>내 여행지</Text><Text style={styles.heroTitle}>저장한 장소</Text><Text style={styles.heroBody}>마음에 든 장소를 다시 보고 여행 후보로 담아보세요.</Text></View><Text style={styles.heroCount}>{resolved.places.length}곳</Text></View>
    {resolved.missingIds.length ? <View accessibilityRole="alert" style={styles.warning}><Text style={styles.warningText}>저장 관계 {resolved.missingIds.length}개의 장소 정보를 불러오지 못했어요. 관계는 자동 삭제하지 않았어요.</Text></View> : null}
    {resolved.places.length ? <><PlaceSearchInput value={keyword} onChangeText={setKeyword} onClear={() => setKeyword("")} placeholder="저장한 장소 검색" /><FilterChips label="카테고리" items={categoryItems} selected={normalizedCategory} onSelect={setCategory} /><View style={styles.resultRow}><Text style={styles.resultText}>조건에 맞는 장소 {filtered.length}곳</Text>{hasFilters ? <Pressable accessibilityRole="button" onPress={() => { setKeyword(""); setCategory("all"); }} style={styles.reset}><Text style={styles.resetText}>조건 초기화</Text></Pressable> : null}</View></> : null}
  </View>;

  return <Screen scroll={false}><FlatList
    data={filtered}
    keyExtractor={(place) => place.id}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.list}
    ItemSeparatorComponent={() => <View style={styles.gap} />}
    ListHeaderComponent={header}
    ListEmptyComponent={resolved.places.length ? <EmptyState title="조건에 맞는 저장 장소가 없어요" description="검색어나 카테고리를 바꿔보세요." ctaLabel="조건 초기화" onPress={() => { setKeyword(""); setCategory("all"); }} /> : <EmptyState title="저장한 장소가 없어요" description="탐색에서 마음에 드는 장소를 저장해 보세요." ctaLabel="장소 탐색하기" onPress={() => router.push("/(tabs)/explore")} />}
    renderItem={({ item }) => { const card = cardsById[item.id]; return card ? <PlaceCard viewModel={card} onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } })} onToggleSaved={() => actions.toggleSaved(item.id)} onAddCandidate={() => actions.requestCandidate(item.id)} /> : null; }}
  />
  <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
  <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={actions.source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
  {actions.memberGatePrompt}</Screen>;
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl }, header: { gap: spacing.md, marginBottom: spacing.lg }, title: { ...typography.display, color: colors.text }, subtitle: { ...typography.body, color: colors.textSecondary }, gap: { height: spacing.md },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primary }, heroEyebrow: { ...typography.caption, color: colors.primarySoft }, heroTitle: { ...typography.display, color: colors.white }, heroBody: { ...typography.body, color: colors.primarySoft, marginTop: spacing.xs, maxWidth: 280 }, heroCount: { ...typography.title, color: colors.white },
  warning: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft }, warningText: { ...typography.caption, color: colors.warning }, resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, resultText: { ...typography.caption, color: colors.textSecondary }, reset: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.primarySoft }, resetText: { ...typography.caption, color: colors.primary },
});
