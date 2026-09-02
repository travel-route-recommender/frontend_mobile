import { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, PrimaryButton } from "../../../components/common";
import { environment } from "../../../config/environment";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, shadows, spacing, typography } from "../../../theme/tokens";
import { AuthErrorBanner, AuthTextField, PasswordField } from "../../auth/components/AuthControls";
import { clearAuthStores, useAuthFlow } from "../../auth/hooks/useAuthFlow";
import { authService } from "../../auth/services/authService";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { validateNickname } from "../../auth/validation";
import { useTravelPreferenceSurveyResult } from "../../preferences/hooks/useTravelPreferenceSurveyResult";
import { useApiPreferenceProfile } from "../../preferences/hooks/useApiPreferenceProfile";
import { resolvePreferenceResultPair } from "../../preferences/logic/resolve-preference-result-pair";

const DURI_GUIDE_IMAGE = require("../../../../assets/images/duri/home/hero-travel.png");
const FOUNDATION = {
  page: "#FFFFFF",
  text: "#17265F",
  secondary: "#60719B",
  muted: "#8290AE",
  border: "#DCE7F7",
  blueSurface: "#F2F8FF",
  lavender: "#F0EDFF",
  mint: "#EAF7EE",
  peach: "#FFF0E2",
} as const;

type MenuTone = "blue" | "mint" | "peach" | "lavender" | "neutral" | "danger";
type MenuRow = { icon: string; label: string; tone: MenuTone; onPress: () => void };

