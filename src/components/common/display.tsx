import { useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadows, spacing, typography } from "../../theme/tokens";

export function Card({ children, style }: PropsWithChildren<{ style?: object }>) { return <View style={[styles.card, style]}>{children}</View>; }

export function AppHeader({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={10} onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : null}
      <View style={styles.headerText}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>
      {action ?? (onBack ? <View style={styles.back} /> : null)}
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={styles.link}>{actionLabel}</Text></Pressable> : null}</View>;
}

export function Chip({ label, selected = false }: { label: string; selected?: boolean }) { return <View style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></View>; }
export function Avatar({ name, uri, size = 44 }: { name: string; uri?: string; size?: number }) { return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }} /> : <View accessibilityLabel={`${name} 프로필`} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}><Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{name.trim().slice(0, 1) || "?"}</Text></View>; }
export function Divider() { return <View style={styles.divider} />; }

export function RemoteImage({ uri, accessibilityLabel, aspectRatio = 1.5 }: { uri?: string; accessibilityLabel: string; aspectRatio?: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <View accessibilityLabel={`${accessibilityLabel} 이미지 없음`} style={[styles.imageFallback, { aspectRatio }]}><Text style={styles.imageFallbackText}>두리</Text></View>;
  return <Image accessibilityLabel={accessibilityLabel} source={{ uri }} resizeMode="cover" onError={() => setFailed(true)} style={[styles.image, { aspectRatio }]} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.card },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingVertical: spacing.sm },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  back: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 36, lineHeight: 38, color: colors.text, fontWeight: "400" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  link: { ...typography.caption, color: colors.primary },
  chip: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextSelected: { color: colors.primary },
  avatar: { backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "800" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, width: "100%" },
  image: { width: "100%", borderRadius: radius.md, backgroundColor: colors.primarySoft },
  imageFallback: { width: "100%", borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  imageFallbackText: { ...typography.subtitle, color: colors.primary },
});
