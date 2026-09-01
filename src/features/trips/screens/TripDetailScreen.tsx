import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Card, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { diagnoseGroupPreferences } from "../../../duri/group-preferences";
import { useDuriHydrationState, useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";
import {
  DuriAnalysisCard,
  PreferenceSectionIntro,
  TripHomeHero,
  TripPlanningSection,
  TripPreparationCard,
  TripQuickActions,
  type TripHomeDuriState,
  type TripNextAction,
} from "../components/home";
import { GroupPreferenceDiagnosisCard, PreferenceResponseSummaryCard } from "../components/preferences";
import { selectRoomPreferenceResponseSummary, selectTripRoomCardViewModel } from "../selectors";
import type { TripPreparationStepId } from "../types";
import { useExploreSearchStore } from "../../explore/store/useExploreSearchStore";
import { buildTripExploreHref } from "../../explore/logic/exploreNavigation";
import { TripInviteManagerModal } from "../../invitations/components/TripInviteManagerModal";
import { useTravelPreferenceSurveyResult } from "../../preferences/hooks/useTravelPreferenceSurveyResult";
import { resolvePreferenceResultPair } from "../../preferences/logic/resolve-preference-result-pair";
import { TripDocumentSection, useTripDocumentStore, type TravelDocument, type TripDocumentSectionHandle } from "../../trip-documents";
import { TripTodoSection } from "../../trip-todos";
import { buildDuriAnalysisInputWithDocuments } from "../../duri/logic/analysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../../duri/logic/analysisSnapshot";
import { duriAnalysisService } from "../../duri/services/duriAnalysisService";
import { useDuriAnalysisStore } from "../../duri/store/useDuriAnalysisStore";
import { workspaceScheduleService } from "../../workspace/services/workspaceDataPolicy";
import { ApiTripDetailContent } from "./ApiTripDetailContent";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];

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
  const [documentDetailsOpen, setDocumentDetailsOpen] = useState(false);
  const [todoDetailsOpen, setTodoDetailsOpen] = useState(false);
  const documentSectionRef = useRef<TripDocumentSectionHandle>(null);
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
  const currentPreferenceOwner = useMemo(
    () => source.currentUserId ? ({ kind: "user", userId: source.currentUserId } as const) : null,
    [source.currentUserId],
  );
  const currentDetailedResult = useTravelPreferenceSurveyResult(currentPreferenceOwner);
  const currentPreferenceResult = source.preferenceResultsByUserId[source.currentUserId];
  const currentPreferencePair = useMemo(() => currentPreferenceResult ? resolvePreferenceResultPair(
    currentPreferenceResult,
    currentDetailedResult,
    source.currentUserId,
  ) : null, [currentDetailedResult, currentPreferenceResult, source.currentUserId]);
  const preferenceSelectorSource = useMemo(() => ({
    ...source,
    canonicalPreferenceTitlesByUserId: currentPreferencePair
      ? { [source.currentUserId]: currentPreferencePair.canonicalPresentation.title }
      : {},
  }), [currentPreferencePair, source]);
  const summary = useMemo(() => selectRoomPreferenceResponseSummary(preferenceSelectorSource, tripId ?? ""), [preferenceSelectorSource, tripId]);
  const diagnosisResults = useMemo(() => Object.fromEntries(Object.entries(source.preferenceResultsByUserId).filter(([userId]) => Boolean(source.usersById[userId]))), [source.preferenceResultsByUserId, source.usersById]);
  const diagnosis = useMemo(() => trip ? diagnoseGroupPreferences(trip, diagnosisResults) : undefined, [diagnosisResults, trip]);
  const viewModel = useMemo(() => tripId ? selectTripRoomCardViewModel(source, tripId) : undefined, [source, tripId]);
  const memberNamesById = useMemo(() => Object.fromEntries(summary.members.map((member) => [member.userId, member.name])), [summary.members]);
  const candidates = tripId ? source.candidatesByTripId[tripId] ?? [] : [];
  const itinerary = tripId ? source.itineraryByTripId[tripId] ?? [] : [];
  const tripDocuments = useTripDocumentStore((state) => tripId ? state.documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS : EMPTY_TRAVEL_DOCUMENTS);
  const analysisState = useDuriAnalysisStore(useShallow((state) => ({
    session: tripId ? state.sessionsByTripId[tripId] : undefined,
    status: tripId ? state.analysisStatusByTripId[tripId] ?? "idle" : "idle",
  })));
  const analysisInput = useMemo(() => tripId ? buildDuriAnalysisInputWithDocuments(source, tripId, tripDocuments) : undefined, [source, tripDocuments, tripId]);
  const currentAnalysisFingerprint = useMemo(() => analysisInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(analysisInput)) : "", [analysisInput]);
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
  const openAnalysis = () => router.push({ pathname: "/trips/[tripId]/analysis", params: { tripId } });
  const explore = () => { setActiveTrip(tripId); startTripExplore(trip.regionId); router.push(buildTripExploreHref({ tripId, origin: "room" })); };
  const startMyTest = () => router.push("/tests/personal");
  const handlePreparationAction = (stepId: TripPreparationStepId) => {
    if (stepId === "preferences") { if (currentMember?.state !== "completed") startMyTest(); return; }
    if (stepId === "candidates") { explore(); return; }
    if (stepId === "itinerary" || stepId === "confirmation") openWorkspace();
  };

  const nextAction: TripNextAction = completed
    ? { title: "여행 일정을 다시 살펴보세요", description: "완료된 여행의 일정과 기록을 안전하게 확인할 수 있어요.", label: "일정 보기", onPress: openWorkspace }
    : currentMember && currentMember.state !== "completed"
      ? { title: "내 여행 성향을 알려주세요", description: "내 응답이 더해지면 그룹에 맞는 계획을 만들 수 있어요.", label: "내 성향 답하기", onPress: startMyTest }
      : candidates.length === 0
        ? { title: "함께 가고 싶은 장소를 모아보세요", description: "후보 장소를 모으면 일정 만들기가 더 쉬워져요.", label: "장소 모으기", onPress: explore }
        : itinerary.length === 0
          ? { title: "첫 일정을 만들어보세요", description: "모아둔 후보를 날짜와 시간에 배치해보세요.", label: "일정 만들기", onPress: openWorkspace }
          : { title: "일정을 계속 만들어보세요", description: `${itinerary.length}개 일정을 바탕으로 남은 후보도 배치해보세요.`, label: "일정 계속 만들기", onPress: openWorkspace };
  const analysisStale = Boolean(analysisState.session && analysisState.session.inputFingerprint !== currentAnalysisFingerprint);
  const engineAvailable = duriAnalysisService.available && workspaceScheduleService.available;
  const duriState: TripHomeDuriState = itinerary.length === 0
    ? { kind: "no-itinerary" }
    : !engineAvailable
      ? { kind: "unavailable", message: !workspaceScheduleService.available ? workspaceScheduleService.message : duriAnalysisService.unavailableMessage }
      : analysisState.status === "loading"
        ? { kind: "loading" }
        : analysisStale
          ? { kind: "stale" }
          : analysisState.session
            ? { kind: "existing", issueCount: analysisState.session.issues.filter((issue) => issue.severity !== "info").length }
            : { kind: "ready" };

  return <Screen padded={false} testID="trip-home-screen"><View style={styles.page}>
    <TripHomeHero trip={trip} region={source.regionsById[trip.regionId]} usersById={source.usersById} currentUserId={source.currentUserId} onBack={() => router.back()} />
    {created ? <Pressable accessibilityRole="button" accessibilityLabel="여행방 생성 완료 안내 닫기" onPress={() => router.setParams({ created: undefined })} style={styles.successBanner}><Text style={styles.successTitle}>여행방을 만들었어요</Text><Text style={styles.successText}>동행자와 후보 장소를 모아 여행을 완성해 보세요. · 닫기</Text></Pressable> : null}
    <TripPreparationCard preparation={viewModel.preparation} nextAction={nextAction} onAction={handlePreparationAction} readOnly={completed} />
    <TripQuickActions completed={completed} onWorkspace={openWorkspace} onExplore={explore} onInvite={() => setInviteOpen(true)} onDocuments={() => documentSectionRef.current?.openAdd()} />

    <View style={styles.preferenceSection}><PreferenceSectionIntro summary={summary} />
    <PreferenceResponseSummaryCard
      summary={summary}
      currentUserId={source.currentUserId || null}
      onStartMyTest={startMyTest}
      onViewMyResult={() => router.push("/tests/personal/result")}
      onRetakeMyTest={() => router.push({ pathname: "/tests/personal/result", params: { retest: "1" } })}
    />
    <GroupPreferenceDiagnosisCard diagnosis={diagnosis} memberNamesById={memberNamesById} canStartMyTest={Boolean(currentMember && currentMember.state !== "completed")} onStartMyTest={startMyTest} />
    </View>

    <TripPlanningSection trip={trip} candidates={candidates} placesById={source.placesById} usersById={source.usersById} itinerary={itinerary} onExplore={explore} onWorkspace={openWorkspace} />
    <DuriAnalysisCard state={duriState} onPress={duriState.kind === "no-itinerary" ? openWorkspace : openAnalysis} />

    <View style={styles.recordsSection}><Text style={styles.sectionHeading}>여행 기록</Text><Card style={styles.recordsCard}><TripDocumentSection
      ref={documentSectionRef}
      tripId={tripId}
      currentUserId={source.currentUserId}
      itineraryItemIds={itinerary.map((item) => item.id)}
      itineraryItemLabelsById={itineraryItemLabelsById}
      placeOptions={documentPlaceOptions}
      tripStartDate={trip.startDate ?? undefined}
      tripEndDate={trip.endDate ?? undefined}
      readOnly={completed}
      isOwner={trip.members.some((member) => member.userId === source.currentUserId && member.role === "owner")}
      compact
      expanded={documentDetailsOpen}
      onExpandedChange={setDocumentDetailsOpen}
    /><View style={styles.recordDivider} /><TripTodoSection
      tripId={tripId}
      currentUserId={source.currentUserId}
      members={summary.members.map((member) => ({ userId: member.userId, name: member.name }))}
      itinerary={itinerary}
      placesById={source.placesById}
      tripStartDate={trip.startDate}
      tripEndDate={trip.endDate}
      readOnly={completed}
      compact
      expanded={todoDetailsOpen}
      onExpandedChange={setTodoDetailsOpen}
    /></Card></View>

    {completed ? <SectionBlock><Card style={styles.readOnly}><Text style={styles.readOnlyTitle}>완료된 여행이에요</Text><Text style={styles.readOnlyText}>후보와 일정은 기록 중심으로 볼 수 있으며, 상태를 자동으로 진행 중으로 바꾸지 않아요.</Text></Card></SectionBlock> : null}
    <TripInviteManagerModal visible={inviteOpen} trip={trip} onClose={() => setInviteOpen(false)} />
  </View></Screen>;
}