export function MyPageScreen() {
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const provider = useAuthSessionStore((session) => session.provider);
  const { logout } = useAuthFlow();
  const { width } = useWindowDimensions();
  const compact = width <= 370;
  const state = useDuriStore();
  const user = state.usersById[state.currentUserId];
  const result = state.preferenceResultsByUserId[state.currentUserId];
  const preferenceOwner = useMemo(
    () => sessionKind === "anonymous" ? null : ({ kind: "user", userId: state.currentUserId } as const),
    [sessionKind, state.currentUserId],
  );
  const detailedResult = useTravelPreferenceSurveyResult(preferenceOwner);
  const preferenceResultPair = useMemo(() => result ? resolvePreferenceResultPair(
    result,
    detailedResult,
    state.currentUserId,
  ) : null, [detailedResult, result, state.currentUserId]);
  const apiPreferenceProfile = useApiPreferenceProfile(state.currentUserId, sessionKind === "member");
  const apiPreferenceState = environment.dataSource === "mock"
    ? "local"
    : apiPreferenceProfile.data
      ? apiPreferenceProfile.data.completed ? "completed" : "incomplete"
      : apiPreferenceProfile.isError ? "error" : "loading";
  const preferencePresentation = environment.dataSource === "mock"
    ? preferenceResultPair?.canonicalPresentation ?? null
    : apiPreferenceProfile.data?.completed
      ? apiPreferenceProfile.data.presentation
      : null;
  const preferenceStatusLabel = apiPreferenceState === "loading"
    ? "여행 성향을 확인하고 있어요"
    : apiPreferenceState === "error"
      ? "여행 성향을 불러오지 못했어요"
      : undefined;
  const trips = useMemo(
    () => Object.values(state.tripsById).filter((trip) => trip.members.some((member) => member.userId === state.currentUserId)),
    [state.currentUserId, state.tripsById],
  );
  const savedCount = sessionKind === "member" ? (state.savedPlaceIdsByUserId[state.currentUserId] ?? []).length : 0;
  const userName = user?.name ?? "여행자";
  const avatarName = user?.initial ?? userName;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nickname, setNickname] = useState(userName);
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profileImageUrl ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openProfileEditor = () => {
    setNickname(user?.name ?? "");
    setProfileImageUrl(user?.profileImageUrl ?? "");
    setError(null);
    setEditing(true);
  };

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

  const serviceRows: MenuRow[] = sessionKind === "member" ? [
    { icon: "♥", label: "친구와 궁합 보기", tone: "blue", onPress: () => router.push("/tests/compatibility") },
    { icon: "♙", label: "친구 관리", tone: "mint", onPress: () => router.push("/friends") },
    { icon: "+", label: "초대 코드로 참여", tone: "peach", onPress: () => router.push("/(auth)/invite") },
    { icon: "✦", label: "온보딩 안내 다시 보기", tone: "lavender", onPress: () => router.push("/(onboarding)/intro") },
    { icon: "▤", label: "서비스 이용약관", tone: "blue", onPress: () => router.push({ pathname: "/(auth)/terms", params: { type: "service" } }) },
    { icon: "◇", label: "개인정보 처리방침", tone: "mint", onPress: () => router.push({ pathname: "/(auth)/terms", params: { type: "privacy" } }) },
  ] : [
    { icon: "+", label: "초대 코드로 참여", tone: "peach", onPress: () => router.push("/(auth)/invite") },
    { icon: "▤", label: "서비스 이용약관", tone: "blue", onPress: () => router.push({ pathname: "/(auth)/terms", params: { type: "service" } }) },
    { icon: "◇", label: "개인정보 처리방침", tone: "mint", onPress: () => router.push({ pathname: "/(auth)/terms", params: { type: "privacy" } }) },
  ];

  const logoutRow: MenuRow[] = [{
    icon: "↗",
    label: "로그아웃",
    tone: "neutral",
    onPress: () => { void (async () => { try { await logout(); } finally { router.replace("/(auth)/login"); } })(); },
  }];
  const dangerRows: MenuRow[] = [{
    icon: "!",
    label: sessionKind === "guest" ? "게스트 계정 삭제" : "회원 탈퇴",
    tone: "danger",
    onPress: () => { setPassword(""); setError(null); setDeleting(true); },
  }];

  return <>
    <SafeAreaView edges={["top", "right", "left"]} style={styles.safeArea} testID="mypage-screen">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}><Text style={styles.pageTitle}>마이</Text></View>

        {sessionKind === "guest" ? <>
          <GuestProfileCard
            avatarName={avatarName}
            imageUrl={user?.profileImageUrl}
            name={userName}
            onEdit={openProfileEditor}
          />
          <GuestUpgradeCard compact={compact} onPress={() => router.push("/(auth)/guest-upgrade" as never)} />
        </> : <>
          <MemberProfileCard
            avatarName={avatarName}
            compact={compact}
            imageUrl={user?.profileImageUrl}
            name={userName}
            preferenceTitle={preferencePresentation?.title}
            preferenceStatusLabel={preferenceStatusLabel}
            preferredTags={preferencePresentation?.preferredTags ?? []}
            onEdit={openProfileEditor}
          />
          <ActivityGrid tripCount={trips.length} savedCount={savedCount} />
          <SectionTitle title="나의 여행 성향" />
          {preferencePresentation
            ? <PreferenceResultCard
              description={preferencePresentation.description}
              preferredTags={preferencePresentation.preferredTags}
              title={preferencePresentation.title}
            />
            : apiPreferenceState === "loading"
              ? <PreferenceStatusCard message="서버에 저장된 최신 성향을 확인하고 있어요." />
              : apiPreferenceState === "error"
                ? <PreferenceStatusCard message="성향 정보를 불러오지 못했어요. 완료 여부를 미완료로 바꾸지 않았습니다." onRetry={() => { void apiPreferenceProfile.refetch(); }} />
                : <PreferenceEmptyCard compact={compact} />}
        </>}

        <MenuSection rows={serviceRows} title="서비스" />
        <MenuSection rows={logoutRow} title="계정" />
        <MenuSection danger rows={dangerRows} title="위험 영역" />
      </ScrollView>
    </SafeAreaView>

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
  </>;
}

function MemberProfileCard({ avatarName, compact, imageUrl, name, preferenceTitle, preferenceStatusLabel, preferredTags, onEdit }: {
  avatarName: string;
  compact: boolean;
  imageUrl?: string;
  name: string;
  preferenceTitle?: string;
  preferenceStatusLabel?: string;
  preferredTags: string[];
  onEdit: () => void;
}) {
  const identityTags = preferredTags.slice(0, 3);
  const remaining = preferredTags.length - identityTags.length;
  return <View style={styles.profileCard} testID="mypage-profile">
    <Avatar name={avatarName} uri={imageUrl} size={76} />
    <View style={styles.profileCopy}>
      <Text numberOfLines={1} style={styles.profileName}>{name}</Text>
      <Text numberOfLines={2} style={[styles.profileIdentity, !preferenceTitle && styles.profileIdentityEmpty]}>
        {preferenceTitle ?? preferenceStatusLabel ?? (compact ? <>아직 여행 성향을{`\n`}알아보지 않았어요</> : "아직 여행 성향을 알아보지 않았어요")}
      </Text>
      {preferenceTitle && identityTags.length ? <Text accessibilityLabel={`선호 여행 키워드 ${preferredTags.join(", ")}`} numberOfLines={2} style={styles.profileTags}>
        {identityTags.join(" · ")}{remaining > 0 ? ` · +${remaining}` : ""}
      </Text> : null}
      <ProfileEditButton onPress={onEdit} />
    </View>
  </View>;
}

