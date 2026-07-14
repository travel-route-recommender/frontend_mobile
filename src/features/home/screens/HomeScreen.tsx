import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Card, PrimaryButton, Screen, SecondaryButton, SectionHeader } from "../../../components/common";
import { useDuriStore } from "../../../store/useDuriStore";
import { formatTripDateRange } from "../../../utils/formatters";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { selectRoomPreferenceResponseSummary } from "../../trips/selectors";

export function HomeScreen() {
  const router = useRouter();
  const state = useDuriStore();
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const user = sessionKind === "anonymous" ? undefined : state.usersById[state.currentUserId];
  const trip = sessionKind === "anonymous" ? undefined : state.tripsById[state.activeTripId];
  const region = trip ? state.regionsById[trip.regionId] : undefined;
  const candidateCount = trip ? (state.candidatesByTripId[trip.id] ?? []).length : 0;
  const itineraryCount = trip ? (state.itineraryByTripId[trip.id] ?? []).length : 0;
  const preferenceCompletedCount = trip ? selectRoomPreferenceResponseSummary(state, trip.id).completedCount : 0;

  return (
    <Screen>
      <View style={styles.hero}><Text style={styles.eyebrow}>함께 만드는 여행, 두리</Text><Text style={styles.greeting}>{user ? `${user.name}님,` : "여행자님,"}{"\n"}어디로 떠나볼까요?</Text><Text style={styles.description}>{sessionKind === "anonymous" ? "로그인 없이 장소를 둘러보고, 마음에 들면 함께 계획을 시작해요." : "서로 다른 취향을 모아 모두가 즐거운 일정을 만들어요."}</Text></View>
      {trip ? <><SectionHeader title="진행 중인 여행" actionLabel="여행 목록" onAction={() => router.push("/(tabs)/trips")} /><Card style={styles.tripCard}><View style={styles.badge}><Text style={styles.badgeText}>{region?.shortName ?? "여행"}</Text></View><Text style={styles.tripTitle}>{trip.title}</Text><Text style={styles.tripMeta}>{formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text><View style={styles.stats}><Stat value={candidateCount} label="후보 장소" /><Stat value={itineraryCount} label="일정" /><Stat value={preferenceCompletedCount} label="성향 응답" /></View><PrimaryButton label="여행방 바로가기" onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: trip.id } })} /></Card></> : <Card style={styles.tripCard}><Text style={styles.tripTitle}>{sessionKind === "anonymous" ? "함께 여행을 계획해 보세요" : "첫 여행방을 만들어 보세요"}</Text><Text style={styles.description}>{sessionKind === "anonymous" ? "회원이 되면 장소를 저장하고 여행방을 만들 수 있어요." : "친구를 초대해 후보와 일정을 함께 모아보세요."}</Text><PrimaryButton label="새 여행 만들기" onPress={() => requireMember(() => router.push("/trips/new"), "여행방 만들기")} /></Card>}
      <SectionHeader title="두리와 여행 준비" />
      <Card style={styles.duriCard}><Text style={styles.duriMark}>✦</Text><View style={styles.duriCopy}><Text style={styles.tripTitle}>취향 차이는 두리가 조율할게요</Text><Text style={styles.description}>일정 밀도, 식사, 동선과 선호 편중을 살펴보고 적용 가능한 제안을 만들어요.</Text></View></Card>
      <SecondaryButton label="장소 둘러보기" onPress={() => router.push("/(tabs)/explore")} />
      {memberGatePrompt}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({ hero: { paddingTop: spacing.lg, paddingBottom: spacing.xl }, eyebrow: { ...typography.caption, color: colors.primary, marginBottom: spacing.xs }, greeting: { ...typography.display, color: colors.text }, description: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs }, tripCard: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs }, badge: { alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 }, badgeText: { ...typography.caption, color: colors.primary }, tripTitle: { ...typography.subtitle, color: colors.text }, tripMeta: { ...typography.body, color: colors.textSecondary }, stats: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radius.md, marginVertical: spacing.sm }, stat: { flex: 1, alignItems: "center", paddingVertical: spacing.sm }, statValue: { ...typography.subtitle, color: colors.primary }, statLabel: { ...typography.caption, color: colors.textSecondary }, duriCard: { flexDirection: "row", gap: spacing.md, marginVertical: spacing.sm }, duriMark: { fontSize: 32, color: colors.primary }, duriCopy: { flex: 1 } });
