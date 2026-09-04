import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { EntityId, TripEndConditionType, User } from "../../../domain";
import { AppHeader, Avatar, Card, Chip, PrimaryButton, RemoteImage, Screen, SecondaryButton, TextField } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { queryKeys } from "../../../query/keys";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { selectSavedFriendIds, useFriendCompatibilityStore } from "../../compatibility/store/use-friend-compatibility-store";
import { fetchApiUserDirectory } from "../../trips/tripRoomApi";
import { formatTripDurationLabel } from "../../trips/utils/tripDateUtils";
import { companionTypeOptions, createTripSteps, endConditionOptions, transportOptions } from "../config";
import { CreateTripFooter, CreateTripReviewSection, CreateTripSection, CreateTripSelectionCard, CreateTripStepHeading, CreateTripWizardShell } from "../components/CreateTripWizardShell";
import { TripCreationSuccess } from "../components/TripCreationSuccess";
import { TripDateStep } from "../components/TripDateStep";
import { TripDestinationStep } from "../components/TripDestinationStep";
import { TripPlaceAnchorField } from "../components/TripPlaceAnchorField";
import { useCreateTripRoomMutation } from "../hooks/useCreateTripRoomMutation";
import { useTripRegionOptions } from "../hooks/useTripRegionOptions";
import { createTripDraftEditCopy, getRegionSelectionPatch, getTripEditCommitPatch } from "../logic/tripDraftEditing";
import type { EditableTripStep } from "../logic/tripDraftEditing";
import { filterEligibleCompanionUserIds, resolveEligibleCompanionUsers } from "../logic/eligibleCompanionMembers";
import { mapDraftToCreateTripRoomRequest } from "../mappers/createTripRoomMapper";
import { createTripColors } from "../presentation/createTripTheme";
import { createTripRoomService } from "../services/createTripRoomService";
import type { CreateTripRoomRequest } from "../services/createTripRoomService";
import { createRegionService, mapRegionToOption } from "../services/regionService";
import type { RegionOption } from "../services/regionService";
import { useCreateTripDraftStore } from "../store/useCreateTripDraftStore";
import type { CreateTripDraft, CreateTripEndConditionDraft, TripCompanionType } from "../types";
import { normalizeInvitedUserIds, validateCreateTripDraft, validateCreateTripStep } from "../validation/validateCreateTripDraft";

type EditSession = { step: EditableTripStep; draft: CreateTripDraft };
type EndConditionSelection = TripEndConditionType | "none";

const endConditionSelectionOptions: readonly { value: EndConditionSelection; label: string; description: string }[] = [
  { value: "none", label: "정해진 종료 조건 없음", description: "마지막 날에 반드시 돌아가야 하는 장소나 시각이 없어요" },
  ...endConditionOptions,
];

function createEmptyEndCondition(type: TripEndConditionType): CreateTripEndConditionDraft {
  return { type, location: "", locationDetails: null, deadline: "", travelMinutes: "", serviceBufferMinutes: "", note: "" };
}

const editTitles: Record<EditableTripStep, string> = {
  0: "여행지 수정",
  1: "여행 날짜 수정",
  2: "여행 정보 수정",
  3: "함께할 멤버 수정",
};

