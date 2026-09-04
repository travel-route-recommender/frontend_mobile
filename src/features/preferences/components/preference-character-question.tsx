import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { PreferenceCharacterPresentation } from "../assets/preference-character-assets";

type CharacterProps = {
  character: PreferenceCharacterPresentation;
};

const WORD_JOINER = "\u2060";

function preventHangulWordBreaks(message: string) {
  return message.replace(/[가-힣]+/g, (word) => Array.from(word).join(WORD_JOINER));
}

function SpeechBubbleTail({ placement }: { placement: PreferenceCharacterPresentation["placement"] }) {
  return <>
    <View
      style={[
        styles.tail,
        styles.ignorePointerEvents,
        placement === "left" && styles.tailBorderLeft,
        placement === "right" && styles.tailBorderRight,
        placement === "together" && styles.tailBorderBottom,
      ]}
    />
    <View
      style={[
        styles.tail,
        styles.ignorePointerEvents,
        placement === "left" && styles.tailFillLeft,
        placement === "right" && styles.tailFillRight,
        placement === "together" && styles.tailFillBottom,
      ]}
    />
  </>;
}

export function PreferenceCharacterAvatar({ character }: CharacterProps) {
  return <View accessible accessibilityLabel={`${character.accessibilityLabel} 프로필`} style={styles.avatar}>
    <Image
      accessible={false}
      contentFit="contain"
      source={character.image}
      style={[
        styles.avatarImage,
        character.id === "dusun" && styles.avatarImageDusun,
        character.id === "excited-dusun" && styles.avatarImageExcitedDusun,
        character.id === "shy-dusun" && styles.avatarImageShyDusun,
        character.id === "duri" && styles.avatarImageDuri,
        character.id === "together" && styles.avatarImageTogether,
      ]}
    />
  </View>;
}

export function PreferenceCharacterQuestion({
  character,
  message,
  compact = false,
}: CharacterProps & { message: string; compact?: boolean }) {
  const together = character.placement === "together";
  return <View
    accessible
    accessibilityLabel={`${character.accessibilityLabel}. ${message}`}
    style={[styles.stage, compact && styles.stageCompact, together && styles.stageTogether]}
  >
    <Image
      accessible={false}
      contentFit="contain"
      source={character.image}
      style={[
        styles.characterImage,
        character.placement === "left" && styles.characterImageLeft,
        character.placement === "right" && styles.characterImageRight,
        together && styles.characterImageTogether,
      ]}
    />
    <View style={[
      styles.bubble,
      character.placement === "left" && styles.bubbleRight,
      character.placement === "right" && styles.bubbleLeft,
      together && styles.bubbleTogether,
    ]}>
      <SpeechBubbleTail placement={character.placement} />
      <Text
        android_hyphenationFrequency="none"
        lineBreakStrategyIOS="hangul-word"
        selectable
        style={styles.message}
        textBreakStrategy="simple"
      >
        {preventHangulWordBreaks(message)}
      </Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  avatarImage: {
    position: "absolute",
    width: 96,
    height: 96,
  },
  avatarImageDusun: { top: -24, left: -6 },
  avatarImageExcitedDusun: { top: -20, left: -6 },
  avatarImageShyDusun: { top: -17, left: -6 },
  avatarImageDuri: { top: -23, right: -11 },
  avatarImageTogether: { top: -12, left: -14, width: 72, height: 72 },
  stage: {
    position: "relative",
    minHeight: 196,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  stageCompact: { minHeight: 158 },
  stageTogether: { minHeight: 208 },
  characterImage: {
    position: "absolute",
    bottom: -36,
    width: 238,
    height: 238,
  },
  characterImageLeft: { left: -22 },
  characterImageRight: { right: -22 },
  characterImageTogether: {
    bottom: -72,
    left: "50%",
    width: 220,
    height: 220,
    marginLeft: -110,
  },
  bubble: {
    position: "absolute",
    top: spacing.md,
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  bubbleRight: { right: spacing.sm, width: "62%" },
  bubbleLeft: { left: spacing.sm, width: "62%" },
  bubbleTogether: { top: spacing.sm, right: spacing.sm, left: spacing.sm },
  tail: { position: "absolute", width: 0, height: 0 },
  ignorePointerEvents: { pointerEvents: "none" },
  tailBorderLeft: {
    bottom: 18,
    left: -12,
    borderTopWidth: 8,
    borderRightWidth: 12,
    borderBottomWidth: 8,
    borderTopColor: "transparent",
    borderRightColor: colors.borderStrong,
    borderBottomColor: "transparent",
  },
  tailFillLeft: {
    bottom: 19,
    left: -10,
    borderTopWidth: 7,
    borderRightWidth: 11,
    borderBottomWidth: 7,
    borderTopColor: "transparent",
    borderRightColor: colors.surface,
    borderBottomColor: "transparent",
  },
  tailBorderRight: {
    right: -12,
    bottom: 18,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 12,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.borderStrong,
  },
  tailFillRight: {
    right: -10,
    bottom: 19,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.surface,
  },
  tailBorderBottom: {
    bottom: -12,
    left: "50%",
    marginLeft: -8,
    borderTopWidth: 12,
    borderRightWidth: 8,
    borderLeftWidth: 8,
    borderTopColor: colors.borderStrong,
    borderRightColor: "transparent",
    borderLeftColor: "transparent",
  },
  tailFillBottom: {
    bottom: -10,
    left: "50%",
    marginLeft: -7,
    borderTopWidth: 11,
    borderRightWidth: 7,
    borderLeftWidth: 7,
    borderTopColor: colors.surface,
    borderRightColor: "transparent",
    borderLeftColor: "transparent",
  },
  message: { ...typography.bodyStrong, color: colors.text },
});
