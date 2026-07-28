import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import mediumSymbolWeight from "expo-symbols/androidWeights/medium";
import type { EntityId, Place, Region, TripRoom } from "../../../domain";
import { Card, Chip, PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, sizes, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { TripDatePicker } from "../../trip-creation/components/TripDatePicker";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import type { PlaceLocationFilterOption } from "../logic/placeFilterOptions";
import type { PlaceActionFeedback, PlaceCandidateState, PlaceLocationSelection, PlaceSortOption } from "../types";

export function PlaceSearchInput({
  value,
  onChangeText,
  onClear,
  onSearch,
  onFilterPress,
  onFocus,
  onBlur,
  placeholder = "장소, 지역, 태그 검색",
  filterActive = false,
  expanded = false,
}: {
  value: string;
  onChangeText(value: string): void;
  onClear(): void;
  onSearch?(): void;
  onFilterPress?(): void;
  onFocus?(): void;
  onBlur?(): void;
  placeholder?: string;
  filterActive?: boolean;
  expanded?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const submitSearch = () => {
    inputRef.current?.blur();
    onSearch?.();
  };
  return <View onStartShouldSetResponderCapture={() => { onFocus?.(); return false; }} style={[styles.searchWrap, expanded && styles.searchWrapExpanded]}><TextInput ref={inputRef} accessibilityLabel="장소 검색" value={value} onFocus={onFocus} onPressIn={onFocus} onBlur={onBlur} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} returnKeyType="search" onSubmitEditing={submitSearch} autoCorrect={false} style={styles.searchInput} />{value ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={onClear} style={styles.clearButton}><Text style={styles.clearText}>×</Text></Pressable> : null}{onSearch ? <Pressable accessibilityRole="button" accessibilityLabel="관광공사 API로 검색" onPress={submitSearch} style={styles.searchIconButton}><SearchGlyph /></Pressable> : null}{onFilterPress ? <Pressable accessibilityRole="button" accessibilityLabel="검색 필터 열기" accessibilityState={{ selected: filterActive }} onPress={onFilterPress} style={[styles.filterIconButton, filterActive && styles.filterButtonActive]}><FilterGlyph active={filterActive} /></Pressable> : null}</View>;
}

function SearchGlyph() {
  return <SymbolView name={{ ios: "magnifyingglass", android: "search", web: "search" }} tintColor={colors.primary} size={22} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbolIcon} />;
}

function FilterGlyph({ active }: { active: boolean }) {
  const color = active ? colors.white : colors.primary;
  return <SymbolView name={{ ios: "slider.horizontal.3", android: "tune", web: "tune" }} tintColor={color} size={24} weight={{ ios: "semibold", android: mediumSymbolWeight }} style={styles.symbolIcon} />;
}

export function FilterChips<T extends string>({ label, items, selected, onSelect }: { label: string; items: readonly { value: T; label: string }[]; selected: T; onSelect(value: T): void }) {
  return <View style={styles.filterSection}><Text style={styles.filterLabel}>{label}</Text><ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>{items.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={`${label} ${item.label}`} accessibilityState={{ selected: selected === item.value }} onPress={() => onSelect(item.value)} style={({ pressed }) => [styles.filterChip, selected === item.value && styles.filterChipSelected, pressed && styles.pressed]}><Text style={[styles.filterChipText, selected === item.value && styles.filterChipTextSelected]}>{item.label}</Text></Pressable>)}</ScrollView></View>;
}

export const EXPLORE_SORT_OPTIONS: readonly { value: PlaceSortOption; label: string; description: string }[] = [
  { value: "popular", label: "인기순", description: "인기 점수 연동 예정" },
  { value: "rating", label: "리뷰점수순", description: "평점이 높은 장소 먼저" },
  { value: "distance", label: "거리순", description: "기준 장소와 가까운 순서" },
];

