import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  primary: "#4388FF",
  primaryPressed: "#2F70E6",
  primarySoft: "#DDEBFF",
  navy: "#243C8F",
  background: "#EFF5FF",
  backgroundStrong: "#D5E6FF",
  surface: "#FFFFFF",
  surfaceMuted: "#F7FAFF",
  border: "#DCE8FA",
  borderStrong: "#B8CCEA",
  text: "#243C8F",
  textSecondary: "#6479A8",
  textMuted: "#91A3C5",
  white: "#FFFFFF",
  success: "#2E9B66",
  successSoft: "#E2F6EC",
  warning: "#E79535",
  warningSoft: "#FFF1DD",
  danger: "#D94F5C",
  dangerSoft: "#FFE8EA",
  overlay: "rgba(18, 39, 92, 0.42)",
} as const;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const sizes = { touch: 44, icon: 22, contentMaxWidth: 560, tabBar: 64 } as const;

export const typography: Record<"display" | "title" | "subtitle" | "body" | "bodyStrong" | "caption" | "button", TextStyle> = {
  display: { fontSize: 28, lineHeight: 36, fontWeight: "800" },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "800" },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: "600" },
  button: { fontSize: 16, lineHeight: 22, fontWeight: "800" },
};

export const shadows: Record<"card" | "floating", ViewStyle> = {
  card: { shadowColor: "#7897D8", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 14, elevation: 3 },
  floating: { shadowColor: "#243C8F", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 7 },
};

export const theme = { colors, spacing, radius, typography, shadows, sizes } as const;
export type DuriTheme = typeof theme;
