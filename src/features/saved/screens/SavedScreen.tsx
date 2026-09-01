import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { Screen } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AddCandidateTripPickerModal, PlaceFeedbackBanner } from "../../places/components/PlaceExploreControls";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { filterPlaces } from "../../places/logic/placeSearch";
import { buildPlaceCardViewModel, selectResolvedSavedPlaces } from "../../places/selectors/placeSelectors";
import { placeRepository } from "../../places/services/placeDataPolicy";
import { SavedFilterChips, SavedPlaceCard, SavedSearchInput, SavedTrueEmpty, SavedUndoBanner } from "../components/SavedPlaceCard";

type PendingUndo = { placeId: string; placeName: string };

export function SavedScreen() {
  const router = useRouter();
  const actions = usePlaceActions();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [pendingUndo, setPendingUndo] = useState<PendingUndo>();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resolved = useMemo(() => selectResolvedSavedPlaces(actions.source), [actions.source]);
  const categories = useMemo(() => [...new Set(resolved.places.map((place) => place.category.trim() || "기타"))].sort((left, right) => left.localeCompare(right, "ko")), [resolved.places]);
  const normalizedCategory = category === "all" || categories.includes(category) ? category : "all";
  const filtered = useMemo(() => filterPlaces(resolved.places, { keyword, regionId: "all", category: normalizedCategory }, actions.source.regionsById), [actions.source.regionsById, keyword, normalizedCategory, resolved.places]);
  const cardsById = useMemo(() => Object.fromEntries(filtered.flatMap((place) => { const card = buildPlaceCardViewModel(actions.source, place.id); return card ? [[place.id, card]] : []; })), [actions.source, filtered]);
  const categoryItems = [{ value: "all", label: "전체" }, ...categories.map((item) => ({ value: item, label: item }))];
  const hasFilters = Boolean(keyword || normalizedCategory !== "all");
  const activeTrip = actions.source.tripsById[actions.source.activeTripId];

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const resetFilters = () => {
    setKeyword("");
    setCategory("all");
  };

  const dismissUndo = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = undefined;
    setPendingUndo(undefined);
  };

  const removeSavedPlace = (placeId: string, placeName: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    actions.toggleSaved(placeId, { silent: true });
    setPendingUndo({ placeId, placeName });
    AccessibilityInfo.announceForAccessibility(`${withObjectParticle(placeName)} 저장에서 삭제했어요. 실행 취소할 수 있어요.`);
    undoTimer.current = setTimeout(() => {
      setPendingUndo(undefined);
      undoTimer.current = undefined;
    }, 5200);
  };

  const undoRemove = () => {
    if (!pendingUndo) return;
    actions.toggleSaved(pendingUndo.placeId, { silent: true });
    AccessibilityInfo.announceForAccessibility(`${withObjectParticle(pendingUndo.placeName)} 저장에 다시 추가했어요.`);
    dismissUndo();
  };

  if (!placeRepository.available) return <Screen includeBottomSafeArea={false}><ErrorState message={placeRepository.message ?? "저장 장소 데이터를 사용할 수 없어요."} /></Screen>;
  if (actions.sessionKind !== "member") return <Screen includeBottomSafeArea={false}><View style={styles.gateHeader}><Text style={styles.gateTitle}>저장</Text><Text style={styles.supporting}>{actions.sessionKind === "guest" ? "초대 게스트의 개인 저장은 정식 계정 전환 후 사용할 수 있어요. 참여 여행방 후보 추가는 탐색에서 계속 가능해요." : "탐색은 자유롭게 할 수 있고, 로그인하면 장소를 개인 목록에 저장할 수 있어요."}</Text></View><EmptyState title="회원 전용 저장 공간이에요" description="로그인하거나 가입하면 가고 싶은 장소를 안전하게 모을 수 있어요." ctaLabel="로그인 또는 가입" onPress={() => actions.requestMember("저장한 장소 보기")} />{actions.memberGatePrompt}</Screen>;

  const header = <View style={styles.header}>
    <Text style={styles.pageTitle}>저장</Text>
    <Text style={styles.count}>저장한 장소 {resolved.places.length}곳</Text>
    <Text style={styles.supporting}>마음에 든 장소를 다시 찾고 여행에 활용해보세요.</Text>
    {resolved.missingIds.length ? <View accessibilityRole="alert" style={styles.warning}><Text style={styles.warningText}>저장 관계 {resolved.missingIds.length}개의 장소 정보를 불러오지 못했어요. 관계는 자동 삭제하지 않았어요.</Text></View> : null}
    {resolved.places.length ? <View style={styles.controls}>
      <SavedSearchInput value={keyword} onChangeText={setKeyword} onClear={() => setKeyword("")} />
      <SavedFilterChips items={categoryItems} selected={normalizedCategory} onSelect={setCategory} />
      {hasFilters ? <View style={styles.resultRow}><Text style={styles.resultText}>검색 결과 {filtered.length}곳</Text>{filtered.length ? <Pressable accessibilityRole="button" onPress={resetFilters} style={styles.reset}><Text style={styles.resetText}>조건 초기화</Text></Pressable> : null}</View> : null}
    </View> : null}
  </View>;

  const empty = resolved.places.length
    ? <EmptyState title="조건에 맞는 저장 장소가 없어요" description="검색어나 카테고리를 바꿔보세요." ctaLabel="조건 초기화" onPress={resetFilters} />
    : resolved.missingIds.length
      ? <EmptyState title="저장 장소 정보를 확인하고 있어요" description="저장 관계는 유지했어요. 잠시 뒤 다시 확인해 주세요." />
      : <SavedTrueEmpty onExplore={() => router.push("/(tabs)/explore")} />;

  return <SafeAreaView edges={["top", "right", "left"]} style={styles.safeArea}>
    <FlatList
      data={filtered}
      keyExtractor={(place) => place.id}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) => {
        const card = cardsById[item.id];
        if (!card) return null;
        return <SavedPlaceCard
          viewModel={card}
          activeTripTitle={activeTrip?.title}
          onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } })}
          onUnsave={() => removeSavedPlace(item.id, item.name)}
          onTravelAction={() => card.activeTripCandidateState === "candidate" ? actions.requestCandidate(item.id) : actions.requestCandidatePicker(item.id)}
          {...(card.activeTripCandidateState === "scheduled" && activeTrip ? { onViewSchedule: () => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId: activeTrip.id } }) } : {})}
        />;
      }}
    />
    <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
    {pendingUndo ? <SavedUndoBanner placeName={pendingUndo.placeName} onUndo={undoRemove} onClose={dismissUndo} /> : null}
    <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={actions.source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
    {actions.memberGatePrompt}
  </SafeAreaView>;
}

function withObjectParticle(value: string) {
  const lastCode = value.charCodeAt(value.length - 1);
  if (lastCode >= 0xac00 && lastCode <= 0xd7a3) return `${value}${(lastCode - 0xac00) % 28 ? "을" : "를"}`;
  return `${value}을(를)`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 112, backgroundColor: colors.white },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  pageTitle: { fontSize: 26, lineHeight: 34, fontWeight: "900", color: "#17265F" },
  count: { marginTop: spacing.xs, fontSize: 18, lineHeight: 25, fontWeight: "900", color: "#17265F" },
  supporting: { ...typography.body, color: "#60719B" },
  controls: { gap: spacing.sm, marginTop: spacing.sm },
  gap: { height: spacing.sm },
  warning: { marginTop: spacing.xs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  warningText: { ...typography.caption, color: colors.warning },
  resultRow: { minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  resultText: { ...typography.caption, color: "#60719B" },
  reset: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  resetText: { ...typography.caption, color: colors.primary },
  gateHeader: { gap: spacing.xs, marginBottom: spacing.lg },
  gateTitle: { fontSize: 26, lineHeight: 34, fontWeight: "900", color: "#17265F" },
});
