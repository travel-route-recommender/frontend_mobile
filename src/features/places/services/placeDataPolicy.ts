import { environment } from "../../../config/environment";

export interface PlaceRepository {
  readonly available: boolean;
  readonly message?: string;
}

const mockPlaceRepository: PlaceRepository = { available: true };
const unavailableApiPlaceRepository: PlaceRepository = {
  available: false,
  message: environment.dataSource === "api"
    ? "Places·Saves·Candidates API 계약이 연결되기 전입니다. mock 장소로 자동 전환하지 않았어요."
    : "서버 Place ID와 로컬 여행방 관계의 호환 계약이 필요합니다. 확인 전에는 데이터를 혼합하지 않아요.",
};

export const placeRepository: PlaceRepository = environment.dataSource === "mock" ? mockPlaceRepository : unavailableApiPlaceRepository;