export function ExploreSortMenu({ value, onChange }: { value: PlaceSortOption; onChange(value: PlaceSortOption): void }) {
  const [open, setOpen] = useState(false);
  const current = EXPLORE_SORT_OPTIONS.find((option) => option.value === value) ?? EXPLORE_SORT_OPTIONS[0];
  return <><Pressable accessibilityRole="button" accessibilityLabel={`정렬 기준 ${current.label}`} onPress={() => setOpen(true)} style={styles.sortButton}><Text style={styles.sortText}>{current.label} ▾</Text></Pressable><Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={styles.overlay}><Card style={styles.modal}><Text style={styles.modalTitle}>정렬 기준</Text>{EXPLORE_SORT_OPTIONS.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} onPress={() => { onChange(option.value); setOpen(false); }} style={[styles.sortRow, option.value === value && styles.sortRowSelected]}><View style={styles.flex}><Text style={styles.bodyStrong}>{option.label}</Text><Text style={styles.caption}>{option.description}</Text></View><Text style={styles.radio}>{option.value === value ? "✓" : "○"}</Text></Pressable>)}<SecondaryButton label="닫기" onPress={() => setOpen(false)} /></Card></View></Modal></>;
}

type ExploreFilterSheetProps = {
  visible: boolean;
  locationOptions: readonly PlaceLocationFilterOption[];
  categories: readonly { value: string; label: string }[];
  selectedLocations: readonly PlaceLocationSelection[];
  selectedCategories: readonly string[];
  selectedEventStartDate?: string;
  selectedEventEndDate?: string;
  festivalCategory: string;
  sortOption: PlaceSortOption;
  trips: readonly TripRoom[];
  regionsById: Record<EntityId, Region>;
  activeTripId: EntityId;
  onApply(input: { regionId: EntityId | "all"; district: string | "all"; locations: PlaceLocationSelection[]; category: string | "all"; categories: string[]; eventStartDate?: string; eventEndDate?: string; sort: PlaceSortOption; tripId?: EntityId }): void;
  onReset(): void;
  onClose(): void;
};

export function ExploreFilterSheet(props: ExploreFilterSheetProps) {
  if (!props.visible) return null;
  const key = [props.selectedLocations.map((location) => location.value).join(","), props.selectedCategories.join(","), props.selectedEventStartDate ?? "", props.selectedEventEndDate ?? "", props.sortOption, props.activeTripId].join(":");
  return <ExploreFilterSheetContent key={key} {...props} />;
}

