import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../../components/common";
import { EmptyState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { PlaceCard } from "../../places/components/PlaceCard";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";

export function SavedScreen() {
  const router = useRouter();
  const { isMember, requireMember, memberGatePrompt } = useMemberGate();
  const state = useDuriStore();
  if (!isMember) return <Screen><View style={styles.header}><Text style={styles.title}>저장한 장소</Text><Text style={styles.subtitle}>장소 저장은 회원 계정에서 안전하게 관리돼요.</Text></View><EmptyState title="회원 전용 공간이에요" description="로그인하거나 가입하면 가고 싶은 장소를 모을 수 있어요." ctaLabel="로그인 또는 가입" onPress={() => requireMember(() => undefined, "저장한 장소 보기")} />{memberGatePrompt}</Screen>;
  const savedIds = state.savedPlaceIdsByUserId[state.currentUserId] ?? [];
  const places = savedIds.flatMap((placeId) => state.placesById[placeId] ? [state.placesById[placeId]] : []);
  return <Screen scroll={false}><FlatList data={places} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={styles.gap} />} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>저장한 장소</Text><Text style={styles.subtitle}>마음에 둔 장소를 여행 후보로 이어갈 수 있어요.</Text></View>} ListEmptyComponent={<EmptyState title="저장한 장소가 없어요" description="탐색에서 하트를 눌러 가고 싶은 장소를 모아보세요." ctaLabel="장소 탐색하기" onPress={() => router.push("/(tabs)/explore")} />} renderItem={({ item }) => <PlaceCard place={item} saved onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } })} onToggleSaved={() => state.toggleSavedPlace(item.id)} />} />{memberGatePrompt}</Screen>;
}
const styles = StyleSheet.create({ list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl }, header: { gap: spacing.xs, marginBottom: spacing.lg }, title: { ...typography.display, color: colors.text }, subtitle: { ...typography.body, color: colors.textSecondary }, gap: { height: spacing.md } });
