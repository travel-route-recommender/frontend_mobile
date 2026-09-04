import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton, SecondaryButton, TextField } from "../../../components/common";
import { useDuriStore, type AddLockedDocumentScheduleResult } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { syncDocumentOcrConfirmationTodo } from "../../trip-todos/services/tripTodoAutomationService";
import {
  confirmTravelDocumentFact,
  createManualTravelDocumentExtraction,
  getNextTravelDocumentFactForReview,
  runTravelDocumentTextExtraction,
  type TravelDocumentTextRecognizer,
} from "../logic/documentExtraction";
import { buildLockedDocumentScheduleDraft } from "../logic/documentSchedule";
import { useTripDocumentStore } from "../store/useTripDocumentStore";
import type { TravelDocument, TravelDocumentExtraction, TravelDocumentFactKind } from "../types";

const factKindOptions: readonly { value: TravelDocumentFactKind; label: string }[] = [
  { value: "reservation", label: "예약·입장" },
  { value: "train", label: "기차 출발" },
  { value: "bus", label: "버스 출발" },
  { value: "rental-car-return", label: "렌터카 반납" },
  { value: "mandatory-place", label: "필수 방문" },
];

function scheduleFailureMessage(result: AddLockedDocumentScheduleResult) {
  if (result.status === "overlap") return "같은 시간에 다른 일정이 있어 추가하지 않았어요. 기존 일정을 연결하거나 시간을 조정해 주세요.";
  if (result.status === "end-condition") return "여행 종료 조건 뒤에는 일정을 추가할 수 없어요. 종료 시각 또는 일정을 확인해 주세요.";
  if (result.status === "invalid-date") return "여행 기간 안의 날짜인지 확인해 주세요.";
  if (result.status === "invalid-time") return "같은 날짜 00:00~24:00 안의 시작·종료 시각인지 확인해 주세요.";
  if (result.status === "invalid-place") return "선택한 장소를 여행방에서 찾을 수 없어요.";
  if (result.status === "trip-not-editable") return "완료된 여행에는 일정을 추가할 수 없어요.";
  if (result.status === "not-member") return "이 여행방의 일정 편집 권한이 없어요.";
  return "일정을 추가하지 못했어요. 여행방과 입력값을 다시 확인해 주세요.";
}

function editableExtraction(document: TravelDocument) {
  return document.extraction?.facts.length
    ? document.extraction
    : createManualTravelDocumentExtraction({ document });
}

function extractionMessage(extraction: TravelDocumentExtraction | undefined) {
  if (!extraction) return "OCR 또는 직접 입력 결과는 확인하기 전까지 일정 검증에 사용하지 않아요.";
  if (extraction.status === "confirmed") return "사용자가 확인한 정보만 두리의 고정 일정 검증에 사용해요.";
  if (extraction.status === "needs-review") return extraction.mode === "on-device"
    ? "문자 인식 결과일 수 있어요. 원본 문서와 대조한 뒤 확정해 주세요."
    : "직접 입력한 내용을 확인한 뒤 확정해 주세요.";
  return extraction.failureMessage ?? "문자 인식을 사용할 수 없어 직접 입력할 수 있어요.";
}

export function TravelDocumentFactReviewModal({
  visible,
  document,
  currentUserId,
  fileAvailable = true,
  tripStartDate,
  tripEndDate,
  itineraryItemLabelsById = {},
  itineraryOptions = [],
  placeOptions = [],
  allowCreateSchedule = true,
  scheduleCreationUnavailableMessage,
  recognizer,
  onClose,
}: {
  visible: boolean;
  document?: TravelDocument;
  currentUserId: string;
  fileAvailable?: boolean;
  tripStartDate?: string;
  tripEndDate?: string;
  itineraryItemLabelsById?: Readonly<Record<string, string>>;
  itineraryOptions?: readonly { id: string; label: string }[];
  placeOptions?: readonly { id: string; label: string }[];
  allowCreateSchedule?: boolean;
  scheduleCreationUnavailableMessage?: string;
  recognizer?: TravelDocumentTextRecognizer;
  onClose(): void;
}) {
  if (!visible || !document) return null;
  return <TravelDocumentFactReviewEditor
    key={document.id}
    document={document}
    currentUserId={currentUserId}
    fileAvailable={fileAvailable}
    tripStartDate={tripStartDate}
    tripEndDate={tripEndDate}
    itineraryItemLabelsById={itineraryItemLabelsById}
    itineraryOptions={itineraryOptions}
    placeOptions={placeOptions}
    allowCreateSchedule={allowCreateSchedule}
    scheduleCreationUnavailableMessage={scheduleCreationUnavailableMessage}
    recognizer={recognizer}
    onClose={onClose}
  />;
}

