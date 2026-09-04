import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Place, TripRoom } from "../../../domain";
import type { DuriSuggestion } from "../../../duri/duri-suggestions";
import { colors, radius, shadows, sizes, spacing, typography } from "../../../theme/tokens";
import { formatDayLabel } from "../../../utils/formatters";
import { getEndTime } from "../../../utils/schedule";
import { getChangedSuggestionItems } from "../presentation/duriPresentation";
import { plainDuriUserText } from "../presentation/plainDuriUserText";
import type { DuriAnalysisSession, DuriSuggestionPreview, ScheduleDiffItem } from "../types";
import { DuriKoreanText } from "./DuriKoreanText";
import { DuriPlanningIllustration } from "./DuriPlanningIllustration";
import { ScheduleSnapshot } from "./ScheduleSnapshot";
import { SuggestionChangeCard } from "./SuggestionChangeCard";

const changeKindLabel = {
  added: "추가",
  removed: "삭제",
  moved: "날짜 이동",
  "time-changed": "시간 변경",
  reordered: "순서 변경",
  unchanged: "유지",
} as const;

export function DuriSuggestionPreviewContent({
  suggestion,
  preview,
  session,
  trip,
  placesById,
  sourceIssueTitles,
}: {
  suggestion: DuriSuggestion;
  preview: DuriSuggestionPreview;
  session: DuriAnalysisSession;
  trip: TripRoom;
  placesById: Record<string, Place>;
  sourceIssueTitles: string[];
}) {
  const { width } = useWindowDimensions();
  const compactHero = width <= 360;
  const [compareOpen, setCompareOpen] = useState(false);
  const changedItems = useMemo(() => getChangedSuggestionItems(preview), [preview]);
  const title = plainDuriUserText(suggestion.title);
  const summary = plainDuriUserText(suggestion.summary);

  return <View style={styles.content}>
    <View accessibilityLabel={`개선 제안. ${title}. ${summary}`} style={styles.hero}>
      <DuriPlanningIllustration compact={compactHero} variant="suggestion" />
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>두리의 일정 제안</Text><DuriKoreanText style={styles.heroTitle}>{title}</DuriKoreanText><DuriKoreanText style={styles.heroText}>{summary}</DuriKoreanText></View>
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>바뀌는 내용</Text><Text style={styles.sectionMeta}>{suggestion.changes.length}개 변경</Text></View>
      {suggestion.changes.map((change, index) => <SuggestionChangeCard key={`${change.itemId ?? "change"}-${index}`} change={change} placesById={placesById} />)}
    </View>

    <View style={styles.section}>
      <Text style={styles.sectionTitle}>왜 바꾸나요?</Text>
      <View style={styles.reasonCard}>
        <View style={styles.reasonRow}><View style={[styles.reasonIcon, styles.lavenderSoft]}><Text style={styles.lavenderText}>✦</Text></View><DuriKoreanText style={styles.reasonText}>{plainDuriUserText(suggestion.reason)}</DuriKoreanText></View>
        {sourceIssueTitles.map((issueTitle) => <View key={issueTitle} style={[styles.reasonRow, styles.reasonDivider]}><View style={[styles.reasonIcon, styles.peachSoft]}><Text style={styles.peachText}>!</Text></View><DuriKoreanText style={styles.reasonText}>{plainDuriUserText(issueTitle)}</DuriKoreanText></View>)}
      </View>
    </View>

    {suggestion.reviewWarnings?.length ? <View accessibilityRole="alert" style={styles.reviewWarning}>
      <Text style={styles.reviewWarningTitle}>적용 전에 직접 확인해 주세요</Text>
      {suggestion.reviewWarnings.map((warning) => <DuriKoreanText key={warning} style={styles.reviewWarningText}>• {plainDuriUserText(warning)}</DuriKoreanText>)}
    </View> : null}

    <View style={styles.section}>
      <Text style={styles.sectionTitle}>기대 효과</Text>
      {preview.impact.metrics.length ? <View style={styles.effects}>{preview.impact.metrics.map((metric) => <View key={metric.id} style={styles.effect}>
        <Text style={styles.effectLabel}>{metric.label}</Text><View style={styles.effectValues}><Text style={styles.effectBefore}>{metric.before}{metric.unit}</Text><Text style={styles.effectArrow}>→</Text><Text style={styles.effectAfter}>{metric.after}{metric.unit}</Text></View>
      </View>)}</View> : <View style={styles.noEffect}><Text style={styles.noEffectTitle}>숫자로 비교할 변화는 없어요</Text><Text style={styles.noEffectText}>확인하지 않은 만족도나 이동 효과는 추측해서 표시하지 않아요.</Text></View>}
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>영향받는 일정</Text><Text style={styles.sectionMeta}>{preview.affectedDates.length}일</Text></View>
      <View style={styles.affectedCard}>{changedItems.length ? changedItems.map((item, index) => <AffectedScheduleRow key={item.itemId} item={item} tripStartDate={trip.startDate} divided={index > 0} />) : <Text style={styles.noEffectText}>변경되는 일정이 없어요.</Text>}</View>
    </View>

    <View style={styles.compareCard}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: compareOpen }} onPress={() => setCompareOpen((value) => !value)} style={({ pressed }) => [styles.compareTrigger, pressed && styles.pressed]}>
        <View style={[styles.reasonIcon, styles.lavenderSoft]}><Text style={styles.lavenderText}>⇄</Text></View><View style={styles.flex}><Text style={styles.compareTitle}>전체 일정 비교</Text><Text style={styles.compareMeta}>변경 전 / 변경 후 전체 일정을 확인해요</Text></View><Text style={styles.chevron}>{compareOpen ? "⌃" : "›"}</Text>
      </Pressable>
      {compareOpen ? <View style={styles.compareBody}>
        <ScheduleSnapshot label="변경 전 일정" items={preview.before} placesById={session.snapshot.placesById} startDate={trip.startDate} endDate={trip.endDate} />
        <ScheduleSnapshot label="변경 후 예상 일정" items={preview.after} placesById={session.snapshot.placesById} startDate={trip.startDate} endDate={trip.endDate} />
      </View> : null}
    </View>

    <View style={styles.safety}><Text style={styles.safetyTitle}>일정은 안전하게 적용돼요</Text><Text style={styles.safetyText}>{suggestion.changes.length > 1 ? `${suggestion.changes.length}개 변경을 모두 한 번에 적용해요. ` : "이 변경을 한 번에 적용해요. "}잠금·확정 예약·연결 문서를 다시 확인하고, 모든 조건이 맞을 때만 일정을 바꿔요.</Text></View>
  </View>;
}

