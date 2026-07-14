import { StyleSheet, Text, View } from "react-native";
import { Card, PrimaryButton, SecondaryButton } from "../../../../components/common";
import { colors, spacing, typography } from "../../../../theme/tokens";
import type { RoomPreferenceResponseSummary } from "../../selectors";
import { MemberPreferenceStatusRow } from "./MemberPreferenceStatusRow";
import { PendingPreferenceNotice } from "./PendingPreferenceNotice";
import { PreferenceCompletionProgress } from "./PreferenceCompletionProgress";

interface PreferenceResponseSummaryCardProps {
  summary: RoomPreferenceResponseSummary;
  currentUserId: string | null;
  onStartMyTest?: () => void;
  onViewMyResult?: () => void;
  onRetakeMyTest?: () => void;
}

export function PreferenceResponseSummaryCard({ summary, currentUserId, onStartMyTest, onViewMyResult, onRetakeMyTest }: PreferenceResponseSummaryCardProps) {
  const currentMember = summary.members.find((member) => member.userId === currentUserId);
  const outstandingMembers = summary.members.filter((member) => member.state !== "completed");
  return <Card style={styles.card}>
    <PreferenceCompletionProgress completed={summary.completedCount} total={summary.totalCount} rate={summary.completionRate} />
    <Text style={styles.summary}>{summary.isComplete ? "모든 멤버의 여행 성향 응답이 준비됐어요." : "실제 저장된 개인 결과만 완료로 계산해요."}</Text>
    <View style={styles.members}>{summary.members.map((member, index) => <MemberPreferenceStatusRow key={member.userId || `missing-member-${index}`} member={member} />)}</View>
    <PendingPreferenceNotice members={outstandingMembers} />
    {currentMember?.state === "completed" ? <View style={styles.actions}>{onViewMyResult ? <PrimaryButton label="내 결과 상세 보기" onPress={onViewMyResult} /> : null}{onRetakeMyTest ? <SecondaryButton label="테스트 다시 하기" onPress={onRetakeMyTest} /> : null}</View> : currentMember && onStartMyTest ? <View style={styles.actions}><Text style={styles.myNotice}>{currentMember.state === "invalid" ? "내 결과를 다시 제출하면 그룹 진단에 반영할 수 있어요." : "내 응답은 아직 그룹 진단에 반영되지 않았어요."}</Text><PrimaryButton accessibilityLabel="내 여행 성향 테스트 하기" label="내 여행 성향 테스트 하기" onPress={onStartMyTest} /></View> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, marginTop: spacing.sm },
  summary: { ...typography.caption, color: colors.textSecondary },
  members: { gap: spacing.md },
  actions: { gap: spacing.sm },
  myNotice: { ...typography.caption, color: colors.textSecondary },
});
