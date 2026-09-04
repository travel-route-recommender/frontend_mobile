export function buildDuriBackFallbackHref(tripId?: string) {
  const normalizedTripId = tripId?.trim();
  if (!normalizedTripId) return "/(tabs)/trips" as const;
  return {
    pathname: "/trips/[tripId]" as const,
    params: { tripId: normalizedTripId },
  };
}

export function resolveDuriBackAction(canGoBack: boolean, tripId?: string) {
  if (canGoBack) return { type: "back" } as const;
  return { type: "replace", href: buildDuriBackFallbackHref(tripId) } as const;
}
