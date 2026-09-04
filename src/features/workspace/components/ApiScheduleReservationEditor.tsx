import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import {
  type WorkspaceScheduleReservationApiGateway,
  type WorkspaceScheduleReservationDeleteResult,
  type WorkspaceScheduleReservationMutationResult,
  type WorkspaceScheduleReservationVersionConflictError,
  workspaceScheduleReservationApiGateway,
} from "../services/workspaceScheduleReservationApi";
import type { BackendScheduleReservation } from "../services/workspaceScheduleContract";
import { WorkspaceTimeField } from "./WorkspaceTimeField";

type ReservationStatus = BackendScheduleReservation["status"];
type TimingKind = "exact" | "window" | "none";

export type ApiScheduleReservationEvidenceOption = {
  id: string;
  label: string;
  kind: "ticket" | "document";
};

export type ApiScheduleReservationCommit =
  | ({ kind: "upsert" } & WorkspaceScheduleReservationMutationResult)
  | ({ kind: "delete" } & WorkspaceScheduleReservationDeleteResult);

export type ApiScheduleReservationEditorProps = {
  roomId: string;
  itemId: string;
  scheduleVersion: number;
  reservation?: BackendScheduleReservation;
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultTimezone?: string;
  placeId?: string;
  externalId?: string;
  evidenceOptions?: readonly ApiScheduleReservationEvidenceOption[];
  disabled?: boolean;
  gateway?: WorkspaceScheduleReservationApiGateway;
  onCommitted: (commit: ApiScheduleReservationCommit) => void | Promise<void>;
  onVersionConflict?: (error: WorkspaceScheduleReservationVersionConflictError) => void | Promise<void>;
  onMutationStateChange?: (busy: boolean) => void;
};

type EditorDraft = {
  status: ReservationStatus;
  date: string;
  timingKind: TimingKind;
  startTime: string;
  endTime: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  timezone: string;
  confirmationCode: string;
  note: string;
  documentTicketIds: string[];
};

const statusOptions: readonly { value: ReservationStatus; label: string; description: string }[] = [
  { value: "confirmed", label: "확정", description: "두리가 바꾸지 않도록 일정 보호" },
  { value: "unconfirmed", label: "미확정", description: "확인이 더 필요한 예약" },
  { value: "cancelled", label: "취소됨", description: "기록은 남기고 일정 보호에서 제외" },
];

const timingOptions: readonly { value: TimingKind; label: string }[] = [
  { value: "exact", label: "정확한 시각" },
  { value: "window", label: "입장 가능 시간" },
  { value: "none", label: "시간 미정" },
];

function timingKindOf(reservation?: BackendScheduleReservation): TimingKind {
  if (reservation?.startTime || reservation?.endTime) return "exact";
  if (reservation?.timeWindowStart || reservation?.timeWindowEnd) return "window";
  return "none";
}

function createDraft(input: Pick<ApiScheduleReservationEditorProps,
  "reservation" | "defaultDate" | "defaultStartTime" | "defaultEndTime" | "defaultTimezone"
>): EditorDraft {
  return {
    status: input.reservation?.status ?? "unconfirmed",
    date: input.reservation?.date ?? input.defaultDate,
    timingKind: input.reservation ? timingKindOf(input.reservation) : "exact",
    startTime: input.reservation?.startTime ?? input.defaultStartTime,
    endTime: input.reservation?.endTime ?? input.defaultEndTime,
    timeWindowStart: input.reservation?.timeWindowStart ?? input.defaultStartTime,
    timeWindowEnd: input.reservation?.timeWindowEnd ?? input.defaultEndTime,
    timezone: input.reservation?.timezone ?? input.defaultTimezone ?? "Asia/Seoul",
    confirmationCode: input.reservation?.confirmationCode ?? "",
    note: input.reservation?.note ?? "",
    documentTicketIds: [...(input.reservation?.documentTicketIds ?? [])],
  };
}

function errorMessage(error: unknown) {
  return toUserFacingApiErrorMessage(error, "예약 정보를 저장하지 못했어요. 내용을 확인한 뒤 다시 시도해 주세요.");
}

