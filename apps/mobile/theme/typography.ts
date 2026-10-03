import type { TextStyle } from "react-native";

const numeric: TextStyle = {
  fontSize: 20,
  lineHeight: 24,
  fontWeight: "800",
  fontVariant: ["tabular-nums"],
};

export const Typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const, letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800" as const, letterSpacing: -0.2 },
  section: { fontSize: 20, lineHeight: 25, fontWeight: "700" as const, letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  bodyMedium: { fontSize: 16, lineHeight: 22, fontWeight: "500" as const },
  bodySemibold: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  captionMedium: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" as const },
  button: { fontSize: 16, lineHeight: 20, fontWeight: "700" as const },
  tab: { fontSize: 13, lineHeight: 17, fontWeight: "600" as const },
  numeric,
} as const;

export const Colors = {
  background: "#000000",
  surface: "#171717",
  surfaceRaised: "#222222",
  border: "#2d2d2d",
  text: "#ffffff",
  textSecondary: "#aaaaaa",
  textMuted: "#777777",
  accent: "#ff2d55",
  danger: "#ff7188",
} as const;
