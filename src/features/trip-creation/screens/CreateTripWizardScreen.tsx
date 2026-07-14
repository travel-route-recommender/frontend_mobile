import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { EntityId, Region, User } from "../../../domain";
import { AppHeader, Avatar, Card, Chip, PrimaryButton, RemoteImage, Screen, SecondaryButton, TextField } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { useMemberGate } from "../../auth/hooks/useMemberGate";
import { formatTripDurationLabel } from "../../trips/utils/tripDateUtils";
import { budgetOptions, createTripSteps, intensityOptions, transportOptions } from "../config";
import { TripDatePicker } from "../components/TripDatePicker";
import { useCreateTripDraftStore } from "../store/useCreateTripDraftStore";
import type { CreateTripDraft, CreateTripStep } from "../types";
import { CREATE_TRIP_STEP_COUNT } from "../types";
import { normalizeInvitedUserIds, validateCreateTripDraft, validateCreateTripStep } from "../validation/validateCreateTripDraft";

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
  const toggleMember = useCreateTripDraftStore((state) => state.toggleMember);
  const goNext = useCreateTripDraftStore((state) => state.goNext);
  const goPrevious = useCreateTripDraftStore((state) => state.goPrevious);
  const goToStep = useCreateTripDraftStore((state) => state.goToStep);
  const resetDraft = useCreateTripDraftStore((state) => state.resetDraft);
  const acknowledgeDraftNotice = useCreateTripDraftStore((state) => state.acknowledgeDraftNotice);
  const [resumeResolved, setResumeResolved] = useState(() => !Boolean(draft && draft.ownerUserId === currentUserId));
  const [exitOpen, setExitOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!isMember || !currentUserId) return;
    if (!draft || draft.ownerUserId !== currentUserId) {
      startDraft(currentUserId);
    }
  }, [currentUserId, draft, isMember, startDraft]);

  const requestExit = useCallback(() => {
    const currentDraft = useCreateTripDraftStore.getState().draft;
    if (currentDraft?.currentStep && currentDraft.currentStep > 0) {
      goPrevious();
    } else {
      setExitOpen(true);
    }
  }, [goPrevious]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { requestExit(); return true; });
    return () => subscription.remove();
  }, [requestExit]));

  if (environment.dataSource !== "mock") {
    return <Screen><AppHeader title="새 여행 만들기" onBack={() => router.back()} /><ErrorState message={environment.dataSource === "api" ? "Rooms API 계약이 연결되기 전에는 여행방을 만들 수 없어요. mock 여행방으로 자동 전환하지 않았어요." : "서버 roomId와 로컬 roomId의 연결 계약이 필요해요. 확인 전에는 로컬 여행방을 생성하지 않아요."} /></Screen>;
  }
  if (!isMember) return <Screen><AppHeader title="새 여행 만들기" onBack={() => router.back()} /><Card style={styles.memberGate}><Text style={styles.sectionTitle}>회원 계정이 필요해요</Text><Text style={styles.body}>여행방 생성과 동행자 선택은 회원으로 로그인한 뒤 사용할 수 있어요.</Text><PrimaryButton label="로그인 또는 가입" onPress={() => requireMember(() => undefined, "여행방 만들기")} /></Card>{memberGatePrompt}</Screen>;
  if (!draft) return <Screen><LoadingState label="여행방 초안을 준비하고 있어요" /></Screen>;

  const context = { regionsById, usersById, currentUserId };
  const region = regionsById[draft.regionId];
  const owner = usersById[currentUserId];
  const availableMembers = Object.values(usersById).filter((user) => user.id !== currentUserId);
  const currentStep = createTripSteps[draft.currentStep];
  const stepError = validateCreateTripStep(draft, draft.currentStep, context);

  const next = () => {
    const error = validateCreateTripStep(draft, draft.currentStep, context);
    if (error) { setSubmitError(error); return; }
    setSubmitError("");
    goNext();
  };

  const submit = () => {
    if (submitLock.current) return;
    const error = validateCreateTripDraft(draft, context);
    if (error) { setSubmitError(error); return; }
    submitLock.current = true;
    setSubmitting(true);
    const invitedUserIds = normalizeInvitedUserIds(draft.selectedMemberUserIds, currentUserId, usersById);
    const tripId = createTrip({
      title: draft.title,
      regionId: draft.regionId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      transport: draft.transport,
      budgetLevel: draft.budgetLevel,
      intensity: draft.intensity,
      invitedUserIds,
    });
    if (!tripId) {
      submitLock.current = false;
      setSubmitting(false);
      setSubmitError("여행방을 만들지 못했어요. 입력값과 회원 정보를 확인해 주세요.");
      return;
    }
    resetDraft();
    router.replace({ pathname: "/trips/[tripId]", params: { tripId, created: "1" } });
  };

  return <>
    <Screen keyboardAware testID="create-trip-wizard">
      <AppHeader title="새 여행 만들기" subtitle={`${draft.currentStep + 1}/${CREATE_TRIP_STEP_COUNT} 단계`} onBack={requestExit} />
      <WizardProgress step={draft.currentStep} />
      {draftNotice ? <Pressable accessibilityRole="button" onPress={acknowledgeDraftNotice} style={styles.notice}><Text style={styles.noticeText}>{draftNotice} · 닫기</Text></Pressable> : null}
      <View style={styles.heading}><Text style={styles.title}>{currentStep.title}</Text><Text style={styles.body}>{currentStep.description}</Text></View>
      {draft.currentStep === 0 ? <DestinationStep regions={Object.values(regionsById)} selectedId={draft.regionId} onSelect={(regionId) => { setSubmitError(""); updateDraft({ regionId }); }} /> : null}
      {draft.currentStep === 1 ? <DateStep draft={draft} onChange={(patch) => { setSubmitError(""); updateDraft(patch); }} /> : null}
      {draft.currentStep === 2 ? <ConditionsStep draft={draft} onChange={updateDraft} /> : null}
      {draft.currentStep === 3 ? <CompanionStep owner={owner} users={availableMembers} selectedIds={draft.selectedMemberUserIds} onToggle={toggleMember} /> : null}
      {draft.currentStep === 4 ? <ReviewStep draft={draft} region={region} usersById={usersById} onTitleChange={(title) => updateDraft({ title })} onEdit={goToStep} /> : null}
      {submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}
      <View style={styles.actions}>
        {draft.currentStep > 0 ? <SecondaryButton label="이전" onPress={() => { setSubmitError(""); goPrevious(); }} /> : null}
        <View style={styles.primaryAction}>{draft.currentStep === 4
          ? <PrimaryButton label="여행방 만들기" onPress={submit} disabled={Boolean(stepError)} loading={isSubmitting} />
          : <PrimaryButton label="다음" onPress={next} disabled={Boolean(stepError)} />}</View>
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

