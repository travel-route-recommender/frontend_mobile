import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { useTravelDocumentAvailability } from "../hooks/useTravelDocumentAvailability";
import { useTripDocumentHydrationState, useTripDocumentStore } from "../store/useTripDocumentStore";
import { getTravelDocumentKindLabel, type TravelDocument } from "../types";
import { TravelDocumentAddModal } from "./TravelDocumentAddModal";

const EMPTY_DOCUMENTS: TravelDocument[] = [];

export function ItineraryAttachmentPicker({
  tripId,
  currentUserId,
  selectedDocumentIds,
  onChange,
}: {
  tripId: string;
  currentUserId: string;
  selectedDocumentIds: readonly string[];
  onChange: (documentIds: string[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const documents = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_DOCUMENTS);
  const isHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const availableById = useTravelDocumentAvailability(documents);
  const selected = new Set(selectedDocumentIds);

  const toggle = (documentId: string) => {
    onChange(selected.has(documentId)
      ? selectedDocumentIds.filter((id) => id !== documentId)
      : [...selectedDocumentIds, documentId]);
  };

  return <View style={styles.section}>
    <View style={styles.heading}><View style={styles.headingCopy}><Text style={styles.title}>입장권·예약 문서</Text><Text style={styles.description}>일정과 연결해 여행 중 바로 찾을 수 있어요. {Platform.OS === "web" ? "웹에서는 현재 탭에만 유지됩니다." : "파일은 이 기기에만 저장됩니다."}</Text></View><Text style={styles.count}>{selectedDocumentIds.length}개 연결</Text></View>
    {!isHydrated ? <Text style={styles.empty}>문서함을 불러오는 중이에요.</Text> : documents.length ? <View style={styles.options}>{documents.map((document) => {
      const checked = selected.has(document.id);
      const availability = availableById[document.id];
      const available = availability === true;
      const canToggle = checked || available;
      return <Pressable
        key={document.id}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !canToggle }}
        disabled={!canToggle}
        onPress={() => toggle(document.id)}
        style={({ pressed }) => [styles.option, checked && styles.optionSelected, !canToggle && styles.disabled, pressed && styles.pressed]}
      ><Text style={[styles.check, checked && styles.checkSelected]}>{checked ? "✓" : "○"}</Text><View style={styles.optionCopy}><Text numberOfLines={1} style={styles.name}>{document.displayName}</Text><Text style={styles.meta}>{getTravelDocumentKindLabel(document.kind)}{availability === undefined ? " · 파일 확인 중" : available ? "" : " · 다시 선택 필요"}</Text></View></Pressable>;
    })}</View> : <Text style={styles.empty}>문서함에 등록된 파일이 없어요.</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isHydrated }} disabled={!isHydrated} onPress={() => setAddOpen(true)} style={({ pressed }) => [styles.addButton, !isHydrated && styles.disabled, pressed && styles.pressed]}><Text style={styles.addButtonText}>+ 새 문서 추가</Text></Pressable>
    <TravelDocumentAddModal
      visible={addOpen}
      tripId={tripId}
      currentUserId={currentUserId}
      onClose={() => setAddOpen(false)}
      onAdded={(document) => onChange([...selectedDocumentIds, document.id])}
    />
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xxs },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.caption, color: colors.textSecondary },
  count: { ...typography.caption, color: colors.primary },
  options: { gap: spacing.xs },
  option: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  check: { ...typography.subtitle, color: colors.textMuted },
  checkSelected: { color: colors.primary },
  optionCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary },
  empty: { ...typography.caption, color: colors.textMuted, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  addButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary },
  addButtonText: { ...typography.bodyStrong, color: colors.primary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
