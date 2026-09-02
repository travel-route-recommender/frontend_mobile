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

// 전국 17개 시·도의 시군구. 한국관광공사 areaCode2 응답 기준이며,
// 통합·폐지된 구역(마산시·진해시·남제주군·북제주군·청원군)은 제외했다.
const districtOptions: readonly { regionId: EntityId; province: string; districts: readonly string[] }[] = [
  { regionId: "seoul", province: "서울", districts: ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"] },
  { regionId: "busan", province: "부산", districts: ["강서구", "금정구", "기장군", "남구", "동구", "동래구", "부산진구", "북구", "사상구", "사하구", "서구", "수영구", "연제구", "영도구", "중구", "해운대구"] },
  { regionId: "daegu", province: "대구", districts: ["군위군", "남구", "달서구", "달성군", "동구", "북구", "서구", "수성구", "중구"] },
  { regionId: "incheon", province: "인천", districts: ["강화군", "계양구", "남동구", "동구", "미추홀구", "부평구", "서구", "연수구", "옹진군", "중구"] },
  { regionId: "gwangju", province: "광주", districts: ["광산구", "남구", "동구", "북구", "서구"] },
  { regionId: "daejeon", province: "대전", districts: ["대덕구", "동구", "서구", "유성구", "중구"] },
  { regionId: "ulsan", province: "울산", districts: ["남구", "동구", "북구", "울주군", "중구"] },
  { regionId: "sejong", province: "세종", districts: ["세종특별자치시"] },
  { regionId: "gyeonggi", province: "경기", districts: ["가평군", "고양시", "과천시", "광명시", "광주시", "구리시", "군포시", "김포시", "남양주시", "동두천시", "부천시", "성남시", "수원시", "시흥시", "안산시", "안성시", "안양시", "양주시", "양평군", "여주시", "연천군", "오산시", "용인시", "의왕시", "의정부시", "이천시", "파주시", "평택시", "포천시", "하남시", "화성시"] },
  { regionId: "gangwon", province: "강원", districts: ["강릉시", "고성군", "동해시", "삼척시", "속초시", "양구군", "양양군", "영월군", "원주시", "인제군", "정선군", "철원군", "춘천시", "태백시", "평창군", "홍천군", "화천군", "횡성군"] },
  { regionId: "chungbuk", province: "충북", districts: ["괴산군", "단양군", "보은군", "영동군", "옥천군", "음성군", "제천시", "증평군", "진천군", "청주시", "충주시"] },
  { regionId: "chungnam", province: "충남", districts: ["계룡시", "공주시", "금산군", "논산시", "당진시", "보령시", "부여군", "서산시", "서천군", "아산시", "예산군", "천안시", "청양군", "태안군", "홍성군"] },
  { regionId: "jeonbuk", province: "전북", districts: ["고창군", "군산시", "김제시", "남원시", "무주군", "부안군", "순창군", "완주군", "익산시", "임실군", "장수군", "전주시", "정읍시", "진안군"] },
  { regionId: "jeonnam", province: "전남", districts: ["강진군", "고흥군", "곡성군", "광양시", "구례군", "나주시", "담양군", "목포시", "무안군", "보성군", "순천시", "신안군", "여수시", "영광군", "영암군", "완도군", "장성군", "장흥군", "진도군", "함평군", "해남군", "화순군"] },
  { regionId: "gyeongbuk", province: "경북", districts: ["경산시", "경주시", "고령군", "구미시", "김천시", "문경시", "봉화군", "상주시", "성주군", "안동시", "영덕군", "영양군", "영주시", "영천시", "예천군", "울릉군", "울진군", "의성군", "청도군", "청송군", "칠곡군", "포항시"] },
  { regionId: "gyeongnam", province: "경남", districts: ["거제시", "거창군", "고성군", "김해시", "남해군", "밀양시", "사천시", "산청군", "양산시", "의령군", "진주시", "창녕군", "창원시", "통영시", "하동군", "함안군", "함양군", "합천군"] },
  { regionId: "gyeongju", province: "경북", districts: ["경주시"] },
  { regionId: "jeju", province: "제주", districts: ["서귀포시", "제주시"] },
];

// 한국관광공사 areaCode2 기준 시군구 코드. 지역만 지정하면 도(道) 전체가 내려와
// 실제로 원하는 시·군 결과가 2%밖에 안 섞이므로, 시·군 선택 시 이 코드를 함께 보낸다.
const SIGUNGU_CODES: Readonly<Record<EntityId, Readonly<Record<string, string>>>> = {
  seoul: { "강남구": "1", "강동구": "2", "강북구": "3", "강서구": "4", "관악구": "5", "광진구": "6", "구로구": "7", "금천구": "8", "노원구": "9", "도봉구": "10", "동대문구": "11", "동작구": "12", "마포구": "13", "서대문구": "14", "서초구": "15", "성동구": "16", "성북구": "17", "송파구": "18", "양천구": "19", "영등포구": "20", "용산구": "21", "은평구": "22", "종로구": "23", "중구": "24", "중랑구": "25" },
  busan: { "강서구": "1", "금정구": "2", "기장군": "3", "남구": "4", "동구": "5", "동래구": "6", "부산진구": "7", "북구": "8", "사상구": "9", "사하구": "10", "서구": "11", "수영구": "12", "연제구": "13", "영도구": "14", "중구": "15", "해운대구": "16" },
  daegu: { "군위군": "9", "남구": "1", "달서구": "2", "달성군": "3", "동구": "4", "북구": "5", "서구": "6", "수성구": "7", "중구": "8" },
  incheon: { "강화군": "1", "계양구": "2", "남동구": "4", "동구": "5", "미추홀구": "3", "부평구": "6", "서구": "7", "연수구": "8", "옹진군": "9", "중구": "10" },
  gwangju: { "광산구": "1", "남구": "2", "동구": "3", "북구": "4", "서구": "5" },
  daejeon: { "대덕구": "1", "동구": "2", "서구": "3", "유성구": "4", "중구": "5" },
  ulsan: { "남구": "2", "동구": "3", "북구": "4", "울주군": "5", "중구": "1" },
  sejong: { "세종특별자치시": "1" },
  gyeonggi: { "가평군": "1", "고양시": "2", "과천시": "3", "광명시": "4", "광주시": "5", "구리시": "6", "군포시": "7", "김포시": "8", "남양주시": "9", "동두천시": "10", "부천시": "11", "성남시": "12", "수원시": "13", "시흥시": "14", "안산시": "15", "안성시": "16", "안양시": "17", "양주시": "18", "양평군": "19", "여주시": "20", "연천군": "21", "오산시": "22", "용인시": "23", "의왕시": "24", "의정부시": "25", "이천시": "26", "파주시": "27", "평택시": "28", "포천시": "29", "하남시": "30", "화성시": "31" },
  gangwon: { "강릉시": "1", "고성군": "2", "동해시": "3", "삼척시": "4", "속초시": "5", "양구군": "6", "양양군": "7", "영월군": "8", "원주시": "9", "인제군": "10", "정선군": "11", "철원군": "12", "춘천시": "13", "태백시": "14", "평창군": "15", "홍천군": "16", "화천군": "17", "횡성군": "18" },
  chungbuk: { "괴산군": "1", "단양군": "2", "보은군": "3", "영동군": "4", "옥천군": "5", "음성군": "6", "제천시": "7", "증평군": "12", "진천군": "8", "청주시": "10", "충주시": "11" },
  chungnam: { "계룡시": "16", "공주시": "1", "금산군": "2", "논산시": "3", "당진시": "4", "보령시": "5", "부여군": "6", "서산시": "7", "서천군": "8", "아산시": "9", "예산군": "11", "천안시": "12", "청양군": "13", "태안군": "14", "홍성군": "15" },
  jeonbuk: { "고창군": "1", "군산시": "2", "김제시": "3", "남원시": "4", "무주군": "5", "부안군": "6", "순창군": "7", "완주군": "8", "익산시": "9", "임실군": "10", "장수군": "11", "전주시": "12", "정읍시": "13", "진안군": "14" },
  jeonnam: { "강진군": "1", "고흥군": "2", "곡성군": "3", "광양시": "4", "구례군": "5", "나주시": "6", "담양군": "7", "목포시": "8", "무안군": "9", "보성군": "10", "순천시": "11", "신안군": "12", "여수시": "13", "영광군": "16", "영암군": "17", "완도군": "18", "장성군": "19", "장흥군": "20", "진도군": "21", "함평군": "22", "해남군": "23", "화순군": "24" },
  gyeongbuk: { "경산시": "1", "경주시": "2", "고령군": "3", "구미시": "4", "김천시": "6", "문경시": "7", "봉화군": "8", "상주시": "9", "성주군": "10", "안동시": "11", "영덕군": "12", "영양군": "13", "영주시": "14", "영천시": "15", "예천군": "16", "울릉군": "17", "울진군": "18", "의성군": "19", "청도군": "20", "청송군": "21", "칠곡군": "22", "포항시": "23" },
  gyeongnam: { "거제시": "1", "거창군": "2", "고성군": "3", "김해시": "4", "남해군": "5", "밀양시": "7", "사천시": "8", "산청군": "9", "양산시": "10", "의령군": "12", "진주시": "13", "창녕군": "15", "창원시": "16", "통영시": "17", "하동군": "18", "함안군": "19", "함양군": "20", "합천군": "21" },
  gyeongju: { "경주시": "2" },
  jeju: { "서귀포시": "3", "제주시": "4" },
};

export function getSigunguCode(regionId: EntityId | "all", district: string | "all" | undefined) {
  if (!district || district === "all" || regionId === "all") return undefined;
  return SIGUNGU_CODES[regionId]?.[district.trim()];
}

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
          sigunguCode: getSigunguCode(group.regionId, district),
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
