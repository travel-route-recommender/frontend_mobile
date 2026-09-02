import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { resolveDeletedDocumentOcrConfirmationTodo } from "../../trip-todos/services/tripTodoAutomationService";
import { ensureTripDocumentStoreHydrated } from "../hooks/useTripDocumentHydration";
import { deleteStoredTravelDocument, formatTravelDocumentSize, openOrShareTravelDocument, shareExternalTravelDocument } from "../services/travelDocumentStorage";
import { useTravelDocumentAvailability } from "../hooks/useTravelDocumentAvailability";
import { useTripDocumentHydrationState, useTripDocumentStore } from "../store/useTripDocumentStore";
import { getTravelDocumentKindLabel, type TravelDocument } from "../types";
import { TravelDocumentAddModal } from "./TravelDocumentAddModal";
import { TravelDocumentFactReviewModal } from "./TravelDocumentFactReviewModal";

const EMPTY_DOCUMENTS: TravelDocument[] = [];

export type TripDocumentSectionHandle = { openAdd(): void };

type TripDocumentSectionProps = {
  tripId: string;
  currentUserId: string;
  itineraryItemIds: readonly string[];
  readOnly?: boolean;
  isOwner?: boolean;
  tripStartDate?: string;
  tripEndDate?: string;
  itineraryItemLabelsById?: Readonly<Record<string, string>>;
  placeOptions?: readonly { id: string; label: string }[];
  allowCreateSchedule?: boolean;
  scheduleCreationUnavailableMessage?: string;
  compact?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export const TripDocumentSection = forwardRef<TripDocumentSectionHandle, TripDocumentSectionProps>(function TripDocumentSection({
  tripId,
  currentUserId,
  itineraryItemIds,
  readOnly = false,
  isOwner = false,
  tripStartDate,
  tripEndDate,
  itineraryItemLabelsById = {},
  placeOptions = [],
  allowCreateSchedule = true,
  scheduleCreationUnavailableMessage,
  compact = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: TripDocumentSectionProps, ref) {
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TravelDocument>();
  const [reviewDocumentId, setReviewDocumentId] = useState<string>();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const documents = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_DOCUMENTS);
  const isHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const hydrationError = useTripDocumentHydrationState((state) => state.hydrationError);
  const removeDocument = useTripDocumentStore((state) => state.removeDocument);
  const reconcileTripLinks = useTripDocumentStore((state) => state.reconcileTripLinks);
  const validItemKey = useMemo(() => JSON.stringify([...new Set(itineraryItemIds)].sort()), [itineraryItemIds]);
  const availableById = useTravelDocumentAvailability(documents);
  const reviewDocument = documents.find((document) => document.id === reviewDocumentId);

  useImperativeHandle(ref, () => ({
    openAdd: () => {
      if (!isHydrated || readOnly) return;
      setMessage("");
      setAddOpen(true);
    },
  }), [isHydrated, readOnly]);

  useEffect(() => {
    if (!isHydrated) return;
    reconcileTripLinks(tripId, JSON.parse(validItemKey) as string[]);
  }, [isHydrated, reconcileTripLinks, tripId, validItemKey]);

  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  const openDocument = async (document: TravelDocument) => {
    setMessage("");
    const result = await openOrShareTravelDocument(document);
    if (!result.ok) {
      setMessage(result.message);
      if (document.storage === "external-url") setReviewDocumentId(document.id);
    }
  };

  const shareDocumentLink = async (document: TravelDocument) => {
    setMessage("");
    const result = await shareExternalTravelDocument(document);
    if (!result.ok) setMessage(result.message);
  };

  const deleteDocument = async () => {
    if (!pendingDelete) return;
    if (readOnly || (!isOwner && pendingDelete.createdByUserId !== currentUserId)) {
      setMessage("이 문서를 삭제할 권한이 없어요.");
      setPendingDelete(undefined);
      return;
    }
    setMessage("");
    const result = await deleteStoredTravelDocument(pendingDelete);
    if (!result.ok) { setMessage(result.message); return; }
    const removed = removeDocument(tripId, pendingDelete.id);
    if (!removed) {
      setMessage("문서는 삭제했지만 목록을 갱신하지 못했어요. 화면을 다시 열어 확인해 주세요.");
      setPendingDelete(undefined);
      return;
    }
    // TODO 정리 실패가 이미 완료된 문서 삭제를 되돌리거나 Workspace를 막아서는 안 된다.
    await resolveDeletedDocumentOcrConfirmationTodo({ tripId, documentId: pendingDelete.id }).catch(() => undefined);
    setPendingDelete(undefined);
  };

  const Container = compact ? View : Card;
  return <Container style={[styles.card, compact && styles.compactRoot]}>
    {compact ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`예약·티켓 문서 ${documents.length}개, ${expanded ? "상세 접기" : "상세 보기"}`} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.compactRow, pressed && styles.pressed]}>
      <View style={styles.compactIcon}><Text style={styles.compactIconText}>▤</Text></View>
      <View style={styles.compactCopy}><Text style={styles.compactTitle}>예약·티켓 문서</Text><Text style={styles.compactMeta}>{!isHydrated ? "불러오는 중" : documents.length ? `${documents.length}개 보관 중` : "아직 보관한 문서 없음"}</Text></View>
      <Text style={styles.compactCount}>{documents.length}개</Text><Text style={styles.compactChevron}>{expanded ? "⌃" : "›"}</Text>
    </Pressable> : <View style={styles.heading}>
      <View style={styles.headingCopy}><Text style={styles.eyebrow}>TRAVEL DOCUMENTS</Text><Text style={styles.title}>예약·티켓 문서함</Text><Text style={styles.description}>숙소 예약, 입장권, 기차·버스표를 여행방에서 바로 찾아보세요.</Text></View>
      <View style={styles.count}><Text style={styles.countValue}>{documents.length}</Text><Text style={styles.countLabel}>개</Text></View>
    </View>}
    {!compact || expanded ? <View style={compact ? styles.expandedBody : undefined}>
    <View style={styles.localNotice}><Text style={styles.localNoticeTitle}>{Platform.OS === "web" ? "브라우저 탭 임시 보관" : "기기 전용 보관"}</Text><Text style={styles.localNoticeText}>{Platform.OS === "web" ? "웹에서는 새로고침하거나 탭을 닫으면 파일이 사라져요. 다른 동행자에게도 공유되지 않습니다." : "현재 파일은 이 기기에만 저장되며 다른 동행자에게 자동 공유되지 않아요."}</Text></View>
    {!isHydrated ? <Text style={styles.empty}>저장된 문서 목록을 불러오는 중이에요.</Text> : documents.length ? <View style={styles.list}>{documents.map((document) => {
      const availability = availableById[document.id];
      const available = availability === true;
      const checking = availability === undefined;
      return <View key={document.id} style={styles.document}>
        <View style={styles.documentCopy}>
          <Text style={styles.kind}>{getTravelDocumentKindLabel(document.kind)}</Text>
          <Text numberOfLines={2} style={styles.documentName}>{document.displayName}</Text>
          <Text style={styles.meta}>{document.storage === "external-url" ? "외부 예약 링크" : formatTravelDocumentSize(document.sizeBytes)} · {document.itineraryItemIds.length ? `일정 ${document.itineraryItemIds.length}개 연결` : "여행방 문서"}</Text>
          {document.extraction?.status === "confirmed" ? <Text style={styles.confirmed}>예약 정보 확인 완료 · 일정 검증 사용 중</Text>
            : document.extraction?.status === "needs-review" ? <Text style={styles.reviewNeeded}>추출 정보 확인 필요</Text>
              : null}
          {checking ? <Text style={styles.checking}>파일 확인 중</Text> : !available ? <Text style={styles.unavailable}>{document.storage === "web-session" ? "웹 새로고침 후 파일 재선택 필요" : "기기에서 파일을 찾을 수 없음"}</Text> : null}
        </View>
        <View style={styles.documentActions}>
          <Pressable accessibilityRole="button" disabled={!available} onPress={() => openDocument(document)} style={({ pressed }) => [styles.smallButton, !available && styles.disabled, pressed && styles.pressed]}><Text style={styles.smallButtonText}>{document.storage === "external-url" ? "링크 열기" : "열기·공유"}</Text></Pressable>
          {document.storage === "external-url" ? <Pressable accessibilityRole="button" onPress={() => shareDocumentLink(document)} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}><Text style={styles.smallButtonText}>링크 공유</Text></Pressable> : null}
          {!readOnly && (isOwner || document.createdByUserId === currentUserId) ? <Pressable accessibilityRole="button" onPress={() => setReviewDocumentId(document.id)} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}><Text style={styles.smallButtonText}>{document.storage === "external-url" ? "일정 정보 입력" : "예약 정보 확인"}</Text></Pressable> : null}
          {!readOnly && (isOwner || document.createdByUserId === currentUserId) ? <Pressable accessibilityRole="button" onPress={() => setPendingDelete(document)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Text style={styles.deleteText}>삭제</Text></Pressable> : null}
        </View>
      </View>;
    })}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>아직 보관한 문서가 없어요</Text><Text style={styles.emptyText}>PDF와 이미지를 15MB까지 추가할 수 있어요.</Text></View>}
    {message || hydrationError ? <Text accessibilityRole="alert" style={styles.error}>{message || hydrationError}</Text> : null}
    {hydrationError ? <SecondaryButton label="문서 목록 다시 불러오기" onPress={() => { setMessage(""); void ensureTripDocumentStoreHydrated().catch(() => undefined); }} /> : null}
    <SecondaryButton label={readOnly ? "완료된 여행에서는 추가할 수 없어요" : "문서 추가"} disabled={!isHydrated || readOnly} onPress={() => { setMessage(""); setAddOpen(true); }} />
    </View> : null}
    <TravelDocumentAddModal visible={addOpen} tripId={tripId} currentUserId={currentUserId} onClose={() => setAddOpen(false)} onAdded={(document) => setReviewDocumentId(document.id)} />
    <TravelDocumentFactReviewModal
      visible={Boolean(reviewDocument)}
      document={reviewDocument}
      currentUserId={currentUserId}
      fileAvailable={reviewDocument ? availableById[reviewDocument.id] === true : false}
      tripStartDate={tripStartDate}
      tripEndDate={tripEndDate}
      itineraryItemLabelsById={itineraryItemLabelsById}
      itineraryOptions={itineraryItemIds.map((id) => ({ id, label: itineraryItemLabelsById[id] ?? "기존 일정" }))}
      placeOptions={placeOptions}
      allowCreateSchedule={allowCreateSchedule}
      scheduleCreationUnavailableMessage={scheduleCreationUnavailableMessage}
      onClose={() => setReviewDocumentId(undefined)}
    />
    <Modal visible={Boolean(pendingDelete)} transparent animationType="fade" onRequestClose={() => setPendingDelete(undefined)}>
      <View style={styles.confirmOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="문서 삭제 취소" onPress={() => setPendingDelete(undefined)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.confirmSafeArea}>
          <View accessibilityViewIsModal style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>문서를 삭제할까요?</Text>
            <Text style={styles.confirmText}>{pendingDelete?.extraction?.facts.some((fact) => fact.reviewState === "confirmed")
              ? `확정한 예약 정보와 두리 검증 조건도 함께 제거됩니다.${pendingDelete.itineraryItemIds.length ? ` 연결된 일정 ${pendingDelete.itineraryItemIds.length}개는 삭제하지 않고 문서 연결만 해제합니다.` : ""} 기기 파일은 복구할 수 없어요.`
              : pendingDelete?.itineraryItemIds.length
                ? "연결된 일정 " + pendingDelete.itineraryItemIds.length + "개에서도 해제됩니다. 일정 자체는 삭제하지 않으며 기기 파일은 복구할 수 없어요."
                : "기기에 저장된 파일도 함께 삭제되며 복구할 수 없어요."}</Text>
            <Pressable accessibilityRole="button" onPress={deleteDocument} style={({ pressed }) => [styles.confirmDelete, pressed && styles.pressed]}><Text style={styles.confirmDeleteText}>문서 삭제</Text></Pressable>
            <SecondaryButton label="취소" onPress={() => setPendingDelete(undefined)} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </Container>;
});

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  compactRoot: { gap: 0 },
  compactRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  compactIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: "#DDEBFF" },
  compactIconText: { color: "#4388FF", fontSize: 17, fontWeight: "900" },
  compactCopy: { flex: 1, minWidth: 0, gap: 2 }, compactTitle: { color: "#17265F", fontSize: 13, lineHeight: 18, fontWeight: "800" }, compactMeta: { color: "#60719B", fontSize: 10, lineHeight: 15, fontWeight: "600" }, compactCount: { color: "#4388FF", fontSize: 11, lineHeight: 16, fontWeight: "800" }, compactChevron: { color: "#8290AE", fontSize: 18, fontWeight: "700" },
  expandedBody: { gap: spacing.md, borderTopWidth: 1, borderTopColor: "#DCE7F7", paddingTop: spacing.md },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xxs },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text },
  description: { ...typography.body, color: colors.textSecondary },
  count: { minWidth: 48, height: 48, flexDirection: "row", alignItems: "baseline", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingTop: spacing.sm },
  countValue: { ...typography.subtitle, color: colors.primary },
  countLabel: { ...typography.caption, color: colors.primary },
  localNotice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  localNoticeTitle: { ...typography.bodyStrong, color: colors.warning },
  localNoticeText: { ...typography.caption, color: colors.textSecondary },
  list: { gap: spacing.sm },
  document: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  documentCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  kind: { ...typography.caption, color: colors.primary },
  documentName: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary },
  unavailable: { ...typography.caption, color: colors.danger },
  checking: { ...typography.caption, color: colors.textMuted },
  confirmed: { ...typography.caption, color: colors.success },
  reviewNeeded: { ...typography.caption, color: colors.warning },
  documentActions: { gap: spacing.xs },
  smallButton: { minHeight: 38, justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm },
  smallButtonText: { ...typography.caption, color: colors.primary },
  deleteButton: { minHeight: 32, alignItems: "center", justifyContent: "center" },
  deleteText: { ...typography.caption, color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  empty: { gap: spacing.xxs, alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, padding: spacing.lg },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
  confirmOverlay: { flex: 1, justifyContent: "center", backgroundColor: colors.overlay, padding: spacing.lg },
  confirmSafeArea: { width: "100%" },
  confirmCard: { width: "100%", maxWidth: 440, alignSelf: "center", gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg },
  confirmTitle: { ...typography.subtitle, color: colors.text },
  confirmText: { ...typography.body, color: colors.textSecondary },
  confirmDelete: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.danger },
  confirmDeleteText: { ...typography.button, color: colors.white },
});
