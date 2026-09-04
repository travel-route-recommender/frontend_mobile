import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import mediumSymbolWeight from "expo-symbols/androidWeights/medium";
import { useQuery } from "@tanstack/react-query";
import { RemoteImage, Screen } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { queryKeys } from "../../../query/keys";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, shadows, spacing } from "../../../theme/tokens";
import { AddCandidateTripPickerModal, PlaceFeedbackBanner } from "../components/PlaceExploreControls";
import { usePlaceActions } from "../hooks/usePlaceActions";
import { findSimilarPlaces } from "../logic/placeSearch";
import { buildClassificationLookup, enrichPlaceClassificationTags } from "../logic/placeClassification";
import { buildPlaceCardViewModel, selectCandidateStateForPlace } from "../selectors/placeSelectors";
import { fetchBackendCategoryCodeTree, getBackendPlace } from "../services/placeApi";
import { placeRepository } from "../services/placeDataPolicy";
import type { PlaceCandidateState, PlaceCardViewModel } from "../types";
import {
  buildExploreListHref,
  buildPlaceDetailHref,
  resolveTripExploreContext,
} from "../../explore/logic/exploreNavigation";

const DETAIL_COLORS = {
  text: "#17265F",
  textSecondary: "#60719B",
  textMuted: "#8290AE",
  border: "#DCE7F7",
  hero: "#F2F8FF",
  lavender: "#F0EDFF",
  lavenderBorder: "#D9D5FF",
  lavenderText: "#735BC4",
  mint: "#EAF7EE",
  mintBorder: "#CDEBDA",
  mintText: "#2E9B66",
  peach: "#FFF0E2",
  peachText: "#D67B24",
} as const;

const HERO_MIN_HEIGHT = 264;
const HERO_MAX_HEIGHT = 300;
const SUMMARY_COLLAPSED_LINES = 3;

function getCompactLocation(address: string, fallback: string) {
  const parts = address.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, Math.min(2, parts.length)).join(" ") || fallback;
}

function isUsableInfoValue(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && !/^(주소 정보 없음|주소 미상|정보 없음|-)$/.test(normalized);
}

