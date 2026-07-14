import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { EntityId, ItineraryItem, Place, Region, TripCandidate, TripRoom, User } from "../../../../domain";
import { AppHeader, Avatar, Card, Chip, PrimaryButton, RemoteImage, SecondaryButton } from "../../../../components/common";
import { colors, radius, spacing, typography } from "../../../../theme/tokens";
import { formatDayLabel, formatTripDateRange, formatTripStatus } from "../../../../utils/formatters";
import { sortItineraryItemsByDateAndTime } from "../../../../utils/schedule";
import type { RoomPreferenceResponseSummary } from "../../selectors";
import type { TripPreparationProgress } from "../../types";
import { formatTripDurationLabel, getTripTimingLabel } from "../../utils/tripDateUtils";

export function TripHomeHero({ trip, region, usersById, currentUserId, onBack }: { trip: TripRoom; region?: Region; usersById: Record<EntityId, User>; currentUserId: EntityId; onBack(): void }) {
  const owner = trip.members.find((member) => member.role === "owner");
  const members = trip.members.flatMap((member) => usersById[member.userId] ? [usersById[member.userId]] : []);
  return <View style={styles.heroWrap}>
    <AppHeader title="여행방" subtitle={formatTripStatus(trip.status)} onBack={onBack} />
    <Card style={styles.hero}>
      <RemoteImage uri={region?.imageUrl} accessibilityLabel={`${region?.name ?? "여행지"} 대표`} aspectRatio={1.85} />
      <View style={styles.chips}><Chip label={formatTripStatus(trip.status)} selected={trip.status !== "completed"} /><Chip label={getTripTimingLabel(trip.startDate, trip.endDate) ?? "날짜 확인"} />{owner?.userId === currentUserId ? <Chip label="내가 방장" /> : null}</View>
      <Text style={styles.heroTitle}>{trip.title}</Text>
      <Text style={styles.body}>{region?.name ?? "목적지 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)} · {formatTripDurationLabel(trip.startDate, trip.endDate)}</Text>
      <View style={styles.memberLine}><View style={styles.avatarStack}>{members.slice(0, 5).map((member, index) => <View key={member.id} style={[styles.avatarSlot, index > 0 && styles.avatarOverlap]}><Avatar name={member.name} uri={member.profileImageUrl} size={36} /></View>)}</View><Text style={styles.caption}>{trip.members.length}명 참여</Text></View>
    </Card>
  </View>;
}

export function TripQuickActions({ completed, onWorkspace, onExplore, onInvite }: { completed: boolean; onWorkspace(): void; onExplore(): void; onInvite(): void }) {
  return <View style={styles.quickGrid}>
    <QuickAction label={completed ? "여행 기록 보기" : "워크스페이스"} symbol="▦" onPress={onWorkspace} />
    {!completed ? <QuickAction label="장소 찾아보기" symbol="⌕" onPress={onExplore} /> : null}
    {!completed ? <QuickAction label="동행자 초대" symbol="+" onPress={onInvite} /> : null}
  </View>;
}

function QuickAction({ label, symbol, onPress }: { label: string; symbol: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><Text style={styles.quickSymbol}>{symbol}</Text><Text style={styles.quickLabel}>{label}</Text></Pressable>;
}

export function TripPreparationCard({ preparation, onAction, readOnly }: { preparation: TripPreparationProgress; onAction(stepId: TripPreparationProgress["steps"][number]["id"]): void; readOnly: boolean }) {
  const percentage = Math.round(preparation.rate * 100);
  return <Card style={styles.stack}>
    <View style={styles.row}><View><Text style={styles.sectionTitle}>여행 준비 진행률</Text><Text style={styles.body}>{preparation.completedSteps}/{preparation.totalSteps}단계 완료</Text></View><Text style={styles.percentage}>{percentage}%</Text></View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percentage, text: `여행 준비 ${percentage}%` }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percentage}%` }]} /></View>
    {preparation.steps.map((step) => <View key={step.id} accessibilityLabel={`${step.label}, ${step.status === "completed" ? "완료" : step.status === "active" ? "진행 중" : "대기"}`} style={styles.checkRow}>
      <View style={[styles.check, step.status === "completed" && styles.checkComplete, step.status === "active" && styles.checkActive]}><Text style={styles.checkText}>{step.status === "completed" ? "✓" : step.status === "active" ? "•" : ""}</Text></View>
      <View style={styles.flex}><Text style={styles.bodyStrong}>{step.label}</Text><Text style={styles.caption}>{step.description}</Text></View>
      {!readOnly && step.status !== "completed" && step.actionLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`${step.label} ${step.actionLabel}`} onPress={() => onAction(step.id)} hitSlop={8}><Text style={styles.link}>{step.actionLabel}</Text></Pressable> : null}
    </View>)}
  </Card>;
}

export function CandidateSummaryCard({ trip, candidates, placesById, usersById, itinerary, onExplore, onWorkspace }: { trip: TripRoom; candidates: TripCandidate[]; placesById: Record<EntityId, Place>; usersById: Record<EntityId, User>; itinerary: ItineraryItem[]; onExplore(): void; onWorkspace(): void }) {
  const scheduledIds = new Set(itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const commonCount = candidates.filter((candidate) => trip.members.length > 0 && new Set(candidate.addedByUserIds).size >= trip.members.length).length;
  const recent = [...candidates].sort((left, right) => (right.addedAt ?? "").localeCompare(left.addedAt ?? "") || left.placeId.localeCompare(right.placeId)).slice(0, 3);
  return <Card style={styles.stack}>
    <View style={styles.row}><View><Text style={styles.sectionTitle}>후보 장소</Text><Text style={styles.body}>전체 {candidates.length}곳{commonCount ? ` · 모두가 고른 ${commonCount}곳` : ""}</Text></View><Chip label={`${candidates.length}곳`} selected /></View>
    {recent.length ? recent.map((candidate) => { const place = placesById[candidate.placeId]; if (!place) return null; const addedBy = candidate.addedByUserIds.flatMap((id) => usersById[id]?.name ? [usersById[id].name] : []).join(", "); return <View key={candidate.placeId} style={styles.placeRow}><View style={styles.placeImage}><RemoteImage uri={place.imageUrl} accessibilityLabel={place.name} aspectRatio={1} /></View><View style={styles.placeCopy}><Text style={styles.bodyStrong}>{place.name}</Text><Text style={styles.caption}>{addedBy ? `${addedBy} 추가` : "추가한 멤버 정보 없음"}</Text><Text style={[styles.caption, scheduledIds.has(place.id) && styles.success]}>{scheduledIds.has(place.id) ? "일정에 배치됨" : "아직 일정에 미배치"}</Text></View></View>; }) : <View style={styles.emptyBox}><Text style={styles.bodyStrong}>아직 후보 장소가 없어요</Text><Text style={styles.body}>탐색에서 함께 가고 싶은 장소를 모아보세요.</Text></View>}
    {trip.status !== "completed" ? <View style={styles.buttonRow}><View style={styles.flex}><SecondaryButton label={candidates.length ? "장소 더 찾기" : "장소 추가하기"} onPress={onExplore} /></View><View style={styles.flex}><PrimaryButton label="후보 확인" onPress={onWorkspace} /></View></View> : <SecondaryButton label="후보 기록 보기" onPress={onWorkspace} />}
  </Card>;
}

export function ItinerarySummaryCard({ trip, itinerary, placesById, onWorkspace }: { trip: TripRoom; itinerary: ItineraryItem[]; placesById: Record<EntityId, Place>; onWorkspace(): void }) {
  const sorted = sortItineraryItemsByDateAndTime(itinerary);
  const dates = [...new Set(sorted.map((item) => item.date))];
  return <Card style={styles.stack}>
    <View style={styles.row}><View><Text style={styles.sectionTitle}>여행 일정</Text><Text style={styles.body}>{itinerary.length}개 항목 · {dates.length}일에 배치</Text></View><Chip label={`${itinerary.length}개`} selected={Boolean(itinerary.length)} /></View>
    {sorted.length ? sorted.slice(0, 3).map((item) => <View key={item.id} style={styles.scheduleRow}><View style={styles.timeBox}><Text style={styles.time}>{item.startTime}</Text><Text style={styles.day}>{formatDayLabel(item.date, trip.startDate)}</Text></View><View style={styles.flex}><Text style={styles.bodyStrong}>{item.placeId ? placesById[item.placeId]?.name ?? "알 수 없는 장소" : item.note ?? "일정 항목"}</Text><Text style={styles.caption}>{item.date} · {item.durationMinutes}분</Text></View></View>) : <View style={styles.emptyBox}><Text style={styles.bodyStrong}>아직 일정이 비어 있어요</Text><Text style={styles.body}>후보 장소를 워크스페이스에서 날짜와 시간에 배치해 보세요.</Text></View>}
    <PrimaryButton label={trip.status === "completed" ? "일정 기록 보기" : "워크스페이스에서 일정 편집"} onPress={onWorkspace} />
  </Card>;
}

export function DuriAnalysisCard({ itineraryCount, onWorkspace }: { itineraryCount: number; onWorkspace(): void }) {
  return <Card style={styles.duriCard}><Text style={styles.duriMark}>✦</Text><View style={styles.flex}><Text style={styles.sectionTitle}>두리의 일정 분석</Text><Text style={styles.body}>{itineraryCount ? `${itineraryCount}개 일정의 동선과 동행자 취향을 워크스페이스에서 분석할 수 있어요.` : "일정을 배치하면 동선과 취향 균형을 분석할 수 있어요."}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="워크스페이스에서 두리 분석 보기" onPress={onWorkspace}><Text style={styles.link}>{itineraryCount ? "분석 보기" : "일정 만들기"}</Text></Pressable></Card>;
}

export function InviteMemberModal({ visible, trip, usersById, onInvite, onClose }: { visible: boolean; trip: TripRoom; usersById: Record<EntityId, User>; onInvite(userId: EntityId): void; onClose(): void }) {
  const memberIds = new Set(trip.members.map((member) => member.userId));
  const available = Object.values(usersById).filter((user) => !memberIds.has(user.id));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><Card style={styles.modal}>
    <Text style={styles.sectionTitle}>데모 동행자 초대</Text><Text style={styles.body}>mock 모드에서는 기존 데모 사용자를 멤버로 바로 추가합니다. 실제 검색·링크 전송은 아직 연결하지 않았어요.</Text>
    {available.length ? available.map((user) => <Pressable key={user.id} accessibilityRole="button" accessibilityLabel={`${user.name} 여행방에 추가`} onPress={() => onInvite(user.id)} style={({ pressed }) => [styles.inviteRow, pressed && styles.pressed]}><Avatar name={user.name} uri={user.profileImageUrl} /><View style={styles.flex}><Text style={styles.bodyStrong}>{user.name}</Text><Text style={styles.caption}>여행방 멤버로 추가</Text></View><Text style={styles.link}>추가</Text></Pressable>) : <View style={styles.emptyBox}><Text style={styles.body}>추가할 수 있는 데모 사용자가 없어요.</Text></View>}
    <SecondaryButton label="닫기" onPress={onClose} />
  </Card></View></Modal>;
}

export function PreferenceSectionIntro({ summary }: { summary: RoomPreferenceResponseSummary }) {
  return <View style={styles.sectionIntro}><View><Text style={styles.sectionTitle}>참여자와 여행 성향</Text><Text style={styles.body}>{summary.completedCount}/{summary.totalCount}명 응답 완료</Text></View><Chip label={summary.isComplete ? "모두 완료" : "응답 중"} selected={summary.isComplete} /></View>;
}

const styles = StyleSheet.create({
  heroWrap: { marginBottom: spacing.md }, hero: { gap: spacing.md }, heroTitle: { ...typography.title, color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, memberLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, avatarStack: { flexDirection: "row" }, avatarSlot: { borderWidth: 2, borderColor: colors.surface, borderRadius: radius.pill }, avatarOverlap: { marginLeft: -9 },
  quickGrid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl }, quickAction: { flex: 1, minHeight: 88, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, quickSymbol: { fontSize: 24, color: colors.primary, fontWeight: "800" }, quickLabel: { ...typography.caption, color: colors.text, textAlign: "center" },
  stack: { gap: spacing.md }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, flex: { flex: 1 },
  sectionTitle: { ...typography.subtitle, color: colors.text }, body: { ...typography.body, color: colors.textSecondary }, bodyStrong: { ...typography.bodyStrong, color: colors.text }, caption: { ...typography.caption, color: colors.textSecondary }, link: { ...typography.caption, color: colors.primary }, success: { color: colors.success }, percentage: { ...typography.title, color: colors.primary },
  progressTrack: { height: 9, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.border }, progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, check: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 2, borderColor: colors.borderStrong }, checkComplete: { backgroundColor: colors.success, borderColor: colors.success }, checkActive: { backgroundColor: colors.primary, borderColor: colors.primary }, checkText: { color: colors.white, fontWeight: "900" },
  placeRow: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: spacing.sm }, placeImage: { width: 76 }, placeCopy: { flex: 1, gap: spacing.xxs }, buttonRow: { flexDirection: "row", gap: spacing.sm }, emptyBox: { gap: spacing.xxs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, timeBox: { width: 60, alignItems: "center", padding: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.primarySoft }, time: { ...typography.bodyStrong, color: colors.primary }, day: { ...typography.caption, color: colors.textSecondary },
  duriCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.primarySoft }, duriMark: { fontSize: 26, color: colors.primary },
  sectionIntro: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  pressed: { opacity: 0.82 }, overlay: { flex: 1, justifyContent: "flex-end", padding: spacing.lg, backgroundColor: colors.overlay }, modal: { gap: spacing.md }, inviteRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
});
