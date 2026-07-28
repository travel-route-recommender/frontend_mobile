import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { deleteStoredTravelDocument, pickTravelDocument } from "../services/travelDocumentStorage";
import { useTripDocumentStore } from "../store/useTripDocumentStore";
import { travelDocumentKindOptions, type TravelDocument, type TravelDocumentKind } from "../types";

export function TravelDocumentAddModal({
  visible,
  tripId,
  currentUserId,
  onClose,
  onAdded,
}: {
  visible: boolean;
  tripId: string;
  currentUserId: string;
  onClose: () => void;
  onAdded?: (document: TravelDocument) => void;
}) {
  const [kind, setKind] = useState<TravelDocumentKind>("admission");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const addDocument = useTripDocumentStore((state) => state.addDocument);

  const selectFile = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await pickTravelDocument({ tripId, kind, createdByUserId: currentUserId });
      if (result.status === "cancelled") return;
      if (result.status !== "selected") {
        setMessage(result.message);
        return;
      }
      if (!addDocument(result.document)) {
        await deleteStoredTravelDocument(result.document);
        setMessage("같은 문서가 이미 등록되어 있어 추가하지 않았어요.");
        return;
      }
      onAdded?.(result.document);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return <Modal visible={visible} transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={close}>
    <View style={styles.overlay}>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <Pressable accessibilityRole="button" accessibilityLabel="문서 추가 닫기" disabled={busy} onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>여행 문서 추가</Text>
          <ScrollView style={styles.documentScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <Text style={styles.description}>종류를 선택한 뒤 PDF 또는 이미지 파일을 가져오세요. 파일 원문은 두리 분석에 사용하지 않아요.</Text>
            <View style={styles.options}>
            {travelDocumentKindOptions.map((option) => {
              const selected = option.value === kind;
              return <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => { setKind(option.value); setMessage(""); }}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
              ><View style={styles.optionCopy}><Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text><Text style={styles.optionDescription}>{option.description}</Text></View><Text style={[styles.radio, selected && styles.radioSelected]}>{selected ? "●" : "○"}</Text></Pressable>;
            })}
            </View>
            <View style={styles.notice}><Text style={styles.noticeTitle}>{Platform.OS === "web" ? "웹에서는 현재 탭에만 보관돼요" : "현재는 이 기기에만 저장돼요"}</Text><Text style={styles.noticeText}>{Platform.OS === "web" ? "새로고침하거나 탭을 닫으면 파일이 사라집니다. 동행자 공유·복원에는 파일 서버가 필요해요." : "동행자 공유·기기 변경 복원은 파일 서버 연동 후 지원할 수 있어요."}</Text></View>
            {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
            <PrimaryButton label="PDF 또는 이미지 선택" loading={busy} onPress={selectFile} />
            <SecondaryButton label="취소" disabled={busy} onPress={close} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(17, 32, 67, 0.32)" },
  safeArea: { flex: 1, width: "100%", justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 640, maxHeight: "92%", alignSelf: "center", overflow: "hidden", gap: spacing.md, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, padding: spacing.lg },
  handle: { width: 44, height: 5, alignSelf: "center", borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  title: { ...typography.title, color: colors.text },
  documentScroll: { flexShrink: 1, minHeight: 0 },
  description: { ...typography.body, color: colors.textSecondary },
  sheetContent: { gap: spacing.md, paddingBottom: spacing.xs },
  options: { gap: spacing.sm },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionCopy: { flex: 1, gap: spacing.xxs },
  optionLabel: { ...typography.bodyStrong, color: colors.text },
  optionLabelSelected: { color: colors.primary },
  optionDescription: { ...typography.caption, color: colors.textSecondary },
  radio: { ...typography.subtitle, color: colors.textMuted },
  radioSelected: { color: colors.primary },
  notice: { gap: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm },
  noticeTitle: { ...typography.bodyStrong, color: colors.warning },
  noticeText: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
  pressed: { opacity: 0.82 },
});
