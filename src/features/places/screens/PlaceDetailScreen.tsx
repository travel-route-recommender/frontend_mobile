import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppHeader, Card, Chip, PrimaryButton, RemoteImage, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";

export function PlaceDetailScreen() {
  const router = useRouter();
  const { requireMember, memberGatePrompt } = useMemberGate();
  const params = useLocalSearchParams<{ placeId?: string | string[] }>();
  const placeId = Array.isArray(params.placeId) ? params.placeId[0] : params.placeId;
  const state = useDuriStore();
  const place = placeId ? state.placesById[placeId] : undefined;
  if (!place) return <Screen><AppHeader title="장소 상세" onBack={() => router.back()} /><ErrorState message="존재하지 않거나 삭제된 장소예요." /></Screen>;
  const saved = (state.savedPlaceIdsByUserId[state.currentUserId] ?? []).includes(place.id);
  const activeTrip = state.tripsById[state.activeTripId];
  const candidate = activeTrip ? (state.candidatesByTripId[activeTrip.id] ?? []).some((item) => item.placeId === place.id) : false;
  return <Screen><AppHeader title="장소 상세" onBack={() => router.back()} /><RemoteImage uri={place.imageUrl} accessibilityLabel={place.name} aspectRatio={1.35} /><View style={styles.heading}><View style={styles.copy}><Text style={styles.title}>{place.name}</Text><Text style={styles.meta}>{place.category} · ★ {place.rating.toFixed(1)} · {place.distanceLabel}</Text></View></View><View style={styles.chips}>{place.tags.map((tag) => <Chip key={tag} label={tag} />)}</View><Card style={styles.info}><Text style={styles.section}>장소 소개</Text><Text style={styles.body}>{place.summary}</Text><Text style={styles.address}>{place.address}</Text></Card><PrimaryButton label={saved ? "저장 해제" : "내 장소로 저장"} onPress={() => requireMember(() => state.toggleSavedPlace(place.id), saved ? "저장 해제" : "장소 저장")} />{activeTrip && activeTrip.status !== "completed" ? <SecondaryButton label={candidate ? "이미 여행 후보에 있어요" : `${activeTrip.title} 후보로 추가`} disabled={candidate} onPress={() => requireMember(() => { state.addCandidatePlace(activeTrip.id, place.id); }, "여행 후보 추가")} /> : null}{memberGatePrompt}</Screen>;
}
const styles = StyleSheet.create({ heading: { flexDirection: "row", marginTop: spacing.lg }, copy: { flex: 1 }, title: { ...typography.title, color: colors.text }, meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xxs }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginVertical: spacing.md }, info: { gap: spacing.xs, marginBottom: spacing.md }, section: { ...typography.subtitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary }, address: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs } });
