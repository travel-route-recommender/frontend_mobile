import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar, Card, PrimaryButton, SecondaryButton } from "../../../../components/common";
import { radius } from "../../../../theme/tokens";
import type { RoomPreferenceResponseSummary } from "../../selectors";
import { MemberPreferenceStatusRow } from "./MemberPreferenceStatusRow";
import { PendingPreferenceNotice } from "./PendingPreferenceNotice";

interface PreferenceResponseSummaryCardProps {
  summary: RoomPreferenceResponseSummary;
  currentUserId: string | null;
  onStartMyTest?: () => void;
  onViewMyResult?: () => void;
  onRetakeMyTest?: () => void;
}

export function PreferenceResponseSummaryCard({ summary, currentUserId, onStartMyTest, onViewMyResult, onRetakeMyTest }: PreferenceResponseSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const currentMember = summary.members.find((member) => member.userId === currentUserId);
  const outstandingMembers = summary.members.filter((member) => member.state !== "completed");
  return <Card style={styles.card}>
    <View style={styles.members}>{summary.members.map((member, index) => <View key={member.userId || `missing-member-${index}`} accessibilityLabel={`${member.name}, ${member.state === "completed" ? "응답 완료" : "아직 응답 전"}`} style={styles.member}>
      <Avatar name={member.initial || member.name} uri={member.profileImageUrl} size={34} />
      <Text numberOfLines={1} style={styles.memberName}>{member.name}{member.isCurrentUser ? " · 나" : ""}</Text>
      <View style={[styles.state, member.state === "completed" ? styles.stateComplete : styles.statePending]}><Text style={[styles.stateText, member.state === "completed" ? styles.stateTextComplete : styles.stateTextPending]}>{member.state === "completed" ? "응답 완료" : "미응답"}</Text></View>
    </View>)}</View>

    {outstandingMembers.length ? <Text style={styles.pendingCopy}>{outstandingMembers.map((member) => member.name).join(", ")}님의 응답을 기다리고 있어요.</Text> : <Text style={styles.completeCopy}>모든 멤버의 여행 성향이 준비됐어요.</Text>}

    {currentMember?.state === "completed" && onViewMyResult ? <Pressable accessibilityRole="button" onPress={onViewMyResult} style={({ pressed }) => [styles.resultButton, pressed && styles.pressed]}><Text style={styles.resultButtonText}>내 성향 보기</Text><Text style={styles.resultButtonText}>→</Text></Pressable>
      : currentMember && onStartMyTest ? <PrimaryButton accessibilityLabel="내 여행 성향 테스트 하기" label="내 여행 성향 테스트 하기" onPress={onStartMyTest} /> : null}

    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.disclosure}><Text style={styles.disclosureText}>{expanded ? "응답 상세 접기" : "멤버 응답 상세 보기"}</Text><Text style={styles.disclosureText}>{expanded ? "⌃" : "⌄"}</Text></Pressable>
    {expanded ? <View style={styles.details}>
      <View style={styles.detailMembers}>{summary.members.map((member, index) => <MemberPreferenceStatusRow key={member.userId || `missing-detail-${index}`} member={member} />)}</View>
      <PendingPreferenceNotice members={outstandingMembers} />
      {currentMember?.state === "completed" && onRetakeMyTest ? <SecondaryButton label="테스트 다시 하기" onPress={onRetakeMyTest} /> : null}
    </View> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: 13, marginTop: 12, borderColor: "#DCE7F7", padding: 16 },
  members: { flexDirection: "row", gap: 8 },
  member: { flex: 1, minWidth: 0, alignItems: "center", gap: 5, borderRadius: 14, backgroundColor: "#F7FAFF", paddingVertical: 10, paddingHorizontal: 4 },
  memberName: { width: "100%", color: "#17265F", fontSize: 10, lineHeight: 14, fontWeight: "800", textAlign: "center" },
  state: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 4 },
  stateComplete: { backgroundColor: "#EAF7EE" }, statePending: { backgroundColor: "#FFF0E2" },
  stateText: { fontSize: 9, lineHeight: 12, fontWeight: "800" }, stateTextComplete: { color: "#2E9B66" }, stateTextPending: { color: "#D67B24" },
  pendingCopy: { color: "#60719B", fontSize: 11, lineHeight: 17, fontWeight: "600", textAlign: "center" },
  completeCopy: { color: "#2E9B66", fontSize: 11, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  resultButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 13, borderWidth: 1, borderColor: "#4388FF", paddingHorizontal: 14 },
  resultButtonText: { color: "#4388FF", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  disclosure: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, disclosureText: { color: "#60719B", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  details: { gap: 12, borderTopWidth: 1, borderTopColor: "#DCE7F7", paddingTop: 13 }, detailMembers: { gap: 12 }, pressed: { opacity: 0.8 },
});
