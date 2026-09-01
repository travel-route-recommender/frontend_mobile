import type { TextProps, TextStyle } from "react-native";
import { Platform, Text } from "react-native";

const WORD_JOINER = "\u2060";
const webWordWrap = Platform.OS === "web"
  ? ({ wordBreak: "keep-all", overflowWrap: "break-word" } as unknown as TextStyle)
  : undefined;

function preserveKoreanWords(value: string) {
  if (Platform.OS === "web") return value;
  return value.replace(/[가-힣]+/g, (word) => Array.from(word).join(WORD_JOINER));
}
export function DuriKoreanText({ children, style, ...props }: TextProps) {
  const content = typeof children === "string" ? preserveKoreanWords(children) : children;

  return <Text
    android_hyphenationFrequency="none"
    lineBreakStrategyIOS="hangul-word"
    textBreakStrategy="simple"
    {...props}
    style={[style, webWordWrap]}
  >
    {content}
  </Text>;
}
