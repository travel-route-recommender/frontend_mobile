import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Avatar, Card, PrimaryButton, Screen, SecondaryButton, SectionHeader } from "../../../components/common";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthFlow } from "../../auth/hooks/useAuthFlow";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";

export function MyPageScreen() {
  const router = useRouter();
  const sessionKind = useAuthSessionStore((session) => session.sessionKind);
  const { requireMember, memberGatePrompt } = useMemberGate();
  const { logout } = useAuthFlow();
  const state = useDuriStore();
  const user = state.usersById[state.currentUserId];
  const result = state.preferenceResultsByUserId[state.currentUserId];
  const trips = Object.values(state.tripsById).filter((trip) => trip.members.some((member) => member.userId === state.currentUserId));
  const savedCount = sessionKind === "member" ? (state.savedPlaceIdsByUserId[state.currentUserId] ?? []).length : 0;
  if (sessionKind === "anonymous") return <Screen><View style={styles.header}><Avatar name="여행자" size={64} /><View style={styles.headerCopy}><Text style={styles.title}>둘러보는 중이에요</Text><Text style={styles.subtitle}>로그인하면 여행, 저장 장소와 취향 결과를 관리할 수 있어요.</Text></View></View><Card style={styles.preference}><Text style={styles.profileType}>나만의 두리를 시작해 보세요</Text><Text style={styles.description}>회원 가입 후 친구와 여행방을 만들고 장소를 함께 모을 수 있어요.</Text><PrimaryButton label="로그인 또는 가입" onPress={() => requireMember(() => undefined, "마이페이지 이용")} /></Card><SecondaryButton label="초대 코드로 참여하기" onPress={() => router.push("/(auth)/invite")} />{memberGatePrompt}</Screen>;
  return <Screen><View style={styles.header}><Avatar name={user?.initial ?? user?.name ?? "여행자"} uri={user?.profileImageUrl} size={64} /><View style={styles.headerCopy}><Text style={styles.title}>{user?.name ?? "여행자"}</Text><Text style={styles.subtitle}>{sessionKind === "guest" ? "초대받은 여행에 게스트로 참여 중이에요" : "두리와 함께 여행 취향을 맞춰가고 있어요"}</Text></View></View><View style={styles.stats}><Metric value={trips.length} label="여행" /><Metric value={savedCount} label="저장" /><Metric value={result ? result.traits.length : 0} label="취향 키워드" /></View><SectionHeader title="나의 여행 성향" /><Card style={styles.preference}><Text style={styles.profileType}>{result?.profileType ?? "아직 결과가 없어요"}</Text><Text style={styles.description}>{result ? result.traits.join(" · ") : "간단한 테스트로 여행할 때 중요하게 생각하는 점을 알아보세요."}</Text>{result ? <View style={styles.tags}>{result.preferredTags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>)}</View> : null}<PrimaryButton label={result ? "성향 테스트 다시 하기" : "성향 테스트 시작"} onPress={() => router.push("/tests/personal")} /></Card><SectionHeader title="계정과 참여" />{sessionKind === "guest" ? <PrimaryButton label="회원 계정 만들기" onPress={() => requireMember(() => undefined, "회원 기능 이용")} /> : <SecondaryButton label="온보딩 안내 다시 보기" onPress={() => router.push("/(onboarding)/intro")} />}<SecondaryButton label="초대 코드로 참여하기" onPress={() => router.push("/(auth)/invite")} /><SecondaryButton label="로그아웃" onPress={async () => { await logout(); router.replace("/(auth)/login"); }} />{memberGatePrompt}</Screen>;
}
function Metric({ value, label }: { value: number; label: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({ header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.lg }, headerCopy: { flex: 1 }, title: { ...typography.title, color: colors.text }, subtitle: { ...typography.caption, color: colors.textSecondary }, stats: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl }, metric: { flex: 1, alignItems: "center", paddingVertical: spacing.md }, metricValue: { ...typography.title, color: colors.primary }, metricLabel: { ...typography.caption, color: colors.textSecondary }, preference: { gap: spacing.sm, marginVertical: spacing.sm, marginBottom: spacing.xl }, profileType: { ...typography.subtitle, color: colors.text }, description: { ...typography.body, color: colors.textSecondary }, tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, tag: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 }, tagText: { ...typography.caption, color: colors.primary } });
