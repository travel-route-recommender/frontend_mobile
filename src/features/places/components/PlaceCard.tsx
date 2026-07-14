import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Place } from "../../../domain";
import { Card, Chip, RemoteImage } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function PlaceCard({ place, saved, onPress, onToggleSaved }: { place: Place; saved: boolean; onPress: () => void; onToggleSaved: () => void }) {
  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${place.name} 상세 보기`} onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
        <RemoteImage uri={place.imageUrl} accessibilityLabel={place.name} aspectRatio={1.7} />
        <View style={styles.heading}>
          <View style={styles.titleWrap}><Text style={styles.title}>{place.name}</Text><Text style={styles.meta}>{place.category} · ★ {place.rating.toFixed(1)}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? `${place.name} 저장 해제` : `${place.name} 저장`} accessibilityState={{ selected: saved }} hitSlop={8} onPress={(event) => { event.stopPropagation(); onToggleSaved(); }} style={[styles.save, saved && styles.saveActive]}>
            <Text style={[styles.saveText, saved && styles.saveTextActive]}>{saved ? "♥" : "♡"}</Text>
          </Pressable>
        </View>
        <Text numberOfLines={2} style={styles.summary}>{place.summary}</Text>
        <View style={styles.chips}>{place.tags.slice(0, 3).map((tag) => <Chip key={tag} label={tag} />)}</View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({ card: { padding: spacing.sm }, pressed: { opacity: 0.86 }, heading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm }, titleWrap: { flex: 1 }, title: { ...typography.subtitle, color: colors.text }, meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, save: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }, saveActive: { backgroundColor: colors.primarySoft }, saveText: { fontSize: 24, color: colors.textMuted }, saveTextActive: { color: colors.primary }, summary: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm } });
