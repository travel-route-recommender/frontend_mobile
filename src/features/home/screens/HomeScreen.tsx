import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Place, TripRoom } from "../../../domain";
import { Avatar, RemoteImage } from "../../../components/common";
import { useDuriStore } from "../../../store/useDuriStore";
import { formatTripDateRange, formatTripStatus } from "../../../utils/formatters";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { DuriLogo } from "../../auth/components/DuriLogo";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { usePlaceActions } from "../../places/hooks/usePlaceActions";
import { selectRoomPreferenceResponseSummary } from "../../trips/selectors";

const HERO_IMAGE = require("../../../../assets/images/duri/home/hero-travel.png");
const PLANNING_IMAGE = require("../../../../assets/images/duri/home/planning.png");
const PAGE_PADDING = 20;
const HOME_NAVY = "#17265F";
const HOME_LAVENDER = "#F3F1FF";
const HOME_BLUE_SURFACE = "#F2F8FF";

type DuriState = ReturnType<typeof useDuriStore.getState>;

export function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const state = useDuriStore();
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const placeActions = usePlaceActions();
  const user = sessionKind === "anonymous" ? undefined : state.usersById[state.currentUserId];
  const tripCardWidth = Math.max(252, width - 96);
  const createCardWidth = Math.max(84, Math.min(96, width * 0.23));

  const trips = useMemo(() => {
    if (sessionKind === "anonymous") return [];
    const seen = new Set<string>();
    return [...state.tripOrder, ...Object.keys(state.tripsById)].flatMap((tripId) => {
      if (seen.has(tripId)) return [];
      seen.add(tripId);
      const trip = state.tripsById[tripId];
      return trip?.members.some((member) => member.userId === state.currentUserId) ? [trip] : [];
    });
  }, [sessionKind, state.currentUserId, state.tripOrder, state.tripsById]);

  const activeTrip = trips.find((trip) => trip.id === state.activeTripId)
    ?? trips.find((trip) => trip.status !== "completed");

  const recommendedPlaces = useMemo(() => {
    const places = Object.values(state.placesById);
    if (!activeTrip) return places.slice(0, 4);
    const nearby = places.filter((place) => place.regionId === activeTrip.regionId);
    const elsewhere = places.filter((place) => place.regionId !== activeTrip.regionId);
    return [...nearby, ...elsewhere].slice(0, 4);
  }, [activeTrip, state.placesById]);

  const createTrip = () => requireMember(() => router.push("/trips/new"), "여행방 만들기");
  const openDuri = () => {
    if (activeTrip) {
      router.push({ pathname: "/trips/[tripId]/analysis", params: { tripId: activeTrip.id } });
      return;
    }
    createTrip();
  };

  return (
    <SafeAreaView edges={["top", "right", "left"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <HomeHeader userName={user?.name ?? "여행자"} profileImageUrl={user?.profileImageUrl} onProfile={() => router.push("/(tabs)/mypage")} />
        <HomeHero userName={user?.name ?? "여행자"} anonymous={sessionKind === "anonymous"} compact={width <= 370} />

        <HomeSectionHeader
          icon="▣"
          title={sessionKind === "guest" ? "참여 중인 여행" : "내 여행"}
          actionLabel="전체 보기  ›"
          onAction={() => router.push("/(tabs)/trips")}
        />

        {trips.length ? (
          <ScrollView
            accessibilityLabel="내 여행 가로 목록"
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={tripCardWidth + spacing.sm}
            decelerationRate="fast"
            contentContainerStyle={styles.tripCarousel}
          >
            {trips.map((trip) => (
              <HomeTripCard
                key={trip.id}
                state={state}
                trip={trip}
                width={tripCardWidth}
                onOpen={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: trip.id } })}
              />
            ))}
            <CreateTripCard width={createCardWidth} onPress={createTrip} />
          </ScrollView>
        ) : (
          <EmptyTripCard anonymous={sessionKind === "anonymous"} onPress={createTrip} />
        )}

        <HomeDuriCard hasTrip={Boolean(activeTrip)} onPress={openDuri} />

        <HomeSectionHeader icon="♥" title="추천 장소" actionLabel="더 보기  ›" onAction={() => router.push("/(tabs)/explore")} />

        <View style={styles.placeList}>
          {recommendedPlaces.map((place) => (
            <CompactPlaceRow
              key={place.id}
              place={place}
              regionName={state.regionsById[place.regionId]?.name ?? "지역 정보 없음"}
              saved={sessionKind !== "anonymous" && (state.savedPlaceIdsByUserId[state.currentUserId] ?? []).includes(place.id)}
              onOpen={() => router.push({ pathname: "/places/[placeId]", params: { placeId: place.id } })}
              onToggleSaved={() => placeActions.toggleSaved(place.id)}
            />
          ))}
        </View>
      </ScrollView>
      {memberGatePrompt}
      {placeActions.memberGatePrompt}
    </SafeAreaView>
  );
}