function uniqueEvidenceOptions(
  options: readonly ApiScheduleReservationEvidenceOption[],
  selectedIds: readonly string[],
) {
  const result = new Map<string, ApiScheduleReservationEvidenceOption>();
  options.forEach((option) => {
    if (!result.has(option.id)) result.set(option.id, option);
  });
  selectedIds.forEach((id) => {
    if (!result.has(id)) result.set(id, { id, label: "이름을 불러오지 못한 연결 문서", kind: "document" });
  });
  return [...result.values()];
}

function ChoiceChip({
  selected,
  label,
  onPress,
  disabled,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, disabled && styles.disabled, pressed && styles.pressed]}
  >
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

function ApiScheduleReservationEditorBody(props: ApiScheduleReservationEditorProps) {
  const {
    roomId,
    itemId,
    scheduleVersion,
    reservation,
    defaultDate,
    defaultStartTime,
    defaultEndTime,
    defaultTimezone,
    placeId,
    externalId,
    evidenceOptions = [],
    disabled = false,
    gateway = workspaceScheduleReservationApiGateway,
    onCommitted,
    onVersionConflict,
    onMutationStateChange,
  } = props;
  const [currentReservation, setCurrentReservation] = useState(reservation);
  const [currentVersion, setCurrentVersion] = useState(scheduleVersion);
  const [draft, setDraft] = useState(() => createDraft(props));
  const [busy, setBusy] = useState<"save" | "delete">();
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [feedback, setFeedback] = useState<string>();

  const selectableEvidence = useMemo(
    () => uniqueEvidenceOptions(evidenceOptions, draft.documentTicketIds),
    [evidenceOptions, draft.documentTicketIds],
  );
  const blocked = disabled || Boolean(busy);
  const hasMixedServerTiming = Boolean(
    (currentReservation?.startTime || currentReservation?.endTime)
    && (currentReservation?.timeWindowStart || currentReservation?.timeWindowEnd),
  );

  const save = async () => {
    if (blocked) return;
    setBusy("save");
    onMutationStateChange?.(true);
    setFeedback(undefined);
    try {
      const result = await gateway.upsert({
        roomId,
        itemId,
        expectedVersion: currentVersion,
        previousReservation: currentReservation,
        draft: {
          status: draft.status,
          date: draft.date,
          timing: draft.timingKind === "exact"
            ? { kind: "exact", startTime: draft.startTime, endTime: draft.endTime }
            : draft.timingKind === "window"
              ? { kind: "window", timeWindowStart: draft.timeWindowStart, timeWindowEnd: draft.timeWindowEnd }
              : { kind: "none" },
          timezone: draft.timezone,
          ...(placeId ? { placeId } : {}),
          ...(externalId !== undefined ? { externalId } : {}),
          confirmationCode: draft.confirmationCode,
          note: draft.note,
          documentTicketIds: draft.documentTicketIds,
        },
      });
      setCurrentReservation(result.reservation);
      setCurrentVersion(result.scheduleVersion);
      setDraft(createDraft({
        reservation: result.reservation,
        defaultDate,
        defaultStartTime,
        defaultEndTime,
        defaultTimezone,
      }));
      setFeedback("예약 정보를 동행자와 공유했어요.");
      try {
        await onCommitted({ kind: "upsert", ...result });
      } catch {
        setFeedback("저장은 완료됐지만 화면 갱신에 실패했어요. 일정을 새로고침해 주세요.");
      }
    } catch (error) {
      setFeedback(errorMessage(error));
      if (error && (error as { name?: unknown }).name === "WorkspaceScheduleReservationVersionConflictError") {
        await onVersionConflict?.(error as WorkspaceScheduleReservationVersionConflictError);
      }
    } finally {
      setBusy(undefined);
      onMutationStateChange?.(false);
    }
  };

  const remove = async () => {
    if (blocked || !currentReservation) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setFeedback("예약 정보만 삭제합니다. 연결된 일정과 파일은 삭제하지 않아요.");
      return;
    }
    setBusy("delete");
    onMutationStateChange?.(true);
    setFeedback(undefined);
    try {
      const result = await gateway.delete({ roomId, itemId, expectedVersion: currentVersion });
      setCurrentReservation(undefined);
      setCurrentVersion(result.scheduleVersion);
      setDraft(createDraft({ reservation: undefined, defaultDate, defaultStartTime, defaultEndTime, defaultTimezone }));
      setDeleteArmed(false);
      setFeedback("공유 예약 정보를 삭제했어요.");
      try {
        await onCommitted({ kind: "delete", ...result });
      } catch {
        setFeedback("삭제는 완료됐지만 화면 갱신에 실패했어요. 일정을 새로고침해 주세요.");
      }
    } catch (error) {
      setFeedback(errorMessage(error));
      if (error && (error as { name?: unknown }).name === "WorkspaceScheduleReservationVersionConflictError") {
        await onVersionConflict?.(error as WorkspaceScheduleReservationVersionConflictError);
      }
    } finally {
      setBusy(undefined);
      onMutationStateChange?.(false);
    }
  };

  const toggleEvidence = (id: string) => {
    setDraft((current) => ({
      ...current,
      documentTicketIds: current.documentTicketIds.includes(id)
        ? current.documentTicketIds.filter((entry) => entry !== id)
        : [...current.documentTicketIds, id],
    }));
  };

  return <View style={styles.container}>
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        <Text style={styles.title}>예약 정보</Text>
        <Text style={styles.description}>사용자가 확인한 정보만 공유하며, 확정 예약은 두리가 바꾸지 않도록 보호해요.</Text>
      </View>
      {currentReservation ? <Text style={styles.revision}>저장된 예약 정보</Text> : null}
    </View>

    <View accessibilityRole="radiogroup" style={styles.choiceRow}>
      {statusOptions.map((option) => <ChoiceChip
        key={option.value}
        selected={draft.status === option.value}
        label={option.label}
        disabled={blocked}
        onPress={() => setDraft((current) => ({ ...current, status: option.value }))}
      />)}
    </View>
    <Text style={styles.helper}>{statusOptions.find((option) => option.value === draft.status)?.description}</Text>

    <TextField
      label="예약 날짜"
      value={draft.date}
      onChangeText={(date) => setDraft((current) => ({ ...current, date }))}
      placeholder="YYYY-MM-DD"
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      helperText="확정 예약에는 달력 날짜가 필요해요."
    />

    <View accessibilityRole="radiogroup" style={styles.choiceRow}>
      {timingOptions.map((option) => <ChoiceChip
        key={option.value}
        selected={draft.timingKind === option.value}
        label={option.label}
        disabled={blocked}
        onPress={() => setDraft((current) => ({ ...current, timingKind: option.value }))}
      />)}
    </View>
    {draft.timingKind === "exact" ? <View style={styles.timeGrid}>
      <View style={styles.timeField}><WorkspaceTimeField label="시작" value={draft.startTime} onChange={(startTime) => setDraft((current) => ({ ...current, startTime }))} /></View>
      <View style={styles.timeField}><WorkspaceTimeField label="종료" value={draft.endTime} onChange={(endTime) => setDraft((current) => ({ ...current, endTime }))} /></View>
    </View> : null}
    {draft.timingKind === "window" ? <View style={styles.timeGrid}>
      <View style={styles.timeField}><WorkspaceTimeField label="입장 가능 시작" value={draft.timeWindowStart} onChange={(timeWindowStart) => setDraft((current) => ({ ...current, timeWindowStart }))} /></View>
      <View style={styles.timeField}><WorkspaceTimeField label="입장 가능 종료" value={draft.timeWindowEnd} onChange={(timeWindowEnd) => setDraft((current) => ({ ...current, timeWindowEnd }))} /></View>
    </View> : null}

    <TextField
      label="예약지 시간대"
      value={draft.timezone}
      onChangeText={(timezone) => setDraft((current) => ({ ...current, timezone }))}
      placeholder="Asia/Seoul"
      maxLength={100}
      autoCapitalize="none"
      helperText="예약 장소 기준으로 입력해 주세요. 예: Asia/Seoul"
    />
    <TextField
      label="예약 번호 (선택)"
      value={draft.confirmationCode}
      onChangeText={(confirmationCode) => setDraft((current) => ({ ...current, confirmationCode }))}
      placeholder="예: BUSAN-240819"
      maxLength={200}
      autoCapitalize="characters"
    />
    <TextField
      label="예약 메모 (선택)"
      value={draft.note}
      onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
      placeholder="취소 조건, 입장 방법, 좌석 등"
      maxLength={500}
      multiline
    />

    <View style={styles.evidenceSection}>
      <Text style={styles.sectionLabel}>연결된 공유 문서·티켓</Text>
      {selectableEvidence.length ? <View style={styles.evidenceList}>{selectableEvidence.map((option) => {
        const selected = draft.documentTicketIds.includes(option.id);
        return <Pressable
          key={option.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled: blocked }}
          disabled={blocked}
          onPress={() => toggleEvidence(option.id)}
          style={({ pressed }) => [styles.evidence, selected && styles.evidenceSelected, blocked && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={[styles.check, selected && styles.checkSelected]}>{selected ? "✓" : ""}</Text>
          <View style={styles.evidenceCopy}>
            <Text numberOfLines={1} style={styles.evidenceLabel}>{option.label}</Text>
            <Text style={styles.evidenceKind}>{option.kind === "ticket" ? "일정 티켓" : "여행 문서"}</Text>
          </View>
        </Pressable>;
      })}</View> : <Text style={styles.helper}>연결할 수 있는 공유 문서나 티켓이 아직 없어요.</Text>}
    </View>

    {hasMixedServerTiming ? <Text style={styles.warning}>예약 정보에 정확한 시각과 시간창이 함께 남아 있어요. 안전하게 삭제 후 다시 등록해 주세요.</Text> : null}
    {feedback ? <Text accessibilityLiveRegion="polite" style={feedback.includes("했어요") && !feedback.includes("실패") ? styles.success : styles.error}>{feedback}</Text> : null}

    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked, busy: busy === "save" }}
        disabled={blocked}
        onPress={() => void save()}
        style={({ pressed }) => [styles.save, blocked && styles.disabled, pressed && styles.pressed]}
      >
        {busy === "save" ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>{currentReservation ? "예약 정보 저장" : "예약 정보 등록"}</Text>}
      </Pressable>
      {currentReservation ? <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked, busy: busy === "delete" }}
        disabled={blocked}
        onPress={() => void remove()}
        style={({ pressed }) => [styles.delete, deleteArmed && styles.deleteArmed, blocked && styles.disabled, pressed && styles.pressed]}
      >
        {busy === "delete" ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.deleteText}>{deleteArmed ? "예약 삭제 확정" : "예약 정보 삭제"}</Text>}
      </Pressable> : null}
      {deleteArmed && !busy ? <Pressable accessibilityRole="button" onPress={() => { setDeleteArmed(false); setFeedback(undefined); }} style={({ pressed }) => [styles.cancelDelete, pressed && styles.pressed]}><Text style={styles.cancelDeleteText}>삭제 취소</Text></Pressable> : null}
    </View>
  </View>;
}

