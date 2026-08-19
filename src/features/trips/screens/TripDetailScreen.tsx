import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Card, Screen, SectionHeader, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { diagnoseGroupPreferences } from "../../../duri/group-preferences";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";
import {
  CandidateSummaryCard,
  DuriAnalysisCard,
  ItinerarySummaryCard,
  PreferenceSectionIntro,
  TripHomeHero,
  TripPreparationCard,
  TripQuickActions,
} from "../components/home";
import { GroupPreferenceDiagnosisCard, PreferenceResponseSummaryCard } from "../components/preferences";
import { selectRoomPreferenceResponseSummary, selectTripRoomCardViewModel } from "../selectors";
import type { TripPreparationStepId } from "../types";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { TripInviteManagerModal } from "../../invitations/components/TripInviteManagerModal";
import { TripDocumentSection } from "../../trip-documents";
import { TripTodoSection } from "../../trip-todos";
import { ApiTripDetailContent } from "./ApiTripDetailContent";

export function TripHomeScreen() {
  return environment.dataSource === "api" ? <ApiTripDetailRoute /> : <MockTripHomeScreen />;
}

function ApiTripDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; created?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const created = (Array.isArray(params.created) ? params.created[0] : params.created) === "1";
  if (!tripId) return <InvalidTripScreen onBack={() => router.replace("/(tabs)/trips")} />;
  return <ApiTripDetailContent tripId={tripId} created={created} />;
}

function MockTripHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; created?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const created = (Array.isArray(params.created) ? params.created[0] : params.created) === "1";
  const [inviteOpen, setInviteOpen] = useState(false);
  const hydrationError = useDuriHydrationState((state) => state.hydrationError);
  const setActiveTrip = useDuriStore((state) => state.setActiveTrip);
  const startTripExplore = useExploreSearchStore((state) => state.startTripExplore);
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    tripsById: state.tripsById,
    tripOrder: state.tripOrder,
    usersById: state.usersById,
    regionsById: state.regionsById,
    placesById: state.placesById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
  })));
  const trip = tripId ? source.tripsById[tripId] : undefined;
  const summary = useMemo(() => selectRoomPreferenceResponseSummary(source, tripId ?? ""), [source, tripId]);
  const diagnosisResults = useMemo(() => Object.fromEntries(Object.entries(source.preferenceResultsByUserId).filter(([userId]) => Boolean(source.usersById[userId]))), [source.preferenceResultsByUserId, source.usersById]);
  const diagnosis = useMemo(() => trip ? diagnoseGroupPreferences(trip, diagnosisResults) : undefined, [diagnosisResults, trip]);
  const viewModel = useMemo(() => tripId ? selectTripRoomCardViewModel(source, tripId) : undefined, [source, tripId]);
  const memberNamesById = useMemo(() => Object.fromEntries(summary.members.map((member) => [member.userId, member.name])), [summary.members]);
  const candidates = tripId ? source.candidatesByTripId[tripId] ?? [] : [];
  const itinerary = tripId ? source.itineraryByTripId[tripId] ?? [] : [];
  const itineraryItemLabelsById = Object.fromEntries(itinerary.map((item) => [
    item.id,
    `${item.date} ${item.startTime} · ${item.placeId ? source.placesById[item.placeId]?.name ?? "장소 일정" : item.note?.trim() || "일정"}`,
  ]));
  const documentPlaceOptions = [...new Set(candidates.map((candidate) => candidate.placeId))].flatMap((placeId) => {
    const place = source.placesById[placeId];
    return place ? [{ id: place.id, label: place.name }] : [];
  });

  useEffect(() => { if (tripId && trip) setActiveTrip(tripId); }, [setActiveTrip, trip, tripId]);

  if (environment.dataSource !== "mock") {
    const message = "서버 여행방과 로컬 진단의 사용자·roomId 연결이 필요합니다. 확인 전에는 데이터를 혼합하지 않아요.";
    return <Screen><AppHeader title="여행방" onBack={() => router.back()} /><ErrorState message={message} /></Screen>;
  }
  if (hydrationError) return <Screen><AppHeader title="여행방" onBack={() => router.back()} /><ErrorState message={hydrationError} /></Screen>;
  const canView = Boolean(trip?.members.some((member) => member.userId === source.currentUserId));
  const hasOwner = Boolean(trip?.members.some((member) => member.role === "owner"));
  if (!trip || !tripId || !canView || !hasOwner || !diagnosis || !viewModel) return <InvalidTripScreen onBack={() => router.replace("/(tabs)/trips")} />;

  const currentMember = summary.members.find((member) => member.userId === source.currentUserId);
  const completed = trip.status === "completed";
  const openWorkspace = () => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } });
  const explore = () => { setActiveTrip(tripId); startTripExplore(trip.regionId); router.push(buildTripExploreHref({ tripId, origin: "room" })); };
  const startMyTest = () => router.push("/tests/personal");
  const handlePreparationAction = (stepId: TripPreparationStepId) => {
    if (stepId === "preferences") { if (currentMember?.state !== "completed") startMyTest(); return; }
    if (stepId === "candidates") { explore(); return; }
    if (stepId === "itinerary" || stepId === "confirmation") openWorkspace();
  };

  return <Screen testID="trip-home-screen">
    <TripHomeHero trip={trip} region={source.regionsById[trip.regionId]} usersById={source.usersById} currentUserId={source.currentUserId} onBack={() => router.back()} />
    {created ? <Pressable accessibilityRole="button" accessibilityLabel="여행방 생성 완료 안내 닫기" onPress={() => router.setParams({ created: undefined })} style={styles.successBanner}><Text style={styles.successTitle}>여행방을 만들었어요</Text><Text style={styles.successText}>동행자와 후보 장소를 모아 여행을 완성해 보세요. · 닫기</Text></Pressable> : null}
    <TripQuickActions completed={completed} onWorkspace={openWorkspace} onExplore={explore} onInvite={() => setInviteOpen(true)} />
    <TripPreparationCard preparation={viewModel.preparation} onAction={handlePreparationAction} readOnly={completed} />

    <SectionBlock><PreferenceSectionIntro summary={summary} /></SectionBlock>
    <PreferenceResponseSummaryCard
      summary={summary}
      currentUserId={source.currentUserId || null}
      onStartMyTest={startMyTest}
      onViewMyResult={() => router.push("/tests/personal/result")}
      onRetakeMyTest={() => router.push({ pathname: "/tests/personal/result", params: { retest: "1" } })}
    />

    <SectionBlock><SectionHeader title="우리 여행 성향" /></SectionBlock>
    <GroupPreferenceDiagnosisCard diagnosis={diagnosis} memberNamesById={memberNamesById} canStartMyTest={Boolean(currentMember && currentMember.state !== "completed")} onStartMyTest={startMyTest} />

    <SectionBlock><TripDocumentSection
      tripId={tripId}
      currentUserId={source.currentUserId}
      itineraryItemIds={itinerary.map((item) => item.id)}
      itineraryItemLabelsById={itineraryItemLabelsById}
      placeOptions={documentPlaceOptions}
      tripStartDate={trip.startDate ?? undefined}
      tripEndDate={trip.endDate ?? undefined}
      readOnly={completed}
      isOwner={trip.members.some((member) => member.userId === source.currentUserId && member.role === "owner")}
    /></SectionBlock>
    <SectionBlock><TripTodoSection
      tripId={tripId}
      currentUserId={source.currentUserId}
      members={summary.members.map((member) => ({ userId: member.userId, name: member.name }))}
      itinerary={itinerary}
      placesById={source.placesById}
      tripStartDate={trip.startDate}
      tripEndDate={trip.endDate}
      readOnly={completed}
    /></SectionBlock>
    <SectionBlock><CandidateSummaryCard trip={trip} candidates={candidates} placesById={source.placesById} usersById={source.usersById} itinerary={itinerary} onExplore={explore} onWorkspace={openWorkspace} /></SectionBlock>
    <SectionBlock><ItinerarySummaryCard trip={trip} itinerary={itinerary} placesById={source.placesById} onWorkspace={openWorkspace} /></SectionBlock>
    <SectionBlock><DuriAnalysisCard itineraryCount={itinerary.length} onWorkspace={openWorkspace} /></SectionBlock>

    {completed ? <SectionBlock><Card style={styles.readOnly}><Text style={styles.readOnlyTitle}>완료된 여행이에요</Text><Text style={styles.readOnlyText}>후보와 일정은 기록 중심으로 볼 수 있으며, 상태를 자동으로 진행 중으로 바꾸지 않아요.</Text></Card></SectionBlock> : null}
    <TripInviteManagerModal visible={inviteOpen} trip={trip} onClose={() => setInviteOpen(false)} />
  </Screen>;
}

export const TripDetailScreen = TripHomeScreen;

function InvalidTripScreen({ onBack }: { onBack(): void }) {
  return <Screen><AppHeader title="여행방" onBack={onBack} /><ErrorState message="존재하지 않거나 참여할 수 없는 여행방이에요. 방장 정보도 함께 확인해 주세요." /><SecondaryButton label="여행 목록으로 돌아가기" onPress={onBack} /></Screen>;
}

function SectionBlock({ children }: { children: React.ReactNode }) { return <View style={styles.section}>{children}</View>; }

const styles = StyleSheet.create({
  successBanner: { gap: spacing.xxs, padding: spacing.md, borderRadius: 16, backgroundColor: colors.successSoft, marginTop: spacing.md }, successTitle: { ...typography.bodyStrong, color: colors.success }, successText: { ...typography.caption, color: colors.textSecondary },
  section: { marginTop: spacing.xl }, readOnly: { gap: spacing.xs, backgroundColor: colors.surfaceMuted }, readOnlyTitle: { ...typography.subtitle, color: colors.text }, readOnlyText: { ...typography.body, color: colors.textSecondary },
});
