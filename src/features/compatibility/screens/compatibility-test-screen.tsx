import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { AppHeader, Avatar, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { EmptyState, ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { getMockTravelPreferenceResult } from "../../preferences/config/mock-travel-preference-results";
import { useTravelPreferenceSurveyResult } from "../../preferences/hooks/useTravelPreferenceSurveyResult";
import { preferenceSteps } from "../../preferences/config/travel-preference-test-config";
import { mockFriendDescriptions, mockFriendProfiles } from "../config/mock-friends";
import { compatibilityCalculationService } from "../services/compatibility-submission-service";
import { selectSavedFriendIds, useFriendCompatibilityStore } from "../store/use-friend-compatibility-store";

export function CompatibilityTestScreen() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const userId = useAuthSessionStore((state) => state.currentSessionUserId);
  const preferenceOwner = useMemo(() => userId ? ({ kind: "user", userId } as const) : null, [userId]);
  const requesterResult = useTravelPreferenceSurveyResult(preferenceOwner);
  const savedFriendIds = useFriendCompatibilityStore((state) => selectSavedFriendIds(state, userId));
  const setLatestResult = useFriendCompatibilityStore((state) => state.setLatestResult);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/mypage");
  };

  if (environment.dataSource !== "mock") return <Redirect href="/(tabs)/mypage" />;

  if (loading) return <Screen scroll={false}><LoadingState label="친구들과의 여행 궁합을 계산하고 있어요" /></Screen>;
  if (sessionKind !== "member" || !userId) return <Screen><AppHeader title="궁합도" onBack={leave} /><ErrorState message="궁합도는 회원 계정에서 이용할 수 있어요." onRetry={() => router.replace("/(auth)/login")} /></Screen>;
  if (!requesterResult) return <Screen><AppHeader title="궁합도" onBack={leave} /><EmptyState title="먼저 마이테스트를 완료해 주세요" description={`궁합 점수를 계산하려면 ${preferenceSteps.length}개 챕터의 상세 여행 성향 결과가 필요해요.`} ctaLabel="마이테스트 시작" onPress={() => router.replace("/tests/personal")} /></Screen>;

  const availableFriendIds = savedFriendIds.filter((friendId) => Boolean(getMockTravelPreferenceResult(friendId)));
  if (!availableFriendIds.length) return <Screen><AppHeader title="궁합도" onBack={leave} /><EmptyState title="저장한 친구가 없어요" description="친구 관리에서 궁합을 확인할 가상 친구를 한 명 이상 저장해 주세요." ctaLabel="친구 관리" onPress={() => router.push("/friends")} /></Screen>;

  const toggleSelected = (friendId: string) => setSelectedIds((current) => current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]);
  const start = async () => {
    if (!selectedIds.length) return;
    setLoading(true);
    setErrorMessage(null);
    const friends = selectedIds.flatMap((friendId) => {
      const result = getMockTravelPreferenceResult(friendId);
      return result ? [result] : [];
    });
    const response = await compatibilityCalculationService.calculate({ requester: requesterResult, friends });
    if (response.status === "error") {
      setLoading(false);
      setErrorMessage(response.message);
      return;
    }
    setLatestResult(response.result);
    router.replace("/tests/compatibility/result");
  };

  return <Screen testID="compatibility-test">
    <AppHeader title="궁합도" subtitle="함께 여행할 친구를 한 명 이상 선택해 주세요." onBack={leave} />
    <View style={styles.selectionSummary}><Text style={styles.selectionValue}>{selectedIds.length}명 선택</Text><Text style={styles.selectionHint}>여러 명을 선택하면 나와 친구들 전체의 평균 궁합을 계산해요.</Text></View>
    <View style={styles.friendList}>{availableFriendIds.map((friendId) => {
      const friend = mockFriendProfiles[friendId as keyof typeof mockFriendProfiles];
      const selected = selectedIds.includes(friendId);
      return <Pressable key={friendId} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleSelected(friendId)} style={({ pressed }) => [pressed && styles.pressed]}>
        <Card style={[styles.friendCard, selected && styles.friendCardSelected]}>
          <Avatar name={friend.initial || friend.name} uri={friend.profileImageUrl} />
          <View style={styles.friendCopy}><Text style={styles.friendName}>{friend.name}</Text><Text style={styles.friendDescription}>{mockFriendDescriptions[friendId as keyof typeof mockFriendDescriptions]}</Text></View>
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}><Text style={styles.checkmark}>{selected ? "✓" : ""}</Text></View>
        </Card>
      </Pressable>;
    })}</View>
    {errorMessage ? <View accessibilityLiveRegion="assertive" style={styles.errorBanner}><Text selectable style={styles.errorText}>{errorMessage}</Text></View> : null}
    <View style={styles.actions}><PrimaryButton label="궁합도 확인하기" disabled={!selectedIds.length} onPress={start} /><SecondaryButton label="친구 관리" onPress={() => router.push("/friends")} /></View>
  </Screen>;
}

const styles = StyleSheet.create({
  selectionSummary: { gap: spacing.xxs, borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: spacing.md },
  selectionValue: { ...typography.subtitle, color: colors.primary },
  selectionHint: { ...typography.caption, color: colors.textSecondary },
  friendList: { gap: spacing.sm, marginTop: spacing.lg },
  friendCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  friendCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  friendCopy: { flex: 1, minWidth: 0 },
  friendName: { ...typography.bodyStrong, color: colors.text },
  friendDescription: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  checkbox: { width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: colors.white, fontWeight: "900" },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  errorBanner: { borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: spacing.md, marginTop: spacing.md },
  errorText: { ...typography.body, color: colors.danger },
  pressed: { opacity: 0.82 },
});
