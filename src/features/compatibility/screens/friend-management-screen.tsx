import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppHeader, Avatar, Card, Screen } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { MOCK_FRIEND_IDS, mockFriendDescriptions, mockFriendProfiles } from "../config/mock-friends";
import { selectSavedFriendIds, useFriendCompatibilityStore } from "../store/use-friend-compatibility-store";

export function FriendManagementScreen() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const userId = useAuthSessionStore((state) => state.currentSessionUserId);
  const savedFriendIds = useFriendCompatibilityStore((state) => selectSavedFriendIds(state, userId));
  const toggleSavedFriend = useFriendCompatibilityStore((state) => state.toggleSavedFriend);

  if (sessionKind !== "member" || !userId) {
    return <Screen><AppHeader title="친구" onBack={() => router.back()} /><ErrorState message="친구를 저장하려면 회원 로그인이 필요해요." onRetry={() => router.replace("/(auth)/login")} /></Screen>;
  }

  return <Screen testID="friend-management">
    <AppHeader title="친구" subtitle="함께 궁합을 확인할 가상 친구를 저장해 보세요." onBack={() => router.back()} />
    <View style={styles.summary}><Text style={styles.summaryValue}>{savedFriendIds.length}명</Text><Text style={styles.summaryLabel}>저장한 친구</Text></View>
    <View style={styles.list}>{MOCK_FRIEND_IDS.map((friendId) => {
      const friend = mockFriendProfiles[friendId];
      const saved = savedFriendIds.includes(friendId);
      return <Pressable key={friendId} accessibilityRole="checkbox" accessibilityState={{ checked: saved }} accessibilityLabel={`${friend.name} 친구 ${saved ? "저장됨" : "저장 안 됨"}`} onPress={() => toggleSavedFriend(userId, friendId)} style={({ pressed }) => [pressed && styles.pressed]}>
        <Card style={[styles.friendCard, saved && styles.friendCardSaved]}>
          <Avatar name={friend.initial || friend.name} uri={friend.profileImageUrl} />
          <View style={styles.friendCopy}><Text style={styles.friendName}>{friend.name}</Text><Text style={styles.friendDescription}>{mockFriendDescriptions[friendId]}</Text></View>
          <View style={[styles.saveBadge, saved && styles.saveBadgeActive]}><Text style={[styles.saveBadgeText, saved && styles.saveBadgeTextActive]}>{saved ? "저장됨" : "저장"}</Text></View>
        </Card>
      </Pressable>;
    })}</View>
    <Text style={styles.notice}>현재 친구 목록은 궁합 테스트 확인을 위한 mock 데이터예요. 백엔드 친구 API가 연결되면 같은 저장 목록 자리에 실제 친구가 표시돼요.</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: spacing.md },
  summaryValue: { ...typography.title, color: colors.primary },
  summaryLabel: { ...typography.body, color: colors.textSecondary },
  list: { gap: spacing.sm, marginTop: spacing.lg },
  friendCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  friendCardSaved: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  friendCopy: { flex: 1, minWidth: 0 },
  friendName: { ...typography.bodyStrong, color: colors.text },
  friendDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  saveBadge: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  saveBadgeActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  saveBadgeText: { ...typography.caption, color: colors.textSecondary },
  saveBadgeTextActive: { color: colors.white },
  pressed: { opacity: 0.82 },
  notice: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
});
