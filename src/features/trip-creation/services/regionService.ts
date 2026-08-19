import type { Region } from "../../../domain";
import { resolveAreaCodeForRegion } from "../../places/services/placeApi";

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
  const areaCode = source === "reference" ? resolveAreaCodeForRegion(region.id) : undefined;
  return {
    id: region.id,
    name: region.shortName || region.name,
    ...(parentName ? { parentName } : {}),
    ...(areaCode ? { areaCode } : {}),
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
}

class ReferenceRegionService extends MockRegionService {
  constructor(regions: readonly Region[]) {
    super(regions, "reference");
  }
}

class UnavailableRegionService implements RegionService {
  async getPopularRegions(): Promise<RegionOption[]> {
    throw new Error("지역 API 계약이 연결되기 전입니다. mock 지역으로 자동 전환하지 않았어요.");
  }

  async searchRegions(): Promise<RegionOption[]> {
    throw new Error("지역 검색 API 계약이 연결되기 전입니다. endpoint를 추측하지 않았어요.");
  }
}

export function createRegionService(mode: "mock" | "api" | "hybrid", regions: readonly Region[]): RegionService {
  if (mode === "mock") return new MockRegionService(regions);
  if (mode === "api") return new ReferenceRegionService(regions);
  return new UnavailableRegionService();
}
