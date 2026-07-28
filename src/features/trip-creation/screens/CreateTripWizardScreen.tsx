import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { EntityId, TripEndConditionType, User } from "../../../domain";
import { AppHeader, Avatar, Card, Chip, PrimaryButton, RemoteImage, Screen, SecondaryButton, TextField } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { formatTripDurationLabel } from "../../trips/utils/tripDateUtils";
import { companionTypeOptions, createTripSteps, endConditionOptions, transportOptions } from "../config";
import { TripCreationSuccess } from "../components/TripCreationSuccess";
import { TripDateStep } from "../components/TripDateStep";
import { TripDestinationStep } from "../components/TripDestinationStep";
import { useCreateTripRoomMutation } from "../hooks/useCreateTripRoomMutation";
import { useTripRegionOptions } from "../hooks/useTripRegionOptions";
import { createTripDraftEditCopy, getRegionSelectionPatch, getTripEditCommitPatch } from "../logic/tripDraftEditing";
import type { EditableTripStep } from "../logic/tripDraftEditing";
import { mapDraftToCreateTripRoomRequest } from "../mappers/createTripRoomMapper";
import { createTripRoomService } from "../services/createTripRoomService";
import { createRegionService, mapRegionToOption } from "../services/regionService";
import type { RegionOption } from "../services/regionService";
import { useCreateTripDraftStore } from "../store/useCreateTripDraftStore";
import type { CreateTripDraft, CreateTripEndConditionDraft, CreateTripStep, TripCompanionType } from "../types";
import { CREATE_TRIP_STEP_COUNT } from "../types";
import { normalizeInvitedUserIds, validateCreateTripDraft, validateCreateTripStep } from "../validation/validateCreateTripDraft";

type EditSession = { step: EditableTripStep; draft: CreateTripDraft };
type EndConditionSelection = TripEndConditionType | "none";

const endConditionSelectionOptions: readonly { value: EndConditionSelection; label: string; description: string }[] = [
  { value: "none", label: "정해진 종료 조건 없음", description: "마지막 날에 반드시 돌아가야 하는 장소나 시각이 없어요" },
  ...endConditionOptions,
];

function createEmptyEndCondition(type: TripEndConditionType): CreateTripEndConditionDraft {
  return { type, location: "", deadline: "", travelMinutes: "", serviceBufferMinutes: "", note: "" };
}

const editTitles: Record<EditableTripStep, string> = {
  0: "여행지 수정",
  1: "여행 날짜 수정",
  2: "여행 조건 수정",
  3: "동행 유형 수정",
};