/**
 * A schedule version change means another conditional mutation won. Remounting
 * the form avoids carrying a draft made against a stale expectedVersion into
 * the next item/version while keeping the body free of state-reset effects.
 */
export function ApiScheduleReservationEditor(props: ApiScheduleReservationEditorProps) {
  const resetKey = `${props.itemId}:${props.scheduleVersion}:${props.reservation?.id ?? "new"}:${props.reservation?.revision ?? 0}`;
  return <ApiScheduleReservationEditorBody key={resetKey} {...props} />;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headingCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  revision: { ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: spacing.sm },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { ...typography.caption, color: colors.textSecondary },
  choiceTextSelected: { color: colors.primary },
  helper: { ...typography.caption, color: colors.textSecondary },
  timeGrid: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  timeField: { flex: 1, minWidth: 0 },
  evidenceSection: { gap: spacing.xs },
  sectionLabel: { ...typography.bodyStrong, color: colors.text },
  evidenceList: { gap: spacing.xs },
  evidence: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  evidenceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  check: { width: 22, height: 22, textAlign: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 6, color: colors.surface, lineHeight: 20 },
  checkSelected: { borderColor: colors.primary, backgroundColor: colors.primary, color: colors.white },
  evidenceCopy: { flex: 1, minWidth: 0 },
  evidenceLabel: { ...typography.bodyStrong, color: colors.text },
  evidenceKind: { ...typography.caption, color: colors.textSecondary },
  warning: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: spacing.sm },
  success: { ...typography.caption, color: colors.success, backgroundColor: colors.successSoft, borderRadius: radius.sm, padding: spacing.sm },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: spacing.sm },
  actionRow: { gap: spacing.xs },
  save: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  saveText: { ...typography.bodyStrong, color: colors.white },
  delete: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, backgroundColor: colors.surface },
  deleteArmed: { backgroundColor: colors.dangerSoft },
  deleteText: { ...typography.bodyStrong, color: colors.danger },
  cancelDelete: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  cancelDeleteText: { ...typography.caption, color: colors.textSecondary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
