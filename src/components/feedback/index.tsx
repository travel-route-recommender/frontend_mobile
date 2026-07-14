import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";
import { PrimaryButton, SecondaryButton } from "../common/controls";

export function LoadingState({ label = "두리가 준비하고 있어요" }: { label?: string }) { return <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.description}>{label}</Text></View>; }
export function EmptyState({ title, description, ctaLabel, onPress }: { title: string; description: string; ctaLabel?: string; onPress?: () => void }) { return <View style={styles.state}><Text style={styles.emoji}>✦</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text>{ctaLabel && onPress ? <PrimaryButton label={ctaLabel} onPress={onPress} /> : null}</View>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <View style={styles.state}><Text style={styles.emoji}>!</Text><Text style={styles.title}>화면을 불러오지 못했어요</Text><Text style={styles.description}>{message}</Text>{onRetry ? <SecondaryButton label="다시 시도" onPress={onRetry} /> : null}</View>; }

const styles = StyleSheet.create({ state: { flex: 1, minHeight: 260, padding: spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.sm }, emoji: { fontSize: 32, color: colors.primary, fontWeight: "800" }, title: { ...typography.subtitle, color: colors.text, textAlign: "center" }, description: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.xs } });
