export type TripExploreOrigin = "room" | "workspace";

export interface TripExploreContext {
  tripId: string;
  origin: TripExploreOrigin;
}

type RouteParam = string | string[] | undefined;

function firstParam(value: RouteParam) {
  return (Array.isArray(value) ? value[0] : value)?.trim();
}

export function resolveTripExploreContext(tripIdParam: RouteParam, originParam: RouteParam): TripExploreContext | undefined {
  const tripId = firstParam(tripIdParam);
  if (!tripId) return undefined;
  return { tripId, origin: firstParam(originParam) === "workspace" ? "workspace" : "room" };
}

export function buildTripExploreHref(context: TripExploreContext) {
  return { pathname: "/trips/[tripId]/explore" as const, params: { tripId: context.tripId, origin: context.origin } };
}

export function buildTripExploreReturnHref(context: TripExploreContext) {
  return context.origin === "workspace"
    ? { pathname: "/trips/[tripId]/workspace" as const, params: { tripId: context.tripId } }
    : { pathname: "/trips/[tripId]" as const, params: { tripId: context.tripId } };
}

export function buildExploreListHref(context?: TripExploreContext) {
  return context ? buildTripExploreHref(context) : "/(tabs)/explore" as const;
}

export function buildExploreMapHref(context?: TripExploreContext) {
  return context
    ? { pathname: "/explore/map" as const, params: { tripId: context.tripId, origin: context.origin } }
    : "/explore/map" as const;
}

export function buildPlaceDetailHref(placeId: string, context?: TripExploreContext) {
  return context
    ? { pathname: "/places/[placeId]" as const, params: { placeId, tripId: context.tripId, origin: context.origin } }
    : { pathname: "/places/[placeId]" as const, params: { placeId } };
}
