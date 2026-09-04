import type { Region } from "../../../domain";
import { getSigunguCode } from "../../places/logic/placeFilterOptions";
import {
  fetchBackendRegionCodes,
  fetchBackendRegionDistrictCodes,
  resolveRegionIdForAreaCode,
  type BackendRegionCode,
} from "../../places/services/placeApi";

export type RegionOption = {
  id: string;
  name: string;
  parentName?: string;
  areaCode?: string;
  sigunguCode?: string;
  imageUrl?: string;
  center?: {
    latitude: number;
    longitude: number;
  };
  description: string;
  spotCount: number;
  weatherLabel: string;
  source: "mock" | "reference";
};

export interface RegionService {
  getPopularRegions(): Promise<RegionOption[]>;
  searchRegions(keyword: string): Promise<RegionOption[]>;
  getRegion(regionId: string): Promise<RegionOption | undefined>;
}

const parentNameByMockId: Readonly<Record<string, string>> = {
  jeju: "제주특별자치도",
  gyeongju: "경상북도",
  gangwon: "강원특별자치도",
  busan: "부산광역시",
  jeonnam: "전라남도",
};

const popularMockOrder = ["gyeongju", "jeju", "busan", "gangwon", "jeonnam"];

export function mapRegionToOption(region: Region, source: RegionOption["source"] = "mock"): RegionOption {
  const parentName = parentNameByMockId[region.id];
  return {
    id: region.id,
    name: region.shortName || region.name,
    ...(parentName ? { parentName } : {}),
    ...(region.imageUrl ? { imageUrl: region.imageUrl } : {}),
    description: region.description,
    spotCount: region.spots,
    weatherLabel: region.weather,
    source,
  };
}

class MockRegionService implements RegionService {
  private readonly options: RegionOption[];

  constructor(regions: readonly Region[], source: RegionOption["source"] = "mock") {
    this.options = regions.map((region) => mapRegionToOption(region, source));
  }

  async getPopularRegions() {
    const rank = new Map(popularMockOrder.map((id, index) => [id, index]));
    return [...this.options].sort((left, right) => (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }

  async searchRegions(keyword: string) {
    const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return this.getPopularRegions();
    return this.options.filter((option) => [option.name, option.parentName, option.description]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)));
  }

  async getRegion(regionId: string) {
    return this.options.find((option) => option.id === regionId);
  }
}

type RegionMetadataLoader = {
  loadProvinces(): Promise<BackendRegionCode[]>;
  loadDistricts(regionCode: string): Promise<BackendRegionCode[]>;
};

const tourAreaCodeByLegalProvinceCode: Readonly<Record<string, string>> = {
  "11": "1", "26": "6", "27": "4", "28": "2", "29": "5", "30": "3", "31": "7", "36": "8",
  "41": "31", "42": "32", "43": "33", "44": "34", "45": "37", "46": "38", "47": "35", "48": "36",
  "50": "39", "51": "32", "52": "37",
};

function provinceOption(region: BackendRegionCode): RegionOption | undefined {
  const areaCode = tourAreaCodeByLegalProvinceCode[region.code];
  if (!areaCode) return undefined;
  const regionId = resolveRegionIdForAreaCode(areaCode) ?? `tour-area:${areaCode}`;
  return {
    id: regionId,
    name: region.name,
    areaCode,
    description: `${region.name} 전체`,
    spotCount: 0,
    weatherLabel: "",
    source: "reference",
  };
}

class ApiRegionService implements RegionService {
  private rawProvincesPromise?: Promise<BackendRegionCode[]>;
  private provincesPromise?: Promise<RegionOption[]>;
  private allOptionsPromise?: Promise<RegionOption[]>;

  constructor(private readonly loader: RegionMetadataLoader) {}

