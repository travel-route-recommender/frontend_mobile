import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader, Card, PrimaryButton, Screen, TextField } from "../../../components/common";
import { useDuriStore } from "../../../store/useDuriStore";
import { isValidISODate } from "../../../utils/formatters";
import { colors, spacing, typography } from "../../../theme/tokens";
import { useMemberGate } from "../../auth/hooks/useMemberGate";

export function NewTripScreen() {
  const router = useRouter();
  const { isMember, requireMember, memberGatePrompt } = useMemberGate();
  const state = useDuriStore();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("부산");
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-02");
  const [submitError, setSubmitError] = useState("");
  const region = useMemo(() => Object.values(state.regionsById).find((item) => [item.id, item.name, item.shortName].some((value) => value.toLowerCase() === destination.trim().toLowerCase())), [destination, state.regionsById]);
  const dateError = (!isValidISODate(startDate) || !isValidISODate(endDate) || endDate < startDate) ? "YYYY-MM-DD 형식으로 올바른 여행 기간을 입력해 주세요." : undefined;
  if (!isMember) return <Screen><AppHeader title="새 여행 만들기" onBack={() => router.back()} /><Card style={styles.form}><Text style={styles.intro}>회원 계정이 필요해요</Text><Text style={styles.description}>여행방 생성과 동행자 초대는 회원으로 로그인한 뒤 사용할 수 있어요.</Text><PrimaryButton label="로그인 또는 가입" onPress={() => requireMember(() => undefined, "여행방 만들기")} /></Card>{memberGatePrompt}</Screen>;
  const submit = () => { if (!region) { setSubmitError("제주, 경주, 강원, 부산, 전남 중 목적지를 입력해 주세요."); return; } if (dateError) { setSubmitError(dateError); return; } const tripId = state.createTrip({ title, regionId: region.id, startDate, endDate, transport: "public", budgetLevel: "standard", intensity: "balanced", invitedUserIds: [] }); if (!tripId) { setSubmitError("여행방을 만들지 못했어요. 입력값을 확인해 주세요."); return; } router.replace({ pathname: "/trips/[tripId]", params: { tripId } }); };
  return <Screen keyboardAware><AppHeader title="새 여행 만들기" subtitle="기본 정보는 나중에 다시 바꿀 수 있어요" onBack={() => router.back()} /><Card style={styles.form}><Text style={styles.intro}>어떤 여행을 준비하고 있나요?</Text><TextField label="여행방 제목" value={title} onChangeText={setTitle} placeholder={region ? `${region.name} 여행` : "우리의 여행"} maxLength={40} /><TextField label="목적지" value={destination} onChangeText={setDestination} placeholder="예: 부산" helperText="현재 데모 지역: 제주, 경주, 강원, 부산, 전남" /><View style={styles.dates}><View style={styles.dateField}><TextField label="시작일" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /></View><View style={styles.dateField}><TextField label="종료일" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /></View></View>{submitError ? <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text> : null}<PrimaryButton label="여행방 만들기" onPress={submit} /></Card></Screen>;
}
const styles = StyleSheet.create({ form: { gap: spacing.md }, intro: { ...typography.subtitle, color: colors.text }, description: { ...typography.body, color: colors.textSecondary }, dates: { flexDirection: "row", gap: spacing.sm }, dateField: { flex: 1 }, error: { ...typography.caption, color: colors.danger } });
