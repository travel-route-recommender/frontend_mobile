import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { TripRoom } from "../../../domain";
import { Card, PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { buildTripInviteUrl } from "../logic/tripInviteLinks";
import { inviteShareService, type InviteSharePayload } from "../services/inviteShareService";
import { useTripInviteHydrationState, useTripInviteStore } from "../store/useTripInviteStore";

type Confirmation = "rotate" | "disable";

export function TripInviteManagerModal({
  visible,
  trip,
  onClose,
}: {
  visible: boolean;
  trip: TripRoom;
  onClose(): void;
}) {
  const isHydrated = useTripInviteHydrationState((state) => state.isHydrated);
  const record = useTripInviteStore((state) => state.linksByTripId[trip.id]);
  const ensureInviteLink = useTripInviteStore((state) => state.ensureInviteLink);
  const rotateInviteLink = useTripInviteStore((state) => state.rotateInviteLink);
  const disableInviteLink = useTripInviteStore((state) => state.disableInviteLink);
  const [feedback, setFeedback] = useState("");
  const [busyAction, setBusyAction] = useState<string>();
  const [confirmation, setConfirmation] = useState<Confirmation>();

  useEffect(() => {
    if (visible && isHydrated && !record) ensureInviteLink(trip.id);
  }, [ensureInviteLink, isHydrated, record, trip.id, visible]);

  const inviteUrl = record?.status === "active" ? buildTripInviteUrl(record) : undefined;
  const payload = useMemo<InviteSharePayload | undefined>(() => inviteUrl && record ? {
    inviteUrl,
    tripTitle: trip.title,
    code: record.code,
  } : undefined, [inviteUrl, record, trip.title]);

  const runShareAction = async (name: string, action: (value: InviteSharePayload) => Promise<{ message: string }>) => {
    if (!payload || busyAction) return;
    setBusyAction(name);
    setFeedback("");
    try {
      const result = await action(payload);
      setFeedback(result.message);
    } catch (reason: unknown) {
      setFeedback(reason instanceof Error ? reason.message : "공유 기능을 열지 못했어요.");
    } finally {
      setBusyAction(undefined);
    }
  };

  const confirmManagement = () => {
    if (confirmation === "rotate") {
      rotateInviteLink(trip.id);
      setFeedback("새 초대 링크를 만들었어요. 이전 링크는 이 기기의 mock 데이터에서 사용할 수 없어요.");
    } else if (confirmation === "disable") {
      disableInviteLink(trip.id);
      setFeedback("초대 링크 사용을 중지했어요.");
    }
    setConfirmation(undefined);
  };

  const close = () => {
    setFeedback("");
    setBusyAction(undefined);
    setConfirmation(undefined);
    onClose();
  };

  return <Modal visible={visible} transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={close}>
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.overlay}>
      <Card style={styles.modal}>
        <View style={styles.header}>
          <View style={styles.flex}><Text style={styles.title}>동행자 초대</Text><Text style={styles.body}>링크를 받은 사람이 참여를 확인하면 여행방 멤버로 추가돼요.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="동행자 초대 닫기" onPress={close} style={styles.close}><Text style={styles.closeText}>닫기</Text></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {!isHydrated ? <View style={styles.infoBox}><Text style={styles.body}>저장된 초대 링크를 불러오고 있어요.</Text></View> : null}

          {isHydrated && record?.status === "active" && payload ? <>
            <View style={styles.linkCard}>
              <View style={styles.statusRow}><Text style={styles.codeLabel}>초대 코드</Text><Text style={styles.activeBadge}>사용 중</Text></View>
              <Text selectable style={styles.code}>{record.code}</Text>
              <Text selectable style={styles.link}>{payload.inviteUrl}</Text>
              <Text style={styles.caption}>앱이 설치된 기기에서 열리는 두리 전용 링크예요.</Text>
            </View>
            <View style={styles.actions}>
              <PrimaryButton label="초대 링크 공유" loading={busyAction === "share"} disabled={Boolean(busyAction)} onPress={() => runShareAction("share", inviteShareService.shareLink)} />
              <SecondaryButton label="링크 복사" disabled={Boolean(busyAction)} onPress={() => runShareAction("copy", inviteShareService.copyLink)} />
            </View>
          </> : null}

          {isHydrated && record?.status === "disabled" ? <View style={styles.disabledCard}>
            <Text style={styles.sectionTitle}>현재 초대 링크가 중지됐어요</Text>
            <Text style={styles.body}>기존 링크는 이 기기의 프론트 mock에서 참여할 수 없습니다. 새 링크가 필요하면 다시 발급하세요.</Text>
            <PrimaryButton label="새 초대 링크 만들기" onPress={() => {
              ensureInviteLink(trip.id);
              setFeedback("새 초대 링크를 만들었어요.");
            }} />
          </View> : null}

          {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}

          {record?.status === "active" ? <View style={styles.management}>
            <Text style={styles.sectionTitle}>링크 관리</Text>
            <Text style={styles.body}>새 링크를 발급하거나 현재 링크 사용을 중지할 수 있어요.</Text>
            {confirmation ? <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>{confirmation === "rotate" ? "새 링크로 교체할까요?" : "초대 링크를 중지할까요?"}</Text>
              <Text style={styles.caption}>{confirmation === "rotate" ? "현재 링크는 로컬 mock에서 즉시 무효화됩니다." : "다시 초대하려면 새 링크를 발급해야 합니다."}</Text>
              <View style={styles.confirmRow}>
                <Pressable accessibilityRole="button" onPress={() => setConfirmation(undefined)} style={styles.confirmButton}><Text style={styles.cancelText}>취소</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={confirmManagement} style={[styles.confirmButton, styles.dangerButton]}><Text style={styles.dangerButtonText}>{confirmation === "rotate" ? "교체" : "중지"}</Text></Pressable>
              </View>
            </View> : <View style={styles.managementRow}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmation("rotate")} style={({ pressed }) => [styles.managementButton, pressed && styles.pressed]}><Text style={styles.managementText}>새 링크 발급</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setConfirmation("disable")} style={({ pressed }) => [styles.managementButton, styles.dangerOutline, pressed && styles.pressed]}><Text style={styles.dangerText}>링크 사용 중지</Text></Pressable>
            </View>}
          </View> : null}

          <View style={styles.mockNotice}>
            <Text style={styles.mockTitle}>현재는 프론트 mock 방식이에요</Text>
            <Text style={styles.caption}>링크 발급·교체·중지 상태는 이 기기에만 저장됩니다. 다른 기기에서 실제 여행방 데이터를 조회하고 폐기 상태를 공유하는 기능은 추후 Invite API 연결이 필요해요.</Text>
          </View>
          <SecondaryButton label="닫기" onPress={close} />
        </ScrollView>
      </Card>
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay, padding: spacing.lg },
  modal: { width: "100%", maxWidth: 560, maxHeight: "92%", alignSelf: "center", gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  flex: { flex: 1 },
  title: { ...typography.title, color: colors.text },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  body: { ...typography.body, color: colors.textSecondary },
  caption: { ...typography.caption, color: colors.textSecondary },
  close: { minWidth: 48, minHeight: 44, alignItems: "center", justifyContent: "center" },
  closeText: { ...typography.caption, color: colors.primary },
  content: { gap: spacing.md, paddingBottom: spacing.xs },
  infoBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  linkCard: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  codeLabel: { ...typography.caption, color: colors.textSecondary },
  activeBadge: { ...typography.caption, color: colors.success, backgroundColor: colors.successSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  code: { ...typography.title, color: colors.primary, letterSpacing: 2 },
  link: { ...typography.caption, color: colors.primary },
  actions: { gap: spacing.sm },
  disabledCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  feedback: { ...typography.caption, color: colors.primary, textAlign: "center" },
  management: { gap: spacing.sm, paddingTop: spacing.xs },
  managementRow: { flexDirection: "row", gap: spacing.sm },
  managementButton: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  managementText: { ...typography.caption, color: colors.text },
  dangerOutline: { borderColor: colors.danger },
  dangerText: { ...typography.caption, color: colors.danger },
  warningBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  warningTitle: { ...typography.bodyStrong, color: colors.warning },
  confirmRow: { flexDirection: "row", gap: spacing.sm },
  confirmButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface },
  dangerButton: { backgroundColor: colors.danger },
  cancelText: { ...typography.caption, color: colors.textSecondary },
  dangerButtonText: { ...typography.caption, color: colors.white },
  mockNotice: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  mockTitle: { ...typography.bodyStrong, color: colors.warning },
  pressed: { opacity: 0.82 },
});
