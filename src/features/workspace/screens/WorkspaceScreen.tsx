import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppHeader, Card, Chip, Screen, SectionHeader, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { selectTripAnalysis } from "../../../store/selectors";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";

export function WorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const state = useDuriStore();
  const startTripExplore = useExploreSearchStore((searchState) => searchState.startTripExplore);
  const trip = tripId ? state.tripsById[tripId] : undefined;
  const canView = trip?.members.some((member) => member.userId === state.currentUserId);
  if (!trip || !canView) return <Screen><AppHeader title="워크스페이스" onBack={() => router.back()} /><ErrorState message="여행 정보를 찾을 수 없거나 참여 권한이 없어요." /></Screen>;
  const candidates = state.candidatesByTripId[trip.id] ?? [];
  const itinerary = state.itineraryByTripId[trip.id] ?? [];
  const analysis = selectTripAnalysis(state, trip.id);
  return <Screen><AppHeader title={trip.title} subtitle="모바일 워크스페이스 기반 화면" onBack={() => router.back()} /><View style={styles.metrics}><Metric value={candidates.length} label="후보 장소" /><Metric value={itinerary.length} label="일정 항목" /><Metric value={trip.members.length} label="참여자" /></View><SecondaryButton label="후보 장소 추가" onPress={() => { state.setActiveTrip(trip.id); startTripExplore(trip.regionId); router.push("/(tabs)/explore"); }} /><View style={styles.sectionGap}><SectionHeader title="두리 일정 분석" /></View><Card style={styles.analysis}><View style={styles.analysisHeading}><Text style={styles.star}>✦</Text><Chip label={analysis?.overallStatus === "good" ? "좋음" : "조율 필요"} selected /></View><Text style={styles.title}>{analysis?.overallMessage ?? "일정이 쌓이면 두리가 함께 살펴볼게요."}</Text><Text style={styles.body}>로컬 순수 엔진으로 동선, 밀도, 식사와 선호 편중을 분석합니다.</Text></Card><SectionHeader title="이번 단계의 편집 범위" /><Card style={styles.placeholder}><Text style={styles.body}>후보 장소와 일정 수를 실제 Store에서 연결했습니다. 드래그 앤 드롭, 제안 미리보기와 적용 UI는 다음 단계에서 네이티브 제스처에 맞춰 구현합니다.</Text></Card></Screen>;
}
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({ metrics: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl }, metric: { flex: 1, alignItems: "center", paddingVertical: spacing.md }, metricValue: { ...typography.title, color: colors.primary }, metricLabel: { ...typography.caption, color: colors.textSecondary }, sectionGap: { marginTop: spacing.xl }, analysis: { gap: spacing.sm, marginVertical: spacing.sm, marginBottom: spacing.xl }, analysisHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, star: { fontSize: 30, color: colors.primary }, title: { ...typography.subtitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary }, placeholder: { marginTop: spacing.sm } });