export function CreateTripWizardScreen() {
  const router = useRouter();
  const { isMember, requireMember, memberGatePrompt } = useMemberGate();
  const currentUserId = useDuriStore((state) => state.currentUserId);
  const usersById = useDuriStore((state) => state.usersById);
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
  })), [createTrip]);
  const creation = useCreateTripRoomMutation(roomService);

  const findRegionOption = useCallback((regionId: string): RegionOption | undefined => {
    const loaded = regionState.options.find((option) => option.id === regionId);
    const domainRegion = regionsById[regionId];
    return loaded ?? (domainRegion ? mapRegionToOption(domainRegion) : undefined);
  }, [regionState.options, regionsById]);

  useEffect(() => {
    if (!isMember || !currentUserId || creation.state.status === "success") return;
    if (!draft || draft.ownerUserId !== currentUserId) startDraft(currentUserId);
  }, [creation.state.status, currentUserId, draft, isMember, startDraft]);

  useEffect(() => {
    if (!draft?.regionId || draft.isRoomNameCustomized || draft.roomName) return;
    const region = regionsById[draft.regionId];
    if (region) setRegion(region.id, region.shortName || region.name);
  }, [draft, regionsById, setRegion]);

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

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { requestExit(); return true; });
    return () => subscription.remove();
  }, [requestExit]));

  if (environment.dataSource !== "mock") {
    return <Screen><AppHeader title="새 여행 만들기" onBack={() => router.back()} /><ErrorState message={environment.dataSource === "api" ? "Rooms API 계약이 연결되기 전에는 여행방을 만들 수 없어요. mock 여행방으로 자동 전환하지 않았어요." : "서버 roomId와 로컬 roomId의 연결 계약이 필요해요. 확인 전에는 로컬 여행방을 생성하지 않아요."} /></Screen>;
  }
  if (!isMember) return <Screen><AppHeader title="새 여행 만들기" onBack={() => router.back()} /><Card style={styles.memberGate}><Text style={styles.sectionTitle}>회원 계정이 필요해요</Text><Text style={styles.body}>여행방 생성과 동행자 선택은 회원으로 로그인한 뒤 사용할 수 있어요.</Text><PrimaryButton label="로그인 또는 가입" onPress={() => requireMember(() => undefined, "여행방 만들기")} /></Card>{memberGatePrompt}</Screen>;
  if (creation.state.status === "success") {
    const response = creation.state.response;
    return <TripCreationSuccess response={response} onEnterRoom={() => enterRoom(response.roomId)} />;
  }
  if (!draft) return <Screen><LoadingState label="여행방 초안을 준비하고 있어요" /></Screen>;

  const activeDraft = editSession?.draft ?? draft;
  const activeStep = editSession?.step ?? draft.currentStep;
  const context = { regionsById, usersById, currentUserId };
  const region = findRegionOption(activeDraft.regionId);
  const owner = usersById[currentUserId];
  const availableMembers = Object.values(usersById).filter((user) => user.id !== currentUserId);
  const currentStep = createTripSteps[activeStep];
  const stepError = validateCreateTripStep(activeDraft, activeStep, context);
  const mutationError = creation.state.status === "error" ? creation.state.message : "";

  const updateEditDraft = (patch: Partial<CreateTripDraft>) => setEditSession((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current);
  const updateActiveDraft = (patch: Partial<CreateTripDraft>) => editSession ? updateEditDraft(patch) : updateDraft(patch);

  const selectRegion = (option: RegionOption) => {
    setSubmitError("");
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
    setEditSession({ step, draft: createTripDraftEditCopy(draft) });
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
    const invitedUserIds = normalizeInvitedUserIds(draft.selectedMemberUserIds, currentUserId, usersById);
    const request = mapDraftToCreateTripRoomRequest(draft, selectedRegion, invitedUserIds);
    setSubmitError("");
    const response = await creation.createRoom(request);
    if (!response) return;
    resetDraft();
  };

  return <>
    <Screen keyboardAware testID="create-trip-wizard">
      <AppHeader title={editSession ? editTitles[editSession.step] : "새 여행 만들기"} subtitle={editSession ? "확인 화면으로 바로 돌아갑니다" : `${draft.currentStep + 1}/${CREATE_TRIP_STEP_COUNT} 단계`} onBack={requestExit} />
      {!editSession ? <WizardProgress step={draft.currentStep} /> : null}
      {draftNotice ? <Pressable accessibilityRole="button" onPress={acknowledgeDraftNotice} style={styles.notice}><Text style={styles.noticeText}>{draftNotice} · 닫기</Text></Pressable> : null}
      <View style={styles.heading}><Text style={styles.title}>{editSession ? editTitles[editSession.step] : currentStep.title}</Text><Text style={styles.body}>{currentStep.description}</Text></View>
      {activeStep === 0 ? <TripDestinationStep keyword={regionState.keyword} options={regionState.options} selectedId={activeDraft.regionId} isLoading={regionState.isLoading} error={regionState.error} onKeywordChange={regionState.setKeyword} onSelect={selectRegion} onRetry={regionState.reload} /> : null}
      {activeStep === 1 ? <TripDateStep startDate={activeDraft.startDate} endDate={activeDraft.endDate} dateUndecided={activeDraft.dateUndecided} onDateRangeChange={changeDateRange} onDateUndecidedChange={changeDateUndecided} /> : null}
      {activeStep === 2 ? <ConditionsStep draft={activeDraft} onChange={(patch) => { setSubmitError(""); updateActiveDraft(patch); }} /> : null}
      {activeStep === 3 ? <CompanionStep owner={owner} users={availableMembers} companionType={activeDraft.companionType} selectedIds={activeDraft.selectedMemberUserIds} onTypeChange={changeCompanionType} onToggle={toggleActiveMember} /> : null}
      {activeStep === 4 ? <ReviewStep draft={draft} region={region} usersById={usersById} onRoomNameChange={(roomName) => { setSubmitError(""); setRoomName(roomName); }} onEdit={startEdit} /> : null}
      {submitError || mutationError ? <Text accessibilityRole="alert" style={styles.error}>{submitError || mutationError}</Text> : stepError ? <Text accessibilityRole="alert" style={styles.validationHint}>{stepError}</Text> : null}
      <View style={styles.actions}>
        {editSession ? <SecondaryButton label="취소" onPress={() => { setSubmitError(""); setEditSession(undefined); }} /> : draft.currentStep > 0 ? <SecondaryButton label="이전" onPress={() => { setSubmitError(""); goPrevious(); }} /> : null}
        <View style={styles.primaryAction}>{editSession
          ? <PrimaryButton label="수정 완료" onPress={finishEdit} disabled={Boolean(stepError)} />
          : draft.currentStep === 4
            ? <PrimaryButton label="여행방 만들기" onPress={submit} disabled={Boolean(stepError)} loading={creation.state.status === "pending"} />
            : <PrimaryButton label="다음" onPress={next} disabled={Boolean(stepError) || (activeStep === 0 && regionState.isLoading)} />}</View>
      </View>
    </Screen>
    <ConfirmModal visible={!resumeResolved && Boolean(draft && draft.ownerUserId === currentUserId)} title="작성 중인 여행방이 있어요" description={`${draft.currentStep + 1}단계부터 이어서 만들 수 있어요.`} primaryLabel="이어서 작성" onPrimary={() => setResumeResolved(true)} secondaryLabel="새로 시작" onSecondary={() => { startDraft(currentUserId); setResumeResolved(true); }} />
    <ConfirmModal visible={exitOpen} title="여행방 만들기를 나갈까요?" description="지금까지 입력한 내용은 이 기기에 초안으로 저장돼요." primaryLabel="저장하고 나가기" onPrimary={() => { setExitOpen(false); router.back(); }} secondaryLabel="초안 삭제하고 나가기" onSecondary={() => { resetDraft(); setExitOpen(false); router.back(); }} onRequestClose={() => setExitOpen(false)} />
  </>;
}

