import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Card, PrimaryButton, Screen, SecondaryButton, SectionHeader } from "../../../components/common";
import { environment } from "../../../config/environment";
import { queryKeys } from "../../../query/keys";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { AuthErrorBanner, AuthTextField, PasswordField } from "../../auth/components/AuthControls";
import { clearAuthStores, useAuthFlow } from "../../auth/hooks/useAuthFlow";
import { authService } from "../../auth/services/authService";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { validateNickname } from "../../auth/validation";
import { getMockFriendProfile } from "../../compatibility/config/mock-friends";
import { selectSavedFriendIds, useFriendCompatibilityStore } from "../../compatibility/store/use-friend-compatibility-store";
import { useTravelPreferenceSurveyResult } from "../../preferences/hooks/useTravelPreferenceSurveyResult";
import { fetchApiTripList } from "../../trips/tripRoomApi";

export function MyPageScreen() {
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const provider = useAuthSessionStore((session) => session.provider);
  const currentSessionUserId = useAuthSessionStore((session) => session.currentSessionUserId);
  const { logout } = useAuthFlow();
  const state = useDuriStore();
  const user = state.usersById[state.currentUserId];
  const result = sessionKind === "member" ? state.preferenceResultsByUserId[state.currentUserId] : undefined;
  const preferenceOwner = useMemo(
    () => sessionKind === "member" ? ({ kind: "user", userId: state.currentUserId } as const) : null,
    [sessionKind, state.currentUserId],
  );
  const detailedResult = useTravelPreferenceSurveyResult(preferenceOwner);
  const savedFriendIds = useFriendCompatibilityStore((friendState) => selectSavedFriendIds(friendState, state.currentUserId));
  const friends = savedFriendIds.flatMap((friendId) => {
    const friend = getMockFriendProfile(friendId) ?? state.usersById[friendId];
    return friend ? [friend] : [];
  });
  const trips = Object.values(state.tripsById).filter((trip) => trip.members.some((member) => member.userId === state.currentUserId));
  const apiTripsQuery = useQuery({
    queryKey: [...queryKeys.trips.all, "api", currentSessionUserId],
    queryFn: ({ signal }) => fetchApiTripList(currentSessionUserId, signal),
    enabled: environment.dataSource === "api" && Boolean(currentSessionUserId),
  });
  const apiTrips = apiTripsQuery.data ?? [];
  const ongoingApiTrip = apiTrips.find((trip) => trip.viewModel.status !== "completed");
  const ongoingLocalTrip = trips.find((trip) => trip.id === state.activeTripId && trip.status !== "completed")
    ?? trips.find((trip) => trip.status !== "completed");
  const activeGuestTrip = sessionKind === "guest"
    ? environment.dataSource === "api"
      ? ongoingApiTrip && { id: ongoingApiTrip.id, title: ongoingApiTrip.viewModel.title }
      : ongoingLocalTrip
    : undefined;
  const tripCount = environment.dataSource === "api" ? apiTrips.length : trips.length;
  const guestTripsLoading = sessionKind === "guest" && environment.dataSource === "api" && apiTripsQuery.isLoading;
  const guestTripsFailed = sessionKind === "guest" && environment.dataSource === "api" && apiTripsQuery.isError;
  const savedCount = sessionKind === "member" ? (state.savedPlaceIdsByUserId[state.currentUserId] ?? []).length : 0;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nickname, setNickname] = useState(user?.name ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveProfile = async () => {
    const validation = validateNickname(nickname);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(null);
    try {
      const updated = await authService.updateProfile({ nickname: nickname.trim(), ...(profileImageUrl.trim() ? { profileImageUrl: profileImageUrl.trim() } : {}) });
      state.upsertUser(updated);
      setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "프로필을 수정하지 못했어요."); } finally { setBusy(false); }
  };

  const deleteAccount = async () => {
    setBusy(true); setError(null);
    try {
      await authService.deleteAccount(provider === "email" ? password : undefined);
      clearAuthStores();
      setDeleting(false);
      router.replace("/(auth)/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "계정을 탈퇴하지 못했어요.");
    } finally { setBusy(false); }
  };

  return <Screen>
    <View style={styles.header}><Avatar name={user?.initial ?? user?.name ?? "여행자"} uri={user?.profileImageUrl} size={64} /><View style={styles.headerCopy}><Text style={styles.title}>{user?.name ?? "여행자"}</Text><Text style={styles.subtitle}>{sessionKind === "guest" ? "초대받은 여행에 게스트로 참여 중이에요" : result ? "개인 여행 성향 분석을 완료했어요" : "여행 성향 테스트를 기다리고 있어요"}</Text></View></View>
    <View style={styles.stats}><Metric value={tripCount} label="여행" /><Metric value={savedCount} label="저장" /><Metric value={sessionKind === "guest" ? (activeGuestTrip ? 1 : 0) : result ? result.traits.length : 0} label={sessionKind === "guest" ? "참여 중" : "취향 키워드"} /></View>
    {sessionKind === "member" ? <>
      <SectionHeader title="나의 여행 성향" />
      <Card style={styles.preference}>
        <Text style={styles.profileType}>{result?.profileType ?? "아직 결과가 없어요"}</Text>
        <Text style={styles.description}>{result ? result.traits.join(" · ") : "간단한 테스트로 여행할 때 중요하게 생각하는 점을 알아보세요."}</Text>
        {result ? <View style={styles.tags}>{result.preferredTags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>)}</View> : null}
        {result ? <><PrimaryButton label="결과 자세히 보기" onPress={() => router.push("/tests/personal/result")} /><SecondaryButton label="테스트 다시 하기" onPress={() => router.push({ pathname: "/tests/personal/result", params: { retest: "1" } })} /><SecondaryButton label="친구와 궁합도 보기" onPress={() => router.push("/tests/compatibility")} /></> : <PrimaryButton label="내 여행 성향 알아보기" onPress={() => router.push("/tests/personal")} />}
        {result && !detailedResult ? <Text style={styles.guestCopy}>궁합도에는 상세 여행 성향 결과가 필요해요.</Text> : null}
      </Card>
    </> : <>
      <SectionHeader title="초대받은 여행" />
      <Card style={styles.guestRoom}>
        <Text style={styles.profileType}>{guestTripsLoading ? "여행방을 불러오는 중이에요" : guestTripsFailed ? "여행방을 불러오지 못했어요" : activeGuestTrip?.title ?? "참여 중인 여행방이 없어요"}</Text>
        <Text style={styles.description}>{guestTripsLoading ? "초대받은 여행 정보를 확인하고 있어요." : guestTripsFailed ? "네트워크 연결을 확인하고 다시 시도해 주세요." : activeGuestTrip ? "이 여행방의 장소와 일정을 보고 후보 장소를 제안할 수 있어요." : "초대 코드를 입력하면 게스트로 여행방에 참여할 수 있어요."}</Text>
        {guestTripsLoading ? null : guestTripsFailed
          ? <PrimaryButton label="다시 불러오기" onPress={() => { void apiTripsQuery.refetch(); }} />
          : activeGuestTrip
            ? <PrimaryButton label="참여 중인 여행방으로 이동" onPress={() => router.push({ pathname: "/trips/[tripId]", params: { tripId: activeGuestTrip.id } })} />
            : <PrimaryButton label="초대 코드로 참여하기" onPress={() => router.push("/(auth)/invite")} />}
        <SecondaryButton label="게스트 계정 업그레이드" onPress={() => router.push("/(auth)/guest-upgrade" as never)} />
      </Card>
    </>}
    {sessionKind === "member" ? <>
      <SectionHeader title="친구" actionLabel="관리" onAction={() => router.push("/friends")} />
      <Card style={styles.friendSection}>
        <Text style={styles.description}>{friends.length ? `${friends.length}명의 친구와 여행 궁합을 확인할 수 있어요.` : "친구를 저장하고 여행 궁합을 확인해 보세요."}</Text>
        {friends.length ? <View style={styles.friendList}>{friends.map((friend) => <View key={friend.id} style={styles.friend}><Avatar name={friend.initial || friend.name} uri={friend.profileImageUrl} size={40} /><Text style={styles.friendName}>{friend.name}</Text></View>)}</View> : null}
        <SecondaryButton label="친구 관리" onPress={() => router.push("/friends")} />
      </Card>
    </> : null}
    <SectionHeader title="계정과 참여" />
    <SecondaryButton label="프로필 수정" onPress={() => { setNickname(user?.name ?? ""); setProfileImageUrl(user?.profileImageUrl ?? ""); setError(null); setEditing(true); }} />
    {sessionKind === "member" ? <><SecondaryButton label="로그인 수단 관리" onPress={() => router.push("/account/social-connections" as never)} /><SecondaryButton label="초대 코드로 참여하기" onPress={() => router.push("/(auth)/invite")} /><SecondaryButton label="온보딩 안내 다시 보기" onPress={() => router.push("/(onboarding)/intro")} /></> : null}
    <SecondaryButton label="로그아웃" onPress={async () => { try { await logout(); } finally { router.replace("/(auth)/login"); } }} />
    <Pressable accessibilityRole="button" onPress={() => { setPassword(""); setError(null); setDeleting(true); }} style={styles.dangerButton}><Text style={styles.dangerText}>{sessionKind === "guest" ? "게스트 계정 삭제" : "회원 탈퇴"}</Text></Pressable>

    <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
      <Dialog title="프로필 수정" onClose={() => setEditing(false)}>
        <AuthTextField label="닉네임" value={nickname} onChangeText={(value) => { setNickname(value); setError(null); }} maxLength={12} />
        <AuthTextField label="프로필 이미지 URL" value={profileImageUrl} onChangeText={(value) => { setProfileImageUrl(value); setError(null); }} autoCapitalize="none" keyboardType="url" placeholder="https://..." />
        <AuthErrorBanner message={error} />
        <PrimaryButton label="수정 완료" loading={busy} onPress={saveProfile} />
      </Dialog>
    </Modal>

    <Modal visible={deleting} transparent animationType="fade" onRequestClose={() => setDeleting(false)}>
      <Dialog title={sessionKind === "guest" ? "게스트 계정 삭제" : "정말 탈퇴할까요?"} onClose={() => setDeleting(false)}>
        <Text style={styles.dialogDescription}>계정 정보와 모든 로그인 세션이 폐기되며 이 작업은 되돌릴 수 없어요.</Text>
        {provider === "email" ? <PasswordField label="현재 비밀번호" value={password} onChangeText={(value) => { setPassword(value); setError(null); }} autoComplete="current-password" /> : null}
        <AuthErrorBanner message={error} />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={deleteAccount} style={[styles.confirmDanger, busy && styles.disabled]}><Text style={styles.confirmDangerText}>{busy ? "처리 중..." : "계정 영구 삭제"}</Text></Pressable>
      </Dialog>
    </Modal>
  </Screen>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <View style={styles.overlay}><View style={styles.dialog}><View style={styles.dialogHeader}><Text style={styles.dialogTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8}><Text style={styles.close}>×</Text></Pressable></View>{children}</View></View>;
}

