import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { BackendScheduleTicket } from "../services/workspaceScheduleContract";

export function ApiScheduleTicketManager({
  tickets,
  disabled,
  onUpload,
  onOpen,
  onDelete,
}: {
  tickets: readonly BackendScheduleTicket[];
  disabled: boolean;
  onUpload: (note: string) => Promise<boolean>;
  onOpen: (ticket: BackendScheduleTicket) => void;
  onDelete: (ticket: BackendScheduleTicket) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const upload = async () => {
    if (disabled || uploading) return;
    setUploading(true);
    try {
      if (await onUpload(note)) setNote("");
    } finally {
      setUploading(false);
    }
  };
  const remove = async (ticket: BackendScheduleTicket) => {
    if (disabled || deletingId) return;
    setDeletingId(ticket.id);
    try {
      if (await onDelete(ticket)) setPendingDeleteId(undefined);
    } finally {
      setDeletingId(undefined);
    }
  };

  return <View style={styles.container}>
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <Text style={styles.title}>서버 입장권 이미지</Text>
        <Text style={styles.description}>동행자와 공유되는 JPG·PNG·WEBP·HEIC·HEIF 이미지이며 항목당 최대 10장, 장당 5MB예요.</Text>
      </View>
      <Text style={styles.count}>{tickets.length}/10</Text>
    </View>
    {tickets.length ? <View style={styles.list}>{tickets.map((ticket) => <View key={ticket.id} style={styles.ticket}>
      <View style={styles.ticketCopy}>
        <Text numberOfLines={1} style={styles.ticketName}>{ticket.originalName?.trim() || "입장권 이미지"}</Text>
        {ticket.note ? <Text numberOfLines={2} style={styles.ticketNote}>{ticket.note}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={!ticket.resolvedImageUrl || disabled} onPress={() => onOpen(ticket)} style={({ pressed }) => [styles.action, pressed && styles.pressed, (!ticket.resolvedImageUrl || disabled) && styles.disabled]}><Text style={styles.actionText}>보기</Text></Pressable>
        {pendingDeleteId === ticket.id ? <>
          <Pressable accessibilityRole="button" disabled={disabled || Boolean(deletingId)} onPress={() => void remove(ticket)} style={({ pressed }) => [styles.action, styles.deleteAction, pressed && styles.pressed, (disabled || Boolean(deletingId)) && styles.disabled]}><Text style={styles.deleteText}>{deletingId === ticket.id ? "삭제 중…" : "삭제 확정"}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={Boolean(deletingId)} onPress={() => setPendingDeleteId(undefined)} style={({ pressed }) => [styles.action, pressed && styles.pressed, Boolean(deletingId) && styles.disabled]}><Text style={styles.actionText}>취소</Text></Pressable>
        </> : <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setPendingDeleteId(ticket.id)} style={({ pressed }) => [styles.action, styles.deleteAction, pressed && styles.pressed, disabled && styles.disabled]}><Text style={styles.deleteText}>삭제</Text></Pressable>}
      </View>
    </View>)}</View> : <Text style={styles.empty}>이 일정에 서버 입장권 이미지가 아직 없어요.</Text>}
    <TextField label="티켓 메모 (선택)" value={note} onChangeText={setNote} maxLength={200} placeholder="예: 15:00 입장 QR" />
    <Pressable accessibilityRole="button" disabled={disabled || uploading || tickets.length >= 10} onPress={() => void upload()} style={({ pressed }) => [styles.upload, pressed && styles.pressed, (disabled || uploading || tickets.length >= 10) && styles.disabled]}><Text style={styles.uploadText}>{uploading ? "업로드 중…" : tickets.length >= 10 ? "최대 10장 등록됨" : "티켓 이미지 선택"}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xxs },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  count: { ...typography.caption, color: colors.primary },
  list: { gap: spacing.xs },
  ticket: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.background, padding: spacing.sm },
  ticketCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  ticketName: { ...typography.bodyStrong, color: colors.text },
  ticketNote: { ...typography.caption, color: colors.textSecondary },
  actions: { flexDirection: "row", gap: spacing.xs },
  action: { minHeight: 38, justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm },
  deleteAction: { backgroundColor: colors.dangerSoft },
  actionText: { ...typography.caption, color: colors.primary },
  deleteText: { ...typography.caption, color: colors.danger },
  empty: { ...typography.caption, color: colors.textSecondary },
  upload: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary },
  uploadText: { ...typography.bodyStrong, color: colors.surface },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
