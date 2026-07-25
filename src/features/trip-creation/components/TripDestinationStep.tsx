import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip, RemoteImage, TextField } from "../../../components/common";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
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
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{keyword.trim() ? "검색 결과" : "인기 여행지"}</Text><Chip label="mock 지역" /></View>
    {isLoading ? <LoadingState label="여행지를 불러오고 있어요" /> : null}
    {!isLoading && error ? <ErrorState message={error} onRetry={onRetry} /> : null}
    {!isLoading && !error && !options.length ? <EmptyState title="검색 결과가 없어요" description="다른 지역명을 입력해 주세요." /> : null}
    {!isLoading && !error ? options.map((option) => <Pressable
      key={option.id}
      accessibilityRole="radio"
      accessibilityState={{ checked: selectedId === option.id }}
      accessibilityLabel={`${option.name} 여행지 선택`}
      onPress={() => onSelect(option)}
      style={({ pressed }) => [styles.destination, selectedId === option.id && styles.selectedCard, pressed && styles.pressed]}
    >
      <RemoteImage uri={option.imageUrl} accessibilityLabel={`${option.name} 대표`} aspectRatio={2.2} />
      <View style={styles.destinationCopy}>
        <View style={styles.row}><View style={styles.titleCopy}><Text style={styles.sectionTitle}>{option.name}</Text>{option.parentName ? <Text style={styles.parentName}>{option.parentName} · {option.name}</Text> : null}</View>{selectedId === option.id ? <Chip label="선택됨" selected /> : null}</View>
        <Text style={styles.body}>{option.description}</Text>
        <Text style={styles.caption}>{option.spotCount}개 장소 · {option.weatherLabel}</Text>
      </View>
    </Pressable>) : null}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  destination: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  destinationCopy: { padding: spacing.md, gap: spacing.xs },
  selectedCard: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.84 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  titleCopy: { flex: 1, gap: spacing.xxs },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  parentName: { ...typography.caption, color: colors.primary },
  body: { ...typography.body, color: colors.textSecondary },
  caption: { ...typography.caption, color: colors.textSecondary },
});