export function CreateTripWizardScreen() {
  const router = useRouter();
  const { isMember, requireMember, memberGatePrompt } = useMemberGate();
  const domainCurrentUserId = useDuriStore((state) => state.currentUserId);
  const domainUsersById = useDuriStore((state) => state.usersById);
  const sessionUserId = useAuthSessionStore((state) => state.currentSessionUserId);
  const currentUserId = environment.dataSource === "api" ? sessionUserId ?? domainCurrentUserId : domainCurrentUserId;
  const eligibleFriendIds = useFriendCompatibilityStore((state) => selectSavedFriendIds(state, currentUserId));
  const apiUsersQuery = useQuery({
    queryKey: queryKeys.users.directory(),
    queryFn: ({ signal }) => fetchApiUserDirectory(signal),
    enabled: environment.dataSource === "api",
    staleTime: 5 * 60 * 1000,
  });
  const usersById = useMemo(() => environment.dataSource === "api"
    ? {
      ...(apiUsersQuery.data ?? {}),
      ...(domainUsersById[currentUserId] ? { [currentUserId]: domainUsersById[currentUserId] } : {}),
    }
    : domainUsersById, [apiUsersQuery.data, currentUserId, domainUsersById]);
  const regionsById = useDuriStore((state) => state.regionsById);
  const createTrip = useDuriStore((state) => state.createTrip);
  const draft = useCreateTripDraftStore((state) => state.draft);
  const draftNotice = useCreateTripDraftStore((state) => state.draftNotice);
  const startDraft = useCreateTripDraftStore((state) => state.startDraft);
  const updateDraft = useCreateTripDraftStore((state) => state.updateDraft);
  const setRegion = useCreateTripDraftStore((state) => state.setRegion);
  const setDateRange = useCreateTripDraftStore((state) => state.setDateRange);
  const setDateUndecided = useCreateTripDraftStore((state) => state.setDateUndecided);
  const setCompanionType = useCreateTripDraftStore((state) => state.setCompanionType);
  const setRoomName = useCreateTripDraftStore((state) => state.setRoomName);
  const toggleMember = useCreateTripDraftStore((state) => state.toggleMember);
  const goNext = useCreateTripDraftStore((state) => state.goNext);
  const goPrevious = useCreateTripDraftStore((state) => state.goPrevious);
  const resetDraft = useCreateTripDraftStore((state) => state.resetDraft);
  const acknowledgeDraftNotice = useCreateTripDraftStore((state) => state.acknowledgeDraftNotice);
  const [resumeResolved, setResumeResolved] = useState(() => !Boolean(draft && draft.ownerUserId === currentUserId));
  const [exitOpen, setExitOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editSession, setEditSession] = useState<EditSession>();
  const [selectedRegionOption, setSelectedRegionOption] = useState<RegionOption>();
  const [createdRequest, setCreatedRequest] = useState<CreateTripRoomRequest>();

  const domainRegions = useMemo(() => Object.values(regionsById), [regionsById]);
  const regionService = useMemo(() => createRegionService(environment.dataSource, domainRegions), [domainRegions]);
  const regionState = useTripRegionOptions(regionService);
  const roomService = useMemo(() => createTripRoomService(environment.dataSource, (request) => createTrip({
    title: request.name,
    regionId: request.regionId,
    startDate: request.startDate,
    endDate: request.endDate,
    dateUndecided: request.dateUndecided,
    transport: request.transport,
    accommodationLocation: request.accommodationLocation,
    endCondition: request.endCondition,
    companionType: request.companionType,
    expectedMemberCount: request.expectedMemberCount,
    invitedUserIds: request.invitedUserIds,
  }), currentUserId), [createTrip, currentUserId]);
  const creation = useCreateTripRoomMutation(roomService);
  const leaveToTrips = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/trips");
  }, [router]);

  const findRegionOption = useCallback((regionId: string): RegionOption | undefined => {
    const loaded = regionState.options.find((option) => option.id === regionId);
    const domainRegion = regionsById[regionId];
    return loaded
      ?? (selectedRegionOption?.id === regionId ? selectedRegionOption : undefined)
      ?? (environment.dataSource === "mock" && domainRegion ? mapRegionToOption(domainRegion) : undefined);
  }, [regionState.options, regionsById, selectedRegionOption]);

  useEffect(() => {
    if (!draft?.regionId || findRegionOption(draft.regionId)) return;
    let active = true;
    void regionService.getRegion(draft.regionId).then((option) => {
      if (active && option) setSelectedRegionOption(option);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [draft?.regionId, findRegionOption, regionService]);

  useEffect(() => {
    if (!isMember || !currentUserId || creation.state.status === "success") return;
    if (!draft || draft.ownerUserId !== currentUserId) startDraft(currentUserId);
  }, [creation.state.status, currentUserId, draft, isMember, startDraft]);

  useEffect(() => {
    if (!draft?.regionId || draft.isRoomNameCustomized || draft.roomName) return;
    const region = regionsById[draft.regionId];
    if (region) setRegion(region.id, region.shortName || region.name);
  }, [draft, regionsById, setRegion]);

  useEffect(() => {
    if (!draft) return;
    const eligibleSelectedIds = filterEligibleCompanionUserIds(draft.selectedMemberUserIds, currentUserId, eligibleFriendIds);
    if (eligibleSelectedIds.length === draft.selectedMemberUserIds.length
      && eligibleSelectedIds.every((userId, index) => userId === draft.selectedMemberUserIds[index])) return;
    updateDraft({ selectedMemberUserIds: eligibleSelectedIds });
  }, [currentUserId, draft, eligibleFriendIds, updateDraft]);

  const enterRoom = useCallback((roomId: string) => {
    router.replace({ pathname: "/trips/[tripId]", params: { tripId: roomId, created: "1" } });
  }, [router]);

  const requestExit = useCallback(() => {
    if (creation.state.status === "success") {
      enterRoom(creation.state.response.roomId);
      return;
    }
    if (editSession) {
      setEditSession(undefined);
      setSubmitError("");
      return;
    }
    const currentDraft = useCreateTripDraftStore.getState().draft;
    if (currentDraft?.currentStep && currentDraft.currentStep > 0) goPrevious();
    else setExitOpen(true);
  }, [creation.state, editSession, enterRoom, goPrevious]);

  const requestClose = useCallback(() => {
    setExitOpen(true);
  }, []);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { requestExit(); return true; });
    return () => subscription.remove();
  }, [requestExit]));

  if (environment.dataSource === "hybrid") {
    return <Screen><AppHeader title="새 여행 만들기" onBack={leaveToTrips} /><ErrorState message="현재 실행 설정에서는 새 여행을 만들 수 없어요. 앱을 다시 시작한 뒤 시도해 주세요." /></Screen>;
  }
  if (!isMember) return <Screen><AppHeader title="새 여행 만들기" onBack={leaveToTrips} /><Card style={styles.memberGate}><Text style={styles.sectionTitle}>회원 계정이 필요해요</Text><Text style={styles.body}>여행방 생성과 동행자 선택은 회원으로 로그인한 뒤 사용할 수 있어요.</Text><PrimaryButton label="로그인 또는 가입" onPress={() => requireMember(() => undefined, "여행방 만들기")} /></Card>{memberGatePrompt}</Screen>;
  if (creation.state.status === "success") {
    const response = creation.state.response;
    return <TripCreationSuccess
      response={response}
      setupRetrying={creation.setupRetrying}
      onRetrySetup={createdRequest && response.setupIssues?.length ? () => creation.retrySetup(createdRequest) : undefined}
      onEnterRoom={() => enterRoom(response.roomId)}
    />;
  }
  if (!draft) return <Screen><LoadingState label="여행방 초안을 준비하고 있어요" /></Screen>;

  const activeDraft = editSession?.draft ?? draft;
  const activeStep = editSession?.step ?? draft.currentStep;
  const region = findRegionOption(activeDraft.regionId);
  const availableRegionIds = new Set(regionState.options.map((option) => option.id));
  if (selectedRegionOption) availableRegionIds.add(selectedRegionOption.id);
  const context = { regionsById, availableRegionIds, usersById, currentUserId };
  const owner = usersById[currentUserId];
  const availableMembers = resolveEligibleCompanionUsers(eligibleFriendIds, currentUserId, usersById);
  const activeSelectedMemberIds = filterEligibleCompanionUserIds(activeDraft.selectedMemberUserIds, currentUserId, eligibleFriendIds);
  const reviewSelectedMemberIds = normalizeInvitedUserIds(
    filterEligibleCompanionUserIds(draft.selectedMemberUserIds, currentUserId, eligibleFriendIds),
    currentUserId,
    usersById,
  );
  const currentStep = createTripSteps[activeStep];
  const stepError = validateCreateTripStep(activeDraft, activeStep, context);
  const mutationError = creation.state.status === "error" ? creation.state.message : "";

  const updateEditDraft = (patch: Partial<CreateTripDraft>) => setEditSession((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current);
  const updateActiveDraft = (patch: Partial<CreateTripDraft>) => editSession ? updateEditDraft(patch) : updateDraft(patch);

  const selectRegion = (option: RegionOption) => {
    setSubmitError("");
    setSelectedRegionOption(option);
    if (editSession) {
      updateEditDraft(getRegionSelectionPatch(activeDraft, option.id, option.name));
    } else setRegion(option.id, option.name);
  };

  const changeDateRange = (startDate: string | null, endDate: string | null) => {
    setSubmitError("");
    if (editSession) updateEditDraft({ startDate, endDate, dateUndecided: false });
    else setDateRange(startDate, endDate);
  };

  const changeDateUndecided = (value: boolean) => {
    setSubmitError("");
    if (editSession) updateEditDraft({ dateUndecided: value, ...(value ? { startDate: null, endDate: null, endCondition: null } : {}) });
    else setDateUndecided(value);
  };

  const changeCompanionType = (companionType: TripCompanionType) => {
    setSubmitError("");
    if (editSession) updateEditDraft({ companionType });
    else setCompanionType(companionType);
  };

  const toggleActiveMember = (userId: string) => {
    setSubmitError("");
    if (!eligibleFriendIds.includes(userId) || userId === currentUserId || !usersById[userId]) return;
    if (!editSession) { toggleMember(userId); return; }
    const selected = activeDraft.selectedMemberUserIds.includes(userId)
      ? activeDraft.selectedMemberUserIds.filter((id) => id !== userId)
      : [...activeDraft.selectedMemberUserIds, userId];
    updateEditDraft({ selectedMemberUserIds: selected });
  };

  const next = () => {
    const error = validateCreateTripStep(draft, draft.currentStep, context);
    if (error) { setSubmitError(error); return; }
    setSubmitError("");
    goNext();
  };

  const startEdit = (step: EditableTripStep) => {
    setSubmitError("");
    const editDraft = createTripDraftEditCopy(draft);
    editDraft.selectedMemberUserIds = filterEligibleCompanionUserIds(editDraft.selectedMemberUserIds, currentUserId, eligibleFriendIds);
    setEditSession({ step, draft: editDraft });
  };

  const finishEdit = () => {
    if (!editSession) return;
    const error = validateCreateTripStep(editSession.draft, editSession.step, context);
    if (error) { setSubmitError(error); return; }
    updateDraft(getTripEditCommitPatch(editSession.step, editSession.draft));
    setEditSession(undefined);
    setSubmitError("");
  };

  const submit = async () => {
    const error = validateCreateTripDraft(draft, context);
    if (error) { setSubmitError(error); return; }
    const selectedRegion = findRegionOption(draft.regionId);
    if (!selectedRegion) { setSubmitError("선택한 여행지 정보를 불러오지 못했어요."); return; }
    const invitedUserIds = normalizeInvitedUserIds(
      filterEligibleCompanionUserIds(draft.selectedMemberUserIds, currentUserId, eligibleFriendIds),
      currentUserId,
      usersById,
    );
    const request = mapDraftToCreateTripRoomRequest(draft, selectedRegion, invitedUserIds);
    setSubmitError("");
    const response = await creation.createRoom(request);
    if (!response) return;
    setCreatedRequest(request);
    resetDraft();
  };

  const footer = <CreateTripFooter
    primaryLabel={editSession ? "수정 완료" : draft.currentStep === 4 ? "여행방 만들기" : "다음"}
    onPrimary={editSession ? finishEdit : draft.currentStep === 4 ? submit : next}
    primaryDisabled={Boolean(stepError) || (!editSession && activeStep === 0 && regionState.isLoading)}
    primaryLoading={!editSession && draft.currentStep === 4 && creation.state.status === "pending"}
    secondaryLabel={editSession ? "취소" : draft.currentStep > 0 ? "이전" : undefined}
    onSecondary={editSession
      ? () => { setSubmitError(""); setEditSession(undefined); }
      : draft.currentStep > 0
        ? () => { setSubmitError(""); goPrevious(); }
        : undefined}
  />;

  return <>
    <CreateTripWizardShell activeStep={activeStep} onBack={requestExit} onClose={requestClose} footer={footer}>
      {draftNotice ? <Pressable accessibilityRole="button" onPress={acknowledgeDraftNotice} style={styles.notice}><Text style={styles.noticeText}>{draftNotice} · 닫기</Text></Pressable> : null}
      <CreateTripStepHeading title={editSession ? editTitles[editSession.step] : currentStep.title} description={editSession ? "수정한 내용은 확인 화면에 바로 반영돼요." : currentStep.description} editing={Boolean(editSession)} />
      {activeStep === 0 ? <TripDestinationStep keyword={regionState.keyword} options={regionState.options} selectedId={activeDraft.regionId} isLoading={regionState.isLoading} error={regionState.error} onKeywordChange={regionState.setKeyword} onSelect={selectRegion} onRetry={regionState.reload} /> : null}
      {activeStep === 1 ? <TripDateStep startDate={activeDraft.startDate} endDate={activeDraft.endDate} dateUndecided={activeDraft.dateUndecided} onDateRangeChange={changeDateRange} onDateUndecidedChange={changeDateUndecided} /> : null}
      {activeStep === 2 ? <ConditionsStep draft={activeDraft} region={region} onChange={(patch) => { setSubmitError(""); updateActiveDraft(patch); }} /> : null}
      {activeStep === 3 ? <CompanionStep owner={owner} users={availableMembers} companionType={activeDraft.companionType} selectedIds={activeSelectedMemberIds} onTypeChange={changeCompanionType} onToggle={toggleActiveMember} /> : null}
      {activeStep === 4 ? <ReviewStep draft={{ ...draft, selectedMemberUserIds: reviewSelectedMemberIds }} region={region} usersById={usersById} onRoomNameChange={(roomName) => { setSubmitError(""); setRoomName(roomName); }} onEdit={startEdit} /> : null}
      {submitError || mutationError ? <Text accessibilityRole="alert" style={styles.error}>{submitError || mutationError}</Text> : stepError ? <Text accessibilityRole="alert" style={styles.validationHint}>{stepError}</Text> : null}
    </CreateTripWizardShell>
    <ConfirmModal visible={!resumeResolved && Boolean(draft && draft.ownerUserId === currentUserId)} title="작성 중인 여행방이 있어요" description={`${draft.currentStep + 1}단계부터 이어서 만들 수 있어요.`} primaryLabel="이어서 작성" onPrimary={() => setResumeResolved(true)} secondaryLabel="새로 시작" onSecondary={() => { startDraft(currentUserId); setResumeResolved(true); }} />
    <ConfirmModal visible={exitOpen} title="여행방 만들기를 나갈까요?" description="지금까지 입력한 내용은 이 기기에 초안으로 저장돼요." primaryLabel="저장하고 나가기" onPrimary={() => { setExitOpen(false); leaveToTrips(); }} secondaryLabel="초안 삭제하고 나가기" onSecondary={() => { resetDraft(); setExitOpen(false); leaveToTrips(); }} onRequestClose={() => setExitOpen(false)} />
  </>;
}