function ExploreFilterSheetContent({
  visible,
  locationOptions,
  categories,
  selectedLocations,
  selectedCategories,
  selectedEventStartDate,
  selectedEventEndDate,
  festivalCategory,
  sortOption,
  trips,
  regionsById,
  activeTripId,
  onApply,
  onReset,
  onClose,
}: ExploreFilterSheetProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [regionQuery, setRegionQuery] = useState("");
  const [draftLocations, setDraftLocations] = useState<PlaceLocationSelection[]>(() => [...selectedLocations]);
  const [draftCategories, setDraftCategories] = useState<string[]>(() => [...selectedCategories]);
  const [draftEventStartDate, setDraftEventStartDate] = useState(() => selectedEventStartDate ?? dateToDateOnly(new Date()));
  const [draftEventEndDate, setDraftEventEndDate] = useState(() => selectedEventEndDate ?? selectedEventStartDate ?? dateToDateOnly(new Date()));
  const [draftTripId, setDraftTripId] = useState<EntityId | undefined>(activeTripId || undefined);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const filteredLocations = useMemo(() => {
    const normalized = regionQuery.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return [];
    return locationOptions.filter((option) => option.regionId !== "all" && `${option.label} ${option.description}`.toLocaleLowerCase("ko-KR").includes(normalized)).slice(0, 80);
  }, [locationOptions, regionQuery]);

  const selectedLocationValues = useMemo(() => new Set(draftLocations.map((location) => location.value)), [draftLocations]);
  const selectedCategoryValues = useMemo(() => new Set(draftCategories), [draftCategories]);
  const festivalSelected = selectedCategoryValues.has(festivalCategory);
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const sheetTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [520, 0] });
  const toggleLocation = (option: PlaceLocationFilterOption) => {
    setDraftLocations((current) => {
      if (current.some((location) => location.value === option.value)) return current.filter((location) => location.value !== option.value);
      return [...current, { value: option.value, label: option.description, regionId: option.regionId, district: option.district }];
    });
  };
  const removeLocation = (value: string) => setDraftLocations((current) => current.filter((location) => location.value !== value));
  const toggleCategory = (value: string) => {
    if (value === "all") {
      setDraftCategories([]);
      return;
    }
    setDraftCategories((current) => current.includes(value) ? current.filter((category) => category !== value) : [...current, value]);
  };
  const changeEventStartDate = (value: string) => {
    setDraftEventStartDate(value);
    setDraftEventEndDate((current) => current && current >= value ? current : value);
  };

  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.filterSheetRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel="검색 필터 닫기" onPress={onClose} style={styles.filterBackdropTouch}><Animated.View style={[styles.filterBackdropShade, { opacity: backdropOpacity }]} /></Pressable>
      <Animated.View style={[styles.filterSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeading}><View style={styles.flex}><Text style={styles.modalTitle}>검색 필터</Text></View><Pressable accessibilityRole="button" accessibilityLabel="검색 필터 닫기" onPress={onClose} style={styles.sheetClose}><Text style={styles.sheetCloseText}>×</Text></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>지역</Text>
            <TextInput accessibilityLabel="지역 검색" value={regionQuery} onChangeText={setRegionQuery} placeholder="도, 광역시, 시군구 검색" placeholderTextColor={colors.textMuted} style={styles.regionSearchInput} />
            {draftLocations.length ? <View style={styles.selectedLocationList}>{draftLocations.map((location) => <Pressable key={location.value} accessibilityRole="button" accessibilityLabel={`${location.label} 지역 선택 해제`} onPress={() => removeLocation(location.value)} style={styles.selectedLocationChip}><Text numberOfLines={1} style={styles.selectedLocationText}>{location.label}</Text><Text style={styles.selectedLocationRemove}>×</Text></Pressable>)}</View> : <Text style={styles.caption}>지역명을 입력한 뒤 하나 이상 선택해 주세요.</Text>}
            <View style={styles.locationGrid}>{filteredLocations.map((option) => {
              const selected = selectedLocationValues.has(option.value);
              return <Pressable key={option.value} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleLocation(option)} style={[styles.locationOption, selected && styles.locationOptionSelected]}><Text numberOfLines={1} style={[styles.locationLabel, selected && styles.locationLabelSelected]}>{option.label}</Text><Text numberOfLines={1} style={[styles.locationDescription, selected && styles.locationLabelSelected]}>{option.description}</Text></Pressable>;
            })}</View>
            {regionQuery.trim() && !filteredLocations.length ? <View style={styles.emptyBox}><Text style={styles.body}>일치하는 지역이 없어요.</Text></View> : null}
          </View>
          <View style={styles.filterBlock}>
            <View style={styles.filterSection}><Text style={styles.filterLabel}>카테고리</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>{categories.map((category) => {
              const selected = category.value === "all" ? draftCategories.length === 0 : selectedCategoryValues.has(category.value);
              return <Pressable key={category.value} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`카테고리 ${category.label}`} onPress={() => toggleCategory(category.value)} style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.pressed]}><Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{category.label}</Text></Pressable>;
            })}</ScrollView></View>
            {festivalSelected ? <View style={styles.eventDatePanel}>
              <Text style={styles.filterTitle}>행사 날짜</Text>
              <View style={styles.eventDateRow}>
                <TripDatePicker label="시작일" value={draftEventStartDate} onChange={changeEventStartDate} />
                <TripDatePicker label="종료일" value={draftEventEndDate} minimumDate={draftEventStartDate} onChange={setDraftEventEndDate} />
              </View>
            </View> : null}
          </View>
          <View style={styles.filterBlock}>
            <Text style={styles.filterTitle}>후보를 담을 여행방</Text>
            {trips.length ? trips.map((trip) => {
              const selected = draftTripId === trip.id;
              return <Pressable key={trip.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setDraftTripId((current) => current === trip.id ? undefined : trip.id)} style={[styles.tripRow, selected && styles.tripRowSelected]}><View style={styles.flex}><Text style={styles.bodyStrong}>{trip.title}</Text><Text style={styles.caption}>{regionsById[trip.regionId]?.name ?? "지역 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text></View>{selected ? <Chip label="저장 대상" selected /> : <Text style={styles.link}>선택</Text>}</Pressable>;
            }) : <View style={styles.emptyBox}><Text style={styles.body}>후보를 담을 수 있는 진행 여행방이 없어요.</Text></View>}
          </View>
        </ScrollView>
        <View style={styles.filterActions}><SecondaryButton label="초기화" onPress={() => { onReset(); onClose(); }} /><PrimaryButton label="검색하기" onPress={() => { onApply({ regionId: draftLocations[0]?.regionId ?? "all", district: draftLocations[0]?.district ?? "all", locations: draftLocations, category: draftCategories[0] ?? "all", categories: draftCategories, eventStartDate: festivalSelected ? draftEventStartDate : undefined, eventEndDate: festivalSelected ? draftEventEndDate : undefined, sort: sortOption, tripId: draftTripId }); onClose(); }} /></View>
      </Animated.View>
    </View>
  </Modal>;
}

