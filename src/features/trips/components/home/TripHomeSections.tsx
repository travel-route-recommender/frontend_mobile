import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { EntityId, ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../../../../domain";
import { AppHeader, Avatar, Card, RemoteImage, SecondaryButton } from "../../../../components/common";
import { radius, shadows, spacing } from "../../../../theme/tokens";
import { formatDayLabel, formatTripDateRange, formatTripStatus } from "../../../../utils/formatters";
import { sortItineraryItemsByDateAndTime } from "../../../../utils/schedule";
import type { RoomPreferenceResponseSummary } from "../../selectors";
import type { TripPreparationProgress } from "../../types";
import { formatTripDurationLabel, getTripTimingLabel } from "../../utils/tripDateUtils";
import type { TripHomeDuriState } from "../../logic/selectTripHomeDuriState";

export type { TripHomeDuriState } from "../../logic/selectTripHomeDuriState";

const CONTINUE_SCHEDULE_IMAGE = require("../../../../../assets/images/duri/trip-home/continue-schedule.png");
const DURI_ANALYSIS_IMAGE = require("../../../../../assets/images/duri/trip-home/duri-analysis.png");

const foundation = {
  primary: "#4388FF",
  primarySoft: "#DDEBFF",
  hero: "#F2F8FF",
  duri: "#F3F1FF",
  planning: "#F0EDFF",
  peach: "#FFF0E2",
  mint: "#EAF7EE",
  text: "#17265F",
  secondary: "#60719B",
  muted: "#8290AE",
  white: "#FFFFFF",
  border: "#DCE7F7",
  duriBorder: "#D9D5FF",
  heroBorder: "#CFE4FF",
  lavenderAccent: "#7567C9",
  success: "#2E9B66",
  warning: "#D67B24",
} as const;

type TripHomePresentation = Pick<TripRoom, "id" | "title" | "status" | "startDate" | "endDate" | "members">;

export type TripNextAction = {
  title: string;
  description: string;
  label: string;
  onPress(): void;
};

export function TripHomeHero({ trip, region, usersById, currentUserId, onBack }: { trip: TripHomePresentation; region?: Region; usersById: Record<EntityId, User>; currentUserId: EntityId; onBack(): void }) {
  const owner = trip.members.find((member) => member.role === "owner");
  const members = trip.members.flatMap((member) => usersById[member.userId] ? [usersById[member.userId]] : []);
  const timing = getTripTimingLabel(trip.startDate, trip.endDate);
  const statusTone = trip.status === "completed" ? styles.badgeNeutral : trip.status === "confirmed" ? styles.badgeMint : styles.badgePeach;
  return <View>
    <AppHeader title="여행방" onBack={onBack} />
    <Card style={styles.identityCard}>
      <View style={styles.identityHeading}>
        <View style={styles.identityCopy}>
          <Text numberOfLines={2} style={styles.tripTitle}>{trip.title}</Text>
          <Text style={styles.tripMeta}>{region?.name ?? "목적지 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)}</Text>
          <Text style={styles.tripSubMeta}>{formatTripDurationLabel(trip.startDate, trip.endDate)} · {trip.members.length}명 함께</Text>
        </View>
        <View style={styles.identityBadges}>
          <View style={[styles.badge, statusTone]}><Text style={styles.badgeText}>{formatTripStatus(trip.status)}</Text></View>
          {owner?.userId === currentUserId ? <View style={[styles.badge, styles.badgeBlue]}><Text style={[styles.badgeText, styles.badgeBlueText]}>방장</Text></View> : null}
          {timing ? <Text style={styles.timing}>{timing}</Text> : null}
        </View>
      </View>
      <View style={styles.memberLine}>
        <View style={styles.avatarStack}>{members.slice(0, 5).map((member, index) => <View key={member.id} style={[styles.avatarSlot, index > 0 && styles.avatarOverlap]}><Avatar name={member.name} uri={member.profileImageUrl} size={34} /></View>)}</View>
        <Text numberOfLines={1} style={styles.memberLabel}>{members.map((member) => member.name).join(" · ")}</Text>
      </View>
    </Card>
  </View>;
}

export function TripPreparationCard({ preparation, nextAction, onAction, readOnly }: { preparation: TripPreparationProgress; nextAction: TripNextAction; onAction(stepId: TripPreparationProgress["steps"][number]["id"]): void; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const completedRate = preparation.totalSteps ? preparation.completedSteps / preparation.totalSteps : 0;
  const pendingSteps = Math.max(preparation.totalSteps - preparation.completedSteps - preparation.activeSteps, 0);
  const nextActionTitle = nextAction.title === "일정을 계속 만들어보세요" ? "일정을 계속\n만들어보세요" : nextAction.title;
  return <View style={styles.sectionGap}>
    <Text style={styles.sectionHeading}>지금 할 일</Text>
    <Card style={styles.nextCard}>
      <View style={styles.nextCopy}>
        <Text style={styles.nextKicker}>{preparation.completedSteps}개 완료 · {preparation.activeSteps}개 진행 중{pendingSteps ? ` · ${pendingSteps}개 대기` : ""}</Text>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: preparation.totalSteps, now: preparation.completedSteps, text: `${preparation.totalSteps}개 중 ${preparation.completedSteps}개 완료` }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(completedRate * 100)}%` }]} /></View>
        <Text style={styles.nextTitle}>{nextActionTitle}</Text>
        <Text style={styles.nextDescription}>{nextAction.description}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={nextAction.label} onPress={nextAction.onPress} style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}><Text style={styles.primaryCtaText}>{nextAction.label}</Text><Text style={styles.primaryCtaArrow}>→</Text></Pressable>
      </View>
      <Image accessibilityElementsHidden resizeMode="contain" source={CONTINUE_SCHEDULE_IMAGE} style={styles.nextImage} />
    </Card>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.disclosure}><Text style={styles.disclosureText}>{expanded ? "준비 단계 접기" : "준비 단계 자세히 보기"}</Text><Text style={styles.disclosureArrow}>{expanded ? "⌃" : "⌄"}</Text></Pressable>
    {expanded ? <View style={styles.preparationDetails}>{preparation.steps.map((step) => <View key={step.id} accessibilityLabel={`${step.label}, ${step.status === "completed" ? "완료" : step.status === "active" ? "진행 중" : "대기"}`} style={styles.checkRow}>
      <View style={[styles.check, step.status === "completed" && styles.checkComplete, step.status === "active" && styles.checkActive]}><Text style={styles.checkText}>{step.status === "completed" ? "✓" : step.status === "active" ? "•" : ""}</Text></View>
      <View style={styles.flex}><Text style={styles.bodyStrong}>{step.label}</Text><Text style={styles.caption}>{step.description}</Text></View>
      {!readOnly && step.status !== "completed" && step.actionLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${step.label} ${step.actionLabel}`} onPress={() => onAction(step.id)} style={styles.inlineAction}><Text style={styles.link}>{step.id === "itinerary" ? "일정 계속" : step.actionLabel}</Text></Pressable> : null}
    </View>)}</View> : null}
  </View>;
}

