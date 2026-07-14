export const DURI_ANALYSIS_CONFIG = {
  density: {
    // 하루 장소 5개부터 동선과 휴식 여유를 함께 점검한다.
    densePlaceCount: 5,
    veryDensePlaceCount: 7,
    // 전체 일정 점유가 7시간/9시간을 넘으면 밀도 근거로 사용한다.
    denseActiveMinutes: 420,
    veryDenseActiveMinutes: 540,
    maxConsecutiveItemsWithoutBreak: 3,
    minMeaningfulBreakMinutes: 45,
    longActivityStreakMinutes: 210,
  },
  meal: {
    breakfast: { label: "아침", start: 7 * 60 + 30, end: 10 * 60 },
    lunch: { label: "점심", start: 11 * 60 + 30, end: 14 * 60 },
    dinner: { label: "저녁", start: 17 * 60 + 30, end: 20 * 60 },
  },
  preference: {
    // 일정이 3개 이상일 때만 참여자 간 편중 여부를 판단한다.
    minimumAnalyzableItems: 3,
    minimumReflectionRatio: 0.25,
    reflectionCountDifferenceWarning: 3,
  },
  route: {
    // 좌표가 생길 경우 실제 도로 거리가 아닌 직선거리 부담 기준으로만 사용한다.
    longStraightSegmentKm: 12,
    highDailyStraightDistanceKm: 30,
    excessiveRegionTransitions: 3,
  },
} as const;
