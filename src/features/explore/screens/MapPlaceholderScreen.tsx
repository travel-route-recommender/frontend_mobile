import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader, Card, Screen } from "../../../components/common";
import { colors, spacing, typography } from "../../../theme/tokens";

export function MapPlaceholderScreen() { const router = useRouter(); return <Screen><AppHeader title="지도 탐색" onBack={() => router.back()} /><Card style={styles.card}><Text style={styles.mark}>⌖</Text><Text style={styles.title}>지도 탐색은 준비 중이에요</Text><Text style={styles.body}>Kakao Map 또는 다른 네이티브 지도 SDK 계약을 정한 뒤 현재 장소 Store와 연결할 예정입니다. 이번 단계에서는 존재하지 않는 API나 키를 사용하지 않습니다.</Text></Card></Screen>; }
const styles = StyleSheet.create({ card: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl }, mark: { fontSize: 42, color: colors.primary }, title: { ...typography.subtitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary, textAlign: "center" } });