export function TripQuickActions({ completed, onWorkspace, onExplore, onInvite, onDocuments }: { completed: boolean; onWorkspace(): void; onExplore(): void; onInvite(): void; onDocuments?: () => void }) {
  return <View style={styles.sectionGap}>
    <Text style={styles.sectionHeading}>빠른 메뉴</Text>
    <View style={styles.quickGrid}>
      {completed ? <QuickAction label="여행 기록 보기" symbol="▦" onPress={onWorkspace} /> : <QuickAction label="장소 더 찾기" symbol="⌕" tone="lavender" onPress={onExplore} />}
      {!completed ? <QuickAction label="동행자 초대" symbol="+" tone="mint" onPress={onInvite} /> : null}
      {onDocuments ? <QuickAction label="문서 추가" symbol="▤" tone="peach" onPress={onDocuments} /> : null}
    </View>
  </View>;
}

function QuickAction({ label, symbol, tone = "default", onPress }: { label: string; symbol: string; tone?: "default" | "lavender" | "mint" | "peach"; onPress(): void }) {
  const iconTone = tone === "lavender" ? styles.quickIconLavender : tone === "mint" ? styles.quickIconMint : tone === "peach" ? styles.quickIconPeach : undefined;
  const symbolTone = tone === "lavender" ? styles.quickSymbolLavender : tone === "mint" ? styles.quickSymbolMint : tone === "peach" ? styles.quickSymbolPeach : undefined;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><View style={[styles.quickIcon, iconTone]}><Text style={[styles.quickSymbol, symbolTone]}>{symbol}</Text></View><Text numberOfLines={1} style={styles.quickLabel}>{label}</Text><Text style={styles.quickArrow}>›</Text></Pressable>;
}

