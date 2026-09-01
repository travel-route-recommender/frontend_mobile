import { StyleSheet, Text, View } from "react-native";
import type { Place } from "../../../domain";
import type { ScheduleChangePreview, ScheduleChangeState } from "../../../duri/duri-suggestions";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getEndTime } from "../../../utils/schedule";
import { DuriKoreanText } from "./DuriKoreanText";

const actionLabel = { add: "추가", remove: "삭제", move: "이동", resize: "시간 변경", replace: "장소 대체" } as const;

function stateLabel(state: ScheduleChangeState | undefined, placesById: Record<string, Place>) {
  if (!state) return "해당 없음";
  const name = state.placeId ? placesById[state.placeId]?.name ?? "알 수 없는 장소" : state.note ?? (state.itemType === "rest" ? "휴식 시간" : state.itemType === "meal" ? "식사 시간" : "일정");
  const time = state.startTime && state.durationMinutes ? `${state.startTime}~${getEndTime(state.startTime, state.durationMinutes)}` : state.startTime ?? "시간 유지";
  return `${name} · ${state.date ?? "날짜 유지"} · ${time}`;
}

export function SuggestionChangeCard({ change, placesById }: { change: ScheduleChangePreview; placesById: Record<string, Place> }) {
  return <View accessibilityLabel={`${actionLabel[change.action]}. 변경 전 ${stateLabel(change.before, placesById)}. 변경 후 ${stateLabel(change.after, placesById)}`} style={styles.card}>
    <Text style={styles.action}>{actionLabel[change.action]}</Text>
    <View style={styles.state}><Text style={styles.label}>변경 전</Text><DuriKoreanText style={styles.value}>{stateLabel(change.before, placesById)}</DuriKoreanText></View>
    <View style={styles.state}><Text style={styles.label}>변경 후</Text><DuriKoreanText style={styles.value}>{stateLabel(change.after, placesById)}</DuriKoreanText></View>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  action: { alignSelf: "flex-start", ...typography.caption, color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill },
  state: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.caption, color: colors.text },
});
