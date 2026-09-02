import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { PrimaryButton, Screen } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { selectCompletedTripsForCurrentUser, selectPlanningTripsForCurrentUser } from "../../../store/selectors";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { TripRoomCard } from "../components/TripCard";
import { selectTripRoomCardViewModel } from "../selectors";
import { useApiTripListQuery } from "../useApiTripListQuery";
import type { TripListFilter } from "../types";

const createTripImage = require("../../../../assets/images/duri/trip-list/create-trip.png");

const filters: readonly { value: TripListFilter; label: string }[] = [
  { value: "ongoing", label: "진행 중" },
  { value: "completed", label: "완료" },
  { value: "all", label: "전체" },
];

export function TripListScreen() {
  const router = useRouter();
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

  const totalCount = ongoing.length + completed.length;

  return <>
    <SafeAreaView edges={["top", "right", "left"]} style={styles.safeArea}>
      <FlatList
        data={tripIds}
        keyExtractor={(tripId) => tripId}
        showsVerticalScrollIndicator={false}
        style={styles.listSurface}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={<TripListHeader
          filter={filter}
          ongoingCount={ongoing.length}
          completedCount={completed.length}
          onCreate={createTrip}
          onFilterChange={setFilter}
        />}
        ListEmptyComponent={<TripListEmpty
          filter={filter}
          totalCount={totalCount}
          onCreate={createTrip}
          onFilterChange={setFilter}
        />}
        renderItem={({ item: tripId }) => {
          const viewModel = cardsById[tripId];
          return viewModel ? <TripRoomCard viewModel={viewModel} onPress={() => {
            setActiveTrip(tripId);
            router.push({ pathname: "/trips/[tripId]", params: { tripId } });
          }} /> : null;
        }}
      />
    </SafeAreaView>
    {memberGatePrompt}
  </>;
}

function ApiTripListContent() {
  const router = useRouter();
  const currentUserId = useAuthSessionStore((session) => session.currentSessionUserId);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const [filter, setFilter] = useState<TripListFilter>("ongoing");
  const query = useApiTripListQuery(currentUserId);
  const rooms = query.data ?? [];
  const ongoing = rooms.filter((room) => room.viewModel.status !== "completed");
  const completed = rooms.filter((room) => room.viewModel.status === "completed");
  const filtered = filter === "ongoing" ? ongoing : filter === "completed" ? completed : [...ongoing, ...completed];
  const createTrip = () => requireMember(() => router.push("/trips/new"), "여행방 만들기");

  if (!currentUserId) return <Screen includeBottomSafeArea={false}><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (query.isLoading) return <Screen includeBottomSafeArea={false}><LoadingState label="서버 여행방을 불러오고 있어요." /></Screen>;
  if (query.error) return <Screen includeBottomSafeArea={false}><ErrorState message={query.error instanceof Error ? query.error.message : "여행방 목록을 불러오지 못했어요."} onRetry={() => void query.refetch()} /></Screen>;

  return <>
    <SafeAreaView edges={["top", "right", "left"]} style={styles.safeArea}>
      <FlatList
        data={filtered}
        keyExtractor={(room) => room.id}
        showsVerticalScrollIndicator={false}
        style={styles.listSurface}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={<TripListHeader
          filter={filter}
          ongoingCount={ongoing.length}
          completedCount={completed.length}
          onCreate={createTrip}
          onFilterChange={setFilter}
        />}
        ListEmptyComponent={<TripListEmpty
          filter={filter}
          totalCount={rooms.length}
          onCreate={createTrip}
          onFilterChange={setFilter}
        />}
        renderItem={({ item }) => <TripRoomCard viewModel={item.viewModel} onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: item.id } })} />}
      />
    </SafeAreaView>
    {memberGatePrompt}
  </>;
}