export function TripPlanningSection({ trip, candidates, placesById, usersById, itinerary, onExplore, onWorkspace }: { trip: Pick<TripRoom, "members" | "status" | "startDate">; candidates: TripCandidate[]; placesById: Record<EntityId, Place>; usersById: Record<EntityId, User>; itinerary: ItineraryItem[]; onExplore(): void; onWorkspace(): void }) {
  const [expanded, setExpanded] = useState(false);
  const scheduledIds = new Set(itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const scheduledCandidateCount = candidates.filter((candidate) => scheduledIds.has(candidate.placeId)).length;
  const unscheduledCount = Math.max(candidates.length - scheduledCandidateCount, 0);
  const commonCount = candidates.filter((candidate) => trip.members.length > 0 && new Set(candidate.addedByUserIds).size >= trip.members.length).length;
  const recent = [...candidates].sort((left, right) => (right.addedAt ?? "").localeCompare(left.addedAt ?? "") || left.placeId.localeCompare(right.placeId)).slice(0, 3);
  const sorted = sortItineraryItemsByDateAndTime(itinerary);
  const ctaLabel = trip.status === "completed" ? "일정 보기" : itinerary.length ? "일정 계속 만들기" : "일정 만들기";
  return <View style={styles.sectionGap}>
    <View style={styles.sectionHeadingRow}><Text style={styles.sectionHeading}>여행 계획</Text><Text style={styles.sectionHint}>후보 모으기 → 일정에 배치</Text></View>
    <Card style={styles.planningCard}>
      <View style={styles.metricRow}>
        <View style={[styles.metric, styles.metricLavender]}><Text style={styles.metricLabel}>후보 장소</Text><Text style={styles.metricValue}>{candidates.length}</Text><Text style={styles.metricUnit}>곳</Text></View>
        <Text style={styles.flowArrow}>→</Text>
        <View style={[styles.metric, styles.metricBlue]}><Text style={styles.metricLabel}>일정</Text><Text style={styles.metricValue}>{itinerary.length}</Text><Text style={styles.metricUnit}>개</Text></View>
      </View>
      <View style={styles.planMessage}><View style={styles.planDot} /><View style={styles.flex}><Text style={styles.planMessageTitle}>{unscheduledCount ? `아직 ${unscheduledCount}곳을 일정에 배치할 수 있어요` : itinerary.length ? "모은 후보를 일정에 잘 담았어요" : "후보를 모아 첫 일정을 만들어보세요"}</Text><Text style={styles.planMessageText}>{commonCount ? `모두가 고른 장소 ${commonCount}곳을 먼저 확인해보세요.` : "동행자와 모은 장소를 날짜와 시간에 맞춰보세요."}</Text></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel={ctaLabel} onPress={onWorkspace} style={({ pressed }) => [styles.outlineCta, pressed && styles.pressed]}><Text style={styles.outlineCtaText}>{ctaLabel}</Text><Text style={styles.outlineCtaText}>→</Text></Pressable>
      <View style={styles.planSecondary}><Pressable accessibilityRole="button" onPress={onExplore} style={styles.inlineAction}><Text style={styles.link}>{candidates.length ? "장소 더 찾기" : "장소 추가하기"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.inlineAction}><Text style={styles.link}>{expanded ? "계획 미리보기 접기" : "계획 미리보기"}</Text></Pressable></View>
      {expanded ? <View style={styles.planDetails}>
        <Text style={styles.detailHeading}>후보 장소</Text>
        {recent.length ? recent.map((candidate) => { const place = placesById[candidate.placeId]; if (!place) return null; const addedBy = candidate.addedByUserIds.flatMap((id) => usersById[id]?.name ? [usersById[id].name] : []).join(", "); return <View key={candidate.placeId} style={styles.placeRow}><View style={styles.placeImage}><RemoteImage uri={place.imageUrl} accessibilityLabel={place.name} aspectRatio={1} /></View><View style={styles.flex}><Text style={styles.bodyStrong}>{place.name}</Text><Text style={styles.caption}>{addedBy ? `${addedBy} 추가` : "추가한 멤버 정보 없음"}</Text><Text style={[styles.caption, scheduledIds.has(place.id) && styles.successText]}>{scheduledIds.has(place.id) ? "일정에 배치됨" : "아직 일정에 미배치"}</Text></View></View>; }) : <Text style={styles.caption}>아직 후보 장소가 없어요.</Text>}
        <Text style={styles.detailHeading}>일정 미리보기</Text>
        {sorted.length ? sorted.slice(0, 3).map((item) => <View key={item.id} style={styles.scheduleRow}><View style={styles.timeBox}><Text style={styles.time}>{item.startTime}</Text><Text style={styles.day}>{formatDayLabel(item.date, trip.startDate)}</Text></View><View style={styles.flex}><Text style={styles.bodyStrong}>{item.placeId ? placesById[item.placeId]?.name ?? "알 수 없는 장소" : item.note ?? "일정 항목"}</Text><Text style={styles.caption}>{item.date} · {item.durationMinutes}분</Text></View></View>) : <Text style={styles.caption}>아직 일정이 비어 있어요.</Text>}
      </View> : null}
    </Card>
  </View>;
}

export function DuriAnalysisCard({ state, onPress }: { state: TripHomeDuriState; onPress(): void }) {
  const copy = state.kind === "no-itinerary"
    ? { title: "일정을 만들면 두리가 점검해드려요", description: "먼저 후보 장소를 날짜와 시간에 배치해보세요.", label: "일정 만들기", disabled: false }
    : state.kind === "loading"
      ? { title: "두리가 현재 일정을 살펴보고 있어요", description: "동선과 동행자 취향의 균형을 분석하는 중이에요.", label: "분석 중", disabled: true }
      : state.kind === "existing"
        ? { title: "두리의 일정 점검 결과가 준비됐어요", description: `현재 일정에서 조율할 항목 ${state.issueCount}개를 확인했어요.`, label: "분석 결과 보기", disabled: false }
        : state.kind === "stale"
          ? { title: "일정이 바뀌어 다시 점검이 필요해요", description: "최신 일정으로 동선과 취향 균형을 다시 분석해보세요.", label: "다시 분석하기", disabled: false }
          : state.kind === "unavailable"
            ? { title: "두리 분석을 준비하고 있어요", description: state.message ?? "분석 기능 연결을 확인한 뒤 다시 이용해 주세요.", label: "분석 준비 중", disabled: true }
            : { title: "두리가 현재 일정을 점검해볼까요?", description: "여행의 속도·식사·이동 경로의 균형을 분석해드릴게요.", label: "DURI 분석하기", disabled: false };
  return <View style={styles.sectionGap}>
    <Text style={styles.sectionHeading}>DURI 추천</Text>
    <Card style={styles.duriCard}>
      <View style={styles.duriCopy}>
        <Text style={styles.duriKicker}>DURI ANALYSIS</Text>
        <Text style={styles.duriTitle}>{copy.title}</Text>
        <Text style={styles.duriDescription}>{copy.description}</Text>
        <Pressable accessibilityRole="button" disabled={copy.disabled} onPress={onPress} style={({ pressed }) => [styles.duriCta, copy.disabled && styles.disabled, pressed && !copy.disabled && styles.pressed]}><Text style={styles.duriCtaText}>{copy.label}</Text><Text style={styles.duriCtaText}>→</Text></Pressable>
      </View>
      <Image accessibilityElementsHidden resizeMode="contain" source={DURI_ANALYSIS_IMAGE} style={styles.duriImage} />
    </Card>
  </View>;
}

export function InviteMemberModal({ visible, trip, usersById, onInvite, onClose }: { visible: boolean; trip: TripRoom; usersById: Record<EntityId, User>; onInvite(userId: EntityId): void; onClose(): void }) {
  const memberIds = new Set(trip.members.map((member) => member.userId));
  const available = Object.values(usersById).filter((user) => !memberIds.has(user.id));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><Card style={styles.modal}>
    <Text style={styles.sectionHeading}>데모 동행자 초대</Text><Text style={styles.body}>mock 모드에서는 기존 데모 사용자를 멤버로 바로 추가합니다. 실제 검색·링크 전송은 아직 연결하지 않았어요.</Text>
    {available.length ? available.map((user) => <Pressable key={user.id} accessibilityRole="button" accessibilityLabel={`${user.name} 여행방에 추가`} onPress={() => onInvite(user.id)} style={({ pressed }) => [styles.inviteRow, pressed && styles.pressed]}><Avatar name={user.name} uri={user.profileImageUrl} /><View style={styles.flex}><Text style={styles.bodyStrong}>{user.name}</Text><Text style={styles.caption}>여행방 멤버로 추가</Text></View><Text style={styles.link}>추가</Text></Pressable>) : <View style={styles.emptyBox}><Text style={styles.body}>추가할 수 있는 데모 사용자가 없어요.</Text></View>}
    <SecondaryButton label="닫기" onPress={onClose} />
  </Card></View></Modal>;
}

export function PreferenceSectionIntro({ summary }: { summary: RoomPreferenceResponseSummary }) {
  return <View style={styles.sectionHeadingRow}><Text style={styles.sectionHeading}>여행 성향</Text><View style={[styles.responseBadge, summary.isComplete && styles.responseBadgeComplete]}><Text style={[styles.responseBadgeText, summary.isComplete && styles.responseBadgeTextComplete]}>{summary.completedCount} / {summary.totalCount}명 응답 완료</Text></View></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identityCard: { gap: 14, padding: 18, borderColor: foundation.border, backgroundColor: foundation.white },
  identityHeading: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, identityCopy: { flex: 1, minWidth: 0, gap: 4 },
  tripTitle: { color: foundation.text, fontSize: 20, lineHeight: 27, fontWeight: "900" }, tripMeta: { color: foundation.secondary, fontSize: 13, lineHeight: 19, fontWeight: "700" }, tripSubMeta: { color: foundation.muted, fontSize: 11, lineHeight: 17, fontWeight: "600" },
  identityBadges: { alignItems: "flex-end", gap: 6 }, badge: { maxWidth: 96, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 }, badgePeach: { backgroundColor: foundation.peach }, badgeMint: { backgroundColor: foundation.mint }, badgeNeutral: { backgroundColor: "#F0F3F8" }, badgeBlue: { backgroundColor: foundation.primarySoft }, badgeText: { color: foundation.text, fontSize: 10, lineHeight: 14, fontWeight: "800", textAlign: "center" }, badgeBlueText: { color: foundation.primary }, timing: { color: foundation.muted, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  memberLine: { flexDirection: "row", alignItems: "center", gap: 10 }, avatarStack: { flexDirection: "row" }, avatarSlot: { borderWidth: 2, borderColor: foundation.white, borderRadius: radius.pill }, avatarOverlap: { marginLeft: -8 }, memberLabel: { flex: 1, color: foundation.secondary, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  sectionGap: { marginTop: 26 }, sectionHeading: { color: foundation.text, fontSize: 19, lineHeight: 25, fontWeight: "800" }, sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, sectionHint: { color: foundation.muted, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  nextCard: { minHeight: 202, marginTop: 12, overflow: "hidden", borderColor: foundation.heroBorder, backgroundColor: foundation.hero, padding: 18 }, nextCopy: { width: "59%", zIndex: 1, gap: 8 }, nextKicker: { color: foundation.primary, fontSize: 11, lineHeight: 16, fontWeight: "800" }, nextTitle: { color: foundation.text, fontSize: 19, lineHeight: 25, fontWeight: "900", marginTop: 2 }, nextDescription: { color: foundation.secondary, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  progressTrack: { height: 7, overflow: "hidden", borderRadius: radius.pill, backgroundColor: foundation.white }, progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: foundation.primary }, primaryCta: { minHeight: 44, marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 13, backgroundColor: foundation.primary, paddingHorizontal: 14 }, primaryCtaText: { color: foundation.white, fontSize: 13, lineHeight: 18, fontWeight: "800" }, primaryCtaArrow: { color: foundation.white, fontSize: 16, fontWeight: "900" }, nextImage: { position: "absolute", right: -8, bottom: -2, width: "46%", height: 170 },
  disclosure: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, disclosureText: { color: foundation.secondary, fontSize: 11, lineHeight: 16, fontWeight: "700" }, disclosureArrow: { color: foundation.primary, fontSize: 14, fontWeight: "800" }, preparationDetails: { gap: 12, borderRadius: 18, borderWidth: 1, borderColor: foundation.border, backgroundColor: foundation.white, padding: 14 }, checkRow: { flexDirection: "row", alignItems: "center", gap: 10 }, check: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 2, borderColor: foundation.border }, checkComplete: { backgroundColor: foundation.success, borderColor: foundation.success }, checkActive: { backgroundColor: foundation.primary, borderColor: foundation.primary }, checkText: { color: foundation.white, fontWeight: "900" },
  quickGrid: { flexDirection: "row", gap: 10, marginTop: 12 }, quickAction: { flex: 1, minWidth: 0, minHeight: 76, alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 18, borderWidth: 1, borderColor: foundation.border, backgroundColor: foundation.white, paddingHorizontal: 6, ...shadows.card }, quickIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: foundation.primarySoft }, quickIconLavender: { backgroundColor: foundation.planning }, quickIconMint: { backgroundColor: foundation.mint }, quickIconPeach: { backgroundColor: foundation.peach }, quickSymbol: { color: foundation.primary, fontSize: 17, fontWeight: "900" }, quickSymbolLavender: { color: foundation.lavenderAccent }, quickSymbolMint: { color: foundation.success }, quickSymbolPeach: { color: foundation.warning }, quickLabel: { color: foundation.text, fontSize: 11, lineHeight: 15, fontWeight: "800", textAlign: "center" }, quickArrow: { position: "absolute", right: 7, top: 7, color: foundation.muted, fontSize: 14 },
  planningCard: { gap: 14, marginTop: 12, padding: 16, borderColor: foundation.border }, metricRow: { flexDirection: "row", alignItems: "center", gap: 8 }, metric: { flex: 1, minHeight: 84, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 3, borderRadius: 16 }, metricLavender: { backgroundColor: foundation.planning }, metricBlue: { backgroundColor: foundation.primarySoft }, metricLabel: { position: "absolute", top: 10, color: foundation.secondary, fontSize: 10, lineHeight: 14, fontWeight: "800" }, metricValue: { color: foundation.text, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 12 }, metricUnit: { color: foundation.secondary, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 21 }, flowArrow: { color: foundation.primary, fontSize: 20, fontWeight: "900" },
  planMessage: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 2 }, planDot: { width: 8, height: 8, marginTop: 5, borderRadius: radius.pill, backgroundColor: foundation.warning }, planMessageTitle: { color: foundation.text, fontSize: 14, lineHeight: 20, fontWeight: "800" }, planMessageText: { color: foundation.secondary, fontSize: 11, lineHeight: 17, fontWeight: "600", marginTop: 2 }, outlineCta: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 13, borderWidth: 1, borderColor: foundation.primary, paddingHorizontal: 14 }, outlineCtaText: { color: foundation.primary, fontSize: 13, lineHeight: 18, fontWeight: "800" }, planSecondary: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, inlineAction: { minHeight: 40, justifyContent: "center", paddingHorizontal: 2 }, link: { color: foundation.primary, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  planDetails: { gap: 11, borderTopWidth: 1, borderTopColor: foundation.border, paddingTop: 14 }, detailHeading: { color: foundation.text, fontSize: 13, lineHeight: 18, fontWeight: "800", marginTop: 2 }, placeRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10 }, placeImage: { width: 56 }, scheduleRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 }, timeBox: { width: 56, alignItems: "center", padding: 7, borderRadius: 10, backgroundColor: foundation.primarySoft }, time: { color: foundation.primary, fontSize: 12, lineHeight: 16, fontWeight: "800" }, day: { color: foundation.secondary, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  duriCard: { minHeight: 224, marginTop: 12, overflow: "hidden", borderColor: foundation.duriBorder, backgroundColor: foundation.duri, padding: 18 }, duriCopy: { width: "58%", zIndex: 1, gap: 7 }, duriKicker: { color: foundation.primary, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.8 }, duriTitle: { color: foundation.text, fontSize: 18, lineHeight: 24, fontWeight: "900" }, duriDescription: { color: foundation.secondary, fontSize: 11, lineHeight: 17, fontWeight: "600" }, duriCta: { minHeight: 43, marginTop: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: foundation.primary, backgroundColor: "rgba(255,255,255,0.82)", paddingHorizontal: 12 }, duriCtaText: { color: foundation.primary, fontSize: 12, lineHeight: 17, fontWeight: "800" }, duriImage: { position: "absolute", right: -12, bottom: -5, width: "48%", height: 164 },
  responseBadge: { borderRadius: radius.pill, backgroundColor: foundation.primarySoft, paddingHorizontal: 10, paddingVertical: 6 }, responseBadgeComplete: { backgroundColor: foundation.mint }, responseBadgeText: { color: foundation.primary, fontSize: 10, lineHeight: 14, fontWeight: "800" }, responseBadgeTextComplete: { color: foundation.success },
  body: { color: foundation.secondary, fontSize: 13, lineHeight: 19, fontWeight: "500" }, bodyStrong: { color: foundation.text, fontSize: 13, lineHeight: 19, fontWeight: "800" }, caption: { color: foundation.secondary, fontSize: 10, lineHeight: 15, fontWeight: "600" }, successText: { color: foundation.success }, emptyBox: { gap: 4, padding: 14, borderRadius: 16, backgroundColor: "#F7FAFF" }, pressed: { opacity: 0.8 }, disabled: { opacity: 0.5 }, overlay: { flex: 1, justifyContent: "flex-end", padding: spacing.lg, backgroundColor: "rgba(18,39,92,0.42)" }, modal: { gap: spacing.md }, inviteRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
});
