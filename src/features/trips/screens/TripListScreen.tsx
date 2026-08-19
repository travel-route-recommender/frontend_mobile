import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { PrimaryButton, Screen } from "../../../components/common";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { queryKeys } from "../../../query/keys";
import { selectCompletedTripsForCurrentUser, selectPlanningTripsForCurrentUser } from "../../../store/selectors";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { TripRoomCard } from "../components/TripCard";
import { selectTripRoomCardViewModel } from "../selectors";
import { fetchApiTripList } from "../tripRoomApi";
import type { TripListFilter } from "../types";

const filters: readonly { value: TripListFilter; label: string }[] = [
  { value: "ongoing", label: "진행 중" }, { value: "completed", label: "완료" }, { value: "all", label: "전체" },
];

export function TripListScreen() {
  const router = useRouter();
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const [filter, setFilter] = useState<TripListFilter>("ongoing");
  const hydrationError = useDuriHydrationState((state) => state.hydrationError);
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    tripsById: state.tripsById,
    tripOrder: state.tripOrder,
    usersById: state.usersById,
    regionsById: state.regionsById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
  })));
  const { ongoing, completed, cardsById } = useMemo(() => {
    const planningTrips = selectPlanningTripsForCurrentUser(source);
    const completedTrips = selectCompletedTripsForCurrentUser(source);
    const cards = Object.fromEntries([...planningTrips, ...completedTrips].flatMap((trip) => {
      const viewModel = selectTripRoomCardViewModel(source, trip.id);
      return viewModel ? [[trip.id, viewModel]] : [];
    }));
    return { ongoing: planningTrips.map((trip) => trip.id), completed: completedTrips.map((trip) => trip.id), cardsById: cards };
  }, [source]);
  const tripIds = filter === "ongoing" ? ongoing : filter === "completed" ? completed : [...ongoing, ...completed];
  const createTrip = () => requireMember(() => router.push("/trips/new"), "여행방 만들기");

  if (environment.dataSource === "api") return <ApiTripListContent />;
  if (environment.dataSource !== "mock") return <Screen includeBottomSafeArea={false}><ErrorState message="서버 여행방의 사용자 식별자 연결이 확인되기 전에는 로컬 여행방을 혼합하지 않아요." /></Screen>;
  if (hydrationError) return <Screen includeBottomSafeArea={false}><ErrorState message={hydrationError} /></Screen>;

  return <Screen scroll={false} includeBottomSafeArea={false}><FlatList
    data={tripIds}
    keyExtractor={(tripId) => tripId}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.list}
    ItemSeparatorComponent={() => <View style={styles.gap} />}
    ListHeaderComponent={<View style={styles.header}>
      <View style={styles.headerRow}><View style={styles.headingCopy}><Text style={styles.title}>{sessionKind === "guest" ? "초대받은 여행" : "내 여행"}</Text><Text style={styles.subtitle}>{sessionKind === "anonymous" ? "회원이 되면 여행방을 만들고 친구를 초대할 수 있어요." : "동행자와 후보를 모으고 일정을 함께 완성해요."}</Text></View></View>
      <PrimaryButton label="새 여행 만들기" onPress={createTrip} />
      <View accessibilityRole="tablist" style={styles.filters}>{filters.map((item) => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: filter === item.value }} accessibilityLabel={`${item.label} 여행 ${item.value === "ongoing" ? ongoing.length : item.value === "completed" ? completed.length : ongoing.length + completed.length}개`} onPress={() => setFilter(item.value)} style={({ pressed }) => [styles.filter, filter === item.value && styles.filterSelected, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{item.label}</Text><Text style={[styles.filterCount, filter === item.value && styles.filterTextSelected]}>{item.value === "ongoing" ? ongoing.length : item.value === "completed" ? completed.length : ongoing.length + completed.length}</Text></Pressable>)}</View>
    </View>}
    ListEmptyComponent={<EmptyState
      title={filter === "completed" ? "완료한 여행이 아직 없어요" : filter === "ongoing" ? "준비 중인 여행이 없어요" : sessionKind === "anonymous" ? "로그인 후 여행을 시작해요" : "아직 여행방이 없어요"}
      description={filter === "completed" ? "여행을 마치고 완료 상태가 되면 이곳에 모여요." : "새 여행방을 만들고 동행자와 계획을 시작해 보세요."}
      ctaLabel={filter === "completed" ? undefined : "새 여행 만들기"}
      onPress={filter === "completed" ? undefined : createTrip}
    />}
    renderItem={({ item: tripId }) => { const viewModel = cardsById[tripId]; return viewModel ? <TripRoomCard viewModel={viewModel} onPress={() => { setActiveTrip(tripId); router.push({ pathname: "/trips/[tripId]", params: { tripId } }); }} /> : null; }}
  />{memberGatePrompt}</Screen>;
}

