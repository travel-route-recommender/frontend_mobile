import type { EntityId, Place, Region } from "../../../domain";
import { normalizeSearchKeyword } from "./placeSearch";

export type PlaceLocationFilterOption = {
  value: string;
  label: string;
  description: string;
  regionId: EntityId | "all";
  district: string | "all";
  areaCode?: string;
  sigunguCode?: string;
  level: "all" | "province" | "district";
};

export type PlaceRegionCodeTree = {
  code: string;
  name: string;
  sigungu?: readonly {
    code: string;
    name: string;
  }[];
};

const regionIdByAreaCode: Readonly<Record<string, EntityId>> = {
  "1": "seoul",
  "2": "incheon",
  "3": "daejeon",
  "4": "daegu",
  "5": "gwangju",
  "6": "busan",
  "7": "ulsan",
  "8": "sejong",
  "31": "gyeonggi",
  "32": "gangwon",
  "33": "chungbuk",
  "34": "chungnam",
  "35": "gyeongbuk",
  "36": "gyeongnam",
  "37": "jeonbuk",
  "38": "jeonnam",
  "39": "jeju",
};

const shortRegionNameByAreaCode: Readonly<Record<string, string>> = {
  "1": "서울",
  "2": "인천",
  "3": "대전",
  "4": "대구",
  "5": "광주",
  "6": "부산",
  "7": "울산",
  "8": "세종",
  "31": "경기",
  "32": "강원",
  "33": "충북",
  "34": "충남",
  "35": "경북",
  "36": "경남",
  "37": "전북",
  "38": "전남",
  "39": "제주",
};

const fullRegionNameByAreaCode: Readonly<Record<string, string>> = {
  "1": "서울특별시",
  "2": "인천광역시",
  "3": "대전광역시",
  "4": "대구광역시",
  "5": "광주광역시",
  "6": "부산광역시",
  "7": "울산광역시",
  "8": "세종특별자치시",
  "31": "경기도",
  "32": "강원특별자치도",
  "33": "충청북도",
  "34": "충청남도",
  "35": "경상북도",
  "36": "경상남도",
  "37": "전북특별자치도",
  "38": "전라남도",
  "39": "제주특별자치도",
};

const provinceSortOrderByAreaCode: Readonly<Record<string, number>> = {
  "1": 0,
  "31": 10,
  "32": 11,
  "33": 12,
  "34": 13,
  "37": 14,
  "38": 15,
  "35": 16,
  "36": 17,
  "39": 30,
  "6": 40,
  "4": 41,
  "2": 42,
  "5": 43,
  "3": 44,
  "7": 45,
  "8": 60,
};

const provinceOptions: readonly { regionId: EntityId; label: string; shortLabel: string }[] = [
  { regionId: "seoul", label: "서울특별시", shortLabel: "서울" },
  { regionId: "busan", label: "부산광역시", shortLabel: "부산" },
  { regionId: "daegu", label: "대구광역시", shortLabel: "대구" },
  { regionId: "incheon", label: "인천광역시", shortLabel: "인천" },
  { regionId: "gwangju", label: "광주광역시", shortLabel: "광주" },
  { regionId: "daejeon", label: "대전광역시", shortLabel: "대전" },
  { regionId: "ulsan", label: "울산광역시", shortLabel: "울산" },
  { regionId: "sejong", label: "세종특별자치시", shortLabel: "세종" },
  { regionId: "gyeonggi", label: "경기도", shortLabel: "경기" },
  { regionId: "gangwon", label: "강원특별자치도", shortLabel: "강원" },
  { regionId: "chungbuk", label: "충청북도", shortLabel: "충북" },
  { regionId: "chungnam", label: "충청남도", shortLabel: "충남" },
  { regionId: "jeonbuk", label: "전북특별자치도", shortLabel: "전북" },
  { regionId: "jeonnam", label: "전라남도", shortLabel: "전남" },
  { regionId: "gyeongbuk", label: "경상북도", shortLabel: "경북" },
  { regionId: "gyeongnam", label: "경상남도", shortLabel: "경남" },
  { regionId: "jeju", label: "제주특별자치도", shortLabel: "제주" },
];
const provinceRegionIds = new Set(provinceOptions.map((province) => province.regionId));

const districtRegionAliases: Readonly<Record<string, { regionId: EntityId; province: string; district: string; areaCode?: string }>> = {
  gyeongju: { regionId: "gyeongbuk", province: "경북", district: "경주시", areaCode: "35" },
};

