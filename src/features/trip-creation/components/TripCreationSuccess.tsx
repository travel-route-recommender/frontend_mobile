import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, spacing, typography } from "../../../theme/tokens";
import { buildTripInviteUrl } from "../../invitations/logic/tripInviteLinks";
import { useTripInviteHydrationState, useTripInviteStore } from "../../invitations/store/useTripInviteStore";
import type { CreateTripRoomResponse } from "../services/createTripRoomService";
import { inviteShareService, type InviteSharePayload } from "../services/inviteShareService";

type Props = {
  response: CreateTripRoomResponse;
  onEnterRoom(): void;
};

export function TripCreationSuccess({ response, onEnterRoom }: Props) {
  const [feedback, setFeedback] = useState("");
  const tripTitle = useDuriStore((state) => state.tripsById[response.roomId]?.title ?? "두리 여행");
  const isHydrated = useTripInviteHydrationState((state) => state.isHydrated);
  const record = useTripInviteStore((state) => state.linksByTripId[response.roomId]);
  const ensureInviteLink = useTripInviteStore((state) => state.ensureInviteLink);
  useEffect(() => {
    if (isHydrated && !record) ensureInviteLink(response.roomId);
  }, [ensureInviteLink, isHydrated, record, response.roomId]);
  const inviteUrl = record?.status === "active" ? buildTripInviteUrl(record) : undefined;
  const payload = useMemo<InviteSharePayload | undefined>(() => inviteUrl && record ? {
    inviteUrl,
    tripTitle,
    code: record.code,
  } : undefined, [inviteUrl, record, tripTitle]);

  const runShareAction = async (action: (value: InviteSharePayload) => Promise<{ message: string }>) => {
    if (!payload) return;
    setFeedback("");
    try {
      const result = await action(payload);
      setFeedback(result.message);
    } catch (reason: unknown) {
      setFeedback(reason instanceof Error ? reason.message : "공유 기능을 열지 못했어요. 여행방에는 바로 들어갈 수 있어요.");
    }
  };

  return <Screen testID="create-trip-success">
    <AppHeader title="여행방 생성 완료" onBack={onEnterRoom} />
    <View style={styles.hero}><Text style={styles.sparkle}>✦</Text><Text style={styles.title}>여행방이 만들어졌어요!</Text><Text style={styles.body}>동행자를 지금 초대하거나, 먼저 여행방에 들어가 계획을 시작할 수 있어요.</Text></View>
    <Card style={styles.inviteCard}>
      <Text style={styles.sectionTitle}>초대 링크</Text>
      <Text selectable style={styles.code}>{record?.code ?? "준비 중"}</Text>
      <Text selectable style={styles.link}>{inviteUrl ?? "초대 링크를 준비하고 있어요."}</Text>
      <Text style={styles.caption}>설치된 앱을 여는 프론트 mock 링크입니다. 다른 기기 간 실제 방 조회는 Invite API 연결 후 지원해요.</Text>
    </Card>
    {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
    <View style={styles.actions}>
      <SecondaryButton label="초대 링크 공유" disabled={!payload} onPress={() => runShareAction(inviteShareService.shareLink)} />
      <SecondaryButton label="초대 링크 복사" disabled={!payload} onPress={() => runShareAction(inviteShareService.copyLink)} />
      <PrimaryButton label="여행방으로 이동" onPress={onEnterRoom} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  sparkle: { fontSize: 44, color: colors.primary },
  title: { ...typography.title, color: colors.text, textAlign: "center" },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  inviteCard: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  code: { ...typography.title, color: colors.primary, letterSpacing: 2 },
  link: { ...typography.caption, color: colors.primary },
  caption: { ...typography.caption, color: colors.textSecondary },
  feedback: { ...typography.caption, color: colors.primary, textAlign: "center", marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