export const TripDetailScreen = TripHomeScreen;

function InvalidTripScreen({ onBack }: { onBack(): void }) {
  return <Screen><AppHeader title="여행방" onBack={onBack} /><ErrorState message="존재하지 않거나 참여할 수 없는 여행방이에요. 방장 정보도 함께 확인해 주세요." /><SecondaryButton label="여행 목록으로 돌아가기" onPress={onBack} /></Screen>;
}

function SectionBlock({ children }: { children: React.ReactNode }) { return <View style={styles.section}>{children}</View>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingBottom: 88 },
  successBanner: { gap: spacing.xxs, padding: spacing.md, borderRadius: 16, backgroundColor: colors.successSoft, marginTop: spacing.md }, successTitle: { ...typography.bodyStrong, color: colors.success }, successText: { ...typography.caption, color: colors.textSecondary },
  preferenceSection: { marginTop: 26 }, recordsSection: { marginTop: 26 }, sectionHeading: { color: "#17265F", fontSize: 19, lineHeight: 25, fontWeight: "800" }, recordsCard: { gap: 0, marginTop: 12, borderColor: "#DCE7F7", paddingHorizontal: 16, paddingVertical: 6 }, recordDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#DCE7F7" },
  section: { marginTop: spacing.xl }, readOnly: { gap: spacing.xs, backgroundColor: colors.surfaceMuted }, readOnlyTitle: { ...typography.subtitle, color: colors.text }, readOnlyText: { ...typography.body, color: colors.textSecondary },
});