export function PlaceDetailScreen() {
  const router = useRouter();
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
  const { setActiveTrip } = actions;
  const detailScrollRef = useRef<ScrollView>(null);
  const [expandedSummaryPlaceId, setExpandedSummaryPlaceId] = useState<string | undefined>();
  const [failedHeroImageUrl, setFailedHeroImageUrl] = useState<string | undefined>();
  const detailQuery = useQuery({
    queryKey: queryKeys.places.detail(placeId ?? ""),
    queryFn: ({ signal }) => getBackendPlace(placeId ?? "", signal),
    enabled: placeRepository.remoteEnabled && Boolean(placeId),
  });
  const categoryCodeTreeQuery = useQuery({
    queryKey: queryKeys.places.categoryCodes(),
    queryFn: ({ signal }) => fetchBackendCategoryCodeTree(signal),
    enabled: placeRepository.remoteEnabled && Boolean(placeId),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
  const classificationLookup = useMemo(
    () => buildClassificationLookup(categoryCodeTreeQuery.data ?? []),
    [categoryCodeTreeQuery.data],
  );
  const detailPlace = useMemo(
    () => detailQuery.data ? enrichPlaceClassificationTags(detailQuery.data, classificationLookup) : undefined,
    [classificationLookup, detailQuery.data],
  );
  const source = useMemo(() => (
    detailPlace
      ? { ...actions.source, placesById: { ...actions.source.placesById, [detailPlace.id]: detailPlace } }
      : actions.source
  ), [actions.source, detailPlace]);
  const place = placeId ? source.placesById[placeId] : undefined;
  const viewModel = useMemo(() => placeId ? buildPlaceCardViewModel(source, placeId) : null, [source, placeId]);
  const similar = useMemo(
    () => place ? findSimilarPlaces({ place, places: Object.values(source.placesById), limit: 3 }) : [],
    [source.placesById, place],
  );
  const similarCards = useMemo(() => Object.fromEntries(similar.flatMap((item) => {
    const card = buildPlaceCardViewModel(source, item.id);
    return card ? [[item.id, card]] : [];
  })), [source, similar]);
  const tripContextTrip = tripExploreContext ? source.tripsById[tripExploreContext.tripId] : undefined;
  const tripContextCandidateCount = tripContextTrip ? (source.candidatesByTripId[tripContextTrip.id] ?? []).length : 0;
  const tripContextScheduledCount = tripContextTrip
    ? new Set((source.itineraryByTripId[tripContextTrip.id] ?? []).map((item) => item.placeId)).size
    : 0;
  const candidateState: PlaceCandidateState = placeId && tripContextTrip
    ? selectCandidateStateForPlace(source, tripContextTrip.id, placeId)
    : viewModel?.activeTripCandidateState ?? "not-added";
  const tripContextLocked = tripContextTrip?.status === "completed";
  const summaryLoading = placeRepository.remoteEnabled && detailQuery.isFetching && !viewModel?.summary;
  const canExpandSummary = (viewModel?.summary.length ?? 0) > 90;
  const summaryExpanded = expandedSummaryPlaceId === placeId;
  const heroHeight = Math.min(HERO_MAX_HEIGHT, Math.max(HERO_MIN_HEIGHT, width * 0.72));
  const relatedCardWidth = Math.max(154, Math.min(178, (width - spacing.lg * 2 - spacing.sm) / 2));

  useEffect(() => {
    if (detailPlace) upsertPlaces([detailPlace]);
  }, [detailPlace, upsertPlaces]);

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [placeId]);

  useEffect(() => {
    if (!tripContextTrip || tripContextTrip.status === "completed" || source.activeTripId === tripContextTrip.id) return;
    if (!tripContextTrip.members.some((member) => member.userId === source.currentUserId)) return;
    setActiveTrip(tripContextTrip.id);
  }, [setActiveTrip, source.activeTripId, source.currentUserId, tripContextTrip]);

  const onBack = tripExploreContext ? backToExplore : () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/explore");
  };

  if (!placeRepository.available) {
    return <DetailStatusScreen onBack={onBack}><ErrorState message={placeRepository.message ?? "장소 데이터를 사용할 수 없어요."} /></DetailStatusScreen>;
  }
  if (hydrationError) return <DetailStatusScreen onBack={onBack}><ErrorState message={hydrationError} /></DetailStatusScreen>;
  if (placeRepository.remoteEnabled && detailQuery.isLoading && !place) {
    return <DetailLoadingScreen heroHeight={heroHeight} onBack={onBack} />;
  }
  if (placeRepository.remoteEnabled && detailQuery.isError && !place) {
    return <DetailStatusScreen onBack={onBack}><ErrorState message={toUserFacingApiErrorMessage(detailQuery.error, "장소 상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")} onRetry={() => { void detailQuery.refetch(); }} /></DetailStatusScreen>;
  }
  if (!place || !viewModel) {
    return <DetailStatusScreen onBack={backToExplore}><ErrorState message="존재하지 않거나 삭제된 장소예요." onRetry={backToExplore} /></DetailStatusScreen>;
  }

  const summaryText = viewModel.summary || (summaryLoading ? "소개를 불러오는 중이에요." : "아직 제공된 소개가 없어요.");
  const compactLocation = getCompactLocation(place.address, viewModel.regionName);
  const visibleTags = viewModel.tags.slice(0, 2);
  const hiddenTagCount = Math.max(0, viewModel.tags.length - visibleTags.length);
  const infoRows = [
    ...(isUsableInfoValue(place.address) ? [{ label: "위치", value: place.address }] : []),
    ...(place.infoItems ?? []).filter((item) => isUsableInfoValue(item.value)),
  ];

  return <Screen scroll={false} padded={false} testID="place-detail-screen">
    <View style={styles.shell}>
      <ScrollView ref={detailScrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: heroHeight }]}>
          {viewModel.imageUrl && failedHeroImageUrl !== viewModel.imageUrl
            ? <Image source={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 대표 이미지`} contentFit="cover" onError={() => setFailedHeroImageUrl(viewModel.imageUrl)} style={styles.heroImage} />
            : <View accessibilityLabel={`${viewModel.name} 이미지 없음`} style={styles.heroFallback}><Text style={styles.heroFallbackText}>등록된 이미지가 없어요</Text></View>}
          <View style={styles.heroActions}>
            <DetailBackButton onPress={onBack} />
            <Pressable accessibilityRole="button" accessibilityLabel={viewModel.isSaved ? `${viewModel.name} 저장 해제` : `${viewModel.name} 저장`} accessibilityState={{ selected: viewModel.isSaved }} hitSlop={8} onPress={() => actions.toggleSaved(place.id)} style={({ pressed }) => [styles.heroHeartButton, pressed && styles.pressed]}>
              <Text style={[styles.heroHeart, viewModel.isSaved && styles.heroHeartSaved]}>{viewModel.isSaved ? "♥" : "♡"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.contentPanel}>
          <View style={styles.identity}>
            <View style={styles.identityMetaRow}>
              <View style={styles.categoryBadge}><Text numberOfLines={1} style={styles.categoryText}>{viewModel.categoryLabel}</Text></View>
              <Text numberOfLines={1} style={styles.locationText}>{compactLocation}</Text>
            </View>
            <Text numberOfLines={2} style={styles.placeName}>{viewModel.name}</Text>
            {(typeof viewModel.rating === "number" || visibleTags.length > 0) ? <View style={styles.placeMetadata}>
              {typeof viewModel.rating === "number" ? <View style={styles.rating}><Text style={styles.ratingStar}>★</Text><Text style={styles.ratingText}>{viewModel.rating.toFixed(1)}</Text></View> : null}
              {visibleTags.map((tag, index) => <View key={tag} style={[styles.tag, index === 1 && styles.tagAlternate]}><Text numberOfLines={1} style={styles.tagText}>{tag}</Text></View>)}
              {hiddenTagCount ? <View style={styles.hiddenTag}><Text style={styles.hiddenTagText}>+{hiddenTagCount}</Text></View> : null}
            </View> : null}
          </View>

          <View style={styles.summaryBlock}>
            <Text numberOfLines={canExpandSummary && !summaryExpanded ? SUMMARY_COLLAPSED_LINES : undefined} style={[styles.summaryText, summaryLoading && styles.mutedText]}>{summaryText}</Text>
            {canExpandSummary ? <Pressable accessibilityRole="button" accessibilityLabel={summaryExpanded ? "소개 접기" : "소개 더 보기"} onPress={() => setExpandedSummaryPlaceId(summaryExpanded ? undefined : placeId)} style={({ pressed }) => [styles.summaryToggle, pressed && styles.pressed]}><Text style={styles.summaryToggleText}>{summaryExpanded ? "접기" : "더 보기"}</Text></Pressable> : null}
          </View>

          {tripExploreContext && tripContextTrip ? <TripContextCard title={tripContextTrip.title} regionName={source.regionsById[tripContextTrip.regionId]?.name} candidateCount={tripContextCandidateCount} scheduledCount={tripContextScheduledCount} /> : null}

          <TravelStateControl
            placeName={viewModel.name}
            state={candidateState}
            locked={tripContextLocked}
            onPress={() => actions.requestCandidate(place.id)}
            onViewSchedule={tripContextTrip ? () => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId: tripContextTrip.id } }) : undefined}
          />

          {infoRows.length ? <View style={styles.section}>
            <Text style={styles.sectionTitle}>기본 정보</Text>
            <View style={styles.infoGroup}>
              {infoRows.map((item, index) => <View key={`${item.label}:${item.value}`} style={[styles.infoRow, index > 0 && styles.infoRowDivider]}>
                <PlaceInfoIcon label={item.label} />
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text selectable style={styles.infoValue}>{item.value}</Text>
              </View>)}
            </View>
          </View> : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>사용자 리뷰</Text>
            <View style={styles.reviewEmpty}><Text style={styles.reviewEmptyText}>아직 등록된 리뷰가 없어요.</Text></View>
          </View>

          {similar.length ? <View style={styles.section}>
            <View style={styles.relatedHeading}><Text style={styles.sectionTitle}>함께 둘러볼 장소</Text><Text style={styles.relatedHint}>같은 지역의 비슷한 장소</Text></View>
            <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRail}>
              {similar.map((item) => {
                const card = similarCards[item.id];
                return card ? <RelatedCompactCard key={item.id} cardWidth={relatedCardWidth} viewModel={card} onPress={() => router.push(buildPlaceDetailHref(item.id, tripExploreContext))} onToggleSaved={() => actions.toggleSaved(item.id)} /> : null;
              })}
            </ScrollView>
          </View> : null}
        </View>
      </ScrollView>

      <AddCandidateTripPickerModal visible={Boolean(actions.selectedPlace)} place={actions.selectedPlace} trips={actions.eligibleTrips} regionsById={source.regionsById} getState={(tripId) => actions.selectedPlace ? actions.getCandidateState(tripId, actions.selectedPlace.id) : "not-added"} onSelect={actions.addToTrip} onCreateTrip={() => { actions.closeCandidatePicker(); router.push("/trips/new"); }} onClose={actions.closeCandidatePicker} />
      <PlaceFeedbackBanner feedback={actions.feedback} onClose={actions.clearFeedback} onAction={(tripId) => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })} />
      {actions.memberGatePrompt}
    </View>
  </Screen>;
}

function TripContextCard({ title, regionName, candidateCount, scheduledCount }: { title: string; regionName?: string; candidateCount: number; scheduledCount: number }) {
  return <View accessibilityRole="text" accessibilityLabel={`${title}, 후보 ${candidateCount}곳, 일정 ${scheduledCount}곳`} style={styles.tripContextCard}>
    <View style={styles.tripContextIcon}><SymbolView name={{ ios: "suitcase.fill", android: "luggage", web: "luggage" }} tintColor={DETAIL_COLORS.lavenderText} size={22} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbol} /></View>
    <View style={styles.flex}><Text style={styles.tripContextEyebrow}>이 여행에 담을 장소를 찾는 중</Text><Text numberOfLines={1} style={styles.tripContextTitle}>{title}</Text><Text numberOfLines={1} style={styles.tripContextMeta}>{regionName ?? "지역 미정"} · 후보 {candidateCount} · 일정 {scheduledCount}</Text></View>
  </View>;
}

function TravelStateControl({ placeName, state, locked = false, onPress, onViewSchedule }: { placeName: string; state: PlaceCandidateState; locked?: boolean; onPress(): void; onViewSchedule?: () => void }) {
  if (state === "scheduled") return <View accessibilityRole="text" accessibilityLabel={`${placeName} 일정에 포함됨`} style={[styles.travelStateBar, styles.scheduledBar]}><View style={styles.travelStateLabel}><Text style={styles.scheduledIcon}>▣</Text><Text style={styles.scheduledText}>일정 포함됨</Text></View>{onViewSchedule ? <Pressable accessibilityRole="button" accessibilityLabel={`${placeName} 일정 보기`} onPress={onViewSchedule} style={({ pressed }) => [styles.scheduleLink, pressed && styles.pressed]}><Text style={styles.scheduleLinkText}>일정 보기</Text></Pressable> : null}</View>;
  if (state === "candidate") return <View style={[styles.travelStateBar, styles.candidateBar]}><View style={styles.travelStateLabel}><Text style={styles.candidateIcon}>✦</Text><Text style={styles.candidateText}>현재 여행 후보</Text></View>{!locked ? <Pressable accessibilityRole="button" accessibilityLabel={`${placeName} 후보 해제`} accessibilityState={{ selected: true }} onPress={onPress} style={({ pressed }) => [styles.releaseButton, pressed && styles.pressed]}><Text style={styles.releaseText}>해제</Text></Pressable> : null}</View>;
  if (locked) return <View accessibilityRole="text" style={[styles.travelStateBar, styles.lockedBar]}><Text style={styles.lockedText}>완료된 여행에서는 후보를 변경할 수 없어요.</Text></View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${placeName} 후보에 담기`} onPress={onPress} style={({ pressed }) => [styles.primaryTravelAction, pressed && styles.primaryTravelActionPressed]}><Text style={styles.primaryTravelText}>후보에 담기</Text><Text style={styles.primaryTravelArrow}>→</Text></Pressable>;
}