function TravelDocumentFactReviewEditor({
  document,
  currentUserId,
  fileAvailable,
  tripStartDate,
  tripEndDate,
  itineraryItemLabelsById,
  itineraryOptions,
  placeOptions,
  allowCreateSchedule,
  scheduleCreationUnavailableMessage,
  recognizer,
  onClose,
}: {
  document: TravelDocument;
  currentUserId: string;
  fileAvailable: boolean;
  tripStartDate?: string;
  tripEndDate?: string;
  itineraryItemLabelsById: Readonly<Record<string, string>>;
  itineraryOptions: readonly { id: string; label: string }[];
  placeOptions: readonly { id: string; label: string }[];
  allowCreateSchedule: boolean;
  scheduleCreationUnavailableMessage?: string;
  recognizer?: TravelDocumentTextRecognizer;
  onClose(): void;
}) {
  const setDocumentExtraction = useTripDocumentStore((state) => state.setDocumentExtraction);
  const initialExtraction = editableExtraction(document);
  const initialFact = getNextTravelDocumentFactForReview(initialExtraction);
  const [working, setWorking] = useState<TravelDocumentExtraction>(initialExtraction);
  const [factId, setFactId] = useState(initialFact.id);
  const [kind, setKind] = useState<TravelDocumentFactKind>(initialFact.kind);
  const [label, setLabel] = useState(initialFact.label);
  const [date, setDate] = useState(initialFact.date ?? "");
  const [startTime, setStartTime] = useState(initialFact.startTime ?? "");
  const [endTime, setEndTime] = useState(initialFact.endTime ?? "");
  const [placeName, setPlaceName] = useState(initialFact.placeName ?? "");
  const [placeId, setPlaceId] = useState(initialFact.placeId ?? "");
  const initialItineraryItemId = initialFact.itineraryItemId && itineraryOptions.some((item) => item.id === initialFact.itineraryItemId)
    ? initialFact.itineraryItemId
    : document.itineraryItemIds.length === 1 && itineraryOptions.some((item) => item.id === document.itineraryItemIds[0]) ? document.itineraryItemIds[0] : undefined;
  const [scheduleTarget, setScheduleTarget] = useState(initialItineraryItemId ?? (allowCreateSchedule ? "create" : "place-only"));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const hydrateFields = (extraction: TravelDocumentExtraction) => {
    const fact = getNextTravelDocumentFactForReview(extraction);
    if (!fact) return;
    setWorking(extraction);
    setFactId(fact.id);
    setKind(fact.kind);
    setLabel(fact.label);
    setDate(fact.date ?? "");
    setStartTime(fact.startTime ?? "");
    setEndTime(fact.endTime ?? "");
    setPlaceName(fact.placeName ?? "");
    setPlaceId(fact.placeId ?? "");
    const target = fact.itineraryItemId && itineraryOptions.some((item) => item.id === fact.itineraryItemId)
      ? fact.itineraryItemId
      : document.itineraryItemIds.length === 1 && itineraryOptions.some((item) => item.id === document.itineraryItemIds[0]) ? document.itineraryItemIds[0] : undefined;
    setScheduleTarget(target ?? (allowCreateSchedule ? "create" : "place-only"));
  };

  const linkedItems = useMemo(() => new Set(document?.itineraryItemIds ?? []), [document?.itineraryItemIds]);

  const recognize = async () => {
    if (!document || !recognizer || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const extraction = await runTravelDocumentTextExtraction(document, recognizer, {
        fileAvailable,
        tripStartDate,
        tripEndDate,
      });
      if (!setDocumentExtraction(document.tripId, document.id, extraction)) {
        setMessage("문서가 삭제되어 문자 인식 결과를 저장하지 않았어요. 일정은 그대로 유지돼요.");
        return;
      }
      let todoFailed = false;
      try {
        await syncDocumentOcrConfirmationTodo({
          tripId: document.tripId,
          document: { ...document, extraction },
          createdByUserId: currentUserId,
        });
      } catch {
        // TODO 저장 실패가 문서 metadata나 워크스페이스를 되돌리면 안 된다.
        todoFailed = true;
      }
      if (extraction.facts.length) hydrateFields(extraction);
      else {
        const manual = createManualTravelDocumentExtraction({ document });
        hydrateFields(manual);
      }
      const baseMessage = extraction.status === "needs-review" ? "문자 인식 결과를 불러왔어요. 원본과 대조해 확정해 주세요." : extractionMessage(extraction);
      setMessage(todoFailed ? `${baseMessage} 확인 TODO는 저장하지 못했지만 문서와 일정에는 영향이 없어요.` : baseMessage);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
    const baseConfirmation = {
      factId,
      kind,
      label,
      date,
      ...(startTime.trim() ? { startTime: startTime.trim() } : {}),
      ...(endTime.trim() ? { endTime: endTime.trim() } : {}),
      ...(placeName.trim() ? { placeName: placeName.trim() } : {}),
      ...(placeId ? { placeId } : {}),
      confirmedByUserId: currentUserId,
      tripStartDate,
      tripEndDate,
    };
    const itineraryBefore = allowCreateSchedule
      ? (useDuriStore.getState().itineraryByTripId[document.tripId] ?? []).map((item) => ({ ...item, preferredByUserIds: [...item.preferredByUserIds] }))
      : undefined;
    const documentsBefore = (useTripDocumentStore.getState().documentsByTripId[document.tripId] ?? []).map((entry) => ({ ...entry, itineraryItemIds: [...entry.itineraryItemIds] }));
    const rollback = () => {
      if (itineraryBefore) useDuriStore.setState((state) => ({ itineraryByTripId: { ...state.itineraryByTripId, [document.tripId]: itineraryBefore } }));
      useTripDocumentStore.setState((state) => ({ documentsByTripId: { ...state.documentsByTripId, [document.tripId]: documentsBefore } }));
    };
    let targetItemId: string | undefined;
    if (scheduleTarget === "create") {
      if (!allowCreateSchedule) {
        setMessage(scheduleCreationUnavailableMessage ?? "이 여행방에서는 새 일정을 바로 만들 수 없어요. 기존 일정에 연결하거나 예약 정보만 확정해 주세요.");
        return;
      }
      const draftResult = buildLockedDocumentScheduleDraft({ kind, label, date, startTime, endTime, ...(placeId ? { placeId } : {}) });
      if (!draftResult.ok) { setMessage(draftResult.message); return; }
      const preflight = confirmTravelDocumentFact(working, { ...baseConfirmation, itineraryItemId: "pending-locked-document-schedule" });
      if (!preflight.ok) { setMessage(preflight.message); return; }
      const scheduleResult = useDuriStore.getState().addLockedDocumentSchedule(document.tripId, draftResult.draft);
      if (scheduleResult.status !== "success") {
        setMessage(scheduleFailureMessage(scheduleResult));
        return;
      }
      targetItemId = scheduleResult.itemId;
    } else if (scheduleTarget !== "place-only") {
      targetItemId = scheduleTarget;
      if (!itineraryOptions.some((option) => option.id === targetItemId)) {
        setMessage("연결할 일정이 삭제되었어요. 목록을 다시 확인해 주세요.");
        return;
      }
    }
    const result = confirmTravelDocumentFact(working, {
      ...baseConfirmation,
      ...(targetItemId ? { itineraryItemId: targetItemId } : {}),
    });
    if (!result.ok) { rollback(); setMessage(result.message); return; }
    if (targetItemId) {
      const currentlyLinkedDocumentIds = (useTripDocumentStore.getState().documentsByTripId[document.tripId] ?? [])
        .filter((entry) => entry.itineraryItemIds.includes(targetItemId!))
        .map((entry) => entry.id);
      if (!useTripDocumentStore.getState().setLinksForItinerary(document.tripId, targetItemId, [...new Set([...currentlyLinkedDocumentIds, document.id])])) {
        rollback();
        setMessage("일정과 문서 연결을 저장하지 못해 일정 추가도 취소했어요.");
        return;
      }
    }
    if (!setDocumentExtraction(document.tripId, document.id, result.extraction)) {
      rollback();
      setMessage("문서를 찾을 수 없어 예약 정보와 일정 추가를 모두 취소했어요.");
      return;
    }
    try {
      const updatedDocument = useTripDocumentStore.getState().documentsByTripId[document.tripId]?.find((entry) => entry.id === document.id)
        ?? { ...document, extraction: result.extraction };
      await syncDocumentOcrConfirmationTodo({
        tripId: document.tripId,
        document: updatedDocument,
        createdByUserId: currentUserId,
      });
    } catch {
      // 예약 사실 확정은 성공했으므로 보조 TODO 실패로 되돌리지 않는다.
    }
    onClose();
    } finally {
      setBusy(false);
    }
  };

  const close = () => { if (!busy) onClose(); };

  return <Modal visible transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={close}>
    <View style={styles.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined} style={styles.keyboardArea}>
        <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
          <Pressable accessibilityRole="button" accessibilityLabel="예약 정보 확인 닫기" disabled={busy} onPress={close} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>예약 정보 확인</Text>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <View style={styles.notice}><Text style={styles.noticeTitle}>확정하기 전에는 일정을 고정하지 않아요</Text><Text style={styles.noticeText}>{extractionMessage(working)}</Text></View>
            {recognizer && document.storage !== "external-url" ? <SecondaryButton label="기기에서 문자 인식" loading={busy} disabled={!fileAvailable} onPress={recognize} />
              : <Text style={styles.capability}>{document.storage === "external-url"
                ? "외부 링크의 페이지 내용은 자동으로 읽지 않아요. 링크가 열리지 않거나 로그인이 필요해도 아래에 예약 정보를 직접 입력할 수 있어요."
                : "이 파일에서는 문자 인식을 사용할 수 없어요. 아래에 예약 정보를 직접 입력하고 원본과 대조한 뒤 확정해 주세요."}</Text>}
            <View style={styles.kindOptions}>{factKindOptions.map((option) => <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: kind === option.value }}
              onPress={() => setKind(option.value)}
              style={({ pressed }) => [styles.kindOption, kind === option.value && styles.kindOptionSelected, pressed && styles.pressed]}
            ><Text style={[styles.kindLabel, kind === option.value && styles.kindLabelSelected]}>{option.label}</Text></Pressable>)}</View>
            <TextField label="예약·방문 이름" value={label} onChangeText={setLabel} maxLength={80} placeholder="예: KTX 서울→부산" />
            <TextField label="날짜" value={date} onChangeText={setDate} maxLength={10} placeholder="YYYY-MM-DD" helperText={tripStartDate && tripEndDate ? `여행 기간 ${tripStartDate} ~ ${tripEndDate}` : "원본 문서의 날짜를 확인해 주세요."} />
            <View style={styles.timeFields}>
              <View style={styles.timeField}><TextField label="시작 시각" value={startTime} onChangeText={setStartTime} maxLength={5} placeholder="HH:mm" /></View>
              <View style={styles.timeField}><TextField label="종료 시각 (선택)" value={endTime} onChangeText={setEndTime} maxLength={5} placeholder="HH:mm" /></View>
            </View>
            <TextField label="장소명 (선택)" value={placeName} onChangeText={setPlaceName} maxLength={100} placeholder="예: 서울역" />
            {placeOptions.length ? <View style={styles.targetSection}><Text style={styles.targetTitle}>여행방 장소와 연결 (선택)</Text><Text style={styles.targetHint}>아직 일정에 없는 예약 장소라면 연결해 누락 여부를 검사할 수 있어요.</Text><View style={styles.targetOptions}><Pressable accessibilityRole="radio" accessibilityState={{ checked: !placeId }} onPress={() => setPlaceId("")} style={({ pressed }) => [styles.targetOption, !placeId && styles.targetOptionSelected, pressed && styles.pressed]}><Text style={[styles.targetLabel, !placeId && styles.targetLabelSelected]}>선택 안 함</Text></Pressable>{placeOptions.map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: placeId === option.id }} onPress={() => { setPlaceId(option.id); if (!placeName.trim()) setPlaceName(option.label); }} style={({ pressed }) => [styles.targetOption, placeId === option.id && styles.targetOptionSelected, pressed && styles.pressed]}><Text style={[styles.targetLabel, placeId === option.id && styles.targetLabelSelected]}>{option.label}</Text></Pressable>)}</View></View> : null}
            <View style={styles.targetSection}>
              <Text style={styles.targetTitle}>일정표 반영</Text>
              <Text style={styles.targetHint}>{allowCreateSchedule ? "새 일정은 확인한 시작·종료 시각 그대로 추가되고 두리가 바꾸지 않도록 잠깁니다. 기존 일정 연결은 그 일정을 자동으로 옮기지 않아요." : scheduleCreationUnavailableMessage ?? "새 일정을 바로 만들 수 없어 기존 일정에 연결하거나 예약 정보만 확인할 수 있어요."}</Text>
              <View style={styles.targetOptions}>
                {allowCreateSchedule ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: scheduleTarget === "create" }} onPress={() => setScheduleTarget("create")} style={({ pressed }) => [styles.targetOption, scheduleTarget === "create" && styles.targetOptionSelected, pressed && styles.pressed]}><Text style={[styles.targetLabel, scheduleTarget === "create" && styles.targetLabelSelected]}>새 잠금 일정으로 추가</Text></Pressable> : null}
                {placeId || !allowCreateSchedule ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: scheduleTarget === "place-only" }} onPress={() => setScheduleTarget("place-only")} style={({ pressed }) => [styles.targetOption, scheduleTarget === "place-only" && styles.targetOptionSelected, pressed && styles.pressed]}><Text style={[styles.targetLabel, scheduleTarget === "place-only" && styles.targetLabelSelected]}>{placeId ? "일정 추가 없이 장소만 확인" : "일정 추가 없이 예약 정보만 확인"}</Text></Pressable> : null}
                {itineraryOptions.map((item, index) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: scheduleTarget === item.id }} onPress={() => setScheduleTarget(item.id)} style={({ pressed }) => [styles.targetOption, scheduleTarget === item.id && styles.targetOptionSelected, pressed && styles.pressed]}><Text style={[styles.targetLabel, scheduleTarget === item.id && styles.targetLabelSelected]}>{linkedItems.has(item.id) ? "연결됨 · " : ""}{itineraryItemLabelsById[item.id] ?? item.label ?? `기존 일정 ${index + 1}`}</Text></Pressable>)}
              </View>
            </View>
            {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
            <PrimaryButton label={scheduleTarget === "create" ? "확정하고 잠금 일정 추가" : "확정하고 일정 검증에 사용"} disabled={busy} onPress={save} />
            <SecondaryButton label="취소" disabled={busy} onPress={close} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(17, 32, 67, 0.32)" },
  keyboardArea: { flex: 1 },
  safeArea: { flex: 1, width: "100%", justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 680, maxHeight: "94%", alignSelf: "center", overflow: "hidden", gap: spacing.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg },
  handle: { width: 44, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  title: { ...typography.title, color: colors.text },
  scroll: { flexShrink: 1, minHeight: 0 },
  content: { gap: spacing.md, paddingBottom: spacing.xs },
  notice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.primarySoft, padding: spacing.sm },
  noticeTitle: { ...typography.bodyStrong, color: colors.primary },
  noticeText: { ...typography.caption, color: colors.textSecondary },
  capability: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  kindOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  kindOption: { minHeight: 40, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm },
  kindOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  kindLabel: { ...typography.caption, color: colors.textSecondary },
  kindLabelSelected: { color: colors.primary },
  timeFields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  timeField: { flex: 1, minWidth: 180 },
  targetSection: { gap: spacing.xs },
  targetTitle: { ...typography.bodyStrong, color: colors.text },
  targetHint: { ...typography.caption, color: colors.textSecondary },
  targetOptions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  targetOption: { minHeight: 42, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm },
  targetOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  targetLabel: { ...typography.caption, color: colors.textSecondary },
  targetLabelSelected: { color: colors.primary },
  targetEmpty: { ...typography.caption, color: colors.warning, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm },
  message: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
  pressed: { opacity: 0.8 },
});