function DestinationStep({ regions, selectedId, onSelect }: { regions: Region[]; selectedId: EntityId; onSelect(id: EntityId): void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => regions.filter((region) => `${region.name} ${region.shortName} ${region.description}`.toLowerCase().includes(query.trim().toLowerCase())), [query, regions]);
  return <View style={styles.stack}><TextField label="여행지 검색" value={query} onChangeText={setQuery} placeholder="지역 이름을 검색해 보세요" returnKeyType="search" />
    {filtered.map((region) => <Pressable key={region.id} accessibilityRole="radio" accessibilityState={{ checked: selectedId === region.id }} accessibilityLabel={`${region.name} 여행지 선택`} onPress={() => onSelect(region.id)} style={({ pressed }) => [styles.destination, selectedId === region.id && styles.selectedCard, pressed && styles.pressed]}>
      <RemoteImage uri={region.imageUrl} accessibilityLabel={`${region.name} 대표`} aspectRatio={2.2} />
      <View style={styles.destinationCopy}><View style={styles.row}><Text style={styles.sectionTitle}>{region.name}</Text>{selectedId === region.id ? <Chip label="선택됨" selected /> : null}</View><Text style={styles.body}>{region.description}</Text><Text style={styles.caption}>{region.spots}개 장소 · {region.weather}</Text></View>
    </Pressable>)}
    {!filtered.length ? <Card><Text style={styles.body}>검색 결과가 없어요. 다른 지역명을 입력해 주세요.</Text></Card> : null}
  </View>;
}

function DateStep({ draft, onChange }: { draft: CreateTripDraft; onChange(patch: Partial<CreateTripDraft>): void }) {
  const invalidRange = draft.endDate < draft.startDate;
  return <Card style={styles.stack}>
    <TripDatePicker label="시작일" value={draft.startDate} onChange={(startDate) => onChange({ startDate })} />
    <TripDatePicker label="종료일" value={draft.endDate} minimumDate={draft.startDate} onChange={(endDate) => onChange({ endDate })} />
    {invalidRange ? <Text accessibilityRole="alert" style={styles.error}>종료일은 시작일보다 빠를 수 없어요.</Text> : <View style={styles.summaryBox}><Text style={styles.sectionTitle}>{formatTripDurationLabel(draft.startDate, draft.endDate)}</Text><Text style={styles.body}>{formatTripDateRange(draft.startDate, draft.endDate)}</Text></View>}
    <Text style={styles.caption}>지난 여행 기록용 날짜도 선택할 수 있어요. 날짜는 YYYY-MM-DD로 저장됩니다.</Text>
  </Card>;
}

function ConditionsStep({ draft, onChange }: { draft: CreateTripDraft; onChange(patch: Partial<CreateTripDraft>): void }) {
  return <View style={styles.stack}>
    <OptionGroup title="이동 방식" options={transportOptions} selected={draft.transport} onSelect={(transport) => onChange({ transport })} />
    <OptionGroup title="예산" options={budgetOptions} selected={draft.budgetLevel} onSelect={(budgetLevel) => onChange({ budgetLevel })} />
    <OptionGroup title="일정 밀도" options={intensityOptions} selected={draft.intensity} onSelect={(intensity) => onChange({ intensity })} />
  </View>;
}

