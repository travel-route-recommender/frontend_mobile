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
  const tripTitle = useDuriStore((state) => response.roomTitle ?? state.tripsById[response.roomId]?.title ?? "두리 여행");
  const isHydrated = useTripInviteHydrationState((state) => state.isHydrated);
  const record = useTripInviteStore((state) => state.linksByTripId[response.roomId]);
  const ensureInviteLink = useTripInviteStore((state) => state.ensureInviteLink);
  useEffect(() => {
    if (response.source !== "api" && isHydrated && !record) ensureInviteLink(response.roomId);
  }, [ensureInviteLink, isHydrated, record, response.roomId, response.source]);
  const inviteUrl = response.source === "api"
    ? response.inviteUrl
    : record?.status === "active" ? buildTripInviteUrl(record) : undefined;
  const inviteCode = response.source === "api" ? response.inviteCode : record?.code;
  const payload = useMemo<InviteSharePayload | undefined>(() => inviteUrl && inviteCode ? {
    inviteUrl,
    tripTitle,
    code: inviteCode,
  } : undefined, [inviteCode, inviteUrl, tripTitle]);

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
      <Text selectable style={styles.code}>{inviteCode ?? "준비 중"}</Text>
      <Text selectable style={styles.link}>{inviteUrl ?? "초대 링크를 준비하고 있어요."}</Text>
      <Text style={styles.caption}>{response.source === "api" ? "서버 초대 코드입니다. 링크를 받은 사용자는 로그인 또는 게스트 참여 후 같은 여행방에 들어올 수 있어요." : "설치된 앱을 여는 프론트 데모 링크입니다."}</Text>
    </Card>
    {response.warnings?.length ? <Card style={styles.warningCard}>{response.warnings.map((warning) => <Text key={warning} accessibilityRole="alert" style={styles.warningText}>• {warning}</Text>)}</Card> : null}
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
  warningCard: { gap: spacing.xs, backgroundColor: colors.warningSoft },
  warningText: { ...typography.caption, color: colors.warning },
  feedback: { ...typography.caption, color: colors.primary, textAlign: "center", marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