function ApiTripListContent() {
  const router = useRouter();
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const currentUserId = useAuthSessionStore((session) => session.currentSessionUserId);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const [filter, setFilter] = useState<TripListFilter>("ongoing");
  const query = useQuery({
    queryKey: [...queryKeys.trips.all, "api", currentUserId],
    queryFn: ({ signal }) => fetchApiTripList(currentUserId, signal),
    enabled: Boolean(currentUserId),
  });
  const rooms = query.data ?? [];
  const ongoing = rooms.filter((room) => room.viewModel.status !== "completed");
  const completed = rooms.filter((room) => room.viewModel.status === "completed");
  const filtered = filter === "ongoing" ? ongoing : filter === "completed" ? completed : [...ongoing, ...completed];
  const createTrip = () => requireMember(() => router.push("/trips/new"), "여행방 만들기");

  if (!currentUserId) return <Screen includeBottomSafeArea={false}><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (query.isLoading) return <Screen includeBottomSafeArea={false}><LoadingState label="서버 여행방을 불러오고 있어요." /></Screen>;
  if (query.error) return <Screen includeBottomSafeArea={false}><ErrorState message={query.error instanceof Error ? query.error.message : "여행방 목록을 불러오지 못했어요."} onRetry={() => void query.refetch()} /></Screen>;

  return <Screen scroll={false} includeBottomSafeArea={false}><FlatList
    data={filtered}
    keyExtractor={(room) => room.id}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.list}
    ItemSeparatorComponent={() => <View style={styles.gap} />}
    ListHeaderComponent={<View style={styles.header}>
      <View style={styles.headerRow}><View style={styles.headingCopy}><Text style={styles.title}>{sessionKind === "guest" ? "초대받은 여행" : "내 여행"}</Text><Text style={styles.subtitle}>서버에 저장된 여행방과 준비 상태를 불러왔어요.</Text></View></View>
      <PrimaryButton label="새 여행 만들기" onPress={createTrip} />
      <View accessibilityRole="tablist" style={styles.filters}>{filters.map((item) => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: filter === item.value }} accessibilityLabel={`${item.label} 여행 ${item.value === "ongoing" ? ongoing.length : item.value === "completed" ? completed.length : rooms.length}개`} onPress={() => setFilter(item.value)} style={({ pressed }) => [styles.filter, filter === item.value && styles.filterSelected, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{item.label}</Text><Text style={[styles.filterCount, filter === item.value && styles.filterTextSelected]}>{item.value === "ongoing" ? ongoing.length : item.value === "completed" ? completed.length : rooms.length}</Text></Pressable>)}</View>
    </View>}
    ListEmptyComponent={<EmptyState
      title={filter === "completed" ? "완료한 여행이 아직 없어요" : filter === "ongoing" ? "준비 중인 여행이 없어요" : "아직 여행방이 없어요"}
      description={filter === "completed" ? "여행을 마치고 완료 상태가 되면 이곳에 모여요." : "새 여행방을 만들고 동행자와 계획을 시작해 보세요."}
      ctaLabel={filter === "completed" ? undefined : "새 여행 만들기"}
      onPress={filter === "completed" ? undefined : createTrip}
    />}
    renderItem={({ item }) => <TripRoomCard viewModel={item.viewModel} onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: item.id } })} />}
  />{memberGatePrompt}</Screen>;
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl }, header: { gap: spacing.md, marginBottom: spacing.lg }, headerRow: { flexDirection: "row", alignItems: "flex-start" }, headingCopy: { flex: 1, gap: spacing.xs },
  title: { ...typography.display, color: colors.text }, subtitle: { ...typography.body, color: colors.textSecondary }, gap: { height: spacing.md },
  filters: { flexDirection: "row", gap: spacing.xs, padding: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surface }, filter: { minHeight: 44, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xxs, borderRadius: radius.sm }, filterSelected: { backgroundColor: colors.primarySoft }, pressed: { opacity: 0.8 }, filterText: { ...typography.bodyStrong, color: colors.textSecondary }, filterCount: { ...typography.caption, color: colors.textMuted }, filterTextSelected: { color: colors.primary },
});
