import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, SecondaryButton, TextField } from "../../../components/common";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import {
  deleteApiTripDocument,
  ensureFreshApiTripDocumentDownload,
  fetchApiTripDocuments,
  openApiTripDocumentDownload,
  pickAndUploadApiTripDocument,
  type ApiTripDocument,
  type ApiTripDocumentDownload,
  type ApiTripDocumentMutationVersion,
} from "../services/tripDocumentApi";

type Feedback = { tone: "success" | "error"; text: string };

export type ApiTripDocumentOnDeviceReviewInput = {
  document: ApiTripDocument;
  download: ApiTripDocumentDownload;
  /** OCR와 사용자의 확인 결과는 현재 Backend 문서 계약에 저장하지 않는다. */
  persistence: "device-only";
};

export type ApiTripDocumentSectionProps = {
  roomId: string;
  currentUserId: string;
  readOnly?: boolean;
  isOwner?: boolean;
  /** 제공된 경우에만 기기 전용 OCR/수동 검토 진입점을 표시한다. */
  onReviewOnDevice?: (input: ApiTripDocumentOnDeviceReviewInput) => void | Promise<void>;
  /** 같은 화면의 TODO 등 서버 문서 선택 UI와 동기화하기 위한 읽기 전용 알림. */
  onDocumentsChange?: (documents: readonly ApiTripDocument[]) => void;
  /** 문서 변경으로 일정·분석 revision이 바뀐 뒤 상위 화면을 다시 읽게 한다. */
  onDocumentsMutationSettled?: (
    kind: "upload" | "delete",
    version?: ApiTripDocumentMutationVersion,
  ) => void;
};

function errorMessage(error: unknown, fallback: string) {
  return toUserFacingApiErrorMessage(error, fallback);
}