type RegionLabelSource = {
  label?: string;
  description?: string;
  regionId: EntityId | "all";
  district?: string | "all";
  areaCode?: string;
};

const fullRegionNameByRegionId = Object.fromEntries(provinceOptions.map((province) => [province.regionId, province.label])) as Readonly<Record<string, string>>;
const shortRegionNameByRegionId = Object.fromEntries(provinceOptions.map((province) => [province.regionId, province.shortLabel])) as Readonly<Record<string, string>>;
const shortRegionNameByFullName = Object.fromEntries([
  ...provinceOptions.map((province) => [province.label, province.shortLabel]),
  ["강원도", "강원"],
  ["전라북도", "전북"],
  ["제주도", "제주"],
]) as Readonly<Record<string, string>>;
const fullRegionNameByShortName = Object.fromEntries([
  ...provinceOptions.map((province) => [province.shortLabel, province.label]),
  ["강원", "강원특별자치도"],
  ["전북", "전북특별자치도"],
  ["제주", "제주특별자치도"],
]) as Readonly<Record<string, string>>;
const provinceSortOrderByRegionId = Object.fromEntries([
  ["seoul", 0],
  ["gyeonggi", 10],
  ["gangwon", 11],
  ["chungbuk", 12],
  ["chungnam", 13],
  ["jeonbuk", 14],
  ["jeonnam", 15],
  ["gyeongbuk", 16],
  ["gyeongnam", 17],
  ["jeju", 30],
  ["busan", 40],
  ["daegu", 41],
  ["incheon", 42],
  ["gwangju", 43],
  ["daejeon", 44],
  ["ulsan", 45],
  ["sejong", 60],
]) as Readonly<Record<string, number>>;
const provinceSortOrderByShortName = Object.fromEntries([
  ["서울", 0],
  ["경기", 10],
  ["강원", 11],
  ["충북", 12],
  ["충남", 13],
  ["전북", 14],
  ["전남", 15],
  ["경북", 16],
  ["경남", 17],
  ["제주", 30],
  ["부산", 40],
  ["대구", 41],
  ["인천", 42],
  ["광주", 43],
  ["대전", 44],
  ["울산", 45],
  ["세종", 60],
]) as Readonly<Record<string, number>>;

function stripOverallSuffix(value?: string) {
  return (value ?? "").replace(/\s*전체$/, "").trim();
}

function firstRegionToken(source: RegionLabelSource) {
  const value = stripOverallSuffix(source.description) || stripOverallSuffix(source.label);
  return value.split(/\s+/)[0] ?? "";
}

export function getPlaceProvinceShortLabel(source: RegionLabelSource) {
  if (source.areaCode && shortRegionNameByAreaCode[source.areaCode]) return shortRegionNameByAreaCode[source.areaCode];
  if (shortRegionNameByRegionId[source.regionId]) return shortRegionNameByRegionId[source.regionId];
  const token = firstRegionToken(source);
  return shortRegionNameByFullName[token] ?? (token.replace(/특별자치도|특별자치시|광역시|특별시/g, "").trim() || "지역");
}

export function getPlaceProvinceFullLabel(source: RegionLabelSource) {
  if (source.areaCode && fullRegionNameByAreaCode[source.areaCode]) return fullRegionNameByAreaCode[source.areaCode];
  if (fullRegionNameByRegionId[source.regionId]) return fullRegionNameByRegionId[source.regionId];
  const token = firstRegionToken(source);
  return fullRegionNameByShortName[token] ?? (token || "지역");
}

export function getPlaceDistrictShortLabel(district?: string | "all") {
  if (!district || district === "all") return "";
  if (district.endsWith("구")) return district.trim();
  return district.replace(/(시|군)$/g, "").trim();
}

export function getPlaceLocationDisplayLabel(source?: RegionLabelSource) {
  if (!source || source.regionId === "all") return "";
  const district = getPlaceDistrictShortLabel(source.district);
  if (district) return `${getPlaceProvinceShortLabel(source)} ${district}`.trim();
  return getPlaceProvinceFullLabel(source);
}

export function getPlaceProvinceSortOrder(source: RegionLabelSource) {
  if (source.areaCode && provinceSortOrderByAreaCode[source.areaCode] !== undefined) return provinceSortOrderByAreaCode[source.areaCode];
  if (provinceSortOrderByRegionId[source.regionId] !== undefined) return provinceSortOrderByRegionId[source.regionId];
  const shortLabel = getPlaceProvinceShortLabel(source);
  return provinceSortOrderByShortName[shortLabel] ?? 900;
}