function HomeHeader({ userName, profileImageUrl, onProfile }: { userName: string; profileImageUrl?: string; onProfile(): void }) {
  return (
    <View style={styles.header}>
      <DuriLogo compact latin />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${userName} 프로필, 마이페이지 열기`}
        hitSlop={8}
        onPress={onProfile}
        style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
      >
        <Avatar name={userName} uri={profileImageUrl} size={40} />
      </Pressable>
    </View>
  );
}

function HomeHero({ userName, anonymous, compact }: { userName: string; anonymous: boolean; compact: boolean }) {
  return (
    <View style={styles.hero}>
      <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={2} style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{userName}님,{"\n"}어디로 떠나볼까요?</Text>
        <Text style={[styles.heroDescription, compact && styles.heroDescriptionCompact]}>
          {anonymous ? "장소를 둘러보고 마음에 들면\n함께 여행을 시작해 보세요." : "서로 다른 취향을 모아\n모두가 즐거운 여행을 만들어요."}
        </Text>
      </View>
      <Image accessibilityElementsHidden resizeMode="contain" source={HERO_IMAGE} style={[styles.heroImage, compact && styles.heroImageCompact]} />
      <View accessibilityElementsHidden style={styles.heroDotOne} />
      <View accessibilityElementsHidden style={styles.heroDotTwo} />
    </View>
  );
}

function HomeSectionHeader({ icon, title, actionLabel, onAction }: { icon: string; title: string; actionLabel: string; onAction(): void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeading}>
        <Text accessibilityElementsHidden style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={actionLabel.replace("  ›", "")} hitSlop={8} onPress={onAction}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function HomeTripCard({ state, trip, width, onOpen }: { state: DuriState; trip: TripRoom; width: number; onOpen(): void }) {
  const region = state.regionsById[trip.regionId];
  const candidateCount = state.candidatesByTripId[trip.id]?.length ?? 0;
  const itineraryCount = state.itineraryByTripId[trip.id]?.length ?? 0;
  const preferenceCompletedCount = selectRoomPreferenceResponseSummary(state, trip.id).completedCount;
  const statusStyle = trip.status === "completed"
    ? styles.badgeComplete
    : trip.status === "confirmed"
      ? styles.badgeConfirmed
      : trip.status === "planning"
        ? styles.badgePlanning
        : styles.badgeDrafting;

  return (
    <View style={[styles.tripCard, { width }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${trip.title}, ${formatTripDateRange(trip.startDate, trip.endDate)}, ${trip.members.length}명 여행방 열기`}
        onPress={onOpen}
        style={({ pressed }) => [styles.tripCardContent, pressed && styles.pressed]}
      >
        <View style={[styles.tripBadge, statusStyle]}>
          <Text style={styles.tripBadgeText}>{formatTripStatus(trip.status)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.tripTitle}>{trip.title}</Text>
        <Text style={styles.tripMeta}>{formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text>
        <RemoteImage uri={region?.imageUrl} accessibilityLabel={`${region?.name ?? trip.title} 대표`} aspectRatio={2.7} />
        <View style={styles.tripStats}>
          <TripMetric value={candidateCount} label="후보" tone="lavender" />
          <TripMetric value={itineraryCount} label="일정" tone="blue" />
          <TripMetric value={preferenceCompletedCount} label="성향 응답" tone="mint" />
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${trip.title} 여행방 바로가기`} onPress={onOpen} style={({ pressed }) => [styles.tripCta, pressed && styles.ctaPressed]}>
        <Text style={styles.tripCtaText}>여행방 바로가기</Text>
        <Text accessibilityElementsHidden style={styles.tripCtaArrow}>→</Text>
      </Pressable>
    </View>
  );
}

function TripMetric({ value, label, tone }: { value: number; label: string; tone: "lavender" | "blue" | "mint" }) {
  return (
    <View style={[styles.tripMetric, tone === "lavender" ? styles.metricLavender : tone === "mint" ? styles.metricMint : styles.metricBlue]}>
      <Text style={styles.tripMetricValue}>{value}</Text>
      <Text style={styles.tripMetricLabel}>{label}</Text>
    </View>
  );
}

function CreateTripCard({ width, onPress }: { width: number; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="새 여행 만들기"
      onPress={onPress}
      style={({ pressed }) => [styles.createTripCard, { width }, pressed && styles.pressed]}
    >
      <View style={styles.createTripPlus}><Text style={styles.createTripPlusText}>＋</Text></View>
      <Text style={styles.createTripLabel}>새 여행</Text>
    </Pressable>
  );
}

function EmptyTripCard({ anonymous, onPress }: { anonymous: boolean; onPress(): void }) {
  return (
    <View style={styles.emptyTripCard}>
      <View style={styles.emptyTripIcon}><Text style={styles.emptyTripIconText}>＋</Text></View>
      <View style={styles.emptyTripCopy}>
        <Text style={styles.emptyTripTitle}>{anonymous ? "함께 여행을 계획해 보세요" : "아직 진행 중인 여행이 없어요"}</Text>
        <Text style={styles.emptyTripDescription}>{anonymous ? "회원이 되면 여행방을 만들고 친구를 초대할 수 있어요." : "두리와 첫 여행을 만들어볼까요?"}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="새 여행 만들기" onPress={onPress} style={({ pressed }) => [styles.emptyTripButton, pressed && styles.pressed]}>
        <Text style={styles.emptyTripButtonText}>새 여행 만들기</Text>
      </Pressable>
    </View>
  );
}

function HomeDuriCard({ hasTrip, onPress }: { hasTrip: boolean; onPress(): void }) {
  return (
    <View style={styles.duriCard}>
      <Text style={styles.duriEyebrow}>✦  DURI 추천</Text>
      <Text style={styles.duriTitle}>취향 차이는 DURI가{"\n"}조율할게요</Text>
      <Text style={styles.duriDescription}>일정부터 음식, 분위기까지{"\n"}우리만의 맞춤 일정을 제안해요.</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.duriCta, pressed && styles.pressed]}>
        <Text style={styles.duriCtaText}>{hasTrip ? "맞춤 일정 제안 받기" : "첫 여행 만들기"}</Text>
        <Text accessibilityElementsHidden style={styles.duriCtaArrow}>→</Text>
      </Pressable>
      <Image accessibilityElementsHidden resizeMode="contain" source={PLANNING_IMAGE} style={styles.duriImage} />
    </View>
  );
}

function CompactPlaceRow({ place, regionName, saved, onOpen, onToggleSaved }: { place: Place; regionName: string; saved: boolean; onOpen(): void; onToggleSaved(): void }) {
  const tag = place.tags[0] ?? place.category;
  return (
    <View style={styles.placeRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${place.name}, ${regionName}, ${place.category} 상세 보기`}
        onPress={onOpen}
        style={({ pressed }) => [styles.placeMain, pressed && styles.pressed]}
      >
        <View style={styles.placeThumbnail}>
          <RemoteImage uri={place.imageUrl} accessibilityLabel={`${place.name} 이미지`} aspectRatio={1.36} />
        </View>
        <View style={styles.placeCopy}>
          <View style={styles.placeTag}><Text numberOfLines={1} style={styles.placeTagText}>{place.category} · {tag}</Text></View>
          <Text numberOfLines={1} style={styles.placeName}>{place.name}</Text>
          <Text numberOfLines={1} style={styles.placeRegion}>{regionName} · {place.address}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? `${place.name} 저장 해제` : `${place.name} 저장`}
        accessibilityState={{ selected: saved }}
        hitSlop={6}
        onPress={onToggleSaved}
        style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
      >
        <Text style={[styles.saveHeart, saved && styles.saveHeartSelected]}>{saved ? "♥" : "♡"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  page: { paddingBottom: 112, backgroundColor: colors.surface },
  pressed: { opacity: 0.78 },
  header: { height: 62, paddingHorizontal: PAGE_PADDING, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: "#D6E4FB", backgroundColor: "#F1F7FF" },
  hero: { height: 178, marginHorizontal: PAGE_PADDING, marginBottom: spacing.xl, overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: "#CFE4FF", backgroundColor: HOME_BLUE_SURFACE },
  heroCopy: { zIndex: 2, width: "58%", paddingTop: 22, paddingLeft: 18 },
  heroCopyCompact: { width: "60%" },
  heroTitle: { color: HOME_NAVY, fontSize: 23, lineHeight: 31, fontWeight: "900", letterSpacing: -0.5 },
  heroTitleCompact: { fontSize: 21, lineHeight: 29 },
  heroDescription: { color: "#60719B", fontSize: 13, lineHeight: 19, fontWeight: "500", marginTop: 10 },
  heroDescriptionCompact: { fontSize: 12, lineHeight: 18 },
  heroImage: { position: "absolute", right: -7, bottom: -2, width: "51%", height: 156 },
  heroImageCompact: { right: -4, width: "49%", height: 150 },
  heroDotOne: { position: "absolute", width: 24, height: 24, borderRadius: radius.pill, backgroundColor: "#E3EEFF", top: 14, right: 15 },
  heroDotTwo: { position: "absolute", width: 13, height: 13, borderRadius: radius.pill, backgroundColor: "#FFE9D8", top: 45, right: 4 },
  sectionHeader: { minHeight: 38, paddingHorizontal: PAGE_PADDING, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionIcon: { color: colors.primary, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  sectionTitle: { color: HOME_NAVY, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  sectionAction: { ...typography.caption, color: colors.primary, fontSize: 13 },
  tripCarousel: { paddingLeft: PAGE_PADDING, paddingRight: PAGE_PADDING, gap: spacing.sm, paddingBottom: 2 },
  tripCard: { minHeight: 322, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface, ...shadows.card },
  tripCardContent: { flex: 1, gap: 7 },
  tripBadge: { alignSelf: "flex-start", minHeight: 24, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  badgePlanning: { backgroundColor: "#EAE7FF" },
  badgeDrafting: { backgroundColor: "#FFF0E2" },
  badgeConfirmed: { backgroundColor: "#E0F6EB" },
  badgeComplete: { backgroundColor: "#EDF1F7" },
  tripBadgeText: { color: HOME_NAVY, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  tripTitle: { color: HOME_NAVY, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  tripMeta: { color: "#6677A2", fontSize: 13, lineHeight: 18, fontWeight: "500" },
  tripStats: { flexDirection: "row", gap: 6 },
  tripMetric: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metricLavender: { backgroundColor: "#F0EDFF" },
  metricBlue: { backgroundColor: "#ECF4FF" },
  metricMint: { backgroundColor: "#EAF7EE" },
  tripMetricValue: { color: colors.primary, fontSize: 17, lineHeight: 20, fontWeight: "900" },
  tripMetricLabel: { color: "#60719B", fontSize: 10, lineHeight: 14, fontWeight: "600", marginTop: 1 },
  tripCta: { height: 44, marginTop: 10, paddingHorizontal: spacing.md, borderRadius: 13, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  ctaPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  tripCtaText: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  tripCtaArrow: { position: "absolute", right: 16, color: colors.white, fontSize: 20, lineHeight: 22 },
  createTripCard: { minHeight: 322, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#9FB7E5", backgroundColor: "#FAFCFF", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  createTripPlus: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: "#EDF4FF", alignItems: "center", justifyContent: "center" },
  createTripPlusText: { color: colors.primary, fontSize: 29, lineHeight: 33, fontWeight: "400" },
  createTripLabel: { color: "#6677A2", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  emptyTripCard: { marginHorizontal: PAGE_PADDING, padding: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: "#FAFCFF", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  emptyTripIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  emptyTripIconText: { color: colors.primary, fontSize: 27, lineHeight: 30 },
  emptyTripCopy: { flex: 1, minWidth: 190 },
  emptyTripTitle: { color: HOME_NAVY, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  emptyTripDescription: { color: "#6C7CA1", fontSize: 12, lineHeight: 18, marginTop: 2 },
  emptyTripButton: { width: "100%", minHeight: 44, borderRadius: 13, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  emptyTripButtonText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  duriCard: { height: 218, marginHorizontal: PAGE_PADDING, marginTop: 28, marginBottom: 26, padding: 18, overflow: "hidden", borderRadius: 22, borderWidth: 1, borderColor: "#D9D5FF", backgroundColor: HOME_LAVENDER },
  duriEyebrow: { zIndex: 2, color: "#7162EB", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  duriTitle: { zIndex: 2, width: "60%", color: HOME_NAVY, fontSize: 19, lineHeight: 26, fontWeight: "900", marginTop: 8 },
  duriDescription: { zIndex: 2, width: "55%", color: "#5F6F98", fontSize: 12, lineHeight: 18, fontWeight: "500", marginTop: 6 },
  duriCta: { zIndex: 3, alignSelf: "flex-start", width: 150, height: 42, marginTop: 12, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: "rgba(255,255,255,0.92)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xxs },
  duriCtaText: { color: colors.primary, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  duriCtaArrow: { color: colors.primary, fontSize: 18, lineHeight: 20 },
  duriImage: { position: "absolute", right: 0, bottom: -2, width: "46%", height: 158 },
  placeList: { marginHorizontal: PAGE_PADDING, borderRadius: 18, borderWidth: 1, borderColor: "#E3EAF5", overflow: "hidden", backgroundColor: colors.surface },
  placeRow: { minHeight: 78, paddingHorizontal: 8, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5EBF4", flexDirection: "row", alignItems: "center" },
  placeMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11 },
  placeThumbnail: { width: 86 },
  placeCopy: { flex: 1, minWidth: 0 },
  placeTag: { alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: "#EEF4FF" },
  placeTagText: { color: "#6677A2", fontSize: 9, lineHeight: 12, fontWeight: "700" },
  placeName: { color: HOME_NAVY, fontSize: 15, lineHeight: 20, fontWeight: "800", marginTop: 2 },
  placeRegion: { color: "#8290AE", fontSize: 10, lineHeight: 14, fontWeight: "500" },
  saveButton: { width: 46, height: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  saveHeart: { color: "#7586AE", fontSize: 30, lineHeight: 34, fontWeight: "400" },
  saveHeartSelected: { color: "#FF6681" },
});
