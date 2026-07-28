export function buildWorkspaceBackFallbackHref(tripId?: string) {
  const normalizedTripId = tripId?.trim();
  if (!normalizedTripId) return "/(tabs)/trips" as const;
  return {
    pathname: "/trips/[tripId]" as const,
    params: { tripId: normalizedTripId },
  };
}

export function resolveWorkspaceBackAction(canGoBack: boolean, tripId?: string) {
  if (canGoBack) return { type: "back" } as const;
  return {
    type: "replace",
    href: buildWorkspaceBackFallbackHref(tripId),
  } as const;
}
