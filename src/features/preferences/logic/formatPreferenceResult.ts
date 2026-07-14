export type PreferenceTypePresentation = {
  title: string;
  description: string;
  icon: string;
  planningMessage: string;
};

const presentations: Record<string, PreferenceTypePresentation> = {
  "여유로운 여행자": {
    title: "여유로운 여행자",
    description: "머무는 시간과 가까운 동선을 소중하게 생각하는 편이에요.",
    icon: "🌿",
    planningMessage: "두리는 충분한 휴식과 무리 없는 이동 흐름을 살펴볼게요.",
  },
  "균형형 여행자": {
    title: "균형형 여행자",
    description: "관광과 휴식, 계획과 유연함을 적절히 섞는 편이에요.",
    icon: "🧭",
    planningMessage: "두리는 함께하는 사람들의 선택을 균형 있게 조율할게요.",
  },
  "알찬 여행자": {
    title: "알찬 여행자",
    description: "다양한 장소와 활동을 적극적으로 경험하는 편이에요.",
    icon: "✨",
    planningMessage: "두리는 알찬 일정이 무리한 동선이 되지 않도록 살펴볼게요.",
  },
};

export function getPreferenceTypePresentation(profileType: string): PreferenceTypePresentation {
  return presentations[profileType] ?? {
    title: profileType || "나의 여행 성향",
    description: "현재 응답을 바탕으로 나에게 편한 여행 흐름을 정리했어요.",
    icon: "🧳",
    planningMessage: "이 결과는 여행 계획을 돕기 위한 참고 정보예요.",
  };
}

export function formatPreferenceCompletedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "완료 날짜를 확인할 수 없어요";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day} 완료`;
}