function WizardProgress({ step }: { step: CreateTripStep }) {
  const percentage = Math.round(((step + 1) / CREATE_TRIP_STEP_COUNT) * 100);
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: CREATE_TRIP_STEP_COUNT, now: step + 1, text: `${CREATE_TRIP_STEP_COUNT}단계 중 ${step + 1}단계` }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percentage}%` }]} /></View>;
}

function ConditionsStep({ draft, onChange }: { draft: CreateTripDraft; onChange(patch: Partial<CreateTripDraft>): void }) {
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
  return <View style={styles.stack}>
    <Card style={styles.factNotice}><Text style={styles.bodyStrong}>여기서는 여행방의 사실 정보만 기록해요.</Text><Text style={styles.caption}>예산과 일정 속도 같은 개인 성향은 방을 만든 뒤 각 동행자가 따로 응답합니다.</Text></Card>
    <OptionGroup title="이동 방식" options={transportOptions} selected={draft.transport} onSelect={(transport) => onChange({ transport })} />
    <TextField label="숙소 위치 (선택)" value={draft.accommodationLocation} onChangeText={(accommodationLocation) => onChange({ accommodationLocation })} placeholder="예: 부산역 근처 호텔" maxLength={100} helperText="예약했거나 머물 예정인 숙소가 있을 때만 입력해 주세요." />
    {draft.dateUndecided
      ? <Card style={styles.factNotice}><Text style={styles.bodyStrong}>여행 종료 조건은 날짜를 정한 뒤 입력할 수 있어요.</Text><Text style={styles.caption}>종료 조건은 마지막 여행 날짜의 일정 가능 시간을 계산할 때 사용됩니다.</Text></Card>
      : <View style={styles.stack}>
          <OptionGroup title="마지막 날 종료 조건" options={endConditionSelectionOptions} selected={draft.endCondition?.type ?? "none"} onSelect={selectEndCondition} />
          {draft.endCondition ? <Card style={styles.endConditionFields}>
            <TextField label="종료 지점" value={draft.endCondition.location} onChangeText={(location) => updateEndCondition({ location })} placeholder="예: 부산역, 렌터카 반납 지점" maxLength={100} />
            <TextField label="도착 또는 반납 마감 시각" value={draft.endCondition.deadline} onChangeText={(deadline) => updateEndCondition({ deadline })} placeholder="예: 17:30" maxLength={5} helperText="마지막 여행 날짜 기준, 15분 단위 HH:mm" />
            <TextField label="마지막 일정에서 종료 지점까지 예상 이동시간 (분)" value={draft.endCondition.travelMinutes} onChangeText={(travelMinutes) => updateEndCondition({ travelMinutes: travelMinutes.replace(/\D/g, "") })} placeholder="예: 45" keyboardType="number-pad" maxLength={4} helperText="실제 경로를 확인한 예상값을 입력해 주세요. 현재 앱은 이동시간 API를 사용하지 않습니다." />
            <TextField label="승차 준비 또는 반납에 필요한 시간 (분)" value={draft.endCondition.serviceBufferMinutes} onChangeText={(serviceBufferMinutes) => updateEndCondition({ serviceBufferMinutes: serviceBufferMinutes.replace(/\D/g, "") })} placeholder="예: 30" keyboardType="number-pad" maxLength={3} />
            <TextField label="종료 조건 메모 (선택)" value={draft.endCondition.note} onChangeText={(note) => updateEndCondition({ note })} placeholder="예: 렌터카 연료 충전 후 반납" maxLength={300} multiline />
          </Card> : null}
        </View>}
  </View>;
}

function OptionGroup<T extends string>({ title, options, selected, onSelect }: { title: string; options: readonly { value: T; label: string; description: string }[]; selected: T | null; onSelect(value: T): void }) {
  return <View style={styles.stackSmall}><Text style={styles.sectionTitle}>{title}</Text>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === selected }} onPress={() => onSelect(option.value)} style={({ pressed }) => [styles.option, option.value === selected && styles.selectedCard, pressed && styles.pressed]}><View style={styles.optionCopy}><Text style={styles.bodyStrong}>{option.label}</Text><Text style={styles.caption}>{option.description}</Text></View><Text style={[styles.radio, option.value === selected && styles.radioSelected]}>{option.value === selected ? "✓" : "○"}</Text></Pressable>)}</View>;
}

function CompanionStep({ owner, users, companionType, selectedIds, onTypeChange, onToggle }: { owner?: User; users: User[]; companionType: TripCompanionType | null; selectedIds: EntityId[]; onTypeChange(value: TripCompanionType): void; onToggle(id: EntityId): void }) {
  return <View style={styles.stack}>
    <OptionGroup title="동행 유형" options={companionTypeOptions} selected={companionType} onSelect={onTypeChange} />
    {owner ? <Card style={styles.member}><Avatar name={owner.name} uri={owner.profileImageUrl} /><View style={styles.optionCopy}><Text style={styles.bodyStrong}>{owner.name} (나)</Text><Text style={styles.caption}>방장으로 자동 포함</Text></View><Chip label="방장" selected /></Card> : null}
    <Text style={styles.sectionTitle}>데모 동행자 선택</Text>
    {users.length ? users.map((user) => { const selected = selectedIds.includes(user.id); return <Pressable key={user.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${user.name} 동행자 ${selected ? "선택 해제" : "선택"}`} onPress={() => onToggle(user.id)} style={({ pressed }) => [styles.member, styles.memberPressable, selected && styles.selectedCard, pressed && styles.pressed]}><Avatar name={user.name} uri={user.profileImageUrl} /><View style={styles.optionCopy}><Text style={styles.bodyStrong}>{user.name}</Text><Text style={styles.caption}>데모 동행자</Text></View><Text style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? "✓" : ""}</Text></Pressable>; }) : <Card><Text style={styles.body}>선택할 수 있는 동행자가 없어요. 나 혼자 여행방을 만들 수 있어요.</Text></Card>}
    <Text style={styles.caption}>동행 유형은 프론트 mock 값이며 실제 사용자 검색과 초대는 Rooms/Invite API 계약 후 연결합니다.</Text>
  </View>;
}

