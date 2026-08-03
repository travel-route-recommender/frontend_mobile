import type { ChallengeStyleType } from "../types";

export type PreferenceTypePresentation = {
  title: string;
  description: string;
  icon: string;
  planningMessage: string;
};

export type ChallengeStylePresentation = PreferenceTypePresentation & {
  traits: string[];
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

const challengeStylePresentations: Record<ChallengeStyleType, ChallengeStylePresentation> = {
  challenge_executor: {
    title: "도전 실행형",
    description: "흥미로운 경험을 발견하면 오래 망설이기보다 직접 시도하며 여행을 넓혀가는 편이에요.",
    icon: "🧭",
    planningMessage: "두리는 새로운 경험을 충분히 담되, 동행자의 속도와 필수 확인 사항도 함께 살펴볼게요.",
    traits: ["새로운 경험", "빠른 실행", "높은 자극 선호"],
  },
  cautious_explorer: {
    title: "신중 탐색형",
    description: "새로운 경험을 좋아하면서도 정보와 조건을 충분히 확인한 뒤 움직이는 편이에요.",
    icon: "🔎",
    planningMessage: "두리는 흥미로운 후보를 제안하면서 후기와 운영 정보도 함께 확인하기 쉽게 정리할게요.",
    traits: ["새로운 경험", "충분한 검토", "계획적인 탐색"],
  },
  stable_planner: {
    title: "안정 계획형",
    description: "익숙하고 검증된 선택을 바탕으로 예측 가능한 여행 흐름을 만드는 편이에요.",
    icon: "🗺️",
    planningMessage: "두리는 검증된 선택과 안정적인 동선을 우선하고, 새로운 제안은 부담이 적은 범위에서 보여드릴게요.",
    traits: ["검증된 선택", "신중한 결정", "안정적인 계획"],
  },
};

export function getChallengeStylePresentation(type: ChallengeStyleType) {
  return challengeStylePresentations[type];
}

export function formatPreferenceCompletedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "완료 날짜를 확인할 수 없어요";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day} 완료`;
}
