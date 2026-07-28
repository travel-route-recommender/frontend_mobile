import type { EntityId, Place, TripRoom } from "../domain";
import { createDemoData } from "../data/mock/demoData";
import type { DataSourceMode } from "../config/environment";
import { getBackendPlace, searchBackendPlaces } from "../features/places/services/placeApi";
import { ApiContractUnavailableError } from "./apiClient";

export interface TravelService {
  listPlaces(): Promise<Place[]>;
  getPlace(placeId: EntityId): Promise<Place | undefined>;
  listTrips(): Promise<TripRoom[]>;
  getTrip(tripId: EntityId): Promise<TripRoom | undefined>;
}

class MockTravelService implements TravelService {
  async listPlaces() { return Object.values(createDemoData().placesById); }
  async getPlace(placeId: EntityId) { return createDemoData().placesById[placeId]; }
  async listTrips() { const data = createDemoData(); return data.tripOrder.flatMap((id) => data.tripsById[id] ? [data.tripsById[id]] : []); }
  async getTrip(tripId: EntityId) { return createDemoData().tripsById[tripId]; }
}

class ApiTravelService implements TravelService {
  async listPlaces() { return searchBackendPlaces({ limit: 50 }); }
  async getPlace(placeId: EntityId) { return await getBackendPlace(placeId) ?? undefined; }
  async listTrips(): Promise<TripRoom[]> { throw new ApiContractUnavailableError(); }
  async getTrip(): Promise<TripRoom | undefined> { throw new ApiContractUnavailableError(); }
}

export function createTravelService(mode: DataSourceMode): TravelService {
  return mode === "mock" ? new MockTravelService() : new ApiTravelService();
}
