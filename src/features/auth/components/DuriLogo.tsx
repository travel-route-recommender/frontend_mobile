import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export function DuriLogo({ compact = false, latin = false }: { compact?: boolean; latin?: boolean }) {
  if (latin) {
    return (
      <View accessibilityLabel="두리" style={styles.latinRow}>
        <Text style={[styles.latinName, compact && styles.latinNameCompact]}>DURI</Text>
        <Text accessibilityElementsHidden style={[styles.latinSparkle, compact && styles.latinSparkleCompact]}>✦</Text>
      </View>
    );
  }

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
  latinRow: { flexDirection: "row", alignItems: "flex-start" },
  latinName: { color: colors.primary, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: 1.2 },
  latinNameCompact: { fontSize: 25, lineHeight: 30, letterSpacing: 0.8 },
  latinSparkle: { color: colors.primary, fontSize: 17, lineHeight: 20, fontWeight: "900", marginLeft: 2 },
  latinSparkleCompact: { fontSize: 13, lineHeight: 16 },
});
