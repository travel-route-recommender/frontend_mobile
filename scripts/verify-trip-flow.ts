import type { Region, TripRoom, User } from "../src/domain";
import { calculateTripPreparationProgress } from "../src/features/trips/logic/calculateTripPreparationProgress";
import { selectTripRoomCardViewModel } from "../src/features/trips/selectors";
import { getTripDayCount } from "../src/features/trips/utils/tripDateUtils";
import { normalizeInvitedUserIds, validateCreateTripDraft } from "../src/features/trip-creation/validation/validateCreateTripDraft";
import type { CreateTripDraft } from "../src/features/trip-creation/types";
import { CREATE_TRIP_DRAFT_VERSION } from "../src/features/trip-creation/types";
import { selectCompletedTripsForCurrentUser, selectPlanningTripsForCurrentUser } from "../src/store/selectors";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const users: Record<string, User> = {
  owner: { id: "owner", name: "방장", initial: "방" },
  friend: { id: "friend", name: "친구", initial: "친" },
};
const regions: Record<string, Region> = { busan: { id: "busan", name: "부산", shortName: "부산", description: "바다", spots: 1, weather: "맑음", imageUrl: "image" } };
const trip = (id: string, startDate: string, endDate: string, status: TripRoom["status"] = "planning"): TripRoom => ({ id, title: id, regionId: "busan", startDate, endDate, status, transport: "public", budgetLevel: "standard", intensity: "balanced", members: [{ userId: "owner", role: "owner" }] });
const tripsById = {
  later: trip("later", "2026-08-10", "2026-08-11"),
  sooner: trip("sooner", "2026-08-01", "2026-08-02"),
  latestDone: trip("latestDone", "2026-06-01", "2026-06-05", "completed"),
  olderDone: trip("olderDone", "2026-05-01", "2026-05-02", "completed"),
};
const collection = { currentUserId: "owner", tripsById, tripOrder: ["later", "sooner", "later", "olderDone", "latestDone"] };
assert(selectPlanningTripsForCurrentUser(collection).map((item) => item.id).join(",") === "sooner,later", "진행 중 여행은 시작일 오름차순이며 중복 ID를 제거해야 한다");
assert(selectCompletedTripsForCurrentUser(collection).map((item) => item.id).join(",") === "latestDone,olderDone", "완료 여행은 종료일 내림차순이어야 한다");

assert(getTripDayCount("2026-08-01", "2026-08-02") === 2, "1박 2일은 달력일 2일이어야 한다");
assert(getTripDayCount("2026-08-02", "2026-08-01") === undefined, "역전된 날짜 범위는 거부해야 한다");

const draft: CreateTripDraft = { configVersion: CREATE_TRIP_DRAFT_VERSION, ownerUserId: "owner", currentStep: 4, regionId: "busan", startDate: "2026-08-02", endDate: "2026-08-01", transport: "public", budgetLevel: "standard", intensity: "balanced", selectedMemberUserIds: [], title: "부산 여행", startedAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" };
const validationContext = { regionsById: regions, usersById: users, currentUserId: "owner" };
assert(validateCreateTripDraft(draft, validationContext)?.includes("종료일"), "역전된 생성 날짜는 validation 오류여야 한다");
assert(normalizeInvitedUserIds(["friend", "friend", "owner", "missing"], "owner", users).join(",") === "friend", "동행자는 중복·방장·없는 사용자를 제거해야 한다");

const progress = calculateTripPreparationProgress({ trip: tripsById.sooner, completedPreferenceCount: 1, preferenceTargetCount: 2, candidateCount: 2, itineraryCount: 0 });
assert(progress.totalSteps === 5 && progress.completedSteps === 1 && progress.activeSteps === 2 && progress.rate === 0.4, "준비율은 완료 1점·진행 0.5점 기준이어야 한다");

const selectorSource = { ...collection, usersById: users, regionsById: regions, candidatesByTripId: {}, itineraryByTripId: {}, preferenceResultsByUserId: {} };
assert(selectTripRoomCardViewModel(selectorSource, "missing") === undefined, "없는 tripId의 ViewModel은 undefined여야 한다");
const card = selectTripRoomCardViewModel(selectorSource, "sooner", "2026-07-31");
assert(card?.memberCount === 1 && card.timingLabel === "D-1" && card.destinationName === "부산", "카드 ViewModel은 관계와 D-day를 파생해야 한다");

console.log("Trip flow verification passed: sorting, dates, draft, members, progress, and ViewModel");