function GuestProfileCard({ avatarName, imageUrl, name, onEdit }: {
  avatarName: string;
  imageUrl?: string;
  name: string;
  onEdit: () => void;
}) {
  return <View style={styles.profileCard} testID="mypage-profile">
    <Avatar name={avatarName} uri={imageUrl} size={76} />
    <View style={styles.profileCopy}>
      <View style={styles.guestNameRow}>
        <Text numberOfLines={1} style={[styles.profileName, styles.guestName]}>{name}</Text>
        <View style={styles.guestBadge}><Text style={styles.guestBadgeText}>게스트</Text></View>
      </View>
      <Text style={styles.guestProfileDescription}>여행 기록을 유지한 채{`\n`}회원으로 전환할 수 있어요.</Text>
      <ProfileEditButton onPress={onEdit} />
    </View>
  </View>;
}

function ProfileEditButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="프로필 수정" hitSlop={4} onPress={onPress} style={({ pressed }) => [styles.profileEdit, pressed && styles.pressed]}>
    <Text style={styles.profileEditText}>프로필 수정</Text><Text style={styles.profileEditArrow}>›</Text>
  </Pressable>;
}

function ActivityGrid({ tripCount, savedCount }: { tripCount: number; savedCount: number }) {
  return <View style={styles.activityGrid}>
    <ActivityCard accessibilityLabel={`여행 ${tripCount}개, 여행 목록 보기`} icon="▣" label="여행" value={tripCount} variant="travel" onPress={() => router.push("/(tabs)/trips")} />
    <ActivityCard accessibilityLabel={`저장 ${savedCount}곳, 저장 목록 보기`} icon="♡" label="저장" value={savedCount} variant="saved" onPress={() => router.push("/(tabs)/saved")} />
  </View>;
}

function ActivityCard({ accessibilityLabel, icon, label, value, variant, onPress }: {
  accessibilityLabel: string;
  icon: string;
  label: string;
  value: number;
  variant: "travel" | "saved";
  onPress: () => void;
}) {
  const travel = variant === "travel";
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.activityCard, travel ? styles.activityTravel : styles.activitySaved, pressed && styles.pressed]}>
    <View style={[styles.activityIcon, travel ? styles.activityIconTravel : styles.activityIconSaved]}><Text style={[styles.activityIconText, !travel && styles.activityIconTextSaved]}>{icon}</Text></View>
    <View style={styles.activityCopy}>
      <Text style={styles.activityLabel}>{label} <Text style={[styles.activityValue, !travel && styles.activityValueSaved]}>{value}</Text></Text>
      <Text style={styles.activityAction}>{label} 보기</Text>
    </View>
    <Text style={styles.activityArrow}>›</Text>
  </Pressable>;
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function PreferenceResultCard({ title, description, preferredTags }: { title: string; description: string; preferredTags: string[] }) {
  return <View style={styles.preferenceCard} testID="mypage-preference-result">
    <Text numberOfLines={2} style={styles.preferenceTitle}>{title}</Text>
    <Text numberOfLines={3} style={styles.preferenceDescription}>{description}</Text>
    <View accessibilityLabel={`선호 여행 키워드 ${preferredTags.join(", ")}`} style={styles.tags}>
      {preferredTags.slice(0, 4).map((tag, index) => <PreferenceTag key={tag} index={index} label={tag} />)}
      {preferredTags.length > 4 ? <PreferenceTag index={4} label={`+${preferredTags.length - 4}`} /> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="성향 자세히 보기" onPress={() => router.push("/tests/personal/result")} style={({ pressed }) => [styles.preferenceDetail, pressed && styles.pressed]}>
      <Text style={styles.preferenceDetailText}>성향 자세히 보기</Text><Text style={styles.preferenceDetailArrow}>›</Text>
    </Pressable>
  </View>;
}

function PreferenceTag({ index, label }: { index: number; label: string }) {
  const palette = [styles.tagPeach, styles.tagMint, styles.tagLavender, styles.tagBlue, styles.tagNeutral];
  const textPalette = [styles.tagTextPeach, styles.tagTextMint, styles.tagTextLavender, styles.tagTextBlue, styles.tagTextNeutral];
  const paletteIndex = Math.min(index, palette.length - 1);
  return <View style={[styles.tag, palette[paletteIndex]]}><Text style={[styles.tagText, textPalette[paletteIndex]]}>#{label}</Text></View>;
}

function PreferenceEmptyCard({ compact }: { compact: boolean }) {
  return <View style={styles.preferenceEmptyCard} testID="mypage-preference-empty">
    <View style={styles.preferenceEmptyTop}>
      <View style={styles.preferenceEmptyCopy}>
        <Text style={[styles.preferenceEmptyTitle, compact && styles.preferenceEmptyTitleCompact]}>아직 여행 성향을{`\n`}알아보지 않았어요</Text>
        <Text style={styles.preferenceEmptyDescription}>두리가 내 여행 취향을 찾아드릴게요.{`\n`}간단한 테스트로 나에게 맞는 여행 스타일을 알아보세요.</Text>
      </View>
      <Image accessible={false} resizeMode="contain" source={DURI_GUIDE_IMAGE} style={[styles.preferenceEmptyImage, compact && styles.preferenceEmptyImageCompact]} />
    </View>
    <Pressable accessibilityRole="button" onPress={() => router.push("/tests/personal")} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
      <Text style={styles.primaryActionText}>여행 성향 알아보기</Text><Text style={styles.primaryActionArrow}>›</Text>
    </Pressable>
  </View>;
}

function PreferenceStatusCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.preferenceStatusCard} testID="mypage-preference-status">
    <Text style={styles.preferenceStatusTitle}>여행 성향 상태 확인</Text>
    <Text style={styles.preferenceStatusDescription}>{message}</Text>
    {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.preferenceRetry, pressed && styles.pressed]}>
      <Text style={styles.preferenceRetryText}>다시 불러오기</Text>
    </Pressable> : null}
  </View>;
}

