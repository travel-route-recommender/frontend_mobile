import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Card, Screen, SectionHeader } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { queryKeys } from "../../../query/keys";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { TripInviteManagerModal } from "../../invitations/components/TripInviteManagerModal";
import { TripTodoSection } from "../../trip-todos";
import {
  CandidateSummaryCard,
  DuriAnalysisCard,
  ItinerarySummaryCard,
  PreferenceSectionIntro,
  TripHomeHero,
  TripPreparationCard,
  TripQuickActions,
} from "../components/home";
import { PreferenceResponseSummaryCard } from "../components/preferences";
import { fetchApiTripDetail } from "../tripRoomApi";
import type { TripPreparationStepId } from "../types";

export function ApiTripDetailContent({ tripId, created }: { tripId: string; created: boolean }) {
  const router = useRouter();
  const currentUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const [inviteOpen, setInviteOpen] = useState(false);
  const startTripExplore = useExploreSearchStore((state) => state.startTripExplore);
  const syncActiveTripRegion = useExploreSearchStore((state) => state.syncActiveTripRegion);
  const query = useQuery({
    queryKey: queryKeys.trips.detail(tripId),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, currentUserId, signal),
    enabled: Boolean(tripId && currentUserId),
  });

  const data = query.data;
  const currentMember = data?.preferenceSummary.members.find((member) => member.userId === currentUserId);
  const completed = data?.room.status === "completed";
  if (!currentUserId) return <Screen><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (query.isLoading) return <Screen><LoadingState label="서버 여행방과 일정을 불러오고 있어요." /></Screen>;
  if (query.error || !data) return <Screen><ErrorState message={query.error instanceof Error ? query.error.message : "여행방을 불러오지 못했어요."} onRetry={() => void query.refetch()} /></Screen>;

  const openWorkspace = () => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } });
  const explore = () => {
    startTripExplore(data.region.id);
    syncActiveTripRegion(tripId, data.region.id);
    router.push(buildTripExploreHref({ tripId, origin: "room" }));
  };
  const startMyTest = () => router.push("/tests/personal");
  const handlePreparationAction = (stepId: TripPreparationStepId) => {
    if (stepId === "preferences") { if (currentMember?.state !== "completed") startMyTest(); return; }
    if (stepId === "candidates") { explore(); return; }
    if (stepId === "itinerary" || stepId === "confirmation") openWorkspace();
  };

  return <Screen testID="api-trip-home-screen">
    <TripHomeHero trip={data.room} region={data.region} usersById={data.usersById} currentUserId={currentUserId} onBack={() => router.back()} />
    {created ? <Pressable accessibilityRole="button" accessibilityLabel="여행방 생성 완료 안내 닫기" onPress={() => router.setParams({ created: undefined })} style={styles.successBanner}><Text style={styles.successTitle}>여행방을 만들었어요</Text><Text style={styles.successText}>서버 여행방을 불러왔어요. · 닫기</Text></Pressable> : null}
    <TripQuickActions completed={completed} canInvite={sessionKind === "member"} onWorkspace={openWorkspace} onExplore={explore} onInvite={() => setInviteOpen(true)} />
    <TripPreparationCard preparation={data.preparation} onAction={handlePreparationAction} readOnly={completed} />

    <SectionBlock><PreferenceSectionIntro summary={data.preferenceSummary} /></SectionBlock>
    <PreferenceResponseSummaryCard
      summary={data.preferenceSummary}
      currentUserId={currentUserId}
      onStartMyTest={startMyTest}
      onViewMyResult={() => router.push("/tests/personal/result")}
      onRetakeMyTest={() => router.push({ pathname: "/tests/personal/result", params: { retest: "1" } })}
    />

    <SectionBlock><SectionHeader title="우리 여행 성향" /></SectionBlock>
    <Card style={styles.contractNotice}>
      <Text style={styles.noticeTitle}>서버에 저장된 성향 결과를 반영했어요</Text>
      <Text style={styles.noticeText}>여행방 응답에는 멤버별 성향 유형 스냅샷만 포함돼요. 세부 문항 축을 임의로 복원하지 않고, 완료 여부와 유형만 표시합니다.</Text>
    </Card>

    <SectionBlock><TripTodoSection
      tripId={tripId}
      currentUserId={currentUserId}
      members={data.preferenceSummary.members.map((member) => ({ userId: member.userId, name: member.name }))}
      itinerary={data.itinerary}
      placesById={data.placesById}
      tripStartDate={data.room.startDate}
      tripEndDate={data.room.endDate}
      readOnly={completed}
    /></SectionBlock>
    <SectionBlock><CandidateSummaryCard trip={data.room} candidates={data.candidates} placesById={data.placesById} usersById={data.usersById} itinerary={data.itinerary} onExplore={explore} onWorkspace={openWorkspace} /></SectionBlock>
    <SectionBlock><ItinerarySummaryCard trip={data.room} itinerary={data.itinerary} placesById={data.placesById} onWorkspace={openWorkspace} /></SectionBlock>
    <SectionBlock><DuriAnalysisCard itineraryCount={data.itinerary.length} onWorkspace={openWorkspace} /></SectionBlock>

    {sessionKind === "member" ? <TripInviteManagerModal visible={inviteOpen} trip={data.room} onClose={() => setInviteOpen(false)} /> : null}
  </Screen>;
}

function SectionBlock({ children }: { children: React.ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

const styles = StyleSheet.create({
  successBanner: { gap: spacing.xxs, padding: spacing.md, borderRadius: 16, backgroundColor: colors.successSoft, marginTop: spacing.md },
  successTitle: { ...typography.bodyStrong, color: colors.success },
  successText: { ...typography.caption, color: colors.textSecondary },
  section: { marginTop: spacing.xl },
  contractNotice: { gap: spacing.xs },
  noticeTitle: { ...typography.bodyStrong, color: colors.text },
  noticeText: { ...typography.body, color: colors.textSecondary },
});
