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

export const PERSONAL_SURVEY_DRAFT_VERSION = 8;

export const preferenceSteps: readonly {
  id: PreferenceStepId;
  eyebrow: string;
  title: string;
  description: string;
}[] = [
  { id: "challengeStyle", eyebrow: "CHAPTER 1–3 · 계획표 밖의 선택", title: "계획표 밖에서 만나는 진짜 여행 성향", description: "예상하지 못한 여섯 장면에서 지금의 나와 가까운 답장을 골라 주세요." },
  { id: "itinerary", eyebrow: "CHAPTER 4 · 오늘의 여행 가방", title: "이번 여행에는 어떤 장면을 담아볼까요?", description: "하고 싶은 활동 8가지와 하루의 속도를 여행 메이트와 맞춰봐요." },
  { id: "accommodation", eyebrow: "CHAPTER 5 · 체크인할 시간", title: "오늘 밤 머물 숙소를 골라볼까요?", description: "두 숙소 카드 사이에서 마음이 기우는 정도를 표시해 주세요." },
  { id: "stamina", eyebrow: "CHAPTER 6 · 오후 5시의 배터리", title: "아직 보고 싶은 곳이 하나 남았어요", description: "아침부터 여행한 지금, 내 실제 체력과 가장 가까운 행동을 골라 주세요." },
  { id: "budget", eyebrow: "CHAPTER 7 · 여행 지갑", title: "여행 코인 100개를 어디에 쓸까요?", description: "더 기억에 남기고 싶은 곳에 코인을 나눠 담아 주세요." },
  { id: "discovery", eyebrow: "CHAPTER 8 · 마지막 두 장면", title: "이번 여행을 완성할 두 장면을 골라볼까요?", description: "대표 명소와 로컬 동네는 반대 선택이 아니에요. 각각 끌리는 정도를 알려 주세요." },
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

export const accommodationAxes: readonly { id: AccommodationAxis; icon: string; sceneTitle: string; left: string; right: string; leftNote: string; rightNote: string; helper: string }[] = [
  { id: "stayMeaning", icon: "🗝️", sceneTitle: "숙소 문을 열었어요", left: "잠만 편히 자면 충분해", right: "머무는 시간도 여행이야", leftNote: "동선과 잠자리가 기본이면 좋아요", rightNote: "공간의 분위기와 경험도 중요해요", helper: "숙소 자체의 경험을 얼마나 중요하게 보는지" },
  { id: "locationFacility", icon: "🗺️", sceneTitle: "두 숙소가 마지막까지 남았어요", left: "작아도 이동이 편한 숙소", right: "조금 멀어도 시설 좋은 숙소", leftNote: "주요 장소와 가까워 시간을 아껴요", rightNote: "수영장·라운지 등 머무는 즐거움이 있어요", helper: "동선의 편리함과 숙소 시설 중 더 끌리는 쪽" },
  { id: "comfortPrice", icon: "💳", sceneTitle: "예산과 편안함 사이에서", left: "비싸도 편안한 숙소", right: "실속 있는 합리적 숙소", leftNote: "좋은 침구와 넓은 공간을 우선해요", rightNote: "숙박비를 아껴 다른 경험에 써요", helper: "더 편안한 숙소와 비용 절약 사이의 기준" },
];

export const staminaOptions: readonly { id: StaminaLevel; label: string; description: string }[] = [
  { id: "low", label: "오늘은 여기까지가 좋아", description: "숙소로 돌아가 충분히 쉬어야 내일도 즐거워요" },
  { id: "medium", label: "잠깐 쉬고 한 곳 더 갈래", description: "카페나 벤치에서 충전하면 저녁 일정도 괜찮아요" },
  { id: "high", label: "아직 더 둘러볼 수 있어", description: "오래 걷고 여러 곳을 다녀도 에너지가 남는 편이에요" },
];

export const budgetCategories: readonly { id: BudgetCategory; icon: string; label: string; parent: string }[] = [
  { id: "stay", icon: "🛏️", label: "숙소", parent: "머무르기" },
  { id: "food", icon: "🍜", label: "맛집", parent: "먹고 마시기" },
  { id: "activity", icon: "🎟️", label: "체험", parent: "즐길 거리" },
  { id: "shopping", icon: "🛍️", label: "쇼핑", parent: "기념과 소비" },
  { id: "mobility", icon: "🚕", label: "이동", parent: "편한 동선" },
];

export const discoveryScenes: readonly {
  id: "landmarkImportance" | "localInterest";
  icon: string;
  sceneTitle: string;
  description: string;
  left: string;
  right: string;
}[] = [
  { id: "landmarkImportance", icon: "🏛️", sceneTitle: "도시의 대표 장면", description: "사진에서 보던 대표 명소가 가까이에 있어요. 이번 여행에 꼭 담고 싶은가요?", left: "시간이 맞으면", right: "꼭 담고 싶어" },
  { id: "localInterest", icon: "🪴", sceneTitle: "관광지 뒤편의 동네", description: "현지인의 일상이 보이는 시장과 골목이 있어요. 얼마나 궁금한가요?", left: "가볍게 궁금해", right: "깊이 걸어보고 싶어" },
];

export const preferenceStepLabels: Record<PreferenceStepId, string> = Object.fromEntries(
  preferenceSteps.map((step) => [step.id, step.eyebrow]),
) as Record<PreferenceStepId, string>;
