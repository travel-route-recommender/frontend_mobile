import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, Card, PrimaryButton, Screen, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getTripDates } from "../../../utils/schedule";
import { ScheduleDiffView } from "../components/ScheduleDiffView";
import { ScheduleSnapshot } from "../components/ScheduleSnapshot";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { SuggestionApplyConfirmModal } from "../components/SuggestionApplyConfirmModal";
import { SuggestionChangeCard } from "../components/SuggestionChangeCard";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../logic/analysisSnapshot";
import { createDuriSuggestionPreview } from "../logic/suggestionPreview";
import { buildDuriAnalysisInputFromState } from "../selectors/duriSelectors";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";

export function DuriSuggestionPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; suggestionId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const suggestionId = Array.isArray(params.suggestionId) ? params.suggestionId[0] : params.suggestionId ?? "";
  const source = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    usersById: state.usersById,
    placesById: state.placesById,
    tripsById: state.tripsById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
  })));
  const feature = useDuriAnalysisStore(useShallow((state) => ({
    session: state.sessionsByTripId[tripId],
    suggestions: state.suggestionsByTripId[tripId],
    receipt: state.receiptsBySuggestionId[suggestionId],
  })));
  const envelope = feature.suggestions?.find((entry) => entry.suggestion.id === suggestionId);
  const trip = source.tripsById[tripId];
  const currentInput = useMemo(() => buildDuriAnalysisInputFromState(source, tripId), [source, tripId]);
  const currentFingerprint = useMemo(() => currentInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(currentInput)) : "", [currentInput]);
  const stale = Boolean(envelope && envelope.baseFingerprint !== currentFingerprint);
  const preview = useMemo(() => envelope && trip ? createDuriSuggestionPreview({
    envelope,
    tripDates: getTripDates(trip.startDate, trip.endDate),
    placesById: feature.session?.snapshot.placesById ?? source.placesById,
    candidates: feature.session?.snapshot.candidates ?? source.candidatesByTripId[tripId] ?? [],
  }) : undefined, [envelope, feature.session, source.candidatesByTripId, source.placesById, trip, tripId]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  const reanalyze = () => router.replace({ pathname: "/trips/[tripId]/analysis", params: { tripId } });

  const apply = async () => {
    if (!envelope || !preview?.validation.valid || stale || feature.receipt || applying) return;
    setApplying(true);
    setApplyError("");
    try {
      const result = useDuriStore.getState().applyDuriSuggestionAtomically({
        tripId,
        envelope,
        expectedFingerprint: envelope.baseFingerprint,
        appliedByUserId: source.currentUserId,
      });
      if (!result.ok) {
        setApplyError(result.message);
        setConfirmOpen(false);
        return;
      }
      useDuriAnalysisStore.getState().recordReceipt(result.receipt);
      setConfirmOpen(false);
      router.replace({ pathname: "/trips/[tripId]/workspace", params: { tripId, duriApplied: "1", affectedDate: result.receipt.affectedDates[0] ?? "" } });
    } finally {
      setApplying(false);
    }
  };

  if (!trip || !envelope || !feature.session || !preview) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message="이 제안은 현재 분석 세션에서 찾을 수 없어요. 분석 리포트에서 다시 생성해 주세요." onRetry={reanalyze} /></Screen>;
  if (!trip.members.some((member) => member.userId === source.currentUserId)) return <Screen><AppHeader title="두리 제안" onBack={() => router.back()} /><ErrorState message="이 여행방의 제안을 볼 권한이 없어요." /></Screen>;

  const canEdit = trip.status !== "completed" && trip.members.some((member) => member.userId === source.currentUserId);
  const disabledReason = feature.receipt
    ? "이미 적용한 제안이에요."
    : stale
      ? "현재 일정과 제안 fingerprint가 달라요."
      : !preview.validation.valid
        ? preview.validation.message
        : !canEdit
          ? "이 여행방을 편집할 권한이 없어요."
          : "";

  return <Screen testID="duri-suggestion-preview-screen">
    <AppHeader title="제안 미리보기" subtitle="적용 전 변경 내용을 확인하세요" onBack={() => router.back()} />
    <Card style={styles.hero}><Text style={styles.eyebrow}>DURI SUGGESTION</Text><Text style={styles.title}>{envelope.suggestion.title}</Text><Text style={styles.summary}>{envelope.suggestion.summary}</Text><Text style={styles.reason}>{envelope.suggestion.reason}</Text></Card>

    {stale || feature.receipt ? <StaleSuggestionNotice onReanalyze={reanalyze} /> : null}
    {applyError ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>제안을 적용하지 않았어요</Text><Text style={styles.errorText}>{applyError}</Text></View> : null}
    {!preview.validation.valid ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>미리보기를 만들 수 없어요</Text><Text style={styles.errorText}>{preview.validation.message}</Text></View> : null}

    <View style={styles.section}><Text style={styles.sectionTitle}>변경 요약</Text>{envelope.suggestion.changes.map((change, index) => <SuggestionChangeCard key={`${change.itemId ?? "change"}-${index}`} change={change} placesById={feature.session?.snapshot.placesById ?? source.placesById} />)}</View>

    <ScheduleSnapshot label="변경 전 일정" items={preview.before} placesById={feature.session.snapshot.placesById} startDate={trip.startDate} endDate={trip.endDate} />
    <ScheduleSnapshot label="변경 후 예상 일정" items={preview.after} placesById={feature.session.snapshot.placesById} startDate={trip.startDate} endDate={trip.endDate} />
    <ScheduleDiffView diff={preview.diff} />

    <View style={styles.section}><Text style={styles.sectionTitle}>계산 가능한 기대 효과</Text>{preview.impact.metrics.length ? preview.impact.metrics.map((metric) => <View key={metric.id} style={styles.impact}><Text style={styles.impactLabel}>{metric.label}</Text><Text style={styles.impactValue}>{metric.before}{metric.unit} → {metric.after}{metric.unit}</Text></View>) : <Text style={styles.noImpact}>시간 충돌·날짜별 개수·공동 후보 배치에서 달라지는 수치가 없어요. 계산하지 않은 만족도나 이동시간 효과는 표시하지 않아요.</Text>}</View>

    <View style={styles.notice}><Text style={styles.noticeTitle}>적용 전 확인</Text><Text style={styles.noticeText}>실제 이동시간·도로 경로·영업시간은 확인하지 않았어요. 확인 버튼을 누른 뒤에도 전체 validation이 성공한 경우에만 일정 Store를 한 번 갱신해요.</Text></View>
    {disabledReason ? <Text accessibilityRole="alert" style={styles.disabledReason}>적용 불가 · {disabledReason}</Text> : null}
    <PrimaryButton label="제안 적용 확인" disabled={Boolean(disabledReason)} onPress={() => setConfirmOpen(true)} />
    <SecondaryButton label="취소하고 리포트로" onPress={() => router.back()} />

    <SuggestionApplyConfirmModal visible={confirmOpen} title={envelope.suggestion.title} affectedDates={preview.affectedDates} loading={applying} onCancel={() => { if (!applying) setConfirmOpen(false); }} onConfirm={apply} />
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs, backgroundColor: "#F8FBFF" },
  eyebrow: { ...typography.caption, color: colors.primary },
  title: { ...typography.title, color: colors.text },
  summary: { ...typography.body, color: colors.textSecondary },
  reason: { ...typography.caption, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: colors.text },
  impact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  impactLabel: { flex: 1, ...typography.bodyStrong, color: colors.text },
  impactValue: { ...typography.bodyStrong, color: colors.primary },
  noImpact: { ...typography.caption, color: colors.textSecondary, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  notice: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.primarySoft, padding: spacing.md },
  noticeTitle: { ...typography.bodyStrong, color: colors.primary },
  noticeText: { ...typography.caption, color: colors.textSecondary },
  error: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorTitle: { ...typography.bodyStrong, color: colors.danger },
  errorText: { ...typography.caption, color: colors.textSecondary },
  disabledReason: { ...typography.caption, color: colors.warning, textAlign: "center" },
});
