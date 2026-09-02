import type { User } from "../../../domain";

export const MOCK_FRIEND_FIXTURE_OWNER_ID = "user-soomin";

export const MOCK_FRIEND_IDS = ["user-jiyoon", "user-minjae", "user-hyunho", "user-suhyeon"] as const;
export const NEW_MOCK_FRIEND_IDS = ["user-hyunho", "user-suhyeon"] as const;

export type MockFriendId = (typeof MOCK_FRIEND_IDS)[number];

export const MOCK_SAVED_FRIEND_IDS_BY_USER_ID: Readonly<Record<string, readonly MockFriendId[]>> = {
  [MOCK_FRIEND_FIXTURE_OWNER_ID]: MOCK_FRIEND_IDS,
};

const EMPTY_MOCK_FRIEND_IDS: readonly MockFriendId[] = [];

export function getMockSavedFriendIds(userId: string) {
  return MOCK_SAVED_FRIEND_IDS_BY_USER_ID[userId] ?? EMPTY_MOCK_FRIEND_IDS;
}

export const mockFriendProfiles: Record<MockFriendId, User> = {
  "user-jiyoon": { id: "user-jiyoon", name: "윤지", initial: "윤" },
  "user-minjae": { id: "user-minjae", name: "민석", initial: "민" },
  "user-hyunho": { id: "user-hyunho", name: "현호", initial: "현" },
  "user-suhyeon": { id: "user-suhyeon", name: "수현", initial: "수" },
};

export const mockFriendDescriptions: Record<MockFriendId, string> = {
  "user-jiyoon": "카페와 로컬 골목을 천천히 둘러보는 여행을 좋아해요.",
  "user-minjae": "명소와 액티비티를 알차게 채우는 여행을 좋아해요.",
  "user-hyunho": "자연과 체험을 중심으로 여유 있게 움직이는 여행을 좋아해요.",
  "user-suhyeon": "맛집과 쇼핑을 즐기며 편안하게 둘러보는 여행을 좋아해요.",
};

export function getMockFriendProfile(friendId: string) {
  return mockFriendProfiles[friendId as MockFriendId] ?? null;
}
