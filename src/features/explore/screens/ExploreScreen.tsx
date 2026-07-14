import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, SecondaryButton, TextField } from "../../../components/common";
import { EmptyState } from "../../../components/feedback";
import { PlaceCard } from "../../places/components/PlaceCard";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";

export function ExploreScreen() {
  const router = useRouter();
  const { requireMember, memberGatePrompt } = useMemberGate();
  const [query, setQuery] = useState("");
  const state = useDuriStore();
  const savedIds = state.savedPlaceIdsByUserId[state.currentUserId] ?? [];
  const places = useMemo(() => Object.values(state.placesById).filter((place) => { const keyword = query.trim().toLowerCase(); return !keyword || [place.name, place.category, place.address, ...place.tags].some((value) => value.toLowerCase().includes(keyword)); }), [query, state.placesById]);

  return (
    <Screen scroll={false}>
      <FlatList data={places} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={styles.gap} />} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>어디를 둘러볼까요?</Text><Text style={styles.subtitle}>두리가 모아둔 여행 장소를 탐색해 보세요.</Text><TextField label="장소 검색" accessibilityLabel="장소 검색" value={query} onChangeText={setQuery} placeholder="장소, 지역, 태그 검색" returnKeyType="search" /><SecondaryButton label="지도 탐색 준비 화면" onPress={() => router.push("/explore/map")} /></View>} ListEmptyComponent={<EmptyState title="검색 결과가 없어요" description="다른 장소명이나 태그로 검색해 보세요." />} renderItem={({ item }) => <PlaceCard place={item} saved={savedIds.includes(item.id)} onPress={() => router.push({ pathname: "/places/[placeId]", params: { placeId: item.id } })} onToggleSaved={() => requireMember(() => state.toggleSavedPlace(item.id), "장소 저장")} />} />
      {memberGatePrompt}
    </Screen>
  );
}
const styles = StyleSheet.create({ list: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl }, header: { gap: spacing.sm, marginBottom: spacing.lg }, title: { ...typography.display, color: colors.text }, subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs }, gap: { height: spacing.md } });
