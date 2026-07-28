import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Screen, SectionHeader } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { queryKeys } from "../../../query/keys";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { AddCandidateTripPickerModal, PlaceFeedbackBanner } from "../components/PlaceExploreControls";
import { PlaceCard as RelatedPlaceCard } from "../components/PlaceCard";
import { usePlaceActions } from "../hooks/usePlaceActions";
import { findSimilarPlaces } from "../logic/placeSearch";
import { buildPlaceCardViewModel } from "../selectors/placeSelectors";
import { getBackendPlace } from "../services/placeApi";
import { placeRepository } from "../services/placeDataPolicy";
import {
  buildExploreListHref,
  buildPlaceDetailHref,
  resolveTripExploreContext,
} from "../../explore/logic/exploreNavigation";

const HERO_MIN_HEIGHT = 284;
const HERO_MAX_HEIGHT = 420;
const BOTTOM_ACTION_SPACE = 128;

export function PlaceDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    placeId?: string | string[];
    tripId?: string | string[];
    origin?: string | string[];
  }>();
  const placeId = Array.isArray(params.placeId) ? params.placeId[0] : params.placeId;
  const tripExploreContext = useMemo(
    () => resolveTripExploreContext(params.tripId, params.origin),
    [params.origin, params.tripId],
  );
  const backToExplore = () => router.dismissTo(buildExploreListHref(tripExploreContext));
  const hydrationError = useDuriHydrationState((state) => state.hydrationError);
  const upsertPlaces = useDuriStore((state) => state.upsertPlaces);
  const actions = usePlaceActions();
  const [expandedSummaryPlaceId, setExpandedSummaryPlaceId] = useState<string | undefined>();
  const [failedHeroImageUrl, setFailedHeroImageUrl] = useState<string | undefined>();
  const detailQuery = useQuery({
    queryKey: queryKeys.places.detail(placeId ?? ""),
    queryFn: ({ signal }) => getBackendPlace(placeId ?? "", signal),
    enabled: placeRepository.remoteEnabled && Boolean(placeId),
  });
  const source = useMemo(() => (
    detailQuery.data
      ? { ...actions.source, placesById: { ...actions.source.placesById, [detailQuery.data.id]: detailQuery.data } }
      : actions.source
  ), [actions.source, detailQuery.data]);
  const place = placeId ? source.placesById[placeId] : undefined;
  const viewModel = useMemo(() => placeId ? buildPlaceCardViewModel(source, placeId) : null, [source, placeId]);
  const similar = useMemo(() => place ? findSimilarPlaces({ place, places: Object.values(source.placesById), limit: 3 }) : [], [source.placesById, place]);
  const similarCards = useMemo(() => Object.fromEntries(similar.flatMap((item) => {
    const card = buildPlaceCardViewModel(source, item.id);
    return card ? [[item.id, card]] : [];
  })), [source, similar]);
  const summaryLoading = placeRepository.remoteEnabled && detailQuery.isFetching && !viewModel?.summary;
  const canExpandSummary = (viewModel?.summary.length ?? 0) > 90;
  const summaryExpanded = expandedSummaryPlaceId === placeId;
  const heroHeight = Math.min(HERO_MAX_HEIGHT, Math.max(HERO_MIN_HEIGHT, width * 0.76));

  useEffect(() => {
    if (detailQuery.data) upsertPlaces([detailQuery.data]);
  }, [detailQuery.data, upsertPlaces]);

  if (!placeRepository.available) {
    return <DetailStatusScreen onBack={tripExploreContext ? backToExplore : () => router.back()}><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></DetailStatusScreen>;
  }
  if (hydrationError) return <DetailStatusScreen onBack={tripExploreContext ? backToExplore : () => router.back()}><ErrorState message={hydrationError} /></DetailStatusScreen>;
  if (placeRepository.remoteEnabled && detailQuery.isLoading && !place) {
    return <DetailStatusScreen onBack={tripExploreContext ? backToExplore : () => router.back()}><LoadingState label="한국관광공사 상세 데이터를 불러오고 있어요." /></DetailStatusScreen>;
  }
  if (placeRepository.remoteEnabled && detailQuery.isError && !place) {
    return <DetailStatusScreen onBack={tripExploreContext ? backToExplore : () => router.back()}><ErrorState message={detailQuery.error instanceof Error ? detailQuery.error.message : "한국관광공사 상세 데이터를 불러오지 못했어요."} onRetry={() => { void detailQuery.refetch(); }} /></DetailStatusScreen>;
  }
  if (!place || !viewModel) {
    return <DetailStatusScreen onBack={backToExplore}><ErrorState message="존재하지 않거나 삭제된 장소예요." onRetry={backToExplore} /></DetailStatusScreen>;
  }

  const summaryText = viewModel.summary || (summaryLoading ? "소개를 불러오는 중이에요." : "아직 제공된 소개가 없어요.");
  const candidateLabel = viewModel.activeTripCandidateState === "not-added" ? "여행방 후보 추가" : "후보 확인";

  return <Screen scroll={false} padded={false} testID="place-detail-screen">
    <View style={styles.shell}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: BOTTOM_ACTION_SPACE + Math.max(insets.bottom, spacing.sm) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          {viewModel.imageUrl && failedHeroImageUrl !== viewModel.imageUrl
            ? <Image source={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 대표 이미지`} contentFit="cover" onError={() => setFailedHeroImageUrl(viewModel.imageUrl)} style={styles.heroImage} />
            : <View accessibilityLabel={`${viewModel.name} 이미지 없음`} style={styles.heroFallback}><Text style={styles.heroFallbackText}>두리</Text></View>}
          <View pointerEvents="none" style={styles.heroShade} />
          <View style={styles.heroTitleBlock}>
            <Text numberOfLines={2} style={styles.heroTitle}>{viewModel.name}</Text>
            <Text numberOfLines={1} style={styles.heroMeta}>{viewModel.regionName} · {viewModel.categoryLabel}</Text>
          </View>
        </View>

        <View style={styles.contentPanel}>
          {viewModel.tags.length || viewModel.hiddenTagCount ? <View style={styles.tags}>
            {viewModel.tags.map((tag) => <Chip key={tag} label={tag} />)}
            {viewModel.hiddenTagCount ? <Chip label={`+${viewModel.hiddenTagCount}`} /> : null}
          </View> : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>장소 소개</Text>
            <Text numberOfLines={viewModel.summary && !summaryExpanded ? 2 : undefined} style={[styles.body, summaryLoading && styles.bodyMuted]}>{summaryText}</Text>
            {canExpandSummary ? <Pressable accessibilityRole="button" accessibilityLabel={summaryExpanded ? "장소 소개 접기" : "장소 소개 더보기"} onPress={() => setExpandedSummaryPlaceId((current) => current === placeId ? undefined : placeId)} style={styles.moreButton}><Text style={styles.moreText}>{summaryExpanded ? "접기" : "더보기"}</Text></Pressable> : null}
          </View>

          {place.address ? <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>위치 정보</Text>
            <Text selectable style={styles.body}>{place.address}</Text>
          </View> : null}

          <View style={styles.sectionCard}>
            <View style={styles.reviewHeader}><Text style={styles.sectionTitle}>사용자 리뷰</Text><Chip label="0개" /></View>
            <View style={styles.reviewEmpty}><Text style={styles.body}>아직 등록된 사용자 리뷰가 없어요.</Text></View>
          </View>

          {similar.length ? <View style={styles.similar}>
            <SectionHeader title="함께 둘러볼 장소" />
            <Text style={styles.caption}>같은 지역·카테고리·태그가 겹치는 장소예요.</Text>
            {similar.map((item) => {
              const card = similarCards[item.id];
              return card ? <RelatedPlaceCard key={item.id} viewModel={card} onPress={() => router.push(buildPlaceDetailHref(item.id, tripExploreContext))} onToggleSaved={() => actions.toggleSaved(item.id)} onAddCandidate={() => actions.requestCandidate(item.id)} /> : null;
            })}
          </View> : null}
        </View>
      </ScrollView>

      <View style={styles.floatingTitleBar}>
        <DetailBackButton onPress={tripExploreContext ? backToExplore : () => router.back()} />
        <Text numberOfLines={1} style={styles.stickyTitle}>{viewModel.name}</Text>
        <View style={styles.stickySpacer} />
      </View>

      <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={viewModel.isSaved ? "저장 해제" : "내 장소로 저장"} onPress={() => actions.toggleSaved(place.id)} style={({ pressed }) => [styles.saveButton, viewModel.isSaved && styles.saveButtonActive, pressed && styles.pressed]}>
          <Text style={[styles.saveIcon, viewModel.isSaved && styles.saveIconActive]}>{viewModel.isSaved ? "♥" : "♡"}</Text>
          <Text style={[styles.saveText, viewModel.isSaved && styles.saveTextActive]}>{viewModel.isSaved ? "저장됨" : "저장"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name} ${candidateLabel}`} onPress={() => actions.requestCandidate(place.id)} style={({ pressed }) => [styles.candidateButton, pressed && styles.pressed]}>
          <Text style={styles.candidateText}>{candidateLabel}</Text>
        </Pressable>
      </View>

      <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
      <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
      {actions.memberGatePrompt}
    </View>
  </Screen>;
}