  private loadRawProvinces() {
    if (!this.rawProvincesPromise) {
      this.rawProvincesPromise = this.loader.loadProvinces().catch((error: unknown) => {
        this.rawProvincesPromise = undefined;
        throw error;
      });
    }
    return this.rawProvincesPromise;
  }

  private loadProvinces() {
    if (!this.provincesPromise) {
      this.provincesPromise = this.loadRawProvinces()
        .then((regions) => regions.flatMap((region) => provinceOption(region) ?? []))
        .then((regions) => regions.sort((left, right) => left.name.localeCompare(right.name, "ko")))
        .catch((error: unknown) => {
          this.provincesPromise = undefined;
          throw error;
        });
    }
    return this.provincesPromise;
  }

  private loadAllOptions() {
    if (!this.allOptionsPromise) {
      this.allOptionsPromise = Promise.all([this.loadRawProvinces(), this.loadProvinces()])
        .then(async ([rawProvinces, provinces]) => {
          const rawByAreaCode = new Map(rawProvinces.flatMap((region) => {
            const areaCode = tourAreaCodeByLegalProvinceCode[region.code];
            return areaCode ? [[areaCode, region] as const] : [];
          }));
          const districtGroups: RegionOption[][] = [];
          for (let offset = 0; offset < provinces.length; offset += 4) {
            const group = provinces.slice(offset, offset + 4);
            districtGroups.push(...await Promise.all(group.map(async (province) => {
              const legalProvince = rawByAreaCode.get(province.areaCode ?? "");
              if (!legalProvince) return [];
              const districts = await this.loader.loadDistricts(legalProvince.code);
              return districts.flatMap((district) => {
                const sigunguCode = getSigunguCode(province.id, district.name);
                if (!sigunguCode) return [];
                return [{
                  id: `${province.id}:${sigunguCode}`,
                  name: district.name,
                  parentName: province.name,
                  areaCode: province.areaCode,
                  sigunguCode,
                  description: `${province.name} ${district.name}`,
                  spotCount: 0,
                  weatherLabel: "",
                  source: "reference" as const,
                }];
              });
            })));
          }
          return [...provinces, ...districtGroups.flat()];
        })
        .catch((error: unknown) => {
          this.allOptionsPromise = undefined;
          throw error;
        });
    }
    return this.allOptionsPromise;
  }

  getPopularRegions() {
    // 인기도 계약이 없으므로 임의 순위를 만들지 않고 서버의 전체 시·도를 제공한다.
    return this.loadProvinces();
  }

  async searchRegions(keyword: string) {
    const normalized = keyword.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return this.getPopularRegions();
    const options = await this.loadAllOptions();
    return options.filter((option) => `${option.parentName ?? ""} ${option.name}`
      .toLocaleLowerCase("ko-KR").includes(normalized));
  }

  async getRegion(regionId: string) {
    return (await this.loadAllOptions()).find((option) => option.id === regionId);
  }
}

class UnavailableRegionService implements RegionService {
  async getPopularRegions(): Promise<RegionOption[]> {
    throw new Error("현재 실행 설정에서는 여행지 목록을 불러올 수 없어요. 앱을 다시 시작한 뒤 시도해 주세요.");
  }

  async searchRegions(): Promise<RegionOption[]> {
    throw new Error("현재 실행 설정에서는 지역을 검색할 수 없어요. 앱을 다시 시작한 뒤 시도해 주세요.");
  }

  async getRegion(): Promise<RegionOption | undefined> {
    return undefined;
  }
}

export function createRegionService(
  mode: "mock" | "api" | "hybrid",
  regions: readonly Region[],
  metadataLoader: RegionMetadataLoader = {
    loadProvinces: () => fetchBackendRegionCodes(),
    loadDistricts: (regionCode) => fetchBackendRegionDistrictCodes(regionCode),
  },
): RegionService {
  if (mode === "mock") return new MockRegionService(regions);
  if (mode === "api") return new ApiRegionService(metadataLoader);
  return new UnavailableRegionService();
}
