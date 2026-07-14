import type {
  EntityId,
  ItineraryItem,
  Place,
  Region,
  TripAnalysis,
  TripCandidate,
  TripRoom,
  User,
  UserPreferenceResult,
} from "../../domain";

export const DEMO_TRIP_ID = "trip-busan-2026";
export const DEMO_CURRENT_USER_ID = "user-soomin";

export type DuriDomainState = {
  schemaVersion: number;
  currentUserId: EntityId;
  activeTripId: EntityId;
  usersById: Record<EntityId, User>;
  regionsById: Record<EntityId, Region>;
  placesById: Record<EntityId, Place>;
  tripsById: Record<EntityId, TripRoom>;
  tripOrder: EntityId[];
  candidatesByTripId: Record<EntityId, TripCandidate[]>;
  itineraryByTripId: Record<EntityId, ItineraryItem[]>;
  preferenceResultsByUserId: Record<EntityId, UserPreferenceResult>;
  analysesByTripId: Record<EntityId, TripAnalysis>;
  savedPlaceIdsByUserId: Record<EntityId, EntityId[]>;
};

export function createDemoData(): DuriDomainState {
  const users: User[] = [
    { id: "user-soomin", name: "수민", initial: "수" },
    { id: "user-jiyoon", name: "지윤", initial: "지" },
    { id: "user-minjae", name: "민재", initial: "민" },
  ];

  const regions: Region[] = [
    {
      id: "jeju",
      name: "제주도",
      shortName: "제주",
      description: "바다와 오름을 천천히 둘러보는 여행",
      spots: 128,
      weather: "18도 맑음",
      imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "gyeongju",
      name: "경주",
      shortName: "경주",
      description: "걷기 좋은 골목과 유적 코스",
      spots: 84,
      weather: "21도 구름 조금",
      imageUrl: "https://images.unsplash.com/photo-1549880338-65ddcdfd017b?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "gangwon",
      name: "강원도",
      shortName: "강원",
      description: "숲, 바다, 드라이브 코스",
      spots: 103,
      weather: "19도 선선함",
      imageUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "busan",
      name: "부산",
      shortName: "부산",
      description: "카페, 바다, 야경을 같이 담는 도시",
      spots: 96,
      weather: "22도 맑음",
      imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "jeonnam",
      name: "전라남도",
      shortName: "전남",
      description: "느긋한 남도 미식과 섬 여행",
      spots: 77,
      weather: "23도 맑음",
      imageUrl: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80",
    },
  ];

  const places: Place[] = [
    {
      id: "gamcheon",
      regionId: "busan",
      name: "감천문화마을",
      category: "문화마을",
      tags: ["사진", "산책", "명소"],
      rating: 4.9,
      distanceLabel: "2.4km",
      imageUrl: "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=80",
      address: "부산 사하구 감내2로 203",
      summary: "골목을 따라 천천히 걸으며 사진을 남기기 좋은 후보 장소예요.",
    },
    {
      id: "jeonpo",
      regionId: "busan",
      name: "전포카페거리",
      category: "카페",
      tags: ["감성", "카페", "여유"],
      rating: 4.8,
      distanceLabel: "1.1km",
      imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
      address: "부산 부산진구 전포대로209번길",
      summary: "취향이 다른 동행자도 무난하게 즐길 수 있는 카페 밀집 코스예요.",
    },
    {
      id: "gwangalli",
      regionId: "busan",
      name: "광안리",
      category: "바다",
      tags: ["야경", "바다"],
      rating: 4.8,
      distanceLabel: "3.2km",
      imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
      address: "부산 수영구 광안해변로",
      summary: "저녁 일정에 넣으면 바다와 야경을 함께 챙길 수 있어요.",
    },
    {
      id: "gukje",
      regionId: "busan",
      name: "국제시장",
      category: "시장",
      tags: ["맛집", "로컬"],
      rating: 4.7,
      distanceLabel: "2.8km",
      imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80",
      address: "부산 중구 신창동4가",
      summary: "맛집 집중형 동행자가 좋아할 만한 로컬 먹거리 후보예요.",
    },
    {
      id: "huinnyeoul",
      regionId: "busan",
      name: "흰여울문화마을",
      category: "산책",
      tags: ["바다", "사진"],
      rating: 4.6,
      distanceLabel: "4.5km",
      imageUrl: "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=900&q=80",
      address: "부산 영도구 영선동4가",
      summary: "바다 옆 골목을 따라 걷는 코스로 감성 산책형에게 잘 맞아요.",
    },
    {
      id: "haeundae",
      regionId: "busan",
      name: "해운대",
      category: "해변",
      tags: ["바다", "야간"],
      rating: 4.7,
      distanceLabel: "5.6km",
      imageUrl: "https://images.unsplash.com/photo-1520454974749-611b7248ffdb?auto=format&fit=crop&w=900&q=80",
      address: "부산 해운대구 우동",
      summary: "일정 여유가 있을 때 넣기 좋은 대표 해변 후보예요.",
    },
  ];

  const trip: TripRoom = {
    id: DEMO_TRIP_ID,
    title: "부산 1박 2일 여행",
    regionId: "busan",
    startDate: "2026-07-18",
    endDate: "2026-07-19",
    status: "drafting",
    transport: "public",
    budgetLevel: "standard",
    intensity: "balanced",
    members: [
      { userId: "user-soomin", role: "owner", preferenceStatus: "completed" },
      { userId: "user-jiyoon", role: "member", preferenceStatus: "completed" },
      { userId: "user-minjae", role: "member", preferenceStatus: "pending" },
    ],
  };

  const candidates: TripCandidate[] = [
    { tripId: trip.id, placeId: "huinnyeoul", addedByUserIds: ["user-jiyoon"], recommendedByDuri: true },
    { tripId: trip.id, placeId: "gukje", addedByUserIds: ["user-minjae"], recommendedByDuri: true },
    { tripId: trip.id, placeId: "haeundae", addedByUserIds: ["user-soomin"], recommendedByDuri: false },
    { tripId: trip.id, placeId: "jeonpo", addedByUserIds: ["user-soomin", "user-jiyoon"], recommendedByDuri: false },
    { tripId: trip.id, placeId: "gamcheon", addedByUserIds: ["user-soomin", "user-minjae"], recommendedByDuri: false },
    {
      tripId: trip.id,
      placeId: "gwangalli",
      addedByUserIds: trip.members.map((member) => member.userId),
      recommendedByDuri: false,
    },
  ];

  const itinerary: ItineraryItem[] = [
    {
      id: "itinerary-jeonpo-day1",
      tripId: trip.id,
      placeId: "jeonpo",
      date: "2026-07-18",
      startTime: "11:00",
      durationMinutes: 90,
      itemType: "place",
      preferredByUserIds: ["user-soomin", "user-jiyoon"],
    },
    {
      id: "itinerary-gamcheon-day1",
      tripId: trip.id,
      placeId: "gamcheon",
      date: "2026-07-18",
      startTime: "14:00",
      durationMinutes: 120,
      itemType: "place",
      preferredByUserIds: ["user-soomin", "user-minjae"],
    },
    {
      id: "itinerary-gwangalli-day1",
      tripId: trip.id,
      placeId: "gwangalli",
      date: "2026-07-18",
      startTime: "18:30",
      durationMinutes: 120,
      itemType: "place",
      preferredByUserIds: trip.members.map((member) => member.userId),
    },
  ];

  return {
    schemaVersion: 2,
    currentUserId: DEMO_CURRENT_USER_ID,
    activeTripId: trip.id,
    usersById: Object.fromEntries(users.map((user) => [user.id, user])),
    regionsById: Object.fromEntries(regions.map((region) => [region.id, region])),
    placesById: Object.fromEntries(places.map((place) => [place.id, place])),
    tripsById: { [trip.id]: trip },
    tripOrder: [trip.id],
    candidatesByTripId: { [trip.id]: candidates },
    itineraryByTripId: { [trip.id]: itinerary },
    preferenceResultsByUserId: {
      "user-soomin": {
        userId: "user-soomin",
        answers: { pace: 0, budget: 1, mobility: 0, activity: 0, mealStyle: 1, planningStyle: 1 },
        profileType: "감성산책형",
        traits: ["느린 동선", "풍경", "카페"],
        preferredTags: ["카페", "산책", "여유", "바다"],
        completedAt: "2026-07-01",
        version: 1,
      },
      "user-jiyoon": {
        userId: "user-jiyoon",
        answers: { pace: 0, budget: 1, mobility: 1, activity: 1, mealStyle: 1, planningStyle: 2 },
        profileType: "여유탐색형",
        traits: ["카페", "바다", "사진"],
        preferredTags: ["명소", "사진", "카페", "산책"],
        completedAt: "2026-07-02",
        version: 1,
      },
    },
    // 이전 persist schema와의 호환을 위해 필드는 유지하되, 실제 분석은 일정에서 동적으로 계산한다.
    analysesByTripId: {},
    savedPlaceIdsByUserId: {
      "user-soomin": ["gamcheon", "gwangalli"],
      "user-jiyoon": ["jeonpo", "huinnyeoul"],
      "user-minjae": ["gamcheon", "gukje"],
    },
  };
}


