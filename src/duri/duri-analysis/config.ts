export const DURI_ANALYSIS_CONFIG = {
  meal: {
    breakfast: { label: "아침", start: 7 * 60 + 30, end: 10 * 60 },
    lunch: { label: "점심", start: 11 * 60 + 30, end: 14 * 60 },
    dinner: { label: "저녁", start: 17 * 60 + 30, end: 20 * 60 },
  },
} as const;