function ReviewStep({ draft, region, usersById, onRoomNameChange, onEdit }: { draft: CreateTripDraft; region?: RegionOption; usersById: Record<EntityId, User>; onRoomNameChange(value: string): void; onEdit(step: EditableTripStep): void }) {
  const transport = transportOptions.find((option) => option.value === draft.transport)?.label;
  const endConditionType = endConditionOptions.find((option) => option.value === draft.endCondition?.type)?.label;
  const companionType = companionTypeOptions.find((option) => option.value === draft.companionType)?.label ?? "미선택";
  const memberNames = [usersById[draft.ownerUserId], ...draft.selectedMemberUserIds.map((id) => usersById[id])].filter((user): user is User => Boolean(user)).map((user) => user.name).join(", ");
  const dateLabel = draft.dateUndecided ? "날짜 미정 · Day 1부터 시작" : `${formatTripDateRange(draft.startDate, draft.endDate)} · ${formatTripDurationLabel(draft.startDate, draft.endDate)}`;
  return <View style={styles.stack}>
    <TextField label="여행방 이름" value={draft.roomName} onChangeText={onRoomNameChange} placeholder={region ? `${region.name} 여행` : "우리의 여행"} maxLength={40} helperText="1~40자로 입력해 주세요. 직접 수정하면 지역을 바꿔도 유지돼요." />
    <Card style={styles.review}>
      {region ? <RemoteImage uri={region.imageUrl} accessibilityLabel={`${region.name} 대표`} aspectRatio={2.2} /> : null}
      <ReviewRow label="여행지" value={region ? `${region.parentName ? `${region.parentName} · ` : ""}${region.name}` : "미선택"} action={() => onEdit(0)} />
      <ReviewRow label="날짜" value={dateLabel} action={() => onEdit(1)} />
      <ReviewRow label="이동 방식" value={transport ?? "미선택"} action={() => onEdit(2)} />
      <ReviewRow label="숙소" value={draft.accommodationLocation.trim() || "입력하지 않음"} action={() => onEdit(2)} />
      <ReviewRow label="마지막 날 종료 조건" value={draft.endCondition
        ? `${endConditionType ?? "종료 조건"} · ${draft.endCondition.location} · ${draft.endCondition.deadline}까지 · 이동 ${draft.endCondition.travelMinutes}분 + 준비 ${draft.endCondition.serviceBufferMinutes}분`
        : draft.dateUndecided ? "날짜 결정 후 입력 가능" : "없음"} action={() => onEdit(2)} />
      <ReviewRow label="동행 유형" value={`${companionType} · ${memberNames || "나"} · ${draft.selectedMemberUserIds.length + 1}명`} action={() => onEdit(3)} />
    </Card>
  </View>;
}

