import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { colors, spacing, typography } from "../../../theme/tokens";
import type { CreateTripRoomResponse } from "../services/createTripRoomService";
import { buildMockInviteUrl, inviteShareService } from "../services/inviteShareService";

type Props = {
  response: CreateTripRoomResponse;
  onEnterRoom(): void;
};

export function TripCreationSuccess({ response, onEnterRoom }: Props) {
  const [feedback, setFeedback] = useState("");
  const inviteUrl = buildMockInviteUrl(response.inviteToken ?? `mock-${response.roomId}`);

  const runShareAction = async (action: () => Promise<{ message: string }>) => {
    setFeedback("");
    try {
      const result = await action();
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
      <Text selectable style={styles.link}>{inviteUrl}</Text>
      <Text style={styles.caption}>`.invalid` 도메인을 사용하는 프론트 mock 링크입니다. 운영 링크가 아니에요.</Text>
    </Card>
    {feedback ? <Text accessibilityRole="alert" style={styles.feedback}>{feedback}</Text> : null}
    <View style={styles.actions}>
      <SecondaryButton label="카카오톡으로 초대하기" onPress={() => runShareAction(() => inviteShareService.shareToKakao(inviteUrl))} />
      <SecondaryButton label="초대 링크 복사" onPress={() => runShareAction(() => inviteShareService.copyLink(inviteUrl))} />
      <SecondaryButton label="다른 앱으로 공유" onPress={() => runShareAction(() => inviteShareService.shareNative(inviteUrl))} />
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
  link: { ...typography.caption, color: colors.primary },
  caption: { ...typography.caption, color: colors.textSecondary },
  feedback: { ...typography.caption, color: colors.primary, textAlign: "center", marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
});
