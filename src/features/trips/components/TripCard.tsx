import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Region, TripRoom } from "../../../domain";
import { Card, Chip } from "../../../components/common";
import { formatTripDateRange, formatTripStatus } from "../../../utils/formatters";
import { colors, spacing, typography } from "../../../theme/tokens";

export function TripCard({ trip, region, candidateCount, itineraryCount, onPress }: { trip: TripRoom; region?: Region; candidateCount: number; itineraryCount: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${trip.title} 여행방 열기`} onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card>
        <View style={styles.row}><View style={styles.copy}><Text style={styles.title}>{trip.title}</Text><Text style={styles.meta}>{region?.name ?? "목적지 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)}</Text></View><Text style={styles.arrow}>›</Text></View>
        <View style={styles.chips}><Chip label={formatTripStatus(trip.status)} selected={trip.status !== "completed"} /><Chip label={`후보 ${candidateCount}`} /><Chip label={`일정 ${itineraryCount}`} /></View>
      </Card>
    </Pressable>
  );
}
const styles = StyleSheet.create({ pressed: { opacity: 0.86 }, row: { flexDirection: "row", alignItems: "center" }, copy: { flex: 1 }, title: { ...typography.subtitle, color: colors.text }, meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xxs }, arrow: { fontSize: 32, color: colors.primary }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md } });
