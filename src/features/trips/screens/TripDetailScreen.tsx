import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppHeader, Avatar, Card, Chip, PrimaryButton, Screen, SectionHeader } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { formatTripDateRange, formatTripStatus } from "../../../utils/formatters";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function TripDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const state = useDuriStore();
  const trip = tripId ? state.tripsById[tripId] : undefined;
  const canView = trip?.members.some((member) => member.userId === state.currentUserId);
  if (!trip || !canView) return <Screen><AppHeader title="여행방" onBack={() => router.back()} /><ErrorState message="존재하지 않거나 참여할 수 없는 여행방이에요." /></Screen>;
  const region = state.regionsById[trip.regionId];
  const members = trip.members.flatMap((member) => state.usersById[member.userId] ? [{ ...state.usersById[member.userId], status: member.preferenceStatus }] : []);
  const candidateCount = (state.candidatesByTripId[trip.id] ?? []).length;
  const itineraryCount = (state.itineraryByTripId[trip.id] ?? []).length;
  return <Screen><AppHeader title="여행방" subtitle={formatTripStatus(trip.status)} onBack={() => router.back()} /><Card style={styles.hero}><Chip label={region?.name ?? "목적지 미정"} selected /><Text style={styles.title}>{trip.title}</Text><Text style={styles.meta}>{formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text><View style={styles.metrics}><Metric value={candidateCount} label="후보" /><Metric value={itineraryCount} label="일정" /><Metric value={members.filter((member) => member.status === "completed").length} label="성향 응답" /></View><PrimaryButton label="일정 워크스페이스 열기" onPress={() => { state.setActiveTrip(trip.id); router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId: trip.id } }); }} /></Card><SectionHeader title="함께하는 여행자" /><Card style={styles.members}>{members.map((member) => <View key={member.id} style={styles.member}><Avatar name={member.name} uri={member.profileImageUrl} /><View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberStatus}>{member.status === "completed" ? "성향 응답 완료" : "성향 응답 대기"}</Text></View><Text style={member.status === "completed" ? styles.done : styles.pending}>{member.status === "completed" ? "완료" : "대기"}</Text></View>)}</Card></Screen>;
}
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({ hero: { gap: spacing.sm, marginBottom: spacing.xl }, title: { ...typography.title, color: colors.text }, meta: { ...typography.body, color: colors.textSecondary }, metrics: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radius.md }, metric: { flex: 1, alignItems: "center", paddingVertical: spacing.sm }, metricValue: { ...typography.subtitle, color: colors.primary }, metricLabel: { ...typography.caption, color: colors.textSecondary }, members: { marginTop: spacing.sm, gap: spacing.md }, member: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, memberCopy: { flex: 1 }, memberName: { ...typography.bodyStrong, color: colors.text }, memberStatus: { ...typography.caption, color: colors.textSecondary }, done: { ...typography.caption, color: colors.success }, pending: { ...typography.caption, color: colors.warning } });