function TripListHeader({ filter, ongoingCount, completedCount, onCreate, onFilterChange }: {
  filter: TripListFilter;
  ongoingCount: number;
  completedCount: number;
  onCreate: () => void;
  onFilterChange: (filter: TripListFilter) => void;
}) {
  const totalCount = ongoingCount + completedCount;
  const selectedCount = filter === "ongoing" ? ongoingCount : filter === "completed" ? completedCount : totalCount;
  const selectedLabel = filter === "ongoing" ? "진행 중 여행" : filter === "completed" ? "완료 여행" : "전체 여행";

  return <View style={styles.header}>
    <View style={styles.headerRow}>
      <Text style={styles.title}>여행</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="새 여행 만들기"
        hitSlop={4}
        onPress={onCreate}
        style={({ pressed }) => [styles.compactCreate, pressed && styles.pressed]}
      >
        <Text style={styles.compactCreateIcon}>＋</Text>
        <Text style={styles.compactCreateText}>새 여행</Text>
      </Pressable>
    </View>

    {totalCount === 0 ? <View style={styles.emptySummary}>
      <Text style={styles.emptySummaryTitle}>여행이 <Text style={styles.emptySummaryCount}>0</Text>개</Text>
      <Text style={styles.emptySummaryDescription}>두리와 첫 여행을 시작해보세요.</Text>
    </View> : <>
      <View accessibilityRole="tablist" style={styles.filters}>
        {filters.map((item) => {
          const count = item.value === "ongoing" ? ongoingCount : item.value === "completed" ? completedCount : totalCount;
          const selected = filter === item.value;
          return <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.label} 여행 ${count}개`}
            onPress={() => onFilterChange(item.value)}
            style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item.label}</Text>
            <Text style={[styles.filterCount, selected && styles.filterTextSelected]}>{count}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={styles.resultTitle}>{selectedLabel} {selectedCount}개</Text>
    </>}
  </View>;
}

function TripListEmpty({ filter, totalCount, onCreate, onFilterChange }: {
  filter: TripListFilter;
  totalCount: number;
  onCreate: () => void;
  onFilterChange: (filter: TripListFilter) => void;
}) {
  if (totalCount === 0) {
    return <View style={styles.trueEmpty}>
      <Image
        accessible={false}
        resizeMode="contain"
        source={createTripImage}
        style={styles.emptyImage}
      />
      <Text style={styles.trueEmptyTitle}>아직 여행이 없어요</Text>
      <Text style={styles.trueEmptyDescription}>두리와 함께 첫 여행을 만들고{`\n`}일정을 하나씩 준비해볼까요?</Text>
      <View style={styles.emptyCta}>
        <PrimaryButton label="새 여행 만들기" onPress={onCreate} />
      </View>
    </View>;
  }

  const completedEmpty = filter === "completed";
  return <View style={styles.filterEmpty}>
    <View accessibilityElementsHidden style={styles.filterEmptyIcon}>
      <Text style={styles.filterEmptyIconText}>{completedEmpty ? "✓" : "↗"}</Text>
    </View>
    <Text style={styles.filterEmptyTitle}>{completedEmpty ? "완료한 여행이 아직 없어요" : "진행 중인 여행이 없어요"}</Text>
    <Text style={styles.filterEmptyDescription}>{completedEmpty ? "현재 준비 중인 여행을 확인해보세요." : "완료한 여행 기록을 다시 확인해보세요."}</Text>
    <Pressable
      accessibilityRole="button"
      onPress={() => onFilterChange(completedEmpty ? "ongoing" : "completed")}
      style={({ pressed }) => [styles.filterEmptyAction, pressed && styles.pressed]}
    >
      <Text style={styles.filterEmptyActionText}>{completedEmpty ? "진행 중 보기" : "완료 여행 보기"}</Text>
      <Text style={styles.filterEmptyArrow}>›</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  listSurface: { flex: 1, backgroundColor: "#FFFFFF" },
  list: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 112 },
  gap: { height: 12 },
  header: { marginBottom: 12 },
  headerRow: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { color: "#17265F", fontSize: 28, lineHeight: 36, fontWeight: "900" },
  compactCreate: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, borderRadius: radius.md },
  compactCreateIcon: { color: colors.primary, fontSize: 23, lineHeight: 26, fontWeight: "500" },
  compactCreateText: { color: colors.primary, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  filters: { flexDirection: "row", gap: 8 },
  filter: { minHeight: 44, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: "#FFFFFF" },
  filterSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterText: { color: "#60719B", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  filterCount: { color: "#8290AE", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  filterTextSelected: { color: "#FFFFFF" },
  resultTitle: { marginTop: 20, color: "#60719B", fontSize: 17, lineHeight: 24, fontWeight: "700" },
  pressed: { opacity: 0.76 },
  emptySummary: { marginTop: 6, borderRadius: 18, borderWidth: 1, borderColor: "#E3ECFA", backgroundColor: "#F2F8FF", paddingHorizontal: 18, paddingVertical: 17 },
  emptySummaryTitle: { color: "#17265F", fontSize: 20, lineHeight: 27, fontWeight: "900" },
  emptySummaryCount: { color: colors.primary },
  emptySummaryDescription: { marginTop: 7, color: "#60719B", fontSize: 14, lineHeight: 21, fontWeight: "600" },
  trueEmpty: { flex: 1, alignItems: "center", paddingTop: 2 },
  emptyImage: { width: "100%", height: 292 },
  trueEmptyTitle: { marginTop: 2, color: "#17265F", fontSize: 22, lineHeight: 29, fontWeight: "900", textAlign: "center" },
  trueEmptyDescription: { marginTop: 8, color: "#60719B", fontSize: 14, lineHeight: 22, fontWeight: "500", textAlign: "center" },
  emptyCta: { width: "100%", marginTop: 20 },
  filterEmpty: { minHeight: 280, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, paddingBottom: 24 },
  filterEmptyIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "#F0EDFF" },
  filterEmptyIconText: { color: "#6A63AD", fontSize: 20, lineHeight: 24, fontWeight: "800" },
  filterEmptyTitle: { marginTop: 16, color: "#17265F", fontSize: 18, lineHeight: 25, fontWeight: "900", textAlign: "center" },
  filterEmptyDescription: { marginTop: 6, color: "#60719B", fontSize: 13, lineHeight: 20, fontWeight: "500", textAlign: "center" },
  filterEmptyAction: { minHeight: 44, marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: "#CFE4FF", backgroundColor: "#F2F8FF" },
  filterEmptyActionText: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  filterEmptyArrow: { color: colors.primary, fontSize: 20, lineHeight: 20, fontWeight: "600" },
});
