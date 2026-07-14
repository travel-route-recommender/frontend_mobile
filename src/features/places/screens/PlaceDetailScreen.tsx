import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppHeader, Card, Chip, PrimaryButton, RemoteImage, Screen, SecondaryButton, SectionHeader } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";
import { AddCandidateTripPickerModal, PlaceFeedbackBanner } from "../components/PlaceExploreControls";
import { PlaceCard } from "../components/PlaceCard";
import { usePlaceActions } from "../hooks/usePlaceActions";
import { findSimilarPlaces } from "../logic/placeSearch";
import { buildPlaceCardViewModel } from "../selectors/placeSelectors";
import { placeRepository } from "../services/placeDataPolicy";

export function PlaceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string | string[] }>();
  const placeId = Array.isArray(params.placeId) ? params.placeId[0] : params.placeId;
  const hydrationError = useDuriStore((state) => state.hydrationError);
  const actions = usePlaceActions();
  const place = placeId ? actions.source.placesById[placeId] : undefined;
  const viewModel = useMemo(() => placeId ? buildPlaceCardViewModel(actions.source, placeId) : null, [actions.source, placeId]);
  const similar = useMemo(() => place ? findSimilarPlaces({ place, places: Object.values(actions.source.placesById), limit: 3 }) : [], [actions.source.placesById, place]);
  const similarCards = useMemo(() => Object.fromEntries(similar.flatMap((item) => { const card = buildPlaceCardViewModel(actions.source, item.id); return card ? [[item.id, card]] : []; })), [actions.source, similar]);

  if (!placeRepository.available) return <Screen><AppHeader title="장소 상세" onBack={() => router.back()} /><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></Screen>;
  if (hydrationError) return <Screen><AppHeader title="장소 상세" onBack={() => router.back()} /><ErrorState message={hydrationError} /></Screen>;
  if (!place || !viewModel) return <Screen><AppHeader title="장소 상세" onBack={() => router.replace("/(tabs)/explore")} /><ErrorState message="존재하지 않거나 삭제된 장소예요." /><SecondaryButton label="탐색으로 돌아가기" onPress={() => router.replace("/(tabs)/explore")} /></Screen>;

  return <Screen testID="place-detail-screen">
    <AppHeader title="장소 상세" subtitle={viewModel.regionName} onBack={() => router.back()} />
    <RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 대표 이미지`} aspectRatio={1.35} />
    <View style={styles.heading}><Text style={styles.title}>{viewModel.name}</Text><View style={styles.meta}><Chip label={viewModel.categoryLabel} />{viewModel.rating !== undefined ? <Text style={styles.metaText}>★ {viewModel.rating.toFixed(1)}</Text> : null}{viewModel.distanceLabel ? <Text style={styles.metaText}>{viewModel.distanceLabel}</Text> : null}</View></View>
    <View style={styles.tags}>{place.tags.map((tag) => <Chip key={tag} label={tag} />)}</View>
    <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
    <Card style={styles.info}><Text style={styles.sectionTitle}>장소 소개</Text><Text style={styles.body}>{place.summary}</Text></Card>
    {place.address ? <Card style={styles.info}><Text style={styles.sectionTitle}>위치 정보</Text><Text style={styles.body}>{place.address}</Text><Text style={styles.caption}>좌표 데이터가 없어 실제 지도 위치는 표시하지 않았어요.</Text></Card> : null}
    <View style={styles.actions}><PrimaryButton label={viewModel.isSaved ? "저장 해제" : "내 장소로 저장"} onPress={() => actions.toggleSaved(place.id)} /><SecondaryButton label={viewModel.activeTripCandidateState === "not-added" ? "여행방 후보로 추가" : "후보 여행방 확인"} onPress={() => actions.requestCandidate(place.id)} /></View>

    {similar.length ? <View style={styles.similar}><SectionHeader title="함께 둘러볼 장소" /><Text style={styles.caption}>같은 지역·카테고리·태그가 겹치는 장소예요.</Text>{similar.map((item) => { const card = similarCards[item.id]; return card ? <PlaceCard key={item.id} viewModel={card} onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } })} onToggleSaved={() => actions.toggleSaved(item.id)} onAddCandidate={() => actions.requestCandidate(item.id)} /> : null; })}</View> : null}

    <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={actions.source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
    {actions.memberGatePrompt}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: spacing.sm, marginTop: spacing.lg }, title: { ...typography.title, color: colors.text }, meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs }, metaText: { ...typography.caption, color: colors.textSecondary }, tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginVertical: spacing.md }, info: { gap: spacing.xs, marginBottom: spacing.md }, sectionTitle: { ...typography.subtitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary }, caption: { ...typography.caption, color: colors.textSecondary }, actions: { gap: spacing.sm, marginBottom: spacing.xl }, similar: { gap: spacing.md, marginTop: spacing.md },
});