function PlaceInfoIcon({ label }: { label: string }) {
  if (/시간|체크인|체크아웃|기간|휴무/.test(label)) return <View style={[styles.infoIcon, styles.infoIconMint]}><SymbolView name={{ ios: "clock.fill", android: "schedule", web: "schedule" }} tintColor={DETAIL_COLORS.mintText} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbol} /></View>;
  if (/홈페이지|사이트|웹/.test(label)) return <View style={[styles.infoIcon, styles.infoIconLavender]}><SymbolView name={{ ios: "globe", android: "language", web: "language" }} tintColor={DETAIL_COLORS.lavenderText} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbol} /></View>;
  if (/문의|전화|연락/.test(label)) return <View style={[styles.infoIcon, styles.infoIconPeach]}><SymbolView name={{ ios: "phone.fill", android: "call", web: "call" }} tintColor={DETAIL_COLORS.peachText} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbol} /></View>;
  if (label === "위치") return <View style={styles.infoIcon}><SymbolView name={{ ios: "mappin.circle.fill", android: "location_on", web: "location_on" }} tintColor={colors.primary} size={19} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbol} /></View>;
  return <View style={styles.infoIcon}><SymbolView name={{ ios: "info.circle.fill", android: "info", web: "info" }} tintColor={colors.primary} size={18} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbol} /></View>;
}

