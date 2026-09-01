import { Pressable, StyleSheet, Text, View } from "react-native";
import { RemoteImage, TextField } from "../../../components/common";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { colors, spacing, typography } from "../../../theme/tokens";
import { createTripColors } from "../presentation/createTripTheme";
import type { RegionOption } from "../services/regionService";

type Props = {
  keyword: string;
  options: RegionOption[];
  selectedId: string;
  isLoading: boolean;
  error: string;
  onKeywordChange(value: string): void;
  onSelect(option: RegionOption): void;
  onRetry(): void;
};

export function TripDestinationStep({ keyword, options, selectedId, isLoading, error, onKeywordChange, onSelect, onRetry }: Props) {
  return <View style={styles.stack}>
    <TextField label="여행지 검색" value={keyword} onChangeText={onKeywordChange} placeholder="경주, 제주처럼 지역 이름을 검색해 보세요" returnKeyType="search" />
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{keyword.trim() ? "검색 결과" : "추천 여행지"}</Text>{!isLoading && !error ? <Text style={styles.resultCount}>{options.length}곳</Text> : null}</View>
    {isLoading ? <LoadingState label="여행지를 불러오고 있어요" /> : null}
    {!isLoading && error ? <ErrorState message={error} onRetry={onRetry} /> : null}
    {!isLoading && !error && !options.length ? <EmptyState title="검색 결과가 없어요" description="다른 지역명을 입력해 주세요." /> : null}
    {!isLoading && !error ? <View style={styles.grid}>{options.map((option) => <Pressable
      key={option.id}
      accessibilityRole="radio"
      accessibilityState={{ checked: selectedId === option.id }}
      accessibilityLabel={`${option.name} 여행지 선택`}
      onPress={() => onSelect(option)}
      style={({ pressed }) => [styles.destination, selectedId === option.id && styles.selectedCard, pressed && styles.pressed]}
    >
      <RemoteImage uri={option.imageUrl} accessibilityLabel={`${option.name} 대표`} aspectRatio={1.42} />
      {selectedId === option.id ? <View style={styles.selectedIndicator}><Text style={styles.selectedIndicatorText}>✓</Text></View> : null}
      <View style={styles.destinationCopy}>
        <Text numberOfLines={1} style={[styles.destinationName, selectedId === option.id && styles.destinationNameSelected]}>{option.name}</Text>
        {option.parentName ? <Text numberOfLines={1} style={styles.parentName}>{option.parentName}</Text> : null}
      </View>
    </Pressable>)}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", color: createTripColors.text },
  resultCount: { ...typography.caption, color: createTripColors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  destination: { position: "relative", width: "48%", overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: createTripColors.border, backgroundColor: createTripColors.page },
  destinationCopy: { minHeight: 57, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 1 },
  selectedCard: { borderColor: colors.primary, backgroundColor: createTripColors.blueSurface },
  pressed: { opacity: 0.84 },
  selectedIndicator: { position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white },
  selectedIndicatorText: { color: colors.white, fontSize: 12, lineHeight: 14, fontWeight: "900" },
  destinationName: { fontSize: 15, lineHeight: 20, fontWeight: "800", color: createTripColors.text },
  destinationNameSelected: { color: colors.primary },
  parentName: { fontSize: 10, lineHeight: 14, fontWeight: "600", color: createTripColors.muted },
});
