import type {
  AccommodationAxis,
  AccommodationScaleValue,
  ActivityTagId,
  BudgetCategory,
  FourPointScaleValue,
  ItineraryHourSlot,
  MobilityMode,
  PreferenceStepId,
  StaminaLevel,
} from "../types";

export const PERSONAL_SURVEY_DRAFT_VERSION = 4;

export const preferenceSteps: readonly {
  id: PreferenceStepId;
  eyebrow: string;
  title: string;
  description: string;
}[] = [
  { id: "itinerary", eyebrow: "일정 밀도", title: "블록을 드래그해 여행 일정을 채워보세요", description: "액티비티 블록을 일정표로 끌어다 놓아 주세요. 배치한 블록의 위·아래 핸들을 드래그하면 빈 시간만큼 1시간 단위로 늘릴 수 있어요." },
  { id: "mobility", eyebrow: "이동 방식", title: "여행지에서 이용하고 싶은 이동 방식은 무엇인가요?", description: "자차와 대중교통을 열어 세부 수단을 고를 수 있어요. 필요한 수단을 모두 선택해 주세요." },
  { id: "accommodation", eyebrow: "숙소 스타일", title: "숙소를 고를 때 어느 쪽에 더 마음이 가나요?", description: "가운데 선택지가 없는 8단계 중 각 기준에서 지금의 취향과 가까운 지점을 선택해 주세요." },
  { id: "adventure", eyebrow: "도전 성향", title: "새로운 장소를 선택할 때 나는 어떤 편인가요?", description: "리뷰가 충분한 검증된 장소와 새롭게 알려지는 장소 사이에서 가까운 쪽을 골라 주세요." },
  { id: "stamina", eyebrow: "체력 수준", title: "여행할 때의 체력 수준을 알려 주세요", description: "스스로 느끼는 체력을 바탕으로 추천 일정의 활동 강도와 휴식 간격을 조절할 수 있어요." },
  { id: "budget", eyebrow: "예산 소비 방향", title: "여행 코인 100개를 나눠보세요", description: "여행에서 더 투자하고 싶은 분야에 코인을 배분해 주세요. 합계가 100개가 되면 완료돼요." },
  { id: "discovery", eyebrow: "여행지 탐색", title: "명소와 로컬 경험에 대한 마음을 각각 알려 주세요", description: "둘 중 하나만 고르지 않아도 돼요. 두 기준을 각각 4단계로 측정해요." },
];

export const activityBlocks: readonly { id: ActivityTagId; icon: string; label: string; color: string; softColor: string }[] = [
  { id: "restaurant", icon: "🍜", label: "식당", color: "#E56B44", softColor: "#FFF0EA" },
  { id: "cafe", icon: "☕", label: "카페", color: "#A36B3F", softColor: "#F8EFE7" },
  { id: "shopping", icon: "🛍️", label: "쇼핑", color: "#B45AA6", softColor: "#FBEAF7" },
  { id: "attraction", icon: "🏛️", label: "명소 관광", color: "#4388FF", softColor: "#EAF2FF" },
  { id: "local", icon: "🪴", label: "로컬 탐방", color: "#2E9B66", softColor: "#E8F7EF" },
  { id: "experience", icon: "🎟️", label: "액티비티", color: "#7A63D6", softColor: "#F0EDFF" },
  { id: "nature", icon: "🌿", label: "자연", color: "#4B9D92", softColor: "#E7F7F4" },
  { id: "rest", icon: "🛋️", label: "휴식", color: "#6479A8", softColor: "#EEF2FA" },
];

export const itineraryHourSlots: readonly ItineraryHourSlot[] = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00",
];

export const itineraryRows: readonly { label: string; slots: readonly [ItineraryHourSlot, ItineraryHourSlot] }[] = [
  { label: "08–10", slots: ["08:00", "09:00"] },
  { label: "10–12", slots: ["10:00", "11:00"] },
  { label: "12–14", slots: ["12:00", "13:00"] },
  { label: "14–16", slots: ["14:00", "15:00"] },
  { label: "16–18", slots: ["16:00", "17:00"] },
  { label: "18–20", slots: ["18:00", "19:00"] },
  { label: "20–22", slots: ["20:00", "21:00"] },
  { label: "22–24", slots: ["22:00", "23:00"] },
];

export const mobilitySections: readonly {
  id: "car" | "transit";
  icon: string;
  label: string;
  description: string;
  options: readonly { id: MobilityMode; label: string }[];
}[] = [
  { id: "car", icon: "🚗", label: "자차", description: "직접 운전하는 이동 수단", options: [{ id: "ownCar", label: "자차" }, { id: "rentalCar", label: "렌터카" }] },
  { id: "transit", icon: "🚌", label: "대중교통", description: "노선과 상황에 맞춰 이용", options: [{ id: "bus", label: "버스" }, { id: "subway", label: "지하철" }, { id: "train", label: "열차" }, { id: "taxi", label: "택시" }] },
];

export const mobilityOptions: readonly { id: MobilityMode; icon: string; label: string }[] = [
  { id: "ownCar", icon: "🚙", label: "자차" },
  { id: "rentalCar", icon: "🔑", label: "렌터카" },
  { id: "bus", icon: "🚌", label: "버스" },
  { id: "subway", icon: "🚇", label: "지하철" },
  { id: "train", icon: "🚆", label: "열차" },
  { id: "taxi", icon: "🚕", label: "택시" },
  { id: "walk", icon: "🚶", label: "도보" },
];

export const accommodationScaleValues: readonly AccommodationScaleValue[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const fourPointScaleValues: readonly FourPointScaleValue[] = [1, 2, 3, 4];

export const accommodationAxes: readonly { id: AccommodationAxis; left: string; right: string; helper: string }[] = [
  { id: "stayMeaning", left: "잠만 자는 곳", right: "여행의 일부", helper: "숙소 자체의 경험을 얼마나 중요하게 보는지" },
  { id: "locationFacility", left: "좋은 위치", right: "좋은 시설", helper: "동선의 편리함과 숙소 시설 중 더 끌리는 쪽" },
  { id: "comfortPrice", left: "편안함", right: "합리적 가격", helper: "더 편안한 숙소와 비용 절약 사이의 기준" },
];

export const staminaOptions: readonly { id: StaminaLevel; label: string; description: string }[] = [
  { id: "low", label: "낮음", description: "중간중간 긴 휴식이 필요해요" },
  { id: "medium", label: "보통", description: "관광과 휴식을 적당히 섞으면 좋아요" },
  { id: "high", label: "좋음", description: "오래 걷거나 여러 일정을 소화할 수 있어요" },
];

export const budgetCategories: readonly { id: BudgetCategory; icon: string; label: string; parent: string }[] = [
  { id: "stay", icon: "🛏️", label: "숙소", parent: "머무르기" },
  { id: "food", icon: "🍜", label: "맛집", parent: "먹고 마시기" },
  { id: "activity", icon: "🎟️", label: "체험", parent: "즐길 거리" },
  { id: "shopping", icon: "🛍️", label: "쇼핑", parent: "기념과 소비" },
  { id: "mobility", icon: "🚕", label: "이동", parent: "편한 동선" },
];

export const preferenceStepLabels: Record<PreferenceStepId, string> = Object.fromEntries(
  preferenceSteps.map((step) => [step.id, step.eyebrow]),
) as Record<PreferenceStepId, string>;
