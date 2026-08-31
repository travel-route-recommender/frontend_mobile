import { Image } from "expo-image";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Card } from "../../../components/common";
import { colors, radius, spacing } from "../../../theme/tokens";
import { DuriKoreanText } from "../../duri/components/DuriKoreanText";
import type { ResolvedPreferencePresentation } from "../logic/resolve-preference-presentation";

const duriResultImage = require("../../../../assets/images/characters/duri_image.webp");

export function PreferenceResultSummary({ presentation, userName }: { presentation: ResolvedPreferencePresentation; userName?: string }) {
  const { width } = useWindowDimensions();
  const compact = width <= 370;
  const visibleTags = presentation.preferredTags.slice(0, 4);
  const hiddenTagCount = Math.max(presentation.preferredTags.length - visibleTags.length, 0);

  return <View style={styles.sections}>
    <Card style={styles.hero}>
      <View style={[styles.heroCopy, compact && styles.heroCopyCompact]}>
        <Text style={styles.eyebrow}>{presentation.icon} 나의 여행 성향</Text>
        {userName ? <Text style={styles.name}>{userName}님의 여행 스타일</Text> : null}
        <DuriKoreanText accessibilityRole="header" selectable style={[styles.title, compact && styles.titleCompact]}>{presentation.title}</DuriKoreanText>
        <DuriKoreanText style={styles.description}>{presentation.description}</DuriKoreanText>
        <View accessibilityLabel={`선호 태그: ${presentation.preferredTags.join(", ")}`} style={styles.tags}>
          {visibleTags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>)}
          {hiddenTagCount ? <View style={styles.tag}><Text style={styles.tagText}>+{hiddenTagCount}</Text></View> : null}
        </View>
      </View>
      <Image accessible={false} contentFit="contain" source={duriResultImage} style={[styles.character, compact && styles.characterCompact]} />
    </Card>

    <View style={styles.section}>
      <Text style={styles.sectionTitle}>나의 특징</Text>
      <Card style={styles.traitCard}>
        {presentation.traits.map((trait, index) => <View key={trait}>
          <View style={styles.traitRow}>
            <View style={styles.traitIcon}><Text style={styles.traitIconText}>✓</Text></View>
            <DuriKoreanText style={styles.traitText}>{trait}</DuriKoreanText>
          </View>
          {index < presentation.traits.length - 1 ? <View style={styles.divider} /> : null}
        </View>)}
      </Card>
    </View>

    <View style={styles.guide}>
      <View style={styles.guideIcon}><Text style={styles.guideIconText}>✦</Text></View>
      <View style={styles.guideCopy}>
        <Text style={styles.guideTitle}>두리가 여행 계획에 활용할게요</Text>
        <DuriKoreanText style={styles.guideText}>{presentation.planningMessage}</DuriKoreanText>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sections: { gap: spacing.xl },
  hero: { minHeight: 272, overflow: "hidden", borderColor: "#D9D5FF", borderRadius: 22, backgroundColor: "#F3F1FF", padding: spacing.lg },
  heroCopy: { zIndex: 1, width: "74%", gap: spacing.xs, paddingRight: spacing.xs },
  heroCopyCompact: { width: "78%" },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: "800", color: "#7569BE" },
  name: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: colors.textSecondary },
  title: { marginTop: spacing.xs, fontSize: 28, lineHeight: 37, fontWeight: "900", color: colors.primary },
  titleCompact: { fontSize: 25, lineHeight: 34 },
  description: { marginTop: spacing.xxs, fontSize: 13, lineHeight: 20, fontWeight: "500", color: colors.textSecondary },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  tag: { borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { fontSize: 10, lineHeight: 14, fontWeight: "800", color: "#7569BE" },
  character: { position: "absolute", right: 2, bottom: 6, width: 112, height: 112 },
  characterCompact: { right: 0, bottom: 6, width: 98, height: 98 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: "800", color: "#17265F" },
  traitCard: { overflow: "hidden", borderRadius: 18, paddingVertical: spacing.xs },
  traitRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm },
  traitIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "#EAF7EE" },
  traitIconText: { fontSize: 13, lineHeight: 16, fontWeight: "900", color: colors.success },
  traitText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "800", color: "#17265F" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 54, backgroundColor: colors.border },
  guide: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderWidth: 1, borderColor: "#D9D5FF", borderRadius: 18, backgroundColor: "#F3F1FF", padding: spacing.md },
  guideIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface },
  guideIconText: { fontSize: 18, lineHeight: 22, fontWeight: "900", color: colors.primary },
  guideCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  guideTitle: { fontSize: 13, lineHeight: 18, fontWeight: "800", color: "#17265F" },
  guideText: { fontSize: 12, lineHeight: 19, fontWeight: "500", color: colors.textSecondary },
});
