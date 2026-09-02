import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

const COMMANDS: Readonly<Record<string, string>> = {
  "\\Delta": "Δ",
  "\\delta": "δ",
  "\\mu": "μ",
  "\\sigma": "σ",
  "\\Sigma": "Σ",
  "\\sum": "∑",
  "\\bigcup": "⋃",
  "\\cup": "∪",
  "\\bigcap": "⋂",
  "\\cap": "∩",
  "\\prod": "∏",
  "\\min": "min",
  "\\max": "max",
  "\\argmin": "arg min",
  "\\argmax": "arg max",
  "\\in": "∈",
  "\\notin": "∉",
  "\\leq": "≤",
  "\\le": "≤",
  "\\geq": "≥",
  "\\ge": "≥",
  "\\neq": "≠",
  "\\succ": "≻",
  "\\approx": "≈",
  "\\cdot": "·",
  "\\circ": "∘",
  "\\uparrow": "↑",
  "\\downarrow": "↓",
  "\\mid": "|",
  "\\tilde": "~",
  "\\times": "×",
  "\\quad": "   ",
  "\\qquad": "      ",
  "\\lvert": "|",
  "\\rvert": "|",
  "\\lceil": "⌈",
  "\\rceil": "⌉",
  "\\vert": "|",
  "\\cdots": "⋯",
  "\\ldots": "…",
  "\\emptyset": "∅",
  "\\bigg": "",
  "\\Bigg": "",
  "\\big": "",
  "\\Big": "",
  "\\rightarrow": "→",
  "\\to": "→",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\land": "∧",
  "\\lor": "∨",
  "\\infty": "∞",
};

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ",
};

const SUBSCRIPT: Readonly<Record<string, string>> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  "a": "ₐ", "e": "ₑ", "h": "ₕ", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "l": "ₗ",
  "m": "ₘ", "n": "ₙ", "o": "ₒ", "p": "ₚ", "r": "ᵣ", "s": "ₛ", "t": "ₜ", "u": "ᵤ", "v": "ᵥ", "x": "ₓ",
};

function scriptText(value: string, alphabet: Readonly<Record<string, string>>, fallbackOpen: string, fallbackClose: string) {
  const converted = [...value].map((character) => alphabet[character] ?? character).join("");
  const fullyConverted = [...value].every((character) => Boolean(alphabet[character]));
  return fullyConverted ? converted : `${fallbackOpen}${converted}${fallbackClose}`;
}

function replaceSimpleGroups(value: string) {
  let result = value;
  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result
      .replace(/\\binom\{([^{}]+)\}\{([^{}]+)\}/g, "C($1,$2)")
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)⁄($2)")
      .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
      .replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathbb|mathcal|operatorname)\*?\{([^{}]+)\}/g, "$1");
  }
  return result;
}

/**
 * 네트워크나 WebView에 의존하지 않는 보고서용 수식 표시기다. 전체 TeX 엔진은
 * 아니며 두리 진단에서 사용하는 분수·제곱·아래첨자·그리스 문자만 안정적으로
 * 사람이 읽을 수 있는 수학 기호로 바꾼다. 원본 LaTeX는 접근성 레이블로 보존한다.
 */
export function formatDuriLatexForDisplay(latex: string) {
  let result = replaceSimpleGroups(latex.trim())
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\left|\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\\\/g, "\n");
  Object.entries(COMMANDS)
    .sort(([left], [right]) => right.length - left.length)
    .forEach(([command, rendered]) => {
      result = result.split(command).join(rendered);
    });
  result = result
    .replace(/\^\{([^{}]+)\}/g, (_match, value: string) => scriptText(value, SUPERSCRIPT, "^(", ")"))
    .replace(/_\{([^{}]+)\}/g, (_match, value: string) => scriptText(value, SUBSCRIPT, "₍", "₎"))
    .replace(/\^([A-Za-z0-9+\-=])/g, (_match, value: string) => scriptText(value, SUPERSCRIPT, "^(", ")"))
    .replace(/_([A-Za-z0-9+\-=])/g, (_match, value: string) => scriptText(value, SUBSCRIPT, "₍", "₎"))
    .replace(/[{}]/g, "")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
  return result || latex;
}

export function DuriMathFormula({ latex, label }: { latex: string; label?: string }) {
  const rendered = formatDuriLatexForDisplay(latex);
  return <View accessibilityLabel={`${label ? `${label}. ` : ""}${latex}`} style={styles.wrap}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <Text selectable style={styles.formula}>{rendered}</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  label: { ...typography.caption, color: colors.textMuted },
  formula: { ...typography.bodyStrong, color: colors.navy, fontFamily: "monospace" },
});