function formatBytes(sizeBytes?: number) {
  if (sizeBytes === undefined) return "크기 정보 없음";
  if (sizeBytes < 1024) return `${sizeBytes}B`;
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatCreatedAt(createdAt?: string) {
  if (!createdAt) return "업로드 시각 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function fileTypeLabel(mimeType?: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType?.startsWith("image/")) return "이미지";
  return "문서";
}

export function ApiTripDocumentSection({
  roomId,
  currentUserId,
  readOnly = false,
  isOwner = false,
  onReviewOnDevice,
  onDocumentsChange,
  onDocumentsMutationSettled,
}: ApiTripDocumentSectionProps) {
  const [documents, setDocuments] = useState<ApiTripDocument[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [pendingDelete, setPendingDelete] = useState<ApiTripDocument>();
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | undefined>(undefined);
  const actionLock = useRef(false);

  const loadDocuments = useCallback(async () => {
    const sequence = ++requestSequence.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setLoading(true);
    setFeedback(undefined);
    try {
      const next = await fetchApiTripDocuments(roomId, controller.signal);
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      setDocuments(next);
    } catch (error) {
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      setDocuments([]);
      setFeedback({ tone: "error", text: errorMessage(error, "공유 문서 목록을 불러오지 못했어요.") });
    } finally {
      if (sequence === requestSequence.current && !controller.signal.aborted) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const timeout = setTimeout(() => void loadDocuments(), 0);
    return () => {
      clearTimeout(timeout);
      requestSequence.current += 1;
      activeController.current?.abort();
    };
  }, [loadDocuments]);

  useEffect(() => {
    if (!loading) onDocumentsChange?.(documents);
  }, [documents, loading, onDocumentsChange]);

  const replaceDocument = (updated: ApiTripDocument) => {
    setDocuments((current) => current.map((document) => document.id === updated.id ? updated : document));
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction(key);
    setFeedback(undefined);
    try {
      await action();
    } finally {
      setBusyAction(undefined);
      actionLock.current = false;
    }
  };

  const upload = () => runAction("upload", async () => {
    if (readOnly) {
      setFeedback({ tone: "error", text: "완료된 여행에는 문서를 추가할 수 없어요." });
      return;
    }
    try {
      const result = await pickAndUploadApiTripDocument({ roomId, ...(note.trim() ? { note } : {}) });
      if (result.status === "cancelled") return;
      if (result.status === "rejected" || result.status === "error") {
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      setDocuments((current) => [result.document, ...current.filter((entry) => entry.id !== result.document.id)]);
      setNote("");
      setFeedback({ tone: "success", text: "문서를 여행방 동행자와 공유했어요." });
      onDocumentsMutationSettled?.("upload", result);
    } catch (error) {
      onDocumentsMutationSettled?.("upload");
      await loadDocuments();
      setFeedback({ tone: "error", text: errorMessage(error, "업로드 결과를 확인하지 못했어요. 새로 불러온 목록을 확인해 주세요.") });
    }
  });

  const openDocument = (document: ApiTripDocument) => runAction(`open:${document.id}`, async () => {
    try {
      const updated = await openApiTripDocumentDownload(roomId, document);
      replaceDocument(updated);
    } catch (error) {
      setFeedback({ tone: "error", text: errorMessage(error, "문서 다운로드 링크를 열지 못했어요.") });
    }
  });

  const reviewOnDevice = (document: ApiTripDocument) => runAction(`review:${document.id}`, async () => {
    if (!onReviewOnDevice) return;
    try {
      const fresh = await ensureFreshApiTripDocumentDownload(roomId, document);
      replaceDocument(fresh.document);
      await onReviewOnDevice({
        document: fresh.document,
        download: fresh.download,
        persistence: "device-only",
      });
    } catch (error) {
      setFeedback({ tone: "error", text: errorMessage(error, "기기 문서 검토를 시작하지 못했어요.") });
    }
  });

  const confirmDelete = () => {
    if (!pendingDelete) return Promise.resolve();
    const target = pendingDelete;
    return runAction(`delete:${target.id}`, async () => {
      if (readOnly || (!isOwner && target.uploadedBy !== currentUserId)) {
        setPendingDelete(undefined);
        setFeedback({ tone: "error", text: "업로더 또는 방장만 이 문서를 삭제할 수 있어요." });
        return;
      }
      try {
        const version = await deleteApiTripDocument(roomId, target.id);
        setDocuments((current) => current.filter((document) => document.id !== target.id));
        setPendingDelete(undefined);
        setFeedback({ tone: "success", text: "공유 문서를 삭제했어요." });
        onDocumentsMutationSettled?.("delete", version);
      } catch (error) {
        onDocumentsMutationSettled?.("delete");
        await loadDocuments();
        setPendingDelete(undefined);
        setFeedback({ tone: "error", text: errorMessage(error, "삭제 결과를 확인하지 못했어요. 새로 불러온 목록을 확인해 주세요.") });
      }
    });
  };

  return <Card style={styles.card}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>SHARED DOCUMENTS</Text>
        <Text style={styles.title}>예약·티켓 문서함</Text>
        <Text style={styles.description}>여행방 멤버가 같은 파일과 메모를 확인할 수 있어요.</Text>
      </View>
      <View style={styles.count}>
        <Text style={styles.countValue}>{documents.length}</Text>
        <Text style={styles.countLabel}>개</Text>
      </View>
    </View>

    <View style={styles.serverNotice}>
      <Text style={styles.serverNoticeTitle}>동행자와 함께 보는 문서함</Text>
      <Text style={styles.serverNoticeText}>올린 파일과 메모는 여행방 동행자가 함께 볼 수 있어요.</Text>
      {onReviewOnDevice ? <Text style={styles.deviceOnlyText}>이 기기에서 확인한 날짜와 시간은 다른 동행자의 화면에 자동으로 반영되지 않아요.</Text> : null}
    </View>

    {loading ? <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>공유 문서를 불러오고 있어요.</Text>
    </View> : documents.length ? <View style={styles.list}>{documents.map((document) => {
      const canDelete = !readOnly && (isOwner || document.uploadedBy === currentUserId);
      const opening = busyAction === `open:${document.id}`;
      const reviewing = busyAction === `review:${document.id}`;
      return <View key={document.id} style={styles.document}>
        <View style={styles.documentCopy}>
          <Text style={styles.kind}>{fileTypeLabel(document.mimeType)}</Text>
          <Text numberOfLines={2} style={styles.documentName}>{document.originalName ?? "이름 없는 공유 문서"}</Text>
          <Text style={styles.meta}>{formatBytes(document.sizeBytes)} · {formatCreatedAt(document.createdAt)}</Text>
          {document.note ? <Text style={styles.note}>{document.note}</Text> : null}
        </View>
        <View style={styles.documentActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${document.originalName ?? "공유 문서"} 열기`}
            accessibilityState={{ busy: opening, disabled: Boolean(busyAction) }}
            disabled={Boolean(busyAction)}
            onPress={() => void openDocument(document)}
            style={({ pressed }) => [styles.smallButton, Boolean(busyAction) && styles.disabled, pressed && styles.pressed]}
          >{opening ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.smallButtonText}>열기</Text>}</Pressable>
          {onReviewOnDevice ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${document.originalName ?? "공유 문서"} 기기에서 정보 검토`}
            accessibilityState={{ busy: reviewing, disabled: Boolean(busyAction) }}
            disabled={Boolean(busyAction)}
            onPress={() => void reviewOnDevice(document)}
            style={({ pressed }) => [styles.smallButton, Boolean(busyAction) && styles.disabled, pressed && styles.pressed]}
          >{reviewing ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.smallButtonText}>정보 검토</Text>}</Pressable> : null}
          {canDelete ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${document.originalName ?? "공유 문서"} 삭제`}
            disabled={Boolean(busyAction)}
            onPress={() => setPendingDelete(document)}
            style={({ pressed }) => [styles.deleteButton, Boolean(busyAction) && styles.disabled, pressed && styles.pressed]}
          ><Text style={styles.deleteText}>삭제</Text></Pressable> : null}
        </View>
      </View>;
    })}</View> : <View style={styles.empty}>
      <Text style={styles.emptyTitle}>아직 공유한 문서가 없어요</Text>
      <Text style={styles.emptyText}>PDF와 이미지 파일을 10MB까지 올릴 수 있어요.</Text>
    </View>}

    {feedback ? <Text accessibilityRole="alert" style={[styles.feedback, feedback.tone === "success" ? styles.success : styles.error]}>{feedback.text}</Text> : null}
    {!loading && feedback?.tone === "error" && !documents.length
      ? <SecondaryButton label="공유 문서 다시 불러오기" onPress={loadDocuments} />
      : null}

    {!readOnly ? <View style={styles.upload}>
      <TextField
        label="문서 메모 (선택)"
        value={note}
        onChangeText={setNote}
        maxLength={200}
        placeholder="예: 부산행 KTX 승차권"
        helperText={`${note.length}/200 · PDF/JPG/PNG/WEBP/HEIC/HEIF, 최대 10MB`}
      />
      <SecondaryButton
        label="문서 선택 후 공유"
        loading={busyAction === "upload"}
        disabled={loading || Boolean(busyAction)}
        onPress={upload}
      />
    </View> : <Text style={styles.readOnly}>완료된 여행에서는 문서를 열어볼 수 있지만 추가하거나 삭제할 수 없어요.</Text>}

    <Modal
      visible={Boolean(pendingDelete)}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!busyAction) setPendingDelete(undefined); }}
    >
      <View style={styles.confirmOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="공유 문서 삭제 취소"
          disabled={Boolean(busyAction)}
          onPress={() => setPendingDelete(undefined)}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.confirmSafeArea}>
          <View accessibilityViewIsModal style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>공유 문서를 삭제할까요?</Text>
            <Text style={styles.confirmText}>{pendingDelete?.originalName ?? "선택한 문서"} 파일이 여행방에서 삭제되며 복구할 수 없어요.</Text>
            <Text style={styles.confirmImpact}>이 문서를 참조하는 예약과 TODO에서는 문서 연결만 해제돼요. 일정과 예약 내용은 그대로 유지됩니다.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: busyAction?.startsWith("delete:") }}
              disabled={Boolean(busyAction)}
              onPress={() => void confirmDelete()}
              style={({ pressed }) => [styles.confirmDelete, Boolean(busyAction) && styles.disabled, pressed && styles.pressed]}
            >{busyAction?.startsWith("delete:")
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.confirmDeleteText}>공유 문서 삭제</Text>}</Pressable>
            <SecondaryButton label="취소" disabled={Boolean(busyAction)} onPress={() => setPendingDelete(undefined)} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headingCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.subtitle, color: colors.text },
  description: { ...typography.body, color: colors.textSecondary },
  count: { minWidth: 48, height: 48, flexDirection: "row", alignItems: "baseline", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingTop: spacing.sm },
  countValue: { ...typography.subtitle, color: colors.primary },
  countLabel: { ...typography.caption, color: colors.primary },
  serverNotice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.successSoft, padding: spacing.sm },
  serverNoticeTitle: { ...typography.bodyStrong, color: colors.success },
  serverNoticeText: { ...typography.caption, color: colors.textSecondary },
  deviceOnlyText: { ...typography.caption, color: colors.warning },
  loading: { minHeight: 96, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  loadingText: { ...typography.body, color: colors.textSecondary },
  list: { gap: spacing.sm },
  document: { gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  documentCopy: { minWidth: 0, gap: spacing.xxs },
  kind: { ...typography.caption, color: colors.primary },
  documentName: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary },
  note: { ...typography.body, color: colors.textSecondary, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  documentActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  smallButton: { minHeight: 40, minWidth: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm },
  smallButtonText: { ...typography.caption, color: colors.primary },
  deleteButton: { minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  deleteText: { ...typography.caption, color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  empty: { gap: spacing.xxs, alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, padding: spacing.lg },
  emptyTitle: { ...typography.bodyStrong, color: colors.text },
  emptyText: { ...typography.caption, color: colors.textSecondary },
  feedback: { ...typography.caption, borderRadius: radius.md, padding: spacing.sm },
  success: { color: colors.success, backgroundColor: colors.successSoft },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft },
  upload: { gap: spacing.sm },
  readOnly: { ...typography.caption, color: colors.textMuted },
  confirmOverlay: { flex: 1, justifyContent: "center", backgroundColor: colors.overlay, padding: spacing.lg },
  confirmSafeArea: { width: "100%" },
  confirmCard: { width: "100%", maxWidth: 440, alignSelf: "center", gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg },
  confirmTitle: { ...typography.subtitle, color: colors.text },
  confirmText: { ...typography.body, color: colors.textSecondary },
  confirmImpact: { ...typography.caption, color: colors.warning },
  confirmDelete: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.danger },
  confirmDeleteText: { ...typography.button, color: colors.white },
});
