import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SecondaryButton } from "../../../components/common";
import { colors, radius, sizes, spacing, typography } from "../../../theme/tokens";
import type { CandidateBoardFilter, CandidatePlaceViewModel } from "../types";
import { CandidatePlaceCard } from "./CandidatePlaceCard";

const filters: { value: CandidateBoardFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "common", label: "공통 관심" },
  { value: "mine", label: "내가 담은 장소" },
  { value: "companion", label: "동행자가 담은 장소" },
];

export function CandidateBoard({
  candidates,
  totalCount,
  unscheduledCount,
  keyword,
  filter,
  canEdit,
  onKeywordChange,
  onFilterChange,
  onSearchFocus,
  onExplore,
  onOpenCandidate,
  onCandidateAction,
  onAddAnotherSchedule,
  onRemoveCandidate,
  renderCandidateExtra,
}: {
  candidates: readonly CandidatePlaceViewModel[];
  totalCount: number;
  unscheduledCount: number;
  keyword: string;
  filter: CandidateBoardFilter;
  canEdit: boolean;
  onKeywordChange: (value: string) => void;
  onFilterChange: (value: CandidateBoardFilter) => void;
  onSearchFocus?: () => void;
  onExplore: () => void;
  onOpenCandidate: (placeId: string) => void;
  onCandidateAction: (candidate: CandidatePlaceViewModel) => void;
  onAddAnotherSchedule: (candidate: CandidatePlaceViewModel) => void;
  onRemoveCandidate: (candidate: CandidatePlaceViewModel) => void;
  renderCandidateExtra?: (candidate: CandidatePlaceViewModel) => ReactNode;
}) {
  const [searchFocused, setSearchFocused] = useState(false);

  return <View style={styles.section}>
    <Text style={styles.description}>전체 {totalCount}곳 · 일정 전 {unscheduledCount}곳 · 배치 후에도 후보는 유지돼요.</Text>
    <View style={styles.searchWrap}>
      <TextInput
        accessibilityLabel="후보 장소 검색"
        value={keyword}
        onChangeText={onKeywordChange}
        onFocus={() => {
          setSearchFocused(true);
          onSearchFocus?.();
        }}
        onBlur={() => setSearchFocused(false)}
        placeholder="후보 장소 검색"
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.search, searchFocused && styles.searchFocused]}
      />
      {keyword ? <Pressable accessibilityRole="button" accessibilityLabel="후보 검색어 지우기" onPress={() => onKeywordChange("")} style={styles.clear}><Text style={styles.clearText}>지우기</Text></Pressable> : null}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
      {filters.map((item) => <Pressable
        key={item.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: filter === item.value }}
        onPress={() => onFilterChange(item.value)}
        style={({ pressed }) => [styles.filter, filter === item.value && styles.filterSelected, pressed && styles.pressed]}
      ><Text style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{item.label}</Text></Pressable>)}
    </ScrollView>
    {candidates.length ? <View style={styles.list}>
      {candidates.map((item) => <CandidatePlaceCard
        key={item.placeId}
        candidate={item}
        canEdit={canEdit}
        compact
        onPress={() => onOpenCandidate(item.placeId)}
        onPrimaryAction={() => onCandidateAction(item)}
        onAddAnother={() => onAddAnotherSchedule(item)}
        onRemove={() => onRemoveCandidate(item)}
        extra={renderCandidateExtra?.(item)}
      />)}
    </View> : <View style={styles.empty}><Text style={styles.emptyTitle}>{totalCount ? "조건에 맞는 후보가 없어요" : "아직 후보 장소가 없어요"}</Text><Text style={styles.description}>{totalCount ? "검색어나 필터를 바꿔보세요." : "함께 가고 싶은 장소를 먼저 담아보세요."}</Text>{!totalCount ? <SecondaryButton label="장소 찾아보기" onPress={onExplore} /> : null}</View>}
    <SecondaryButton label="장소 더 찾기" onPress={onExplore} disabled={!canEdit} />
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, paddingVertical: spacing.sm },
  description: { ...typography.caption, color: colors.textSecondary },
  searchWrap: { position: "relative" },
  search: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingRight: 64, ...typography.body, color: colors.text },
  searchFocused: { borderColor: colors.primary },
  clear: { position: "absolute", right: spacing.sm, top: 3, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  clearText: { ...typography.caption, color: colors.primary },
  filters: { gap: spacing.xs },
  filter: { minHeight: sizes.touch, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.caption, color: colors.text },
  filterTextSelected: { color: colors.white },
  list: { gap: spacing.sm },
  empty: { gap: spacing.sm, padding: spacing.lg, alignItems: "center", borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  pressed: { opacity: 0.82 },
});