function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.lg }, headerCopy: { flex: 1 }, title: { ...typography.title, color: colors.text }, subtitle: { ...typography.caption, color: colors.textSecondary },
  stats: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl }, metric: { flex: 1, alignItems: "center", paddingVertical: spacing.md }, metricValue: { ...typography.title, color: colors.primary }, metricLabel: { ...typography.caption, color: colors.textSecondary },
  preference: { gap: spacing.sm, marginVertical: spacing.sm, marginBottom: spacing.xl }, guestRoom: { gap: spacing.sm, marginVertical: spacing.sm, marginBottom: spacing.xl }, profileType: { ...typography.subtitle, color: colors.text }, description: { ...typography.body, color: colors.textSecondary }, tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, tag: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 }, tagText: { ...typography.caption, color: colors.primary }, guestCopy: { ...typography.caption, color: colors.textSecondary, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm },
  friendSection: { gap: spacing.sm, marginVertical: spacing.sm, marginBottom: spacing.xl }, friendList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, friend: { minWidth: 88, alignItems: "center", gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm }, friendName: { ...typography.caption, color: colors.text },
  dangerButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing.sm }, dangerText: { ...typography.bodyStrong, color: colors.danger, textDecorationLine: "underline" },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(20, 34, 67, 0.45)" }, dialog: { gap: spacing.md, borderRadius: radius.xl, padding: spacing.lg, backgroundColor: colors.surface }, dialogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, dialogTitle: { ...typography.subtitle, color: colors.text }, close: { fontSize: 28, color: colors.textSecondary }, dialogDescription: { ...typography.body, color: colors.textSecondary },
  confirmDanger: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger }, confirmDangerText: { ...typography.button, color: colors.white }, disabled: { opacity: 0.5 },
});