function ReviewRow({ label, value, action }: { label: string; value: string; action(): void }) {
  return <View style={styles.reviewRow}><View style={styles.optionCopy}><Text style={styles.caption}>{label}</Text><Text style={styles.bodyStrong}>{value}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${label} 수정`} onPress={action} hitSlop={8}><Text style={styles.edit}>수정</Text></Pressable></View>;
}

function ConfirmModal({ visible, title, description, primaryLabel, secondaryLabel, onPrimary, onSecondary, onRequestClose = onPrimary }: { visible: boolean; title: string; description: string; primaryLabel: string; secondaryLabel: string; onPrimary(): void; onSecondary(): void; onRequestClose?(): void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}><View style={styles.overlay}><Card style={styles.modal}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{description}</Text><PrimaryButton label={primaryLabel} onPress={onPrimary} /><SecondaryButton label={secondaryLabel} onPress={onSecondary} /></Card></View></Modal>;
}

const styles = StyleSheet.create({
  progressTrack: { height: 8, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.border, marginBottom: spacing.xl },
  progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  notice: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, marginBottom: spacing.md },
  noticeText: { ...typography.caption, color: colors.warning },
  heading: { gap: spacing.xs, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
  bodyStrong: { ...typography.bodyStrong, color: colors.text },
  caption: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  validationHint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  stack: { gap: spacing.md },
  stackSmall: { gap: spacing.sm },
  selectedCard: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.84 },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  optionCopy: { flex: 1, gap: spacing.xxs },
  radio: { fontSize: 24, color: colors.textMuted },
  radioSelected: { color: colors.primary },
  member: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberPressable: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, textAlign: "center", textAlignVertical: "center", color: colors.white, fontWeight: "800" },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  review: { gap: spacing.md },
  factNotice: { gap: spacing.xs, backgroundColor: colors.primarySoft },
  endConditionFields: { gap: spacing.md },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  edit: { ...typography.caption, color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.xl },
  primaryAction: { flex: 1 },
  memberGate: { gap: spacing.md, marginTop: spacing.lg },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  modal: { gap: spacing.md },
});