function RelatedCompactCard({ viewModel, cardWidth, onPress, onToggleSaved }: { viewModel: PlaceCardViewModel; cardWidth: number; onPress(): void; onToggleSaved(): void }) {
  const imageWidth = Math.max(68, Math.round(cardWidth * 0.44));
  const compactLocation = getCompactLocation(viewModel.address, viewModel.regionName);
  return <View style={[styles.relatedCard, { width: cardWidth }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${viewModel.name}, ${compactLocation} 상세 보기`} onPress={onPress} style={({ pressed }) => [styles.relatedBody, pressed && styles.pressed]}><View style={[styles.relatedImage, { width: imageWidth }]}><RemoteImage uri={viewModel.imageUrl} accessibilityLabel={`${viewModel.name} 이미지`} aspectRatio={imageWidth / 96} /></View><View style={styles.relatedCopy}><Text numberOfLines={2} style={styles.relatedTitle}>{viewModel.name}</Text><Text numberOfLines={1} style={styles.relatedMeta}>{compactLocation}</Text></View></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={viewModel.isSaved ? `${viewModel.name} 저장 해제` : `${viewModel.name} 저장`} accessibilityState={{ selected: viewModel.isSaved }} hitSlop={6} onPress={onToggleSaved} style={({ pressed }) => [styles.relatedHeartButton, pressed && styles.pressed]}><Text style={[styles.relatedHeart, viewModel.isSaved && styles.relatedHeartSaved]}>{viewModel.isSaved ? "♥" : "♡"}</Text></Pressable>
  </View>;
}

function DetailLoadingScreen({ heroHeight, onBack }: { heroHeight: number; onBack: () => void }) {
  return <Screen scroll={false} padded={false} testID="place-detail-loading"><View style={styles.shell}><ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><View style={[styles.loadingHero, { height: heroHeight }]}><View style={styles.heroActions}><DetailBackButton onPress={onBack} /></View></View><View style={styles.contentPanel}><View style={styles.loadingBadge} /><View style={[styles.loadingLine, styles.loadingTitle]} /><View style={[styles.loadingLine, styles.loadingMetadata]} /><View style={[styles.loadingLine, styles.loadingBody]} /><View style={[styles.loadingLine, styles.loadingBodyShort]} /><View style={styles.loadingAction} /><Text accessibilityLiveRegion="polite" style={styles.loadingLabel}>한국관광공사 상세 데이터를 불러오고 있어요.</Text></View></ScrollView></View></Screen>;
}

function DetailStatusScreen({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return <Screen><View style={styles.statusHeader}><DetailBackButton onPress={onBack} /></View>{children}</Screen>;
}

function DetailBackButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={10} onPress={onPress} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Chevron /></Pressable>;
}

function Chevron() {
  return <View style={styles.chevronFrame}><View style={[styles.chevronLine, styles.chevronTop]} /><View style={[styles.chevronLine, styles.chevronBottom]} /></View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 48, backgroundColor: colors.white },
  hero: { position: "relative", width: "100%", overflow: "hidden", backgroundColor: DETAIL_COLORS.hero },
  heroImage: { width: "100%", height: "100%" },
  heroFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: DETAIL_COLORS.hero },
  heroFallbackText: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: DETAIL_COLORS.textMuted },
  heroActions: { position: "absolute", left: spacing.lg, right: spacing.lg, top: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 4 },
  backButton: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.96)", borderWidth: 1, borderColor: "rgba(220, 231, 247, 0.9)", ...shadows.card },
  chevronFrame: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  chevronLine: { position: "absolute", left: 5, width: 11, height: 2.4, borderRadius: radius.pill, backgroundColor: DETAIL_COLORS.text },
  chevronTop: { top: 6, transform: [{ rotate: "-45deg" }] },
  chevronBottom: { bottom: 6, transform: [{ rotate: "45deg" }] },
  heroHeartButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(255, 255, 255, 0.96)", borderWidth: 1, borderColor: "rgba(220, 231, 247, 0.9)", ...shadows.card },
  heroHeart: { fontSize: 30, lineHeight: 34, color: DETAIL_COLORS.textSecondary },
  heroHeartSaved: { color: colors.primary },
  contentPanel: { gap: 26, marginTop: -22, paddingHorizontal: spacing.lg, paddingTop: 28, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.white },
  identity: { gap: spacing.sm },
  identityMetaRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  categoryBadge: { maxWidth: "60%", minHeight: 28, justifyContent: "center", paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: DETAIL_COLORS.peach },
  categoryText: { fontSize: 12, lineHeight: 17, fontWeight: "800", color: DETAIL_COLORS.peachText },
  locationText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "700", color: DETAIL_COLORS.textSecondary },
  placeName: { fontSize: 28, lineHeight: 36, fontWeight: "900", letterSpacing: -0.5, color: DETAIL_COLORS.text },
  placeMetadata: { minHeight: 28, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  rating: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 2 },
  ratingStar: { fontSize: 20, lineHeight: 24, color: "#F6B83F" },
  ratingText: { fontSize: 15, lineHeight: 21, fontWeight: "800", color: DETAIL_COLORS.text },
  tag: { maxWidth: 86, minHeight: 28, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  tagAlternate: { backgroundColor: DETAIL_COLORS.mint },
  tagText: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: DETAIL_COLORS.textSecondary },
  hiddenTag: { minHeight: 28, justifyContent: "center", paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: "#F4F5F9" },
  hiddenTagText: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: DETAIL_COLORS.textMuted },
  summaryBlock: { gap: 5 },
  summaryText: { fontSize: 14, lineHeight: 23, fontWeight: "500", color: DETAIL_COLORS.text },
  summaryToggle: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center", paddingHorizontal: spacing.xs },
  summaryToggleText: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: colors.primary },
  mutedText: { color: DETAIL_COLORS.textMuted },
  tripContextCard: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 18, borderWidth: 1, borderColor: DETAIL_COLORS.lavenderBorder, backgroundColor: DETAIL_COLORS.lavender },
  tripContextIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.white },
  tripContextEyebrow: { fontSize: 10, lineHeight: 15, fontWeight: "800", color: DETAIL_COLORS.lavenderText },
  tripContextTitle: { fontSize: 16, lineHeight: 22, fontWeight: "900", color: DETAIL_COLORS.text },
  tripContextMeta: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: DETAIL_COLORS.textSecondary },
  symbol: { width: 22, height: 22 },
  primaryTravelAction: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: 15, backgroundColor: colors.primary, ...shadows.card },
  primaryTravelActionPressed: { backgroundColor: colors.primaryPressed },
  primaryTravelText: { fontSize: 16, lineHeight: 22, fontWeight: "900", color: colors.white },
  primaryTravelArrow: { fontSize: 22, lineHeight: 24, fontWeight: "700", color: colors.white },
  travelStateBar: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 15, borderWidth: 1 },
  travelStateLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  candidateBar: { borderColor: DETAIL_COLORS.lavenderBorder, backgroundColor: DETAIL_COLORS.lavender },
  candidateIcon: { fontSize: 18, lineHeight: 22, color: DETAIL_COLORS.lavenderText },
  candidateText: { fontSize: 14, lineHeight: 20, fontWeight: "900", color: DETAIL_COLORS.lavenderText },
  releaseButton: { minWidth: 58, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderLeftWidth: 1, borderLeftColor: DETAIL_COLORS.lavenderBorder },
  releaseText: { fontSize: 12, lineHeight: 17, fontWeight: "800", color: DETAIL_COLORS.lavenderText },
  scheduledBar: { borderColor: DETAIL_COLORS.mintBorder, backgroundColor: DETAIL_COLORS.mint },
  scheduledIcon: { fontSize: 16, lineHeight: 20, color: DETAIL_COLORS.mintText },
  scheduledText: { fontSize: 14, lineHeight: 20, fontWeight: "900", color: DETAIL_COLORS.mintText },
  scheduleLink: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.xs },
  scheduleLinkText: { fontSize: 12, lineHeight: 17, fontWeight: "800", color: DETAIL_COLORS.mintText, textDecorationLine: "underline" },
  lockedBar: { justifyContent: "center", borderColor: DETAIL_COLORS.border, backgroundColor: "#F4F6FA" },
  lockedText: { fontSize: 12, lineHeight: 18, fontWeight: "700", color: DETAIL_COLORS.textMuted, textAlign: "center" },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "900", color: DETAIL_COLORS.text },
  infoGroup: { overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: DETAIL_COLORS.border, backgroundColor: colors.white },
  infoRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  infoRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: DETAIL_COLORS.border },
  infoIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.primarySoft },
  infoIconMint: { backgroundColor: DETAIL_COLORS.mint },
  infoIconLavender: { backgroundColor: DETAIL_COLORS.lavender },
  infoIconPeach: { backgroundColor: DETAIL_COLORS.peach },
  infoLabel: { width: 64, fontSize: 12, lineHeight: 18, fontWeight: "800", color: DETAIL_COLORS.text },
  infoValue: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "500", color: DETAIL_COLORS.textSecondary },
  reviewEmpty: { minHeight: 60, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: DETAIL_COLORS.border, backgroundColor: colors.white },
  reviewEmptyText: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: DETAIL_COLORS.textMuted },
  relatedHeading: { gap: 2 },
  relatedHint: { fontSize: 10, lineHeight: 15, fontWeight: "600", color: DETAIL_COLORS.textMuted },
  relatedRail: { gap: spacing.sm, paddingRight: spacing.lg },
  relatedCard: { position: "relative", height: 98, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: DETAIL_COLORS.border, backgroundColor: colors.white },
  relatedBody: { flex: 1, flexDirection: "row" },
  relatedImage: { height: 96, overflow: "hidden", borderTopLeftRadius: 15, borderBottomLeftRadius: 15, backgroundColor: colors.primarySoft },
  relatedCopy: { flex: 1, minWidth: 0, gap: 3, justifyContent: "center", paddingLeft: 9, paddingRight: 28, paddingVertical: spacing.xs },
  relatedTitle: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: DETAIL_COLORS.text },
  relatedMeta: { fontSize: 10, lineHeight: 15, fontWeight: "600", color: DETAIL_COLORS.textSecondary },
  relatedHeartButton: { position: "absolute", right: 3, top: 4, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.9)" },
  relatedHeart: { fontSize: 23, lineHeight: 27, color: DETAIL_COLORS.textSecondary },
  relatedHeartSaved: { color: colors.primary },
  loadingHero: { position: "relative", width: "100%", backgroundColor: DETAIL_COLORS.hero },
  loadingBadge: { width: 92, height: 28, borderRadius: radius.pill, backgroundColor: "#EDF2F9" },
  loadingLine: { height: 14, borderRadius: radius.pill, backgroundColor: "#EDF2F9" },
  loadingTitle: { width: "64%", height: 34 },
  loadingMetadata: { width: "46%" },
  loadingBody: { width: "100%" },
  loadingBodyShort: { width: "72%" },
  loadingAction: { height: 54, borderRadius: 15, backgroundColor: colors.primarySoft },
  loadingLabel: { fontSize: 12, lineHeight: 18, color: DETAIL_COLORS.textMuted, textAlign: "center" },
  statusHeader: { minHeight: 54, justifyContent: "center" },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.86 },
});