function GuestUpgradeCard({ compact, onPress }: { compact: boolean; onPress: () => void }) {
  return <View style={styles.guestUpgradeCard} testID="mypage-guest-upgrade">
    <View style={styles.guestUpgradeTop}>
      <View style={styles.guestUpgradeCopy}>
        <Text style={[styles.guestUpgradeTitle, compact && styles.guestUpgradeTitleCompact]}>회원으로{`\n`}전환해보세요</Text>
        <Text style={styles.guestUpgradeDescription}>{compact
          ? <>지금 만든 여행 기록을{`\n`}그대로 유지하고{`\n`}더 많은 기능을 이어서{`\n`}사용할 수 있어요.</>
          : "지금 만든 여행 기록을 그대로 유지하고 더 많은 기능을 이어서 사용할 수 있어요."}</Text>
      </View>
      <Image accessible={false} resizeMode="contain" source={DURI_GUIDE_IMAGE} style={[styles.guestUpgradeImage, compact && styles.guestUpgradeImageCompact]} />
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="회원 계정으로 전환하기" onPress={onPress} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
      <Text style={styles.primaryActionText}>회원 계정으로 전환하기</Text><Text style={styles.primaryActionArrow}>›</Text>
    </Pressable>
  </View>;
}

function MenuSection({ danger = false, rows, title }: { danger?: boolean; rows: MenuRow[]; title: string }) {
  return <View style={styles.menuSection}>
    <SectionTitle title={title} />
    <View style={styles.menuGroup}>
      {rows.map((row, index) => <View key={row.label}>
        <MenuItem {...row} danger={danger} />
        {index < rows.length - 1 ? <View style={styles.menuDivider} /> : null}
      </View>)}
    </View>
  </View>;
}

function MenuItem({ danger, icon, label, onPress, tone }: MenuRow & { danger: boolean }) {
  const iconTone = menuIconTone(tone);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}>
    <View style={[styles.menuIcon, { backgroundColor: iconTone.background }]}><Text style={[styles.menuIconText, { color: iconTone.color }]}>{icon}</Text></View>
    <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
    <Text style={[styles.menuArrow, danger && styles.menuArrowDanger]}>›</Text>
  </Pressable>;
}

