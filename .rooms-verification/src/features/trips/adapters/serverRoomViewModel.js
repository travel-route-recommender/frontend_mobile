"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatServerRoomDateRange = formatServerRoomDateRange;
exports.serverRoomCardViewModel = serverRoomCardViewModel;
const formatters_1 = require("../../../utils/formatters");
const preparationLabels = [
    "여행지 설정",
    "일정 설정",
    "동행자 초대",
    "후보 수집",
    "일정 작성",
];
function preparation(room) {
    const completedSteps = Math.min(preparationLabels.length, Math.max(0, room.currentStep));
    return {
        completedSteps,
        activeSteps: room.status === "ongoing" && completedSteps < preparationLabels.length ? 1 : 0,
        totalSteps: preparationLabels.length,
        rate: room.status === "completed" ? 1 : completedSteps / preparationLabels.length,
        steps: preparationLabels.map((label, index) => ({
            id: ["room", "preferences", "candidates", "itinerary", "confirmation"][index],
            label,
            description: index < completedSteps ? "완료했어요." : index === completedSteps ? room.progressLabel : "아직 시작하지 않았어요.",
            status: index < completedSteps ? "completed" : index === completedSteps && room.status === "ongoing" ? "active" : "pending",
        })),
    };
}
function formatServerRoomDateRange(room) {
    return (0, formatters_1.formatTripDateRange)(room.startDate ?? "", room.endDate ?? "");
}
function matchingRegion(room, regions) {
    const destination = room.destination.trim().toLocaleLowerCase("ko");
    const regionCode = room.destinationDetail?.regionCode?.trim().toLocaleLowerCase("ko");
    return regions.find((region) => region.id.toLocaleLowerCase("ko") === regionCode ||
        region.name.toLocaleLowerCase("ko") === destination ||
        region.shortName.toLocaleLowerCase("ko") === destination);
}
function serverRoomCardViewModel(room, currentUser, regions) {
    const region = matchingRegion(room, regions);
    const completedPreferences = room.members.filter((member) => member.preferenceCompleted).length;
    const memberViews = room.members.map((member, index) => {
        const isCurrentUser = member.userId === currentUser?.id;
        const name = isCurrentUser ? currentUser.name : `참여자 ${index + 1}`;
        return {
            userId: member.userId,
            name,
            initial: isCurrentUser ? currentUser.initial : "?",
            ...(isCurrentUser && currentUser.profileImageUrl ? { profileImageUrl: currentUser.profileImageUrl } : {}),
        };
    });
    return {
        id: room.id,
        title: room.title,
        destinationName: room.destination || "목적지 미정",
        ...(region?.imageUrl ? { imageUrl: region.imageUrl } : {}),
        dateLabel: formatServerRoomDateRange(room),
        status: room.status === "completed" ? "completed" : "planning",
        statusLabel: room.status === "completed" ? "여행 완료" : room.progressLabel,
        members: memberViews,
        memberCount: room.members.length,
        candidateCount: room.candidateCount,
        itineraryCount: room.scheduleItemCount,
        preferenceCompletedCount: completedPreferences,
        preferenceTotalCount: room.members.length,
        preparation: preparation(room),
        isOwner: room.createdBy === currentUser?.id,
    };
}
