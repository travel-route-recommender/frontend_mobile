import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader, Card, Chip, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";

export function PersonalResultScreen() {
  const router = useRouter();
  const result = useDuriStore((state) => state.preferenceResultsByUserId[state.currentUserId]);
  if (!result) return <Screen><AppHeader title="성향 결과" onBack={() => router.back()} /><EmptyState title="저장된 성향 결과가 없어요" description="테스트를 완료하면 결과를 이곳에서 확인할 수 있어요." ctaLabel="테스트 시작" onPress={() => router.replace("/tests/personal")} /></Screen>;
  return <Screen><AppHeader title="성향 결과" onBack={() => router.back()} /><Card style={styles.hero}><Text style={styles.mark}>✦</Text><Text style={styles.eyebrow}>나의 여행 유형</Text><Text style={styles.title}>{result.profileType}</Text><Text style={styles.body}>{result.traits.join(" · ")}</Text></Card><Text style={styles.section}>잘 맞는 여행 키워드</Text><View style={styles.chips}>{result.preferredTags.map((tag) => <Chip key={tag} label={`#${tag}`} selected />)}</View><PrimaryButton label="마이페이지에서 확인" onPress={() => router.replace("/(tabs)/mypage")} /><SecondaryButton label="다시 테스트하기" onPress={() => router.replace("/tests/personal")} /></Screen>;
}
const styles = StyleSheet.create({ hero: { alignItems: "center", gap: spacing.xs, marginTop: spacing.lg, marginBottom: spacing.xl }, mark: { fontSize: 38, color: colors.primary }, eyebrow: { ...typography.caption, color: colors.primary }, title: { ...typography.title, color: colors.text }, body: { ...typography.body, color: colors.textSecondary }, section: { ...typography.subtitle, color: colors.text, marginBottom: spacing.sm }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.xl } });
