import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function DuriLogo({ compact = false }: { compact?: boolean }) {
  return (
    <View accessibilityLabel="두리" style={styles.row}>
      <View style={[styles.mark, compact && styles.markCompact]}><Text style={[styles.symbol, compact && styles.symbolCompact]}>✦</Text></View>
      <Text style={[styles.name, compact && styles.nameCompact]}>두리</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mark: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  markCompact: { width: 38, height: 38, borderRadius: radius.sm },
  symbol: { color: colors.white, fontSize: 26, fontWeight: "800" },
  symbolCompact: { fontSize: 19 },
  name: { ...typography.display, color: colors.primary },
  nameCompact: { ...typography.title },
});
