import type { EntityId, Place, Region } from "../../../domain";
import { normalizeSearchKeyword } from "./placeSearch";

export type PlaceLocationFilterOption = {
  value: string;
  label: string;
  description: string;
  regionId: EntityId | "all";
  district: string | "all";
  level: "all" | "province" | "district";
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

const districtOptions: readonly { regionId: EntityId; province: string; districts: readonly string[] }[] = [
  { regionId: "busan", province: "부산", districts: ["중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"] },
  { regionId: "jeju", province: "제주", districts: ["제주시", "서귀포시"] },
  { regionId: "gyeongju", province: "경북", districts: ["경주시"] },
  { regionId: "gangwon", province: "강원", districts: ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"] },
  { regionId: "jeonnam", province: "전남", districts: ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"] },
];

export function getPlaceLocationValue(regionId: EntityId | "all", district: string | "all" = "all") {
  return `${regionId}::${district}`;
}

function addOption(target: Map<string, PlaceLocationFilterOption>, option: Omit<PlaceLocationFilterOption, "value">) {
  const value = getPlaceLocationValue(option.regionId, option.district);
  if (!target.has(value)) target.set(value, { ...option, value });
}

function extractDistrictName(address: string) {
  const match = address.match(/([가-힣]+(?:시|군|구))(?:\s|$)/);
  return match?.[1];
}

export function buildPlaceLocationOptions(regionsById: Readonly<Record<EntityId, Region>>, places: readonly Place[]) {
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
    addOption(options, {
      label: region.name,
      description: `${region.shortName || region.name} 전체`,
      regionId: region.id,
      district: "all",
      level: "province",
    });
  });

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

  places.forEach((place) => {
    const district = extractDistrictName(place.address);
    if (!district) return;
    const region = regionsById[place.regionId];
    addOption(options, {
      label: district,
      description: `${region?.shortName || region?.name || "검색 결과"} ${district}`,
      regionId: place.regionId,
      district,
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
