"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomsApi = void 0;
exports.parseServerRoomSummary = parseServerRoomSummary;
const apiClient_1 = require("../../../services/apiClient");
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function requiredString(source, key) {
    const value = source[key];
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Rooms API 응답의 ${key} 값이 올바르지 않아요.`);
    }
    return value;
}
function optionalString(source, key) {
    const value = source[key];
    return typeof value === "string" && value.trim() ? value : undefined;
}
function nonNegativeNumber(source, key) {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
function parseDestination(value) {
    if (!isRecord(value))
        return undefined;
    const name = optionalString(value, "name");
    if (!name)
        return undefined;
    const regionCode = optionalString(value, "regionCode");
    const lat = typeof value.lat === "number" && Number.isFinite(value.lat) ? value.lat : undefined;
    const lng = typeof value.lng === "number" && Number.isFinite(value.lng) ? value.lng : undefined;
    return {
        name,
        ...(regionCode ? { regionCode } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
    };
}
function parseMember(value) {
    if (!isRecord(value))
        throw new Error("Rooms API 응답의 멤버 정보가 올바르지 않아요.");
    const role = value.role;
    if (role !== "owner" && role !== "member") {
        throw new Error("Rooms API 응답의 멤버 권한이 올바르지 않아요.");
    }
    return {
        userId: requiredString(value, "userId"),
        role,
        preferenceCompleted: Boolean(value.preferenceCompleted),
    };
}
function parseServerRoomSummary(value) {
    if (!isRecord(value))
        throw new Error("Rooms API 응답 형식이 올바르지 않아요.");
    const status = value.status;
    if (status !== "ongoing" && status !== "completed") {
        throw new Error("Rooms API 응답의 여행 상태가 올바르지 않아요.");
    }
    const rawMembers = value.members;
    if (!Array.isArray(rawMembers))
        throw new Error("Rooms API 응답에 멤버 목록이 없어요.");
    const destinationDetail = parseDestination(value.destinationDetail);
    const destination = optionalString(value, "destination") ?? destinationDetail?.name ?? "미정";
    const startDate = optionalString(value, "startDate");
    const endDate = optionalString(value, "endDate");
    return {
        id: requiredString(value, "id"),
        title: requiredString(value, "title"),
        destination,
        ...(destinationDetail ? { destinationDetail } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        status,
        createdBy: requiredString(value, "createdBy"),
        members: rawMembers.map(parseMember),
        candidateCount: nonNegativeNumber(value, "candidateCount"),
        scheduleItemCount: nonNegativeNumber(value, "scheduleItemCount"),
        progressLabel: optionalString(value, "progressLabel") ?? "진행 중",
        lastUpdated: optionalString(value, "lastUpdated") ?? "",
        summary: optionalString(value, "summary") ?? "여행 계획을 시작해보세요",
        currentStep: Math.min(5, Math.floor(nonNegativeNumber(value, "currentStep"))),
    };
}
function parseRoomList(value) {
    if (!Array.isArray(value))
        throw new Error("Rooms API 응답에 여행방 목록이 없어요.");
    return value.map(parseServerRoomSummary);
}
function parseCreatedRoomId(value) {
    if (!isRecord(value))
        throw new Error("여행방 생성 응답 형식이 올바르지 않아요.");
    return requiredString(value, "id");
}
function parseInviteLink(value) {
    if (!isRecord(value))
        throw new Error("초대 코드 응답 형식이 올바르지 않아요.");
    return {
        inviteCode: requiredString(value, "inviteCode"),
        inviteLink: requiredString(value, "inviteLink"),
    };
}
exports.roomsApi = {
    async listMine(signal) {
        const response = await apiClient_1.apiClient.request({ path: "/rooms/me", signal });
        return parseRoomList(response);
    },
    async getSummary(roomId, signal) {
        const response = await apiClient_1.apiClient.request({
            path: `/rooms/${encodeURIComponent(roomId)}/summary`,
            signal,
        });
        return parseServerRoomSummary(response);
    },
    async create(input) {
        const created = await apiClient_1.apiClient.request({
            path: "/rooms",
            method: "POST",
            body: { ...(input.title?.trim() ? { title: input.title.trim() } : {}) },
        });
        const roomId = parseCreatedRoomId(created);
        await apiClient_1.apiClient.request({
            path: `/rooms/${encodeURIComponent(roomId)}`,
            method: "PATCH",
            body: { startDate: input.startDate, endDate: input.endDate },
        });
        await apiClient_1.apiClient.request({
            path: `/rooms/${encodeURIComponent(roomId)}/destination`,
            method: "PATCH",
            body: input.destination,
        });
        return this.getSummary(roomId);
    },
    async getInviteLink(roomId, signal) {
        const response = await apiClient_1.apiClient.request({
            path: `/rooms/${encodeURIComponent(roomId)}/invite-link`,
            signal,
        });
        return parseInviteLink(response);
    },
};
