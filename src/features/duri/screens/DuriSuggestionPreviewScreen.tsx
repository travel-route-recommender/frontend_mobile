import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, PrimaryButton, SecondaryButton } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { getTripDates } from "../../../utils/schedule";
import { DuriScrollPage, DuriStickyPage } from "../components/DuriPageShell";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { SuggestionApplyConfirmModal } from "../components/SuggestionApplyConfirmModal";
import { DuriSuggestionPreviewContent } from "../components/DuriSuggestionPreviewContent";
import { buildDuriAnalysisInputWithDocuments } from "../logic/analysisInput";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint } from "../logic/analysisSnapshot";
import { createDuriSuggestionPreview } from "../logic/suggestionPreview";
import { getSuggestionIssueTitles } from "../presentation/duriPresentation";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";
import { useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { buildConfirmedScheduleConstraintsFromDocuments, buildDuriDocumentReferencesFromDocuments } from "../../trip-documents";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];

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
  const tripDocuments = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS);
  const currentInput = useMemo(() => buildDuriAnalysisInputWithDocuments(source, tripId, tripDocuments), [source, tripDocuments, tripId]);
  const currentFingerprint = useMemo(() => currentInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(currentInput)) : "", [currentInput]);
  const stale = Boolean(envelope && envelope.baseFingerprint !== currentFingerprint);
  const preview = useMemo(() => envelope && trip ? createDuriSuggestionPreview({
    envelope,
    tripDates: getTripDates(trip.startDate, trip.endDate),
    placesById: feature.session?.snapshot.placesById ?? source.placesById,
    candidates: feature.session?.snapshot.candidates ?? source.candidatesByTripId[tripId] ?? [],
    trip,
    protectionInput: currentInput,
  }) : undefined, [currentInput, envelope, feature.session, source.candidatesByTripId, source.placesById, trip, tripId]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  const reanalyze = () => router.replace({ pathname: "/trips/[tripId]/analysis", params: { tripId } });

  const apply = async () => {
    if (!envelope || !preview?.validation.valid || stale || feature.receipt || applying) return;
    setApplying(true);
    setApplyError("");
    try {
      const latestDocuments = useTripDocumentStore.getState().documentsByTripId[tripId] ?? [];
      const confirmedScheduleConstraints = buildConfirmedScheduleConstraintsFromDocuments(latestDocuments).constraints;
      const result = useDuriStore.getState().applyDuriSuggestionAtomically({
        tripId,
        envelope,
        expectedFingerprint: envelope.baseFingerprint,
        appliedByUserId: source.currentUserId,
        documentReferences: buildDuriDocumentReferencesFromDocuments(latestDocuments),
        confirmedScheduleConstraints,
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

  if (!trip || !envelope || !feature.session || !preview) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={() => router.back()} /><ErrorState message="이 제안은 현재 점검 결과에서 찾을 수 없어요. DURI 일정 점검에서 다시 만들어 주세요." onRetry={reanalyze} /></DuriScrollPage>;
  if (!trip.members.some((member) => member.userId === source.currentUserId)) return <DuriScrollPage><AppHeader title="개선 제안 미리보기" onBack={() => router.back()} /><ErrorState message="이 여행방의 제안을 볼 권한이 없어요." /></DuriScrollPage>;

  const canEdit = trip.status !== "completed" && trip.members.some((member) => member.userId === source.currentUserId);
  const disabledReason = feature.receipt
    ? "이미 적용한 제안이에요."
    : stale
      ? "일정이 변경되어 제안을 다시 확인해야 해요."
      : !preview.validation.valid
        ? preview.validation.message
        : !canEdit
          ? "완료된 여행에서는 제안을 볼 수 있지만 적용할 수 없어요."
          : "";
  const suggestionIndex = Math.max((feature.suggestions?.findIndex((entry) => entry.suggestion.id === suggestionId) ?? 0) + 1, 1);
  const suggestionCount = feature.suggestions?.length ?? 1;
  const sourceIssueTitles = getSuggestionIssueTitles(feature.session, envelope.suggestion.sourceIssueIds);
  const footer = <>
    {disabledReason ? <Text accessibilityRole="alert" style={styles.disabledReason}>적용 불가 · {disabledReason}</Text> : <Text style={styles.footerScope}>{envelope.suggestion.changes.length > 1 ? `${envelope.suggestion.changes.length}개 변경을 모두 한 번에 적용해요.` : "확인한 변경 1개를 일정에 적용해요."}</Text>}
    <View style={styles.footerActions}><View style={styles.footerButton}><SecondaryButton label="적용하지 않기" disabled={applying} onPress={() => router.back()} /></View><View style={styles.footerButton}><PrimaryButton label="일정에 적용" loading={applying} disabled={Boolean(disabledReason)} onPress={() => setConfirmOpen(true)} /></View></View>
  </>;

  return <DuriStickyPage testID="duri-suggestion-preview-screen" footer={footer}>
    <AppHeader title="개선 제안 미리보기" subtitle={`제안 ${suggestionIndex}/${suggestionCount}`} onBack={() => router.back()} />

    {stale ? <StaleSuggestionNotice onReanalyze={reanalyze} /> : null}
    {feature.receipt ? <View accessibilityRole="alert" style={styles.applied}><Text style={styles.appliedTitle}>이미 일정에 적용한 제안이에요</Text><Text style={styles.appliedText}>현재 일정에서 최신 결과를 다시 점검해 주세요.</Text></View> : null}
    {applyError ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>제안을 적용하지 않았어요</Text><Text style={styles.errorText}>{applyError}</Text></View> : null}
    {!preview.validation.valid ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorTitle}>현재 일정에는 적용할 수 없어요</Text><Text style={styles.errorText}>{preview.validation.message}</Text></View> : null}

    <DuriSuggestionPreviewContent suggestion={envelope.suggestion} preview={preview} session={feature.session} trip={trip} placesById={feature.session.snapshot.placesById ?? source.placesById} sourceIssueTitles={sourceIssueTitles} />

    <SuggestionApplyConfirmModal visible={confirmOpen} title={envelope.suggestion.title} affectedDates={preview.affectedDates} changeCount={envelope.suggestion.changes.length} loading={applying} onCancel={() => { if (!applying) setConfirmOpen(false); }} onConfirm={apply} />
  </DuriStickyPage>;
}

const styles = StyleSheet.create({
  error: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorTitle: { ...typography.bodyStrong, color: colors.danger },
  errorText: { ...typography.caption, color: colors.textSecondary },
  applied: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.successSoft, padding: spacing.md },
  appliedTitle: { ...typography.bodyStrong, color: colors.success },
  appliedText: { ...typography.caption, color: colors.textSecondary },
  footerScope: { fontSize: 10, lineHeight: 15, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  disabledReason: { ...typography.caption, color: colors.warning, textAlign: "center" },
  footerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerButton: { flex: 1, minWidth: 0 },
});
