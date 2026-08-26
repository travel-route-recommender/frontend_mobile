import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import mediumSymbolWeight from "expo-symbols/androidWeights/medium";
import type { EntityId, Place, Region, TripRoom } from "../../../domain";
import { Card, Chip, PrimaryButton, SecondaryButton } from "../../../components/common";
import { colors, radius, shadows, sizes, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { TripDatePicker } from "../../trip-creation/components/TripDatePicker";
import { dateToDateOnly } from "../../trips/utils/tripDateUtils";
import {
  FESTIVAL_CLASSIFICATION_CODE,
  classificationSelectionFromLarge,
  classificationSelectionFromLeaf,
  classificationSelectionFromMiddle,
  sortClassificationTree,
  type PlaceClassificationSelection,
  type PlaceClassificationTreeItem,
} from "../logic/placeClassification";
import { getPlaceDistrictShortLabel, getPlaceLocationDisplayLabel, getPlaceProvinceShortLabel, getPlaceProvinceSortOrder, type PlaceLocationFilterOption } from "../logic/placeFilterOptions";
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

type RegionSelectionSheetProps = {
  visible: boolean;
  locationOptions: readonly PlaceLocationFilterOption[];
  selectedLocations: readonly PlaceLocationSelection[];
  initialQuery?: string;
  onApply(locations: PlaceLocationSelection[]): void;
  onClose(): void;
};

function normalizeRegionText(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function optionToLocationSelection(option: PlaceLocationFilterOption): PlaceLocationSelection {
  return {
    value: option.value,
    label: getPlaceLocationDisplayLabel(option) || option.description,
    regionId: option.regionId,
    district: option.district,
    ...(option.areaCode ? { areaCode: option.areaCode } : {}),
    ...(option.sigunguCode ? { sigunguCode: option.sigunguCode } : {}),
  };
}

function sameProvince(left: PlaceLocationFilterOption, right?: PlaceLocationFilterOption) {
  if (!right) return false;
  if (left.areaCode && right.areaCode) return left.areaCode === right.areaCode;
  return left.regionId === right.regionId;
}

function sameLocationProvince(left: PlaceLocationSelection, right: Pick<PlaceLocationSelection, "regionId" | "areaCode">) {
  if (left.areaCode && right.areaCode) return left.areaCode === right.areaCode;
  return left.regionId === right.regionId;
}

function getRegionOptionTitle(option: PlaceLocationFilterOption) {
  if (option.level === "province") return "전체";
  return getPlaceDistrictShortLabel(option.district) || option.label;
}

function getRegionOptionDescription(option: PlaceLocationFilterOption) {
  if (option.level === "province") return `${getPlaceProvinceShortLabel(option)} 전체`;
  return getPlaceLocationDisplayLabel(option) || option.description;
}

export function RegionSelectionSheet(props: RegionSelectionSheetProps) {
  if (!props.visible) return null;
  const key = [props.selectedLocations.map((location) => location.value).join(","), props.initialQuery ?? ""].join(":");
  return <RegionSelectionSheetContent key={key} {...props} />;
}

function RegionSelectionSheetContent({
  visible,
  locationOptions,
  selectedLocations,
  initialQuery = "",
  onApply,
  onClose,
}: RegionSelectionSheetProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [query, setQuery] = useState(initialQuery);
  const provinceOptions = useMemo(() => {
    const seen = new Set<string>();
    return locationOptions.filter((option) => option.level === "province" && option.regionId !== "all").filter((option) => {
      const key = option.areaCode ?? option.regionId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((left, right) => getPlaceProvinceSortOrder(left) - getPlaceProvinceSortOrder(right) || getPlaceProvinceShortLabel(left).localeCompare(getPlaceProvinceShortLabel(right), "ko"));
  }, [locationOptions]);
  const [selectedProvinceKey, setSelectedProvinceKey] = useState(() => {
    const firstSelected = selectedLocations[0];
    const matched = firstSelected ? provinceOptions.find((option) => option.regionId === firstSelected.regionId || option.areaCode === firstSelected.areaCode) : undefined;
    return (matched ?? provinceOptions[0])?.value ?? "";
  });
  const selectedProvince = provinceOptions.find((option) => option.value === selectedProvinceKey) ?? provinceOptions[0];
  const [draftLocations, setDraftLocations] = useState<PlaceLocationSelection[]>(() => [...selectedLocations]);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const selectedValues = useMemo(() => new Set(draftLocations.map((location) => location.value)), [draftLocations]);
  const districtOptions = useMemo(() => locationOptions.filter((option) => option.level === "district" && sameProvince(option, selectedProvince)), [locationOptions, selectedProvince]);
  const normalizedQuery = normalizeRegionText(query);
  const searchOptions = useMemo(() => {
    if (!normalizedQuery) return [];
    const seen = new Set<string>();
    return locationOptions
      .filter((option) => option.regionId !== "all")
      .filter((option) => normalizeRegionText(`${option.label} ${option.description}`).includes(normalizedQuery))
      .filter((option) => {
        const key = option.value;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 80);
  }, [locationOptions, normalizedQuery]);
  const visibleOptions = normalizedQuery ? searchOptions : [selectedProvince, ...districtOptions].filter((option): option is PlaceLocationFilterOption => Boolean(option));
  const sheetTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [560, 0] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const toggleLocation = (option: PlaceLocationFilterOption) => {
    const nextLocation = optionToLocationSelection(option);
    setDraftLocations((current) => {
      if (current.some((location) => location.value === option.value)) return current.filter((location) => location.value !== option.value);
      const withoutRedundantParent = current.filter((location) => !(sameLocationProvince(location, nextLocation) && (option.level === "province" || location.district === "all")));
      return [...withoutRedundantParent, nextLocation];
    });
  };
  const removeLocation = (value: string) => setDraftLocations((current) => current.filter((location) => location.value !== value));

  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.filterSheetRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel="지역 선택 닫기" onPress={onClose} style={styles.filterBackdropTouch}><Animated.View style={[styles.filterBackdropShade, { opacity: backdropOpacity }]} /></Pressable>
      <Animated.View style={[styles.filterSheet, styles.regionSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeading}><View style={styles.flex}><Text style={styles.modalTitle}>지역 선택</Text></View><Pressable accessibilityRole="button" accessibilityLabel="지역 선택 닫기" onPress={onClose} style={styles.sheetClose}><Text style={styles.sheetCloseText}>×</Text></Pressable></View>
        <TextInput accessibilityLabel="지역 검색" value={query} onChangeText={setQuery} placeholder="도, 광역시, 시군구 검색" placeholderTextColor={colors.textMuted} style={styles.regionSearchInput} />
        {draftLocations.length ? <View style={styles.selectedLocationList}>{draftLocations.map((location) => <Pressable key={location.value} accessibilityRole="button" accessibilityLabel={`${getPlaceLocationDisplayLabel(location) || location.label} 지역 선택 해제`} onPress={() => removeLocation(location.value)} style={styles.selectedLocationChip}><Text numberOfLines={1} style={styles.selectedLocationText}>{getPlaceLocationDisplayLabel(location) || location.label}</Text><Text style={styles.selectedLocationRemove}>×</Text></Pressable>)}</View> : <Text style={styles.caption}>시도 또는 시군구를 선택해 주세요.</Text>}
        <View style={styles.regionSelectorBody}>
          <ScrollView style={styles.provinceList} showsVerticalScrollIndicator={false} contentContainerStyle={styles.provinceListContent}>
            {provinceOptions.map((option) => {
              const selected = option.value === selectedProvince?.value;
              return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${option.label} 시군구 보기`} onPress={() => { setSelectedProvinceKey(option.value); setQuery(""); }} style={[styles.provinceRow, selected && styles.provinceRowSelected]}><Text numberOfLines={1} style={[styles.provinceText, selected && styles.provinceTextSelected]}>{getPlaceProvinceShortLabel(option)}</Text></Pressable>;
            })}
          </ScrollView>
          <ScrollView style={styles.districtList} showsVerticalScrollIndicator={false} contentContainerStyle={styles.districtListContent}>
            {visibleOptions.length ? visibleOptions.map((option) => {
              const selected = selectedValues.has(option.value);
              const optionTitle = getRegionOptionTitle(option);
              const optionDescription = getRegionOptionDescription(option);
              return <Pressable key={option.value} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${optionDescription} 지역 선택`} onPress={() => toggleLocation(option)} style={[styles.districtOption, selected && styles.districtOptionSelected]}><View style={styles.flex}><Text numberOfLines={1} style={[styles.districtLabel, selected && styles.districtTextSelected]}>{optionTitle}</Text><Text numberOfLines={1} style={[styles.districtDescription, selected && styles.districtTextSelected]}>{optionDescription}</Text></View>{selected ? <Text style={styles.districtSelectedMark}>✓</Text> : null}</Pressable>;
            }) : <View style={styles.emptyBox}><Text style={styles.body}>일치하는 지역이 없어요.</Text></View>}
          </ScrollView>
        </View>
        <View style={styles.filterActions}><SecondaryButton label="지역 초기화" onPress={() => setDraftLocations([])} /><PrimaryButton label="지역 적용" onPress={() => { onApply(draftLocations); onClose(); }} /></View>
      </Animated.View>
    </View>
  </Modal>;
}

type ExploreFilterSheetProps = {
  visible: boolean;
  categoryTree: readonly PlaceClassificationTreeItem[];
  selectedClassification?: PlaceClassificationSelection;
  selectedClassifications?: readonly PlaceClassificationSelection[];
  availableClassificationValues?: ReadonlySet<string>;
  categoryTreeLoading?: boolean;
  selectedEventStartDate?: string;
  selectedEventEndDate?: string;
  sortOption: PlaceSortOption;
  trips: readonly TripRoom[];
  regionsById: Record<EntityId, Region>;
  activeTripId: EntityId;
  onApply(input: { category: string | "all"; categories: string[]; classification?: PlaceClassificationSelection; classifications: PlaceClassificationSelection[]; eventStartDate?: string; eventEndDate?: string; sort: PlaceSortOption; tripId?: EntityId }): void;
  onReset(): void;
  onClose(): void;
};

export function ExploreFilterSheet(props: ExploreFilterSheetProps) {
  if (!props.visible) return null;
  const selectedClassificationKey = (props.selectedClassifications?.length ? props.selectedClassifications : props.selectedClassification ? [props.selectedClassification] : []).map((selection) => selection.value).join(",");
  const key = [selectedClassificationKey, props.selectedEventStartDate ?? "", props.selectedEventEndDate ?? "", props.sortOption, props.activeTripId].join(":");
  return <ExploreFilterSheetContent key={key} {...props} />;
}

function ExploreFilterSheetContent({
  visible,
  categoryTree,
  selectedClassification,
  selectedClassifications,
  availableClassificationValues,
  categoryTreeLoading = false,
  selectedEventStartDate,
  selectedEventEndDate,
  sortOption,
  trips,
  regionsById,
  activeTripId,
  onApply,
  onReset,
  onClose,
}: ExploreFilterSheetProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [dragY] = useState(() => new Animated.Value(0));
  const initialClassifications = useMemo(
    () => selectedClassifications?.length ? [...selectedClassifications] : selectedClassification ? [selectedClassification] : [],
    [selectedClassification, selectedClassifications],
  );
  const [draftClassifications, setDraftClassifications] = useState<PlaceClassificationSelection[]>(() => initialClassifications);
  const [activeLargeCode, setActiveLargeCode] = useState<string | undefined>(() => initialClassifications[0]?.lclsSystm1);
  const [activeMiddleCode, setActiveMiddleCode] = useState<string | undefined>(() => initialClassifications.find((selection) => selection.lclsSystm2)?.lclsSystm2);
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

  const sortedCategoryTree = useMemo(() => sortClassificationTree(categoryTree), [categoryTree]);
  const selectedValues = useMemo(() => new Set(draftClassifications.map((selection) => selection.value)), [draftClassifications]);
  const selectedLargeCategory = useMemo(() => sortedCategoryTree.find((item) => item.code === activeLargeCode), [activeLargeCode, sortedCategoryTree]);
  const selectedMiddleCategory = useMemo(() => selectedLargeCategory?.children.find((item) => item.code === activeMiddleCode), [activeMiddleCode, selectedLargeCategory]);
  const festivalSelected = draftClassifications.some((selection) => selection.lclsSystm1 === FESTIVAL_CLASSIFICATION_CODE);
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const sheetTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [520, 0] });
  const combinedSheetTranslateY = Animated.add(sheetTranslateY, dragY);
  const closeByDrag = useCallback(() => {
    Animated.timing(dragY, {
      toValue: 520,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onClose());
  }, [dragY, onClose]);
  const filterSheetPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => {
      dragY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 90 || gesture.vy > 0.85) {
        closeByDrag();
        return;
      }
      Animated.spring(dragY, {
        toValue: 0,
        damping: 18,
        mass: 0.9,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragY, {
        toValue: 0,
        damping: 18,
        mass: 0.9,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    },
  }), [closeByDrag, dragY]);
  const changeEventStartDate = (value: string) => {
    setDraftEventStartDate(value);
    setDraftEventEndDate((current) => current && current >= value ? current : value);
  };
  const classificationSelected = (value?: string) => value !== undefined && selectedValues.has(value);
  const classificationVisible = (selection: PlaceClassificationSelection) => !availableClassificationValues || availableClassificationValues.has(selection.value) || selectedValues.has(selection.value);
  const getVisibleLeafCount = (large: PlaceClassificationTreeItem, middle: PlaceClassificationTreeItem["children"][number]) => middle.children.filter((leaf) => classificationVisible(classificationSelectionFromLeaf(large, middle, leaf))).length;
  const updateClassificationSelection = (selection: PlaceClassificationSelection) => {
    setActiveLargeCode(selection.lclsSystm1);
    setActiveMiddleCode(selection.lclsSystm2);
    setDraftClassifications((current) => {
      const alreadySelected = current.some((item) => item.value === selection.value);
      if (alreadySelected) return current.filter((item) => item.value !== selection.value);
      const withoutConflicts = current.filter((item) => {
        if (selection.level === "large") return item.lclsSystm1 !== selection.lclsSystm1;
        if (selection.level === "middle") return !(item.lclsSystm1 === selection.lclsSystm1 && (!item.lclsSystm2 || item.lclsSystm2 === selection.lclsSystm2));
        return !(item.lclsSystm1 === selection.lclsSystm1 && (!item.lclsSystm2 || (item.lclsSystm2 === selection.lclsSystm2 && !item.lclsSystm3)));
      });
      return [...withoutConflicts, selection];
    });
  };
  const clearAllClassifications = () => {
    setDraftClassifications([]);
    setActiveLargeCode(undefined);
    setActiveMiddleCode(undefined);
  };
  const removeClassification = (value: string) => setDraftClassifications((current) => current.filter((selection) => selection.value !== value));

  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.filterSheetRoot}>
      <Pressable accessibilityRole="button" accessibilityLabel="검색 필터 닫기" onPress={onClose} style={styles.filterBackdropTouch}><Animated.View style={[styles.filterBackdropShade, { opacity: backdropOpacity }]} /></Pressable>
      <Animated.View style={[styles.filterSheet, { transform: [{ translateY: combinedSheetTranslateY }] }]}>
        <View {...filterSheetPanResponder.panHandlers} style={styles.sheetDragHandleArea}>
          <View style={styles.sheetHandle} />
        </View>
        <View style={styles.sheetHeading}><View style={styles.flex}><Text style={styles.modalTitle}>검색 필터</Text></View><Pressable accessibilityRole="button" accessibilityLabel="검색 필터 닫기" onPress={onClose} style={styles.sheetClose}><Text style={styles.sheetCloseText}>×</Text></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          <View style={styles.filterBlock}>
            <View style={styles.filterSection}>
              <View style={styles.filterHeadingRow}>
                <Text style={styles.filterLabel}>상세 테마</Text>
                {draftClassifications.length ? <Pressable accessibilityRole="button" accessibilityLabel="상세 테마 초기화" onPress={clearAllClassifications} hitSlop={8}><Text style={styles.link}>초기화</Text></Pressable> : null}
              </View>
              {categoryTreeLoading ? <Text style={styles.caption}>분류체계를 불러오는 중이에요.</Text> : sortedCategoryTree.length ? <>
                <View style={styles.classificationThemeGrid}>
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: draftClassifications.length === 0 }} accessibilityLabel="상세 테마 전체" onPress={clearAllClassifications} style={({ pressed }) => [styles.classificationThemeChip, draftClassifications.length === 0 && styles.classificationThemeChipSelected, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.classificationThemeText, draftClassifications.length === 0 && styles.classificationThemeTextSelected]}>전체</Text></Pressable>
                  {sortedCategoryTree.map((large) => {
                    const selection = classificationSelectionFromLarge(large);
                    const selected = draftClassifications.some((item) => item.lclsSystm1 === large.code);
                    if (!classificationVisible(selection) && !large.children.some((middle) => classificationVisible(classificationSelectionFromMiddle(large, middle)) || middle.children.some((leaf) => classificationVisible(classificationSelectionFromLeaf(large, middle, leaf))))) return null;
                    return <Pressable key={large.code} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${large.name} 상세 테마`} onPress={() => updateClassificationSelection(selection)} style={({ pressed }) => [styles.classificationThemeChip, selected && styles.classificationThemeChipSelected, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.classificationThemeText, selected && styles.classificationThemeTextSelected]}>{large.name}</Text></Pressable>;
                  })}
                </View>
                {selectedLargeCategory ? <View style={styles.classificationPanel}>
                  <View style={styles.classificationMiddleGrid}>
                    {(() => {
                      const selection = classificationSelectionFromLarge(selectedLargeCategory);
                      const selected = classificationSelected(selection.value);
                      return classificationVisible(selection) ? <Pressable key={`${selectedLargeCategory.code}:all`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${selectedLargeCategory.name} 전체`} onPress={() => updateClassificationSelection(selection)} style={[styles.classificationMiddleChip, selected && styles.classificationMiddleChipSelected]}><Text numberOfLines={1} style={[styles.classificationMiddleChipText, selected && styles.classificationMiddleChipTextSelected]}>전체</Text>{selected ? <Text style={styles.classificationMiddleCheck}>✓</Text> : null}</Pressable> : null;
                    })()}
                    {selectedLargeCategory.children.map((middle) => {
                      const middleSelection = classificationSelectionFromMiddle(selectedLargeCategory, middle);
                      const middleActive = activeMiddleCode === middle.code;
                      const selected = classificationSelected(middleSelection.value);
                      const visibleLeafCount = getVisibleLeafCount(selectedLargeCategory, middle);
                      if (!classificationVisible(middleSelection) && !middle.children.some((leaf) => classificationVisible(classificationSelectionFromLeaf(selectedLargeCategory, middle, leaf)))) return null;
                      return <Pressable key={middle.code} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${middle.name} 태그`} onPress={() => updateClassificationSelection(middleSelection)} style={[styles.classificationMiddleChip, middleActive && styles.classificationMiddleChipActive, selected && styles.classificationMiddleChipSelected]}><View style={styles.flex}><Text numberOfLines={1} style={[styles.classificationMiddleChipText, selected && styles.classificationMiddleChipTextSelected]}>{middle.name}</Text>{visibleLeafCount ? <Text numberOfLines={1} style={[styles.classificationCount, selected && styles.classificationMiddleChipTextSelected]}>{visibleLeafCount}개</Text> : null}</View>{selected ? <Text style={styles.classificationMiddleCheck}>✓</Text> : null}</Pressable>;
                    })}
                  </View>
                  {selectedMiddleCategory?.children.length ? <View style={styles.classificationLeafPanel}>
                    <View style={styles.classificationLeafGrid}>
                      {(() => {
                        const selection = classificationSelectionFromMiddle(selectedLargeCategory, selectedMiddleCategory);
                        const selected = classificationSelected(selection.value);
                        return classificationVisible(selection) ? <Pressable key={`${selectedMiddleCategory.code}:all`} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${selectedMiddleCategory.name} 전체`} onPress={() => updateClassificationSelection(selection)} style={[styles.classificationLeafChip, selected && styles.classificationLeafChipSelected]}><Text numberOfLines={1} style={[styles.classificationLeafChipText, selected && styles.classificationLeafChipTextSelected]}>전체</Text></Pressable> : null;
                      })()}
                      {selectedMiddleCategory.children.map((leaf) => {
                        const selection = classificationSelectionFromLeaf(selectedLargeCategory, selectedMiddleCategory, leaf);
                        const selected = classificationSelected(selection.value);
                        if (!classificationVisible(selection)) return null;
                        return <Pressable key={leaf.code} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${leaf.name} 태그`} onPress={() => updateClassificationSelection(selection)} style={[styles.classificationLeafChip, selected && styles.classificationLeafChipSelected]}><Text numberOfLines={1} style={[styles.classificationLeafChipText, selected && styles.classificationLeafChipTextSelected]}>{leaf.name}</Text></Pressable>;
                      })}
                    </View>
                  </View> : null}
                  {draftClassifications.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedClassificationList}>{draftClassifications.map((selection) => <Pressable key={selection.value} accessibilityRole="button" accessibilityLabel={`${selection.label} 태그 선택 해제`} onPress={() => removeClassification(selection.value)} style={styles.selectedClassificationChip}><Text numberOfLines={1} style={styles.selectedClassificationText}>{selection.label}</Text><Text style={styles.selectedClassificationRemove}>×</Text></Pressable>)}</ScrollView> : null}
                </View> : null}
              </> : <Text style={styles.caption}>백엔드 분류체계 메타가 연결되면 자연, 역사, 카페, 캠핑처럼 더 세부적으로 고를 수 있어요.</Text>}
            </View>
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
        <View style={styles.filterActions}><SecondaryButton label="초기화" onPress={() => { onReset(); onClose(); }} /><PrimaryButton label="검색하기" onPress={() => { onApply({ category: "all", categories: [], classification: draftClassifications[0], classifications: draftClassifications, eventStartDate: festivalSelected ? draftEventStartDate : undefined, eventEndDate: festivalSelected ? draftEventEndDate : undefined, sort: sortOption, tripId: draftTripId }); onClose(); }} /></View>
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

export function RegionContextBanner({ label, onPress, onClear }: { label: string; onPress(): void; onClear(): void }) {
  return <Card style={[styles.activeTrip, styles.activeTripEmpty]}>
    <View style={styles.flex}>
      <Text style={styles.activeEmptyEyebrow}>선택 지역</Text>
      <Text numberOfLines={1} style={styles.activeEmptyTitle}>{label || "지역 미선택"}</Text>
      <Text numberOfLines={1} style={styles.activeEmptyMeta}>이 지역 안에서 여행지를 찾아볼게요.</Text>
    </View>
    <View style={styles.regionContextActions}>
      <Pressable accessibilityRole="button" accessibilityLabel="지역 다시 선택" onPress={onPress} style={styles.changeButton}><Text style={styles.changeText}>변경</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="선택 지역 해제" onPress={onClear} hitSlop={8} style={styles.regionContextClear}><Text style={styles.regionContextClearText}>×</Text></Pressable>
    </View>
  </Card>;
}

export function ActiveTripSelectorModal({ visible, trips, regionsById, activeTripId, onSelect, onClose }: { visible: boolean; trips: TripRoom[]; regionsById: Record<EntityId, Region>; activeTripId: EntityId; onSelect(trip: TripRoom): void; onClose(): void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.sheetOverlay}><Card style={styles.sheet}><Text style={styles.modalTitle}>후보를 담을 여행방</Text><Text style={styles.body}>참여 중인 진행 여행방을 선택하면 해당 지역으로 탐색 조건을 맞춰요.</Text>{trips.length ? trips.map((trip) => <Pressable key={trip.id} accessibilityRole="radio" accessibilityState={{ checked: trip.id === activeTripId }} onPress={() => onSelect(trip)} style={[styles.tripRow, trip.id === activeTripId && styles.tripRowSelected]}><View style={styles.flex}><Text style={styles.bodyStrong}>{trip.title}</Text><Text style={styles.caption}>{regionsById[trip.regionId]?.name ?? "지역 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text></View>{trip.id === activeTripId ? <Chip label="현재" selected /> : <Text style={styles.link}>선택</Text>}</Pressable>) : <View style={styles.emptyBox}><Text style={styles.body}>후보를 담을 수 있는 진행 여행방이 없어요.</Text></View>}<SecondaryButton label="닫기" onPress={onClose} /></Card></View></Modal>;
}

export function AddCandidateTripPickerModal({ visible, place, trips, regionsById, getState, onSelect, onCreateTrip, createTripLabel = "새 여행 만들기", onClose }: { visible: boolean; place?: Place; trips: TripRoom[]; regionsById: Record<EntityId, Region>; getState(tripId: EntityId): PlaceCandidateState; onSelect(tripId: EntityId): void; onCreateTrip(): void; createTripLabel?: string; onClose(): void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.sheetOverlay}><Card style={styles.sheet}><Text style={styles.modalTitle}>여행방 후보에 담기</Text><Text style={styles.body}>{place ? `${place.name}을(를) 담을 여행방을 선택해 주세요.` : "장소 정보를 확인해 주세요."}</Text>{trips.length ? trips.map((trip) => { const state = place ? getState(trip.id) : "not-added"; const disabled = state !== "not-added"; return <Pressable key={trip.id} accessibilityRole="radio" accessibilityState={{ checked: false, disabled }} accessibilityLabel={`${trip.title}, ${state === "scheduled" ? "일정에 포함됨" : state === "candidate" ? "후보에 담김" : "선택 가능"}`} disabled={disabled} onPress={() => onSelect(trip.id)} style={[styles.tripRow, disabled && styles.tripRowDisabled]}><View style={styles.flex}><Text style={styles.bodyStrong}>{trip.title}</Text><Text style={styles.caption}>{regionsById[trip.regionId]?.name ?? "지역 미정"} · {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.members.length}명</Text></View><Chip label={state === "scheduled" ? "일정 포함" : state === "candidate" ? "담김" : "선택"} selected={state === "not-added"} /></Pressable>; }) : <View style={styles.emptyBox}><Text style={styles.bodyStrong}>추가 가능한 여행방이 없어요</Text><Text style={styles.caption}>새 여행방을 만든 뒤 후보를 담아보세요.</Text><PrimaryButton label={createTripLabel} onPress={onCreateTrip} /></View>}<SecondaryButton label="계속 탐색" onPress={onClose} /></Card></View></Modal>;
}

const styles = StyleSheet.create({
  searchWrap: { minHeight: 52, flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, overflow: "hidden" }, searchWrapExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }, searchInput: { flex: 1, height: 52, paddingHorizontal: spacing.md, paddingTop: 15, paddingBottom: 15, textAlignVertical: "center", ...typography.body, color: colors.text }, clearButton: { width: 42, height: 52, alignItems: "center", justifyContent: "center" }, clearText: { fontSize: 26, lineHeight: 28, textAlign: "center", color: colors.textSecondary }, searchIconButton: { alignSelf: "stretch", width: 50, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: colors.border }, filterIconButton: { alignSelf: "stretch", width: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border }, filterButtonActive: { backgroundColor: colors.primary, borderLeftColor: colors.primary }, symbolIcon: { width: 24, height: 24 },
  filterSection: { gap: spacing.xs }, filterLabel: { ...typography.caption, color: colors.textSecondary }, chipScroll: { gap: spacing.xs, paddingRight: spacing.lg }, filterChip: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, filterChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, filterChipText: { ...typography.caption, color: colors.textSecondary }, filterChipTextSelected: { color: colors.white },
  sortButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface }, sortText: { ...typography.caption, color: colors.text },
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay }, modal: { gap: spacing.md }, modalTitle: { ...typography.subtitle, color: colors.text }, sortRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, sortRowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, radio: { fontSize: 22, color: colors.primary },
  filterSheetRoot: { flex: 1, justifyContent: "flex-end" }, filterBackdropTouch: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, filterBackdropShade: { flex: 1, backgroundColor: colors.overlay }, filterSheet: { height: "75%", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.background, ...shadows.floating }, regionSheet: { height: "82%" }, sheetDragHandleArea: { minHeight: 18, alignItems: "center", justifyContent: "center" }, sheetHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: radius.pill, backgroundColor: colors.borderStrong }, sheetHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, sheetClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface }, sheetCloseText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.textSecondary }, filterContent: { gap: spacing.lg, paddingBottom: spacing.lg }, filterBlock: { gap: spacing.sm }, filterHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, filterTitle: { ...typography.bodyStrong, color: colors.text }, eventDatePanel: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted }, eventDateRow: { gap: spacing.sm }, classificationThemeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, classificationThemeChip: { minWidth: 78, minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, classificationThemeChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, classificationThemeText: { ...typography.caption, color: colors.textSecondary }, classificationThemeTextSelected: { color: colors.white }, classificationPanel: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted }, classificationEmptyPanel: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, classificationPanelHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, classificationPanelTitle: { ...typography.bodyStrong, color: colors.text }, classificationPanelDescription: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, classificationAllChip: { minHeight: 34, minWidth: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, classificationAllChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, classificationAllChipText: { ...typography.caption, color: colors.primary }, classificationAllChipTextSelected: { color: colors.white }, classificationMiddleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, classificationMiddleChip: { width: "48%", minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white }, classificationMiddleChipActive: { borderColor: colors.borderStrong, backgroundColor: colors.surface }, classificationMiddleChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, classificationMiddleChipText: { ...typography.caption, color: colors.text }, classificationMiddleChipTextSelected: { color: colors.white }, classificationMiddleCheck: { ...typography.bodyStrong, color: colors.white }, classificationCount: { ...typography.caption, color: colors.textMuted }, classificationLeafPanel: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, classificationLeafPanelTitle: { ...typography.caption, color: colors.text }, classificationLeafGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, classificationLeafChip: { minHeight: 32, maxWidth: "100%", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white }, classificationLeafChipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, classificationLeafChipText: { ...typography.caption, color: colors.textSecondary }, classificationLeafChipTextSelected: { color: colors.white }, selectedClassificationList: { gap: spacing.xs, paddingTop: spacing.xs, paddingRight: spacing.xl }, selectedClassificationChip: { minHeight: 32, maxWidth: 260, flexDirection: "row", alignItems: "center", gap: spacing.xxs, paddingLeft: spacing.sm, paddingRight: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: "hidden" }, selectedClassificationText: { ...typography.caption, color: colors.primary, flexShrink: 1, minWidth: 0 }, selectedClassificationRemove: { width: 24, flexShrink: 0, fontSize: 18, lineHeight: 20, textAlign: "center", color: colors.primary }, classificationSummary: { padding: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.white }, classificationSummaryText: { ...typography.caption, color: colors.primary }, regionSearchInput: { minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: spacing.md, ...typography.body, color: colors.text }, selectedLocationList: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, selectedLocationChip: { minHeight: 34, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primary }, selectedLocationText: { ...typography.caption, color: colors.white }, selectedLocationRemove: { minWidth: 18, fontSize: 18, lineHeight: 20, textAlign: "center", color: colors.white }, regionSelectorBody: { flex: 1, minHeight: 0, flexDirection: "row", gap: spacing.sm }, provinceList: { width: 72, minWidth: 72, maxWidth: 72, flexBasis: 72, flexGrow: 0, flexShrink: 0, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, provinceListContent: { width: 72, padding: spacing.xxs, gap: spacing.xs }, provinceRow: { minHeight: 32, alignItems: "flex-start", justifyContent: "center", paddingLeft: spacing.sm, paddingRight: spacing.xs, borderRadius: radius.sm }, provinceRowSelected: { backgroundColor: colors.primary }, provinceText: { ...typography.caption, color: colors.textSecondary, textAlign: "left" }, provinceTextSelected: { color: colors.white }, districtList: { flex: 1, minWidth: 0 }, districtListContent: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingBottom: spacing.sm }, districtOption: { width: "47.5%", minHeight: 46, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, districtOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, districtLabel: { ...typography.caption, color: colors.text }, districtDescription: { ...typography.caption, color: colors.textMuted }, districtTextSelected: { color: colors.white }, districtSelectedMark: { ...typography.bodyStrong, color: colors.white }, locationGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, locationOption: { width: "48%", minHeight: 58, justifyContent: "center", gap: 2, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, locationOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, locationLabel: { ...typography.caption, color: colors.text }, locationDescription: { ...typography.caption, color: colors.textMuted }, locationLabelSelected: { color: colors.white }, distanceModeGroup: { flexDirection: "row", padding: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, distanceModeButton: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm }, distanceModeButtonSelected: { backgroundColor: colors.primary }, distanceModeText: { ...typography.caption, color: colors.textSecondary }, distanceModeTextSelected: { color: colors.white }, distanceSummary: { gap: spacing.xxs, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft }, referenceList: { gap: spacing.xs }, referenceRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, filterActions: { flexDirection: "row", gap: spacing.sm },
  feedbackToast: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: sizes.tabBar + spacing.md, zIndex: 30, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.borderStrong, ...shadows.floating }, feedbackText: { ...typography.bodyStrong, color: colors.success }, feedbackAction: { ...typography.caption, color: colors.primary, marginTop: spacing.xxs }, feedbackClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, feedbackCloseText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.textSecondary },
  activeTrip: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary }, activeTripEmpty: { minHeight: 62, backgroundColor: colors.surface }, activeEyebrow: { ...typography.caption, color: colors.primarySoft }, activeTitle: { ...typography.bodyStrong, color: colors.white }, activeMeta: { ...typography.caption, color: colors.primarySoft, marginTop: 1 }, activeEmptyEyebrow: { color: colors.primary }, activeEmptyTitle: { color: colors.text }, activeEmptyMeta: { color: colors.textSecondary }, activeTripClear: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: "rgba(255, 255, 255, 0.18)" }, activeTripClearText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.white }, regionContextActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, regionContextClear: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }, regionContextClearText: { fontSize: 24, lineHeight: 26, textAlign: "center", color: colors.textSecondary }, changeButton: { minWidth: 54, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, changeText: { ...typography.caption, color: colors.primary },
  sheetOverlay: { flex: 1, justifyContent: "flex-end", padding: spacing.lg, backgroundColor: colors.overlay }, sheet: { gap: spacing.md, maxHeight: "85%" }, tripRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, tripRowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, tripRowDisabled: { opacity: 0.64, backgroundColor: colors.surfaceMuted }, emptyBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  flex: { flex: 1 }, body: { ...typography.body, color: colors.textSecondary }, bodyStrong: { ...typography.bodyStrong, color: colors.text }, caption: { ...typography.caption, color: colors.textSecondary }, link: { ...typography.caption, color: colors.primary }, pressed: { opacity: 0.82 },
});
