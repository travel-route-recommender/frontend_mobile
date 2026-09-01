import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../components/common";
import { colors, radius, spacing } from "../../../theme/tokens";
import { DuriKoreanText } from "../../duri/components/DuriKoreanText";
import { PreferenceFlowHeader, PreferenceStickyFooter } from "./PreferenceFlowChrome";

const introIllustration = require("../../../../assets/images/characters/duri_and_dusun_image.webp");

const introBenefits = [
  { icon: "▦", title: "테스트 규모", getDescription: (chapters: number, questions: number) => `${chapters}개 챕터 · ${questions}개 질문` },
  { icon: "✓", title: "답변 자동 저장", getDescription: () => "중간에 나가도 현재 답변부터 이어갈 수 있어요" },
  { icon: "✦", title: "결과 활용", getDescription: () => "여행 계획과 동행자 성향 비교에 활용할 수 있어요" },
] as const;

export function PreferenceTestIntro({
  chapterCount,
  questionCount,
  onBack,
  onExit,
  onStart,
}: {
  chapterCount: number;
  questionCount: number;
  onBack: () => void;
  onExit: () => void;
  onStart: () => void;
}) {
  return <Screen
    backgroundColor={colors.surface}
    contentContainerStyle={styles.content}
    footer={<PreferenceStickyFooter onPrimary={onStart} primaryLabel="테스트 시작하기" />}
    header={<PreferenceFlowHeader actionLabel="나가기" onAction={onExit} onBack={onBack} />}
    testID="personal-preference-intro"
  >
    <View style={styles.heroCopy}>
      <View style={styles.eyebrow}><Text style={styles.eyebrowText}>DURI PREFERENCE</Text></View>
      <DuriKoreanText accessibilityRole="header" style={styles.title}>나의 여행 스타일을{`\n`}두리와 함께 알아볼까요?</DuriKoreanText>
      <DuriKoreanText style={styles.description}>여행 속도와 선택 기준, 마음이 가는 장면을 살펴보고 나에게 편한 여행 방식을 정리해드려요.</DuriKoreanText>
    </View>

    <View style={styles.infoCard}>
      {introBenefits.map((benefit, index) => <View key={benefit.title}>
        <View style={styles.infoRow}>
          <View style={[styles.infoIcon, index === 1 && styles.infoIconMint, index === 2 && styles.infoIconLavender]}><Text style={styles.infoIconText}>{benefit.icon}</Text></View>
          <View style={styles.infoCopy}>
            <Text style={styles.infoTitle}>{benefit.title}</Text>
            <DuriKoreanText style={styles.infoDescription}>{benefit.getDescription(chapterCount, questionCount)}</DuriKoreanText>
          </View>
        </View>
        {index < introBenefits.length - 1 ? <View style={styles.divider} /> : null}
      </View>)}
    </View>

    <View style={styles.characterCard}>
      <View style={styles.characterCopy}>
        <Text style={styles.characterEyebrow}>두리와 두순의 한마디</Text>
        <DuriKoreanText style={styles.characterMessage}>정답은 없어요.{`\n`}실제 여행의 나를 떠올려 주세요.</DuriKoreanText>
      </View>
      <Image accessible={false} contentFit="contain" source={introIllustration} style={styles.characterImage} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl, backgroundColor: colors.surface },
  heroCopy: { gap: spacing.sm },
  eyebrow: { alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: "#F0EDFF", paddingHorizontal: spacing.sm, paddingVertical: 6 },
  eyebrowText: { fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 0.5, color: "#7569BE" },
  title: { fontSize: 28, lineHeight: 37, fontWeight: "900", color: "#17265F" },
  description: { fontSize: 14, lineHeight: 22, fontWeight: "500", color: colors.textSecondary },
  infoCard: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  infoRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  infoIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: "#EAF2FF" },
  infoIconMint: { backgroundColor: "#EAF7EE" },
  infoIconLavender: { backgroundColor: "#F0EDFF" },
  infoIconText: { fontSize: 18, lineHeight: 22, fontWeight: "900", color: colors.primary },
  infoCopy: { flex: 1, minWidth: 0, gap: 2 },
  infoTitle: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: "#17265F" },
  infoDescription: { fontSize: 12, lineHeight: 18, fontWeight: "500", color: colors.textSecondary },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 66, backgroundColor: colors.border },
  characterCard: { minHeight: 150, overflow: "hidden", borderWidth: 1, borderColor: "#D9D5FF", borderRadius: 22, backgroundColor: "#F3F1FF", padding: spacing.md },
  characterCopy: { zIndex: 1, width: "59%", gap: spacing.xs },
  characterEyebrow: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: "#7569BE" },
  characterMessage: { fontSize: 15, lineHeight: 23, fontWeight: "800", color: "#17265F" },
  characterImage: { position: "absolute", right: -2, bottom: 0, width: 150, height: 150 },
});
