import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppHeader, Card, Chip, PrimaryButton, Screen, SectionHeader } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { diagnoseGroupPreferences } from "../../../duri/group-preferences";
import { useDuriStore } from "../../../store/useDuriStore";
import { formatTripDateRange, formatTripStatus } from "../../../utils/formatters";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { GroupPreferenceDiagnosisCard, PreferenceResponseSummaryCard } from "../components/preferences";
import { selectRoomPreferenceResponseSummary } from "../selectors";

export function TripDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const tripsById = useDuriStore((state) => state.tripsById);
  const usersById = useDuriStore((state) => state.usersById);
  const preferenceResultsByUserId = useDuriStore((state) => state.preferenceResultsByUserId);
  const regionsById = useDuriStore((state) => state.regionsById);
  const candidatesByTripId = useDuriStore((state) => state.candidatesByTripId);
  const itineraryByTripId = useDuriStore((state) => state.itineraryByTripId);
  const currentUserId = useDuriStore((state) => state.currentUserId);
  const hydrationError = useDuriStore((state) => state.hydrationError);
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const trip = tripId ? tripsById[tripId] : undefined;
  const summary = useMemo(
    () => selectRoomPreferenceResponseSummary({ tripsById, usersById, preferenceResultsByUserId, currentUserId }, tripId ?? ""),
    [currentUserId, preferenceResultsByUserId, tripId, tripsById, usersById],
  );
  const diagnosisResults = useMemo(
    () => Object.fromEntries(Object.entries(preferenceResultsByUserId).filter(([userId]) => Boolean(usersById[userId]))),
    [preferenceResultsByUserId, usersById],
  );
  const diagnosis = useMemo(
    () => trip ? diagnoseGroupPreferences(trip, diagnosisResults) : undefined,
    [diagnosisResults, trip],
  );
  const memberNamesById = useMemo(
    () => Object.fromEntries(summary.members.map((member) => [member.userId, member.name])),
    [summary.members],
  );

  if (environment.dataSource !== "mock") {
    const message = environment.dataSource === "api"
      ? "여행방과 성향 결과 API 계약 연결 전입니다. mock 여행방으로 자동 전환하지 않았어요."
      : "서버 여행방 멤버와 로컬 성향 결과의 사용자 식별자 연결이 필요합니다. 연결이 확인되기 전에는 그룹 진단을 표시하지 않아요.";
    return <Screen><AppHeader title="여행방" onBack={() => router.back()} /><ErrorState message={message} /></Screen>;
  }
  if (hydrationError) return <Screen><AppHeader title="여행방" onBack={() => router.back()} /><ErrorState message={hydrationError} /></Screen>;
  const canView = trip?.members.some((member) => member.userId === currentUserId);
  if (!trip || !canView || !diagnosis) return <Screen><AppHeader title="여행방" onBack={() => router.back()} /><ErrorState message="존재하지 않거나 참여할 수 없는 여행방이에요." /></Screen>;

  const region = regionsById[trip.regionId];
  const candidateCount = (candidatesByTripId[trip.id] ?? []).length;
  const itineraryCount = (itineraryByTripId[trip.id] ?? []).length;
  const currentMember = summary.members.find((member) => member.userId === currentUserId);
  const startMyTest = () => router.push("/tests/personal");

  return <Screen testID="trip-preference-diagnosis">
    <AppHeader title="여행방" subtitle={formatTripStatus(trip.status)} onBack={() => router.back()} />
    <Card style={styles.hero}>
      <Chip label={region?.name ?? "목적지 미정"} selected />
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.meta}>{formatTripDateRange(trip.startDate, trip.endDate)} · {summary.totalCount}명</Text>
      <View style={styles.metrics}><Metric value={candidateCount} label="후보" /><Metric value={itineraryCount} label="일정" /><Metric value={summary.completedCount} label="성향 응답" /></View>
      <PrimaryButton label="일정 워크스페이스 열기" onPress={() => { setActiveTrip(trip.id); router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId: trip.id } }); }} />
    </Card>
    <SectionHeader title="여행 성향 응답 현황" />
    <PreferenceResponseSummaryCard
      summary={summary}
      currentUserId={currentUserId || null}
      onStartMyTest={startMyTest}
      onViewMyResult={() => router.push("/tests/personal/result")}
      onRetakeMyTest={() => router.push({ pathname: "/tests/personal/result", params: { retest: "1" } })}
    />
    <View style={styles.sectionGap}><SectionHeader title="우리 여행 성향" /></View>
    <GroupPreferenceDiagnosisCard
      diagnosis={diagnosis}
      memberNamesById={memberNamesById}
      canStartMyTest={Boolean(currentMember && currentMember.state !== "completed")}
      onStartMyTest={startMyTest}
    />
  </Screen>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.text },
  meta: { ...typography.body, color: colors.textSecondary },
  metrics: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
  metric: { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  metricValue: { ...typography.subtitle, color: colors.primary },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  sectionGap: { marginTop: spacing.xl },
});