function OptionGroup<T extends string>({ title, options, selected, onSelect }: { title: string; options: readonly { value: T; label: string; description: string }[]; selected: T; onSelect(value: T): void }) {
  return <View style={styles.stackSmall}><Text style={styles.sectionTitle}>{title}</Text>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === selected }} onPress={() => onSelect(option.value)} style={({ pressed }) => [styles.option, option.value === selected && styles.selectedCard, pressed && styles.pressed]}><View style={styles.optionCopy}><Text style={styles.bodyStrong}>{option.label}</Text><Text style={styles.caption}>{option.description}</Text></View><Text style={[styles.radio, option.value === selected && styles.radioSelected]}>{option.value === selected ? "✓" : "○"}</Text></Pressable>)}</View>;
}

function CompanionStep({ owner, users, selectedIds, onToggle }: { owner?: User; users: User[]; selectedIds: EntityId[]; onToggle(id: EntityId): void }) {
  return <View style={styles.stack}>
    {owner ? <Card style={styles.member}><Avatar name={owner.name} uri={owner.profileImageUrl} /><View style={styles.optionCopy}><Text style={styles.bodyStrong}>{owner.name} (나)</Text><Text style={styles.caption}>방장으로 자동 포함</Text></View><Chip label="방장" selected /></Card> : null}
    <Text style={styles.sectionTitle}>동행자 선택</Text>
    {users.length ? users.map((user) => { const selected = selectedIds.includes(user.id); return <Pressable key={user.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${user.name} 동행자 ${selected ? "선택 해제" : "선택"}`} onPress={() => onToggle(user.id)} style={({ pressed }) => [styles.member, styles.memberPressable, selected && styles.selectedCard, pressed && styles.pressed]}><Avatar name={user.name} uri={user.profileImageUrl} /><View style={styles.optionCopy}><Text style={styles.bodyStrong}>{user.name}</Text><Text style={styles.caption}>데모 동행자</Text></View><Text style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? "✓" : ""}</Text></Pressable>; }) : <Card><Text style={styles.body}>선택할 수 있는 동행자가 없어요. 나 혼자 여행방을 만들 수 있어요.</Text></Card>}
    <Text style={styles.caption}>실제 사용자 검색과 초대 링크 생성은 Rooms/Invite API 계약 연결 후 제공됩니다.</Text>
  </View>;
}

function ReviewStep({ draft, region, usersById, onTitleChange, onEdit }: { draft: CreateTripDraft; region?: Region; usersById: Record<EntityId, User>; onTitleChange(value: string): void; onEdit(step: CreateTripStep): void }) {
  const transport = transportOptions.find((option) => option.value === draft.transport)?.label;
  const budget = budgetOptions.find((option) => option.value === draft.budgetLevel)?.label;
  const intensity = intensityOptions.find((option) => option.value === draft.intensity)?.label;
  const memberNames = [usersById[draft.ownerUserId], ...draft.selectedMemberUserIds.map((id) => usersById[id])].filter((user): user is User => Boolean(user)).map((user) => user.name).join(", ");
  return <View style={styles.stack}>
    <TextField label="여행방 이름" value={draft.title} onChangeText={onTitleChange} placeholder={region ? `${region.name} 여행` : "우리의 여행"} maxLength={40} helperText="비워두면 여행지 이름으로 자동 생성돼요." />
    <Card style={styles.review}>
      {region ? <RemoteImage uri={region.imageUrl} accessibilityLabel={`${region.name} 대표`} aspectRatio={2.2} /> : null}
      <ReviewRow label="여행지" value={region?.name ?? "미선택"} action={() => onEdit(0)} />
      <ReviewRow label="날짜" value={`${formatTripDateRange(draft.startDate, draft.endDate)} · ${formatTripDurationLabel(draft.startDate, draft.endDate)}`} action={() => onEdit(1)} />
      <ReviewRow label="조건" value={`${transport} · ${budget} · ${intensity}`} action={() => onEdit(2)} />
      <ReviewRow label="동행자" value={`${memberNames || "나"} · ${draft.selectedMemberUserIds.length + 1}명`} action={() => onEdit(3)} />
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
  stack: { gap: spacing.md }, stackSmall: { gap: spacing.sm }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  destination: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  destinationCopy: { padding: spacing.md, gap: spacing.xs },
  selectedCard: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.84 },
  summaryBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft, gap: spacing.xxs },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  optionCopy: { flex: 1, gap: spacing.xxs },
  radio: { fontSize: 24, color: colors.textMuted }, radioSelected: { color: colors.primary },
  member: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  memberPressable: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, textAlign: "center", textAlignVertical: "center", color: colors.white, fontWeight: "800" },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  review: { gap: spacing.md }, reviewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md }, edit: { ...typography.caption, color: colors.primary },
  actions: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.xl }, primaryAction: { flex: 1 },
  memberGate: { gap: spacing.md, marginTop: spacing.lg },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay }, modal: { gap: spacing.md },
});
