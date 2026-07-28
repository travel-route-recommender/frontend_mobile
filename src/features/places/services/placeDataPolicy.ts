import { environment } from "../../../config/environment";

export interface PlaceRepository {
  readonly available: boolean;
  readonly remoteEnabled: boolean;
  readonly message?: string;
}

export const placeRepository: PlaceRepository = {
  available: true,
  remoteEnabled: environment.placesDataSource === "api",
};