export function PlaceFeedbackBanner({ feedback, onClose, onAction }: { feedback?: PlaceActionFeedback; onClose(): void; onAction?(tripId: EntityId): void }) {
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(onClose, feedback.tripId ? 3600 : 2400);
    return () => clearTimeout(timer);
  }, [feedback, onClose]);

  if (!feedback) return null;
  return <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.feedbackToast}><View style={styles.flex}><Text style={styles.feedbackText}>{feedback.message}</Text>{feedback.tripId && onAction ? <Pressable accessibilityRole="button" onPress={() => { onAction(feedback.tripId!); onClose(); }}><Text style={styles.feedbackAction}>워크스페이스 보기</Text></Pressable> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="안내 닫기" onPress={onClose} style={styles.feedbackClose}><Text style={styles.feedbackCloseText}>×</Text></Pressable></View>;
}

export function ActiveTripBanner({ trip, region, onClear }: { trip?: TripRoom; region?: Region; onClear?(): void }) {
  return <Card style={[styles.activeTrip, !trip && styles.activeTripEmpty]}>
    <View style={styles.flex}>
      <Text style={[styles.activeEyebrow, !trip && styles.activeEmptyEyebrow]}>{trip ? "후보 여행방" : "개인 탐색"}</Text>
      <Text numberOfLines={1} style={[styles.activeTitle, !trip && styles.activeEmptyTitle]}>{trip ? `${trip.title} 후보 탐색 중` : "활성 여행방 없음"}</Text>
      <Text numberOfLines={1} style={[styles.activeMeta, !trip && styles.activeEmptyMeta]}>{trip ? `${region?.name ?? "지역 미정"} · ${formatTripDateRange(trip.startDate, trip.endDate)}` : "후보 추가 시 여행방을 선택할 수 있어요."}</Text>
    </View>
    {trip && onClear ? <Pressable accessibilityRole="button" accessibilityLabel={`${trip.title} 후보 여행방 선택 해제`} onPress={onClear} hitSlop={8} style={styles.activeTripClear}><Text style={styles.activeTripClearText}>×</Text></Pressable> : null}
  </Card>;
}