function ConditionsStep({ draft, region, onChange }: { draft: CreateTripDraft; region?: RegionOption; onChange(patch: Partial<CreateTripDraft>): void }) {
  const selectEndCondition = (selection: EndConditionSelection) => {
    if (selection === "none") {
      onChange({ endCondition: null });
      return;
    }
    onChange({
      endCondition: draft.endCondition?.type === selection
        ? draft.endCondition
        : createEmptyEndCondition(selection),
    });
  };
  const updateEndCondition = (patch: Partial<CreateTripEndConditionDraft>) => {
    if (!draft.endCondition) return;
    onChange({ endCondition: { ...draft.endCondition, ...patch } });
  };
  return <View style={styles.stepStack}>
    <CreateTripSection title="이동 방식" description="이번 여행에서 실제로 이용할 이동 수단을 선택해 주세요.">
      <OptionGroup options={transportOptions} selected={draft.transport} onSelect={(transport) => onChange({ transport })} layout="grid" />
    </CreateTripSection>
    <CreateTripSection title="숙소" description="정해진 숙소가 있을 때만 남겨두면 돼요." optional>
      <TripPlaceAnchorField
        label="숙소 위치"
        value={draft.accommodationLocation}
        selected={draft.accommodationLocationDetails}
        placeholder="예: 부산역 근처 호텔"
        areaCode={region?.areaCode}
        onChange={(accommodationLocation, accommodationLocationDetails) => onChange({ accommodationLocation, accommodationLocationDetails })}
      />
    </CreateTripSection>
    {draft.dateUndecided
      ? <View style={styles.infoNote}><Text style={styles.infoNoteTitle}>날짜를 정한 뒤 입력할 수 있어요</Text><Text style={styles.infoNoteBody}>마지막 날 귀환 일정은 여행 날짜가 정해지면 활성화됩니다.</Text></View>
      : <CreateTripSection title="마지막 날 귀환 일정" description="정해진 출발·반납 시각이 있다면 일정 마감 시간을 계산할 수 있어요." optional>
          <OptionGroup options={endConditionSelectionOptions} selected={draft.endCondition?.type ?? "none"} onSelect={selectEndCondition} />
          {draft.endCondition ? <View style={styles.disclosureFields}>
            <Text style={styles.disclosureTitle}>귀환 상세 정보</Text>
            <TripPlaceAnchorField
              label="종료 지점"
              value={draft.endCondition.location}
              selected={draft.endCondition.locationDetails}
              placeholder="예: 부산역, 렌터카 반납 지점"
              areaCode={region?.areaCode}
              onChange={(location, locationDetails) => updateEndCondition({ location, locationDetails })}
            />
            <TextField label="도착 또는 반납 마감 시각" value={draft.endCondition.deadline} onChangeText={(deadline) => updateEndCondition({ deadline })} placeholder="예: 17:30" maxLength={5} helperText="마지막 여행 날짜 기준, 1분 단위 HH:mm" />
            <TextField label="종료 지점까지 예상 이동시간 (분)" value={draft.endCondition.travelMinutes} onChangeText={(travelMinutes) => updateEndCondition({ travelMinutes: travelMinutes.replace(/\D/g, "") })} placeholder="예: 45" keyboardType="number-pad" maxLength={4} helperText="실제 경로를 확인한 예상값을 입력해 주세요." />
            <TextField label="승차 준비 또는 반납 시간 (분)" value={draft.endCondition.serviceBufferMinutes} onChangeText={(serviceBufferMinutes) => updateEndCondition({ serviceBufferMinutes: serviceBufferMinutes.replace(/\D/g, "") })} placeholder="예: 30" keyboardType="number-pad" maxLength={3} />
            <TextField label="메모 (선택)" value={draft.endCondition.note} onChangeText={(note) => updateEndCondition({ note })} placeholder="예: 렌터카 연료 충전 후 반납" maxLength={300} multiline />
          </View> : null}
        </CreateTripSection>}
    <View style={styles.dataNote}><Text style={styles.dataNoteText}>{environment.dataSource === "api" ? "이동 방식·숙소·귀환 시각은 여행방에 공유되고, 동행 유형과 귀환 메모는 이 기기에 보관돼요." : "예산과 일정 속도 같은 개인 성향은 여행방을 만든 뒤 각자 응답해요."}</Text></View>
  </View>;
}

