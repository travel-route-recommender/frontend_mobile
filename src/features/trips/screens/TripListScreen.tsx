import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PrimaryButton, Screen } from "../../../components/common";
import { EmptyState, ErrorState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { useDuriStore } from "../../../store/useDuriStore";
import { TripCard } from "../components/TripCard";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";

export function TripListScreen() {
  const router = useRouter();
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const state = useDuriStore();
  const trips = state.tripOrder.flatMap((tripId) => { const trip = state.tripsById[tripId]; return trip?.members.some((member) => member.userId === state.currentUserId) ? [trip] : []; });
  const createTrip = () => requireMember(() => router.push("/trips/new"), "여행방 만들기");
  if (environment.dataSource !== "mock") return <Screen><ErrorState message={environment.dataSource === "api" ? "여행방 API 계약 연결 전입니다. mock 여행방으로 자동 전환하지 않았어요." : "서버 여행방의 사용자 식별자 연결이 확인되기 전에는 로컬 여행방을 혼합하지 않아요."} /></Screen>;
  return <Screen scroll={false}><FlatList data={trips} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={styles.gap} />} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>{sessionKind === "guest" ? "초대받은 여행" : "나의 여행"}</Text><Text style={styles.subtitle}>{sessionKind === "anonymous" ? "회원이 되면 여행방을 만들고 친구를 초대할 수 있어요." : "여행방에서 친구들과 후보와 일정을 모아보세요."}</Text><PrimaryButton label="새 여행 만들기" onPress={createTrip} /></View>} ListEmptyComponent={<EmptyState title={sessionKind === "anonymous" ? "로그인 후 여행을 시작해요" : "아직 여행방이 없어요"} description={sessionKind === "anonymous" ? "로그인하거나 가입하면 여행방을 만들 수 있어요." : "첫 여행방을 만들고 동행자를 초대해 보세요."} ctaLabel="새 여행 만들기" onPress={createTrip} />} renderItem={({ item }) => <TripCard trip={item} region={state.regionsById[item.regionId]} candidateCount={(state.candidatesByTripId[item.id] ?? []).length} itineraryCount={(state.itineraryByTripId[item.id] ?? []).length} onPress={() => { state.setActiveTrip(item.id); router.push({ pathname: "/trips/[tripId]", params: { tripId: item.id } }); }} />} />{memberGatePrompt}</Screen>;
}
const styles = StyleSheet.create({ list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl }, header: { gap: spacing.sm, marginBottom: spacing.lg }, title: { ...typography.display, color: colors.text }, subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs }, gap: { height: spacing.md } });
