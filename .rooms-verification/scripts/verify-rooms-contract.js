"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serverRoomViewModel_1 = require("../src/features/trips/adapters/serverRoomViewModel");
const roomsApi_1 = require("../src/features/trips/services/roomsApi");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function expectFailure(operation, message) {
    try {
        operation();
    }
    catch {
        return;
    }
    throw new Error(message);
}
const room = (0, roomsApi_1.parseServerRoomSummary)({
    id: "room-1",
    title: "게스트 통합 테스트 여행",
    destination: "부산",
    destinationDetail: { name: "부산", regionCode: "BUSAN" },
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    status: "ongoing",
    createdBy: "owner-1",
    members: [
        { userId: "owner-1", role: "owner", preferenceCompleted: true },
        { userId: "guest-1", role: "member", preferenceCompleted: false },
    ],
    candidateCount: 3,
    scheduleItemCount: 2,
    progressLabel: "후보 수집",
    lastUpdated: "2026-07-23T00:00:00.000Z",
    summary: "부산 여행 계획",
    currentStep: 4,
});
assert(room.members.length === 2, "member list must preserve owner and guest");
assert(room.destinationDetail?.regionCode === "BUSAN", "destination detail must preserve the backend region code");
const viewModel = (0, serverRoomViewModel_1.serverRoomCardViewModel)(room, { id: "guest-1", name: "초대게스트", initial: "초" }, [{ id: "busan", name: "부산", shortName: "부산", description: "", spots: 0, weather: "", imageUrl: "busan.jpg" }]);
assert(viewModel.memberCount === 2, "guest card must show the backend member count");
assert(viewModel.members.some((member) => member.name === "초대게스트"), "current guest profile must be mapped without inventing another identity");
assert(viewModel.destinationName === "부산" && viewModel.imageUrl === "busan.jpg", "backend destination must map to the matching presentation region");
assert(viewModel.preferenceCompletedCount === 1, "preference completion count must come from backend members");
assert(!viewModel.isOwner, "guest must not be rendered as the room owner");
expectFailure(() => (0, roomsApi_1.parseServerRoomSummary)({ ...room, status: "unknown" }), "unknown backend status must fail closed");
expectFailure(() => (0, roomsApi_1.parseServerRoomSummary)({ ...room, members: undefined }), "missing backend members must fail closed");
console.log("Rooms contract verification passed: parsing, guest membership, ownership, destination, and fail-closed validation");