function OptionGroup<T extends string>({ options, selected, onSelect, layout = "list" }: { options: readonly { value: T; label: string; description: string }[]; selected: T | null; onSelect(value: T): void; layout?: "grid" | "list" }) {
  return <View style={layout === "grid" ? styles.optionGrid : styles.optionList}>{options.map((option) => <CreateTripSelectionCard key={option.value} label={option.label} description={layout === "list" ? option.description : undefined} selected={option.value === selected} onPress={() => onSelect(option.value)} compact style={layout === "grid" ? styles.optionGridItem : undefined} />)}</View>;
}

function CompanionStep({ owner, users, companionType, selectedIds, onTypeChange, onToggle }: { owner?: User; users: User[]; companionType: TripCompanionType | null; selectedIds: EntityId[]; onTypeChange(value: TripCompanionType): void; onToggle(id: EntityId): void }) {
  return <View style={styles.stepStack}>
    <CreateTripSection title="동행 유형" description="친구 선택과 별개로 반드시 하나를 선택해 주세요.">
      <OptionGroup options={companionTypeOptions} selected={companionType} onSelect={onTypeChange} layout="grid" />
    </CreateTripSection>
    <CreateTripSection title="방장">
      {owner ? <View style={styles.ownerRow}><Avatar name={owner.name} uri={owner.profileImageUrl} /><View style={styles.rowCopy}><Text style={styles.rowName}>{owner.name} (나)</Text><Text style={styles.rowDescription}>여행방에 자동으로 포함돼요</Text></View><Chip label="방장" selected /></View> : null}
    </CreateTripSection>
    <CreateTripSection title="바로 함께할 친구" description="저장한 친구 중 여행방에 지금 추가할 멤버만 선택해 주세요." optional>
      {users.length ? <View style={styles.friendList}>{users.map((user, index) => { const selected = selectedIds.includes(user.id); return <Pressable key={user.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${user.name} 동행자 ${selected ? "선택 해제" : "선택"}`} onPress={() => onToggle(user.id)} style={({ pressed }) => [styles.friendRow, index < users.length - 1 && styles.friendRowDivider, selected && styles.friendRowSelected, pressed && styles.pressed]}><Avatar name={user.name} uri={user.profileImageUrl} /><View style={styles.rowCopy}><Text style={styles.rowName}>{user.name}</Text><Text style={styles.rowDescription}>여행방 멤버로 바로 추가</Text></View><View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkboxMark}>✓</Text> : null}</View></Pressable>; })}</View> : <View style={styles.emptyState}><Text style={styles.emptyStateTitle}>바로 추가할 친구가 없어요</Text><Text style={styles.emptyStateBody}>지금은 나만 포함해 만들고, 여행방에서 멤버를 초대할 수 있어요.</Text></View>}
    </CreateTripSection>
    <View style={styles.dataNote}><Text style={styles.dataNoteText}>{environment.dataSource === "api" ? "선택한 친구는 여행방 멤버로 바로 추가돼요. 동행 유형 선택은 이 기기에 보관돼요." : "친구를 선택하지 않아도 여행방을 만들 수 있어요."}</Text></View>
  </View>;
}

function ReviewStep({ draft, region, usersById, onRoomNameChange, onEdit }: { draft: CreateTripDraft; region?: RegionOption; usersById: Record<EntityId, User>; onRoomNameChange(value: string): void; onEdit(step: EditableTripStep): void }) {
  const transport = transportOptions.find((option) => option.value === draft.transport)?.label;
  const endConditionType = endConditionOptions.find((option) => option.value === draft.endCondition?.type)?.label;
  const companionType = companionTypeOptions.find((option) => option.value === draft.companionType)?.label ?? "미선택";
  const members = [usersById[draft.ownerUserId], ...draft.selectedMemberUserIds.map((id) => usersById[id])].filter((user): user is User => Boolean(user));
  const memberNames = members.map((user) => user.name).join(", ");
  const dateLabel = draft.dateUndecided ? "날짜 미정 · Day 1부터 시작" : `${formatTripDateRange(draft.startDate, draft.endDate)} · ${formatTripDurationLabel(draft.startDate, draft.endDate)}`;
  return <View style={styles.reviewStack}>
    <TextField label="여행방 이름" value={draft.roomName} onChangeText={onRoomNameChange} placeholder={region ? `${region.name} 여행` : "우리의 여행"} maxLength={40} helperText="1~40자로 입력해 주세요. 직접 수정하면 지역을 바꿔도 유지돼요." />
    <CreateTripReviewSection title="기본 정보" actions={[{ label: "여행지", accessibilityLabel: "여행지 수정", onPress: () => onEdit(0) }, { label: "날짜", accessibilityLabel: "여행 날짜 수정", onPress: () => onEdit(1) }]}>
      <View style={styles.basicInfoRow}>{region ? <View style={styles.reviewImage}><RemoteImage uri={region.imageUrl} accessibilityLabel={`${region.name} 대표`} aspectRatio={1.2} /></View> : null}<View style={styles.reviewCopy}><Text style={styles.reviewPrimary}>{region ? `${region.parentName ? `${region.parentName} · ` : ""}${region.name}` : "미선택"}</Text><Text style={styles.reviewSecondary}>{dateLabel}</Text></View></View>
    </CreateTripReviewSection>
    <CreateTripReviewSection title="여행 정보" actions={[{ label: "수정", accessibilityLabel: "여행 정보 수정", onPress: () => onEdit(2) }]}>
      <ReviewFact label="이동 방식" value={transport ?? "미선택"} />
      <ReviewFact label="숙소" value={draft.accommodationLocation.trim() || "입력하지 않음"} />
      <ReviewFact label="귀환 일정" value={draft.endCondition
        ? `${endConditionType ?? "종료 조건"} · ${draft.endCondition.location} · ${draft.endCondition.deadline}까지 · 이동 ${draft.endCondition.travelMinutes}분 + 준비 ${draft.endCondition.serviceBufferMinutes}분`
        : draft.dateUndecided ? "날짜 결정 후 입력 가능" : "없음"} />
    </CreateTripReviewSection>
    <CreateTripReviewSection title="함께할 멤버" actions={[{ label: "수정", accessibilityLabel: "함께할 멤버 수정", onPress: () => onEdit(3) }]}>
      <View style={styles.memberSummary}><View style={styles.memberAvatars}>{members.slice(0, 4).map((user) => <Avatar key={user.id} name={user.name} uri={user.profileImageUrl} />)}</View><View style={styles.reviewCopy}><Text style={styles.reviewPrimary}>{companionType} · {members.length || 1}명</Text><Text style={styles.reviewSecondary}>{memberNames || "나"}</Text></View></View>
    </CreateTripReviewSection>
    <View style={styles.duriGuide}><Text style={styles.duriGuideTitle}>DURI와 여행을 이어가세요</Text><Text style={styles.duriGuideBody}>여행방을 만든 뒤 후보 장소를 모으고, 함께 여행 일정을 만들 수 있어요.</Text></View>
  </View>;
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.reviewFact}><Text style={styles.reviewFactLabel}>{label}</Text><Text style={styles.reviewFactValue}>{value}</Text></View>;
}

function ConfirmModal({ visible, title, description, primaryLabel, secondaryLabel, onPrimary, onSecondary, onRequestClose = onPrimary }: { visible: boolean; title: string; description: string; primaryLabel: string; secondaryLabel: string; onPrimary(): void; onSecondary(): void; onRequestClose?(): void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}><View style={styles.overlay}><Card style={styles.modal}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{description}</Text><PrimaryButton label={primaryLabel} onPress={onPrimary} /><SecondaryButton label={secondaryLabel} onPress={onSecondary} /></Card></View></Modal>;
}

const styles = StyleSheet.create({
  notice: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, marginBottom: spacing.md },
  noticeText: { ...typography.caption, color: colors.warning },
  title: { ...typography.title, color: colors.text },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  validationHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  stepStack: { gap: spacing.xl },
  pressed: { opacity: 0.84 },
  optionList: { gap: spacing.sm },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  optionGridItem: { width: "48%" },
  infoNote: { gap: 4, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: createTripColors.lavenderBorder, backgroundColor: createTripColors.lavenderSurface },
  infoNoteTitle: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: createTripColors.text },
  infoNoteBody: { fontSize: 12, lineHeight: 18, fontWeight: "500", color: createTripColors.secondary },
  disclosureFields: { gap: spacing.md, marginTop: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: createTripColors.blueBorder, borderRadius: 18, backgroundColor: createTripColors.blueSurface },
  disclosureTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: createTripColors.text },
  dataNote: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 14, backgroundColor: createTripColors.lavenderSurface },
  dataNoteText: { fontSize: 11, lineHeight: 17, fontWeight: "600", color: createTripColors.secondary },
  ownerRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: createTripColors.border, backgroundColor: createTripColors.page },
  rowCopy: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: createTripColors.text },
  rowDescription: { fontSize: 11, lineHeight: 16, fontWeight: "500", color: createTripColors.secondary },
  friendList: { overflow: "hidden", borderWidth: 1, borderColor: createTripColors.border, borderRadius: 16, backgroundColor: createTripColors.page },
  friendRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  friendRowDivider: { borderBottomWidth: 1, borderBottomColor: createTripColors.border },
  friendRowSelected: { backgroundColor: createTripColors.blueSurface },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { fontSize: 13, lineHeight: 16, fontWeight: "900", color: colors.white },
  emptyState: { gap: 4, padding: spacing.lg, borderRadius: 16, borderWidth: 1, borderColor: createTripColors.border, backgroundColor: createTripColors.blueSurface },
  emptyStateTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: createTripColors.text },
  emptyStateBody: { fontSize: 12, lineHeight: 18, fontWeight: "500", color: createTripColors.secondary },
  reviewStack: { gap: spacing.md },
  basicInfoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  reviewImage: { width: 78, overflow: "hidden", borderRadius: 12, backgroundColor: createTripColors.blueSurface },
  reviewCopy: { flex: 1, gap: 4 },
  reviewPrimary: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: createTripColors.text },
  reviewSecondary: { fontSize: 12, lineHeight: 18, fontWeight: "500", color: createTripColors.secondary },
  reviewFact: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  reviewFactLabel: { width: 62, fontSize: 11, lineHeight: 17, fontWeight: "700", color: createTripColors.muted },
  reviewFactValue: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "600", color: createTripColors.text },
  memberSummary: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  memberAvatars: { flexDirection: "row", alignItems: "center", gap: 4 },
  duriGuide: { gap: 5, padding: spacing.md, borderRadius: 18, borderWidth: 1, borderColor: createTripColors.lavenderBorder, backgroundColor: createTripColors.lavenderSurface },
  duriGuideTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: createTripColors.text },
  duriGuideBody: { fontSize: 12, lineHeight: 18, fontWeight: "500", color: createTripColors.secondary },
  memberGate: { gap: spacing.md, marginTop: spacing.lg },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  modal: { gap: spacing.md },
});