function DetailStatusScreen({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return <Screen><View style={styles.statusHeader}><DetailBackButton onPress={onBack} /></View>{children}</Screen>;
}

function DetailBackButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={10} onPress={onPress} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Chevron direction="left" color={colors.text} /></Pressable>;
}

function Chevron({ direction, color }: { direction: "left" | "right"; color: string }) {
  return <View style={styles.chevronFrame}>
    <View style={[styles.chevronLine, { backgroundColor: color }, direction === "left" ? styles.chevronLeftTop : styles.chevronRightTop]} />
    <View style={[styles.chevronLine, { backgroundColor: color }, direction === "left" ? styles.chevronLeftBottom : styles.chevronRightBottom]} />
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1 },
  hero: { position: "relative", width: "100%", overflow: "hidden", backgroundColor: colors.primarySoft },
  heroImage: { width: "100%", height: "100%" },
  heroFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  heroFallbackText: { ...typography.title, color: colors.primary },
  heroShade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(15, 29, 66, 0.2)" },
  heroTitleBlock: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, gap: spacing.xs },
  heroTitle: { ...typography.display, color: colors.white },
  heroMeta: { ...typography.bodyStrong, color: "rgba(255, 255, 255, 0.88)" },
  floatingTitleBar: { position: "absolute", left: 0, right: 0, top: 0, minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: "rgba(255, 255, 255, 0.94)", borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 8 },
  stickyTitle: { ...typography.bodyStrong, color: colors.text, flex: 1, textAlign: "center" },
  stickySpacer: { width: 44, height: 44 },
  statusHeader: { minHeight: 54, justifyContent: "center" },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chevronFrame: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  chevronLine: { position: "absolute", width: 10, height: 2.4, borderRadius: radius.pill },
  chevronLeftTop: { left: 5, top: 6, transform: [{ rotate: "-45deg" }] },
  chevronLeftBottom: { left: 5, bottom: 6, transform: [{ rotate: "45deg" }] },
  chevronRightTop: { right: 5, top: 6, transform: [{ rotate: "45deg" }] },
  chevronRightBottom: { right: 5, bottom: 6, transform: [{ rotate: "-45deg" }] },
  contentPanel: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.md },
  sectionCard: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.card },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
  bodyMuted: { color: colors.textMuted },
  moreButton: { alignSelf: "flex-start", minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.xs },
  moreText: { ...typography.caption, color: colors.primary },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  reviewEmpty: { minHeight: 64, justifyContent: "center", paddingVertical: spacing.sm },
  caption: { ...typography.caption, color: colors.textSecondary },
  similar: { gap: spacing.md, paddingTop: spacing.sm },
  bottomActionBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, ...shadows.floating },
  saveButton: { width: 92, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong },
  saveButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  saveIcon: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  saveIconActive: { color: colors.primary },
  saveText: { ...typography.caption, color: colors.textSecondary },
  saveTextActive: { color: colors.primary },
  candidateButton: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.primary },
  candidateText: { ...typography.button, color: colors.white },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
});