function menuIconTone(tone: MenuTone) {
  if (tone === "blue") return { background: FOUNDATION.blueSurface, color: colors.primary };
  if (tone === "mint") return { background: FOUNDATION.mint, color: "#35BFA9" };
  if (tone === "peach") return { background: FOUNDATION.peach, color: "#FF8068" };
  if (tone === "lavender") return { background: FOUNDATION.lavender, color: "#806BEB" };
  if (tone === "danger") return { background: colors.dangerSoft, color: colors.danger };
  return { background: "#F3F5F9", color: FOUNDATION.muted };
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <View style={styles.overlay}><View style={styles.dialog}><View style={styles.dialogHeader}><Text style={styles.dialogTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.closeButton}><Text style={styles.close}>×</Text></Pressable></View>{children}</View></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: FOUNDATION.page },
  page: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 112, backgroundColor: FOUNDATION.page },
  header: { minHeight: 62, justifyContent: "center" },
  pageTitle: { color: FOUNDATION.text, fontSize: 28, lineHeight: 36, fontWeight: "900" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 132, borderRadius: 22, borderWidth: 1, borderColor: "#E3ECFA", backgroundColor: FOUNDATION.page, padding: 16, ...shadows.card },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { color: FOUNDATION.text, fontSize: 23, lineHeight: 30, fontWeight: "900" },
  profileIdentity: { marginTop: 1, color: colors.primary, fontSize: 17, lineHeight: 23, fontWeight: "900" },
  profileIdentityEmpty: { color: FOUNDATION.secondary, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  profileTags: { marginTop: 3, color: FOUNDATION.secondary, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  profileEdit: { minHeight: 44, alignSelf: "flex-end", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2, paddingLeft: 10 },
  profileEditText: { color: FOUNDATION.secondary, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  profileEditArrow: { color: FOUNDATION.muted, fontSize: 22, lineHeight: 24, fontWeight: "600" },
  guestNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  guestName: { flexShrink: 1 },
  guestBadge: { borderRadius: radius.pill, backgroundColor: "#F1F3F7", paddingHorizontal: 9, paddingVertical: 4 },
  guestBadgeText: { color: "#6D7485", fontSize: 11, lineHeight: 15, fontWeight: "800" },
  guestProfileDescription: { marginTop: 4, color: FOUNDATION.secondary, fontSize: 14, lineHeight: 21, fontWeight: "600" },
  activityGrid: { flexDirection: "row", gap: 12, marginTop: 18 },
  activityCard: { minHeight: 106, flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 14 },
  activityTravel: { borderColor: "#CFE4FF", backgroundColor: "#F8FBFF" },
  activitySaved: { borderColor: "#DED7FF", backgroundColor: "#FBFAFF" },
  activityIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  activityIconTravel: { backgroundColor: "#E5F0FF" },
  activityIconSaved: { backgroundColor: "#EEE9FF" },
  activityIconText: { color: colors.primary, fontSize: 21, lineHeight: 24, fontWeight: "800" },
  activityIconTextSaved: { color: "#806BEB" },
  activityCopy: { flex: 1, minWidth: 0 },
  activityLabel: { color: FOUNDATION.text, fontSize: 15, lineHeight: 21, fontWeight: "800" },
  activityValue: { color: colors.primary },
  activityValueSaved: { color: "#806BEB" },
  activityAction: { marginTop: 4, color: FOUNDATION.secondary, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  activityArrow: { color: FOUNDATION.muted, fontSize: 24, lineHeight: 26, fontWeight: "500" },
  sectionTitle: { marginTop: 24, marginBottom: 10, color: FOUNDATION.text, fontSize: 19, lineHeight: 25, fontWeight: "900" },
  preferenceCard: { gap: 8, borderRadius: 22, borderWidth: 1, borderColor: "#E3ECFA", backgroundColor: FOUNDATION.page, padding: 18, ...shadows.card },
  preferenceTitle: { color: colors.primary, fontSize: 22, lineHeight: 29, fontWeight: "900" },
  preferenceDescription: { color: FOUNDATION.secondary, fontSize: 14, lineHeight: 22, fontWeight: "500" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 2 },
  tag: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  tagText: { fontSize: 12, lineHeight: 17, fontWeight: "800" },
  tagPeach: { backgroundColor: "#FFE9E2" },
  tagMint: { backgroundColor: "#DFF6F1" },
  tagLavender: { backgroundColor: "#ECE8FF" },
  tagBlue: { backgroundColor: "#E2EEFF" },
  tagNeutral: { backgroundColor: "#F1F4F9" },
  tagTextPeach: { color: "#F06955" },
  tagTextMint: { color: "#1C9F8D" },
  tagTextLavender: { color: "#6A58D6" },
  tagTextBlue: { color: "#3479E9" },
  tagTextNeutral: { color: FOUNDATION.secondary },
  preferenceDetail: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: FOUNDATION.border, paddingTop: 8 },
  preferenceDetailText: { color: FOUNDATION.secondary, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  preferenceDetailArrow: { color: FOUNDATION.secondary, fontSize: 22, lineHeight: 24, fontWeight: "600" },
  preferenceEmptyCard: { borderRadius: 22, borderWidth: 1, borderColor: "#E3ECFA", backgroundColor: FOUNDATION.page, padding: 18, overflow: "hidden", ...shadows.card },
  preferenceStatusCard: { gap: 8, borderRadius: 22, borderWidth: 1, borderColor: "#E3ECFA", backgroundColor: FOUNDATION.page, padding: 18, ...shadows.card },
  preferenceStatusTitle: { color: FOUNDATION.text, fontSize: 17, lineHeight: 23, fontWeight: "900" },
  preferenceStatusDescription: { color: FOUNDATION.secondary, fontSize: 13, lineHeight: 20, fontWeight: "500" },
  preferenceRetry: { minHeight: 44, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 14, borderRadius: 12, backgroundColor: FOUNDATION.blueSurface },
  preferenceRetryText: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: "800" },
  preferenceEmptyTop: { minHeight: 142, flexDirection: "row", alignItems: "center" },
  preferenceEmptyCopy: { flex: 1, zIndex: 1 },
  preferenceEmptyTitle: { color: FOUNDATION.text, fontSize: 22, lineHeight: 29, fontWeight: "900" },
  preferenceEmptyTitleCompact: { fontSize: 20, lineHeight: 27 },
  preferenceEmptyDescription: { marginTop: 8, color: FOUNDATION.secondary, fontSize: 13, lineHeight: 20, fontWeight: "500" },
  preferenceEmptyImage: { width: 138, height: 124, marginRight: -13 },
  preferenceEmptyImageCompact: { width: 116, height: 108 },
  primaryAction: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: colors.primary, paddingHorizontal: 16 },
  primaryActionText: { color: colors.white, fontSize: 15, lineHeight: 21, fontWeight: "900" },
  primaryActionArrow: { color: colors.white, fontSize: 22, lineHeight: 24, fontWeight: "600" },
  guestUpgradeCard: { marginTop: 20, borderRadius: 22, borderWidth: 1, borderColor: "#CFE4FF", backgroundColor: FOUNDATION.blueSurface, padding: 18, overflow: "hidden" },
  guestUpgradeTop: { minHeight: 154, flexDirection: "row", alignItems: "center" },
  guestUpgradeCopy: { flex: 1, zIndex: 1 },
  guestUpgradeTitle: { color: FOUNDATION.text, fontSize: 25, lineHeight: 33, fontWeight: "900" },
  guestUpgradeTitleCompact: { fontSize: 23, lineHeight: 31 },
  guestUpgradeDescription: { marginTop: 10, color: FOUNDATION.secondary, fontSize: 13, lineHeight: 20, fontWeight: "500" },
  guestUpgradeImage: { width: 156, height: 148, marginRight: -14 },
  guestUpgradeImageCompact: { width: 132, height: 132 },
  menuSection: { marginTop: 2 },
  menuGroup: { overflow: "hidden", borderRadius: 20, borderWidth: 1, borderColor: "#E3ECFA", backgroundColor: FOUNDATION.page, ...shadows.card },
  menuRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: FOUNDATION.page },
  menuRowPressed: { backgroundColor: "#F7FAFF" },
  menuIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  menuIconText: { fontSize: 16, lineHeight: 20, fontWeight: "900" },
  menuLabel: { flex: 1, color: FOUNDATION.text, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  menuLabelDanger: { color: colors.danger },
  menuArrow: { color: FOUNDATION.muted, fontSize: 23, lineHeight: 25, fontWeight: "500" },
  menuArrowDanger: { color: "#E47A84" },
  menuDivider: { height: StyleSheet.hairlineWidth, marginLeft: 57, backgroundColor: FOUNDATION.border },
  pressed: { opacity: 0.76 },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(20, 34, 67, 0.45)" },
  dialog: { gap: spacing.md, borderRadius: radius.xl, padding: spacing.lg, backgroundColor: colors.surface },
  dialogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dialogTitle: { ...typography.subtitle, color: colors.text },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10, marginTop: -10 },
  close: { fontSize: 28, lineHeight: 30, color: colors.textSecondary },
  dialogDescription: { ...typography.body, color: colors.textSecondary },
  confirmDanger: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger },
  confirmDangerText: { ...typography.button, color: colors.white },
  disabled: { opacity: 0.5 },
});
