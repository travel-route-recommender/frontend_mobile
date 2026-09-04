import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { AppHeader, Card, Screen } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { queryKeys } from "../../../query/keys";
import { queryClient } from "../../../query/queryClient";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { TripInviteManagerModal } from "../../invitations/components/TripInviteManagerModal";
import { ApiTripDocumentSection, type ApiTripDocument } from "../../trip-documents";
import { ApiTripTodoSection } from "../../trip-todos";
import { buildApiDuriAnalysisInput } from "../../duri/logic/apiAnalysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../../duri/logic/analysisSnapshot";
import { duriAnalysisService } from "../../duri/services/duriAnalysisService";
import { useDuriAnalysisStore } from "../../duri/store/useDuriAnalysisStore";
import {
  DuriAnalysisCard,
  PreferenceSectionIntro,
  TripHomeHero,
  TripPlanningSection,
  TripPreparationCard,
  TripQuickActions,
  type TripNextAction,
} from "../components/home";
import { PreferenceResponseSummaryCard } from "../components/preferences";
import { selectTripHomeDuriState } from "../logic/selectTripHomeDuriState";
import { fetchApiTripDetail } from "../tripRoomApi";
import type { TripPreparationStepId } from "../types";

export function ApiTripDetailContent({ tripId, created }: { tripId: string; created: boolean }) {
  const router = useRouter();
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/trips");
  }, [router]);
  const currentUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sharedDocuments, setSharedDocuments] = useState<readonly ApiTripDocument[]>([]);
  const handleDocumentsChange = useCallback((documents: readonly ApiTripDocument[]) => {
    setSharedDocuments(documents);
  }, []);
  const handleDocumentsMutated = useCallback((kind: "upload" | "delete") => {
    if (!currentUserId) return;
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId, currentUserId) }),
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.trips.all, "api", currentUserId],
        exact: true,
      }),
    ];
    if (kind === "delete") {
      invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.trips.todos(tripId, currentUserId) }));
    }
    void Promise.all(invalidations);
  }, [currentUserId, tripId]);
  const startTripExplore = useExploreSearchStore((state) => state.startTripExplore);
  const syncActiveTripRegion = useExploreSearchStore((state) => state.syncActiveTripRegion);
  const query = useQuery({
    queryKey: queryKeys.trips.detail(tripId, currentUserId ?? ""),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, currentUserId, signal),
    enabled: Boolean(tripId && currentUserId),
  });

  const data = query.data;
  const analysisSession = useDuriAnalysisStore((state) => state.sessionsByTripId[tripId]);
  const analysisStatus = useDuriAnalysisStore((state) => state.analysisStatusByTripId[tripId] ?? "idle");
  const analysisInput = useMemo(() => buildApiDuriAnalysisInput(
    data,
    currentUserId ?? "",
    [],
    data?.sharedDocumentsStatus ?? "unavailable",
  ), [currentUserId, data]);
  const currentAnalysisFingerprint = useMemo(
    () => analysisInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(analysisInput)) : "",
    [analysisInput],
  );
  const analysisAvailability = useMemo(() => getDuriAnalysisAvailability({
    input: analysisInput,
    engineAvailable: duriAnalysisService.available && Boolean(data?.scheduleSnapshot),
  }), [analysisInput, data?.scheduleSnapshot]);
  const currentMember = data?.preferenceSummary.members.find((member) => member.userId === currentUserId);
  const completed = data?.room.status === "completed";
  if (!currentUserId) return <Screen><AppHeader title="여행방" onBack={leave} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></Screen>;
  if (query.isLoading) return <Screen><AppHeader title="여행방" onBack={leave} /><LoadingState label="여행방과 일정을 불러오고 있어요." /></Screen>;
  if (query.error || !data) return <Screen><AppHeader title="여행방" onBack={leave} /><ErrorState message={toUserFacingApiErrorMessage(query.error, "여행방을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")} onRetry={() => void query.refetch()} /></Screen>;

  const isOwner = data.room.members.some((member) => member.userId === currentUserId && member.role === "owner");
  const documentOptions = sharedDocuments.map((document) => ({
    id: document.id,
    label: document.originalName || "공유 문서",
    description: document.note || document.mimeType || "공유 문서",
  }));

  const openWorkspace = () => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } });
  const openAnalysis = () => router.push({ pathname: "/trips/[tripId]/analysis", params: { tripId } });
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

  const nextAction: TripNextAction = completed
    ? { title: "여행 일정을 다시 살펴보세요", description: "완료된 여행의 일정과 기록을 확인할 수 있어요.", label: "일정 보기", onPress: openWorkspace }
    : currentMember && currentMember.state !== "completed"
      ? { title: "내 여행 성향을 알려주세요", description: "내 응답이 더해지면 그룹에 맞는 계획을 만들 수 있어요.", label: "내 성향 답하기", onPress: startMyTest }
      : data.candidates.length === 0
        ? { title: "함께 가고 싶은 장소를 모아보세요", description: "후보 장소를 모으면 일정 만들기가 더 쉬워져요.", label: "장소 모으기", onPress: explore }
        : data.itinerary.length === 0
          ? { title: "첫 일정을 만들어보세요", description: "모아둔 후보를 날짜와 시간에 배치해보세요.", label: "일정 만들기", onPress: openWorkspace }
          : { title: "일정을 계속 만들어보세요", description: `${data.itinerary.length}개 일정을 바탕으로 남은 후보도 배치해보세요.`, label: "일정 계속 만들기", onPress: openWorkspace };
  const duriState = selectTripHomeDuriState({
    itineraryCount: data.itinerary.length,
    analysisAvailable: analysisAvailability.canAnalyze,
    unavailableMessage: analysisAvailability.message,
    analysisStatus,
    currentFingerprint: currentAnalysisFingerprint,
    session: analysisSession,
  });

  return <Screen padded={false} testID="api-trip-home-screen"><View style={styles.page}>
    <TripHomeHero trip={data.room} region={data.region} usersById={data.usersById} currentUserId={currentUserId} onBack={leave} />
    {created ? <Pressable accessibilityRole="button" accessibilityLabel="여행방 생성 완료 안내 닫기" onPress={() => router.setParams({ created: undefined })} style={styles.successBanner}><Text style={styles.successTitle}>여행방을 만들었어요</Text><Text style={styles.successText}>동행자를 초대하고 여행 계획을 시작해 보세요. · 닫기</Text></Pressable> : null}
    <TripPreparationCard preparation={data.preparation} nextAction={nextAction} onAction={handlePreparationAction} readOnly={completed} />
    <TripQuickActions completed={completed} onWorkspace={openWorkspace} onExplore={explore} onInvite={() => setInviteOpen(true)} />

    <View style={styles.preferenceSection}><PreferenceSectionIntro summary={data.preferenceSummary} />
    <PreferenceResponseSummaryCard
      summary={data.preferenceSummary}
      currentUserId={currentUserId}
      onStartMyTest={startMyTest}
      onViewMyResult={() => router.push("/tests/personal/result")}
      onRetakeMyTest={() => router.push({ pathname: "/tests/personal/result", params: { retest: "1" } })}
    />
    <Card style={styles.contractNotice}>
      <Text style={styles.noticeTitle}>완료한 동행자의 여행 성향을 반영해요</Text>
      <Text style={styles.noticeText}>성향 조사를 마친 동행자의 결과만 일정 추천에 사용해요. 아직 참여하지 않은 동행자의 취향은 임의로 추측하지 않아요.</Text>
    </Card>
    </View>

    <TripPlanningSection trip={data.room} candidates={data.candidates} placesById={data.placesById} usersById={data.usersById} itinerary={data.itinerary} onExplore={explore} onWorkspace={openWorkspace} />
    <DuriAnalysisCard state={duriState} onPress={openAnalysis} />

    <View style={styles.recordsSection}>
      <Text style={styles.sectionHeading}>여행 기록</Text>
      <View style={styles.recordStack}>
        <ApiTripDocumentSection
          roomId={tripId}
          currentUserId={currentUserId}
          readOnly={completed}
          isOwner={isOwner}
          onDocumentsChange={handleDocumentsChange}
          onDocumentsMutationSettled={handleDocumentsMutated}
        />
        <ApiTripTodoSection
      tripId={tripId}
      currentUserId={currentUserId}
      members={data.preferenceSummary.members.map((member) => ({ userId: member.userId, name: member.name }))}
      itinerary={data.itinerary}
      placesById={data.placesById}
      tripStartDate={data.room.startDate}
      tripEndDate={data.room.endDate}
      timezone={data.scheduleSnapshot?.planning?.timezone ?? "Asia/Seoul"}
      documentOptions={documentOptions}
      readOnly={completed}
      isOwner={isOwner}
        />
      </View>
    </View>

    <TripInviteManagerModal visible={inviteOpen} trip={data.room} onClose={() => setInviteOpen(false)} />
  </View></Screen>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingBottom: 88 },
  successBanner: { gap: spacing.xxs, padding: spacing.md, borderRadius: 16, backgroundColor: colors.successSoft, marginTop: spacing.md },
  successTitle: { ...typography.bodyStrong, color: colors.success },
  successText: { ...typography.caption, color: colors.textSecondary },
  preferenceSection: { marginTop: 26 }, recordsSection: { marginTop: 26 }, sectionHeading: { color: "#17265F", fontSize: 19, lineHeight: 25, fontWeight: "800" }, recordStack: { gap: 12, marginTop: 12 },
  contractNotice: { gap: spacing.xs, marginTop: 10, borderColor: "#DCE7F7" },
  noticeTitle: { ...typography.bodyStrong, color: colors.text },
  noticeText: { ...typography.body, color: colors.textSecondary },
});