const districtOptions: readonly { regionId: EntityId; province: string; districts: readonly string[] }[] = [
  { regionId: "busan", province: "부산", districts: ["중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"] },
  { regionId: "jeju", province: "제주", districts: ["제주시", "서귀포시"] },
  { regionId: "gyeongbuk", province: "경북", districts: ["경주시"] },
  { regionId: "gangwon", province: "강원", districts: ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"] },
  { regionId: "jeonnam", province: "전남", districts: ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"] },
];

export function getPlaceLocationValue(regionId: EntityId | "all", district: string | "all" = "all") {
  return `${regionId}::${district}`;
}

function addOption(target: Map<string, PlaceLocationFilterOption>, option: Omit<PlaceLocationFilterOption, "value">) {
  const value = getPlaceLocationValue(option.regionId, option.district);
  const existing = target.get(value);
  if (!existing) {
    target.set(value, { ...option, value });
    return;
  }
  target.set(value, {
    ...existing,
    ...option,
    value,
    areaCode: option.areaCode ?? existing.areaCode,
    sigunguCode: option.sigunguCode ?? existing.sigunguCode,
  });
}

function extractDistrictName(address: string) {
  const match = address.match(/([가-힣]+(?:시|군|구))(?:\s|$)/);
  return match?.[1];
}

export function buildPlaceLocationOptions(
  regionsById: Readonly<Record<EntityId, Region>>,
  places: readonly Place[],
  regionCodeTree: readonly PlaceRegionCodeTree[] = [],
) {
  const options = new Map<string, PlaceLocationFilterOption>();
  addOption(options, { label: "전국", description: "전체 지역", regionId: "all", district: "all", level: "all" });

  provinceOptions.forEach((province) => {
    addOption(options, {
      label: province.label,
      description: `${province.shortLabel} 전체`,
      regionId: province.regionId,
      district: "all",
      level: "province",
    });
  });

  Object.values(regionsById).forEach((region) => {
    if (!provinceRegionIds.has(region.id)) return;
    addOption(options, {
      label: region.name,
      description: `${region.shortName || region.name} 전체`,
      regionId: region.id,
      district: "all",
      level: "province",
    });
  });

  regionCodeTree.forEach((region) => {
    const regionId = regionIdByAreaCode[region.code] ?? `area-${region.code}`;
    const shortLabel = shortRegionNameByAreaCode[region.code] ?? region.name;
    addOption(options, {
      label: region.name,
      description: `${shortLabel} 전체`,
      regionId,
      district: "all",
      areaCode: region.code,
      level: "province",
    });
    region.sigungu?.forEach((district) => {
      if (!district.code || !district.name) return;
      addOption(options, {
        label: district.name,
        description: `${shortLabel} ${district.name}`,
        regionId,
        district: district.name,
        areaCode: region.code,
        sigunguCode: district.code,
        level: "district",
      });
    });
  });

  if (!regionCodeTree.length) {
    districtOptions.forEach((group) => {
      group.districts.forEach((district) => {
        addOption(options, {
          label: district,
          description: `${group.province} ${district}`,
          regionId: group.regionId,
          district,
          level: "district",
        });
      });
    });
  }

  places.forEach((place) => {
    const alias = districtRegionAliases[place.regionId];
    const district = extractDistrictName(place.address) ?? alias?.district;
    if (!district) return;
    const regionId = alias?.regionId ?? place.regionId;
    const region = regionsById[regionId] ?? regionsById[place.regionId];
    addOption(options, {
      label: district,
      description: `${alias?.province || region?.shortName || region?.name || "검색 결과"} ${district}`,
      regionId,
      district,
      ...(alias?.areaCode ? { areaCode: alias.areaCode } : {}),
      level: "district",
    });
  });

  return [...options.values()].sort((left, right) => {
    if (left.level === "all") return -1;
    if (right.level === "all") return 1;
    if (left.level !== right.level) return left.level === "province" ? -1 : 1;
    return left.label.localeCompare(right.label, "ko") || left.description.localeCompare(right.description, "ko");
  });
}

export function filterPlaceLocationOptions(options: readonly PlaceLocationFilterOption[], keyword: string) {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized) return options;
  return options.filter((option) => normalizeSearchKeyword(`${option.label} ${option.description}`).includes(normalized));
}