export function ActiveTripSelectorModal({ visible, trips, regionsById, activeTripId, onSelect, onClose }: { visible: boolean; trips: TripRoom[]; regionsById: Record<EntityId, Region>; activeTripId: EntityId; onSelect(trip: TripRoom): void; onClose(): void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.sheetOverlay}><Card style={styles.sheet}><Text style={styles.modalTitle}>후보를 담을 여행방</Text><Text style={styles.body}>참여 중인 진행 여행방을 선택하면 해당 지역으로 탐색 조건을 맞춰요.</Text>{trips.length ? trips.map((trip) => <Pressable key={trip.id} accessibilityRole="radio" accessibilityState={{ checked: trip.id === activeTripId }} onPress={() => onSelect(trip)} style={[styles.tripRow, trip.id === activeTripId && styles.tripRowSelected]}><View style={styles.flex}><Text style={styles.bodyStrong}>{trip.title}</Text><Text style={styles.caption}>{regionsById[trip.regionId]?.name ?? "지역 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text></View>{trip.id === activeTripId ? <Chip label="현재" selected /> : <Text style={styles.link}>선택</Text>}</Pressable>) : <View style={styles.emptyBox}><Text style={styles.body}>후보를 담을 수 있는 진행 여행방이 없어요.</Text></View>}<SecondaryButton label="닫기" onPress={onClose} /></Card></View></Modal>;
}

export function AddCandidateTripPickerModal({ visible, place, trips, regionsById, getState, onSelect, onCreateTrip, onClose }: { visible: boolean; place?: Place; trips: TripRoom[]; regionsById: Record<EntityId, Region>; getState(tripId: EntityId): PlaceCandidateState; onSelect(tripId: EntityId): void; onCreateTrip(): void; onClose(): void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.sheetOverlay}><Card style={styles.sheet}><Text style={styles.modalTitle}>여행방 후보에 담기</Text><Text style={styles.body}>{place ? `${place.name}을(를) 담을 여행방을 선택해 주세요.` : "장소 정보를 확인해 주세요."}</Text>{trips.length ? trips.map((trip) => { const state = place ? getState(trip.id) : "not-added"; const disabled = state !== "not-added"; return <Pressable key={trip.id} accessibilityRole="radio" accessibilityState={{ checked: false, disabled }} accessibilityLabel={`${trip.title}, ${state === "scheduled" ? "일정에 포함됨" : state === "candidate" ? "후보에 담김" : "선택 가능"}`} disabled={disabled} onPress={() => onSelect(trip.id)} style={[styles.tripRow, disabled && styles.tripRowDisabled]}><View style={styles.flex}><Text style={styles.bodyStrong}>{trip.title}</Text><Text style={styles.caption}>{regionsById[trip.regionId]?.name ?? "지역 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text></View><Chip label={state === "scheduled" ? "일정 포함" : state === "candidate" ? "담김" : "선택"} selected={state === "not-added"} /></Pressable>; }) : <View style={styles.emptyBox}><Text style={styles.bodyStrong}>추가 가능한 여행방이 없어요</Text><Text style={styles.caption}>새 여행방을 만든 뒤 후보를 담아보세요.</Text><PrimaryButton label="새 여행 만들기" onPress={onCreateTrip} /></View>}<SecondaryButton label="계속 탐색" onPress={onClose} /></Card></View></Modal>;
}

const styles = StyleSheet.create({
  searchWrap: { minHeight: 52, flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, overflow: "hidden" }, searchWrapExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }, searchInput: { flex: 1, minHeight: 52, paddingHorizontal: spacing.md, ...typography.body, color: colors.text }, clearButton: { width: 42, height: 52, alignItems: "center", justifyContent: "center" }, clearText: { fontSize: 26, lineHeight: 28, textAlign: "center", color: colors.textSecondary }, searchIconButton: { alignSelf: "stretch", width: 50, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: colors.border }, filterIconButton: { alignSelf: "stretch", width: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border }, filterButtonActive: { backgroundColor: colors.primary, borderLeftColor: colors.primary }, symbolIcon: { width: 24, height: 24 },
  filterSection: { gap: spacing.xs }, filterLabel: { ...typography.caption, color: colors.textSecondary }, chipScroll: { gap: spacing.xs, paddingRight: spacing.lg }, filterChip: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, filterChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, filterChipText: { ...typography.caption, color: colors.textSecondary }, filterChipTextSelected: { color: colors.white },
  sortButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface }, sortText: { ...typography.caption, color: colors.text },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay }, modal: { gap: spacing.md }, modalTitle: { ...typography.subtitle, color: colors.text }, sortRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, sortRowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, radio: { fontSize: 22, color: colors.primary },
  filterSheetRoot: { flex: 1, justifyContent: "flex-end" }, filterBackdropTouch: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, filterBackdropShade: { flex: 1, backgroundColor: colors.overlay }, filterSheet: { height: "75%", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.background, ...shadows.floating }, sheetHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: radius.pill, backgroundColor: colors.borderStrong }, sheetHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, sheetClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface }, sheetCloseText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.textSecondary }, filterContent: { gap: spacing.lg, paddingBottom: spacing.lg }, filterBlock: { gap: spacing.sm }, filterTitle: { ...typography.bodyStrong, color: colors.text }, eventDatePanel: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted }, eventDateRow: { gap: spacing.sm }, regionSearchInput: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md, ...typography.body, color: colors.text }, selectedLocationList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, selectedLocationChip: { minHeight: 34, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primary }, selectedLocationText: { ...typography.caption, color: colors.white }, selectedLocationRemove: { minWidth: 18, fontSize: 18, lineHeight: 20, textAlign: "center", color: colors.white }, locationGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, locationOption: { width: "48%", minHeight: 58, justifyContent: "center", gap: 2, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, locationOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, locationLabel: { ...typography.caption, color: colors.text }, locationDescription: { ...typography.caption, color: colors.textMuted }, locationLabelSelected: { color: colors.white }, distanceModeGroup: { flexDirection: "row", padding: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, distanceModeButton: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, distanceModeButtonSelected: { backgroundColor: colors.primary }, distanceModeText: { ...typography.caption, color: colors.textSecondary }, distanceModeTextSelected: { color: colors.white }, distanceSummary: { gap: spacing.xxs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft }, referenceList: { gap: spacing.xs }, referenceRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, filterActions: { flexDirection: "row", gap: spacing.sm },
  feedbackToast: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: sizes.tabBar + spacing.md, zIndex: 30, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.borderStrong, ...shadows.floating }, feedbackText: { ...typography.bodyStrong, color: colors.success }, feedbackAction: { ...typography.caption, color: colors.primary, marginTop: spacing.xxs }, feedbackClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, feedbackCloseText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.textSecondary },
  activeTrip: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary }, activeTripEmpty: { minHeight: 62, backgroundColor: colors.surface }, activeEyebrow: { ...typography.caption, color: colors.primarySoft }, activeTitle: { ...typography.bodyStrong, color: colors.white }, activeMeta: { ...typography.caption, color: colors.primarySoft, marginTop: 1 }, activeEmptyEyebrow: { color: colors.primary }, activeEmptyTitle: { color: colors.text }, activeEmptyMeta: { color: colors.textSecondary }, activeTripClear: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(255, 255, 255, 0.18)" }, activeTripClearText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.white }, changeButton: { minWidth: 54, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, changeText: { ...typography.caption, color: colors.primary },
  sheetOverlay: { flex: 1, justifyContent: "flex-end", padding: spacing.lg, backgroundColor: colors.overlay }, sheet: { gap: spacing.md, maxHeight: "85%" }, tripRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, tripRowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, tripRowDisabled: { opacity: 0.64, backgroundColor: colors.surfaceMuted }, emptyBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  flex: { flex: 1 }, body: { ...typography.body, color: colors.textSecondary }, bodyStrong: { ...typography.bodyStrong, color: colors.text }, caption: { ...typography.caption, color: colors.textSecondary }, link: { ...typography.caption, color: colors.primary }, pressed: { opacity: 0.82 },
});
