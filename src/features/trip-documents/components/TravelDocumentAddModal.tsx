import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton, SecondaryButton, TextField } from "../../../components/common";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { createExternalTravelDocument, deleteStoredTravelDocument, pickTravelDocument } from "../services/travelDocumentStorage";
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
  const [sourceMode, setSourceMode] = useState<"file" | "link">("file");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalName, setExternalName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const addDocument = useTripDocumentStore((state) => state.addDocument);

  const resetAndClose = () => {
    setMessage("");
    setExternalUrl("");
    setExternalName("");
    onClose();
  };

  const storeDocument = async (document: TravelDocument) => {
    if (!addDocument(document)) {
      await deleteStoredTravelDocument(document);
      setMessage("같은 문서가 이미 등록되어 있어 추가하지 않았어요.");
      return false;
    }
    onAdded?.(document);
    resetAndClose();
    return true;
  };

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
      await storeDocument(result.document);
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    if (busy) return;
    setMessage("");
    const result = createExternalTravelDocument({
      tripId,
      kind,
      createdByUserId: currentUserId,
      url: externalUrl,
      displayName: externalName,
    });
    if (result.status !== "selected") {
      setMessage(result.status === "cancelled" ? "" : result.message);
      return;
    }
    setBusy(true);
    try {
      await storeDocument(result.document);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) resetAndClose();
  };

  return <Modal visible={visible} transparent animationType="slide" navigationBarTranslucent statusBarTranslucent onRequestClose={close}>
    <View style={styles.overlay}>
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <Pressable accessibilityRole="button" accessibilityLabel="문서 추가 닫기" disabled={busy} onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>여행 문서 추가</Text>
          <ScrollView style={styles.documentScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            <Text style={styles.description}>종류를 고른 뒤 파일이나 예약 링크를 추가하세요. 원문과 링크 내용은 자동으로 두리의 일정 사실이 되지 않으며, 사용자가 확인한 정보만 사용해요.</Text>
            <View style={styles.sourceModes}>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: sourceMode === "file" }} onPress={() => { setSourceMode("file"); setMessage(""); }} style={({ pressed }) => [styles.sourceMode, sourceMode === "file" && styles.sourceModeSelected, pressed && styles.pressed]}><Text style={[styles.sourceModeText, sourceMode === "file" && styles.sourceModeTextSelected]}>PDF·이미지</Text></Pressable>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: sourceMode === "link" }} onPress={() => { setSourceMode("link"); setMessage(""); }} style={({ pressed }) => [styles.sourceMode, sourceMode === "link" && styles.sourceModeSelected, pressed && styles.pressed]}><Text style={[styles.sourceModeText, sourceMode === "link" && styles.sourceModeTextSelected]}>예약 링크</Text></Pressable>
            </View>
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
            {sourceMode === "link" ? <>
              <TextField label="예약 링크" value={externalUrl} onChangeText={setExternalUrl} maxLength={2048} autoCapitalize="none" keyboardType="url" placeholder="https://..." helperText="https 링크는 설치된 앱의 universal link를 지원하면 앱으로, 아니면 브라우저로 열려요." />
              <TextField label="표시 이름 (선택)" value={externalName} onChangeText={setExternalName} maxLength={80} placeholder="예: 부산행 KTX 예매 내역" />
              <View style={styles.notice}><Text style={styles.noticeTitle}>링크가 열리지 않아도 일정은 입력할 수 있어요</Text><Text style={styles.noticeText}>링크 추가 직후 날짜·시간을 직접 확인하고 잠긴 일정으로 만들 수 있습니다. 링크 페이지 내용은 앱이 자동으로 신뢰하지 않아요.</Text></View>
            </> : <View style={styles.notice}><Text style={styles.noticeTitle}>{Platform.OS === "web" ? "웹에서는 현재 탭에만 보관돼요" : "현재는 이 기기에만 저장돼요"}</Text><Text style={styles.noticeText}>{Platform.OS === "web" ? "새로고침하거나 탭을 닫으면 파일이 사라집니다. 동행자 공유·복원에는 파일 서버가 필요해요." : "동행자 공유·기기 변경 복원은 파일 서버 연동 후 지원할 수 있어요."}</Text></View>}
            {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
            <PrimaryButton label={sourceMode === "file" ? "PDF 또는 이미지 선택" : "링크 추가하고 일정 정보 입력"} loading={busy} onPress={sourceMode === "file" ? selectFile : addLink} />
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
  sourceModes: { flexDirection: "row", gap: spacing.xs },
  sourceMode: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sourceModeSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  sourceModeText: { ...typography.bodyStrong, color: colors.textSecondary },
  sourceModeTextSelected: { color: colors.primary },
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