function AffectedScheduleRow({ item, tripStartDate, divided }: { item: ScheduleDiffItem; tripStartDate: string | null; divided: boolean }) {
  const target = item.after ?? item.before;
  const date = target?.date;
  const time = target ? `${target.startTime}–${getEndTime(target.startTime, target.durationMinutes)}` : "시간 없음";
  return <View accessibilityLabel={`${changeKindLabel[item.kind]}, ${item.placeName}, ${date ?? "날짜 없음"} ${time}`} style={[styles.affectedRow, divided && styles.affectedDivider]}>
    <View style={styles.dayBox}><Text style={styles.dayLabel}>{date ? formatDayLabel(date, tripStartDate) : "일정"}</Text><Text style={styles.dayDate}>{date?.slice(5).replace("-", ".") ?? "-"}</Text></View>
    <View style={styles.flex}><DuriKoreanText style={styles.affectedName}>{item.placeName}</DuriKoreanText><Text style={styles.affectedTime}>{time} · {target?.durationMinutes ?? 0}분</Text></View>
    <Text style={[styles.changeBadge, item.kind === "removed" ? styles.removeBadge : styles.addBadge]}>{changeKindLabel[item.kind]}</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  flex: { flex: 1 },
  hero: { minHeight: 206, flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#D9D5FF", backgroundColor: "#F3F1FF", paddingHorizontal: spacing.md, paddingTop: spacing.md, ...shadows.card },
  heroCopy: { flex: 1, alignSelf: "stretch", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  eyebrow: { ...typography.caption, color: "#735BC4", fontWeight: "900" },
  heroTitle: { fontSize: 19, lineHeight: 26, fontWeight: "900", color: "#17265F" },
  heroText: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: "#60719B" },
  section: { gap: spacing.sm },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "900", color: "#17265F" },
  sectionMeta: { ...typography.caption, color: "#8290AE" },
  reasonCard: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface },
  reasonRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  reasonDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE7F7" },
  reasonIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  reasonText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "700", color: "#17265F" },
  effects: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  effect: { flexBasis: "46%", flexGrow: 1, minWidth: 140, gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface, padding: spacing.md },
  effectLabel: { ...typography.caption, color: "#60719B" },
  effectValues: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  effectBefore: { ...typography.bodyStrong, color: "#8290AE" },
  effectArrow: { ...typography.bodyStrong, color: colors.primary },
  effectAfter: { fontSize: 17, lineHeight: 23, fontWeight: "900", color: "#2E9B66" },
  noEffect: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  noEffectTitle: { ...typography.bodyStrong, color: "#17265F" },
  noEffectText: { ...typography.caption, color: "#60719B" },
  affectedCard: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface },
  affectedRow: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm },
  affectedDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE7F7" },
  dayBox: { width: 58, alignSelf: "stretch", alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: "#F2F8FF" },
  dayLabel: { ...typography.caption, color: colors.primary, fontWeight: "900" },
  dayDate: { fontSize: 10, lineHeight: 15, fontWeight: "700", color: "#60719B" },
  affectedName: { ...typography.bodyStrong, color: "#17265F" },
  affectedTime: { ...typography.caption, color: "#60719B" },
  changeBadge: { ...typography.caption, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, overflow: "hidden" },
  addBadge: { color: "#2E9B66", backgroundColor: "#EAF7EE" },
  removeBadge: { color: colors.danger, backgroundColor: colors.dangerSoft },
  compareCard: { overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: "#DCE7F7", backgroundColor: colors.surface },
  compareTrigger: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  compareTitle: { ...typography.bodyStrong, color: "#17265F" },
  compareMeta: { ...typography.caption, color: "#60719B" },
  compareBody: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surfaceMuted, padding: spacing.sm },
  chevron: { width: sizes.icon, fontSize: 27, lineHeight: 30, color: "#60719B", textAlign: "center" },
  safety: { gap: spacing.xs, borderRadius: radius.md, backgroundColor: "#F2F8FF", padding: spacing.md },
  safetyTitle: { ...typography.bodyStrong, color: colors.primary },
  safetyText: { ...typography.caption, color: "#60719B" },
  reviewWarning: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#F1C98E", backgroundColor: colors.warningSoft, padding: spacing.md },
  reviewWarningTitle: { ...typography.bodyStrong, color: colors.warning },
  reviewWarningText: { ...typography.caption, color: colors.textSecondary },
  pressed: { opacity: 0.72 },
  lavenderSoft: { backgroundColor: "#F0EDFF" },
  lavenderText: { color: "#735BC4", fontWeight: "900" },
  peachSoft: { backgroundColor: "#FFF0E2" },
  peachText: { color: "#D67B24", fontWeight: "900" },
});
