import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { TripLocation } from "../../../domain";
import { SecondaryButton, TextField } from "../../../components/common";
import { environment } from "../../../config/environment";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { searchBackendPlacePage } from "../../places/services/placeApi";

type Props = {
  label: string;
  value: string;
  selected?: TripLocation | null;
  placeholder: string;
  areaCode?: string;
  onChange(value: string, details: TripLocation | null): void;
};

export function TripPlaceAnchorField({ label, value, selected, placeholder, areaCode, onChange }: Props) {
  const [searchKeyword, setSearchKeyword] = useState("");
  const query = useQuery({
    queryKey: ["trip-creation", "place-anchor", areaCode ?? "all", searchKeyword],
    queryFn: ({ signal }) => searchBackendPlacePage({
      keyword: searchKeyword,
      ...(areaCode ? { areaCode } : {}),
      page: 1,
      limit: 6,
      signal,
    }),
    enabled: environment.dataSource === "api" && searchKeyword.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const search = () => {
    const keyword = value.trim();
    if (keyword.length < 2) return;
    if (keyword === searchKeyword) void query.refetch();
    else setSearchKeyword(keyword);
  };

  return <View style={styles.stack}>
    <TextField
      label={label}
      value={value}
      onChangeText={(nextValue) => onChange(nextValue, null)}
      placeholder={placeholder}
      maxLength={100}
      helperText={selected ? `${selected.address || "검색 결과"}에서 선택됨` : "검색 결과가 없으면 입력한 이름을 그대로 저장할 수 있어요."}
    />
    {environment.dataSource === "api" ? <SecondaryButton
      label="장소 검색"
      loading={query.isFetching}
      disabled={value.trim().length < 2}
      onPress={search}
    /> : null}
    {searchKeyword && !query.isFetching && query.error ? <View accessibilityRole="alert" style={styles.messageBox}>
      <Text style={styles.messageText}>검색하지 못했어요. 직접 입력하거나 다시 시도해 주세요.</Text>
    </View> : null}
    {searchKeyword && !query.isFetching && query.data && !query.data.places.length ? <View style={styles.messageBox}>
      <Text style={styles.messageText}>검색 결과가 없어요. 입력한 이름을 그대로 저장할 수 있어요.</Text>
    </View> : null}
    {query.data?.places.length ? <View accessibilityRole="radiogroup" style={styles.results}>
      {query.data.places.map((place) => {
        const details: TripLocation = {
          name: place.name,
          ...(place.address ? { address: place.address } : {}),
          ...(place.latitude !== undefined && place.longitude !== undefined ? { lat: place.latitude, lng: place.longitude } : {}),
          ...(place.backendPlaceId ? { placeId: place.backendPlaceId } : {}),
          ...(place.externalId ? { externalId: place.externalId } : {}),
          source: place.source ?? "tour",
        };
        const checked = selected?.name === details.name && selected?.externalId === details.externalId;
        return <Pressable
          key={place.id}
          accessibilityRole="radio"
          accessibilityState={{ checked }}
          onPress={() => onChange(place.name, details)}
          style={({ pressed }) => [styles.result, checked && styles.selected, pressed && styles.pressed]}
        >
          <Text style={styles.resultName}>{place.name}</Text>
          <Text numberOfLines={1} style={styles.resultAddress}>{place.address || "주소 정보 없음"}</Text>
        </Pressable>;
      })}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  results: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  result: { gap: 2, minHeight: 54, justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  selected: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.82 },
  resultName: { ...typography.bodyStrong, color: colors.text },
  resultAddress: { ...typography.caption, color: colors.textSecondary },
  messageBox: { padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  messageText: { ...typography.caption, color: colors.textSecondary },
});
