import type { EntityId, Place, TripRoom } from "../domain";
import { createDemoData } from "../data/mock/demoData";
import type { DataSourceMode } from "../config/environment";
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

export function createTravelService(mode: DataSourceMode): TravelService {
  if (mode === "mock") return new MockTravelService();
  throw new ApiContractUnavailableError();
}
