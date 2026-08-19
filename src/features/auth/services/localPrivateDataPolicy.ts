export type LocalPrivateDataScope<Data> = {
  ownerUserId: string | null;
  activeData: Data;
  dataByOwnerUserId: Record<string, Data>;
};

export function activateLocalPrivateDataScope<Data>(
  scope: LocalPrivateDataScope<Data>,
  nextUserId: string,
  emptyData: () => Data,
) {
  if (scope.ownerUserId === nextUserId) return scope;
  const dataByOwnerUserId = { ...scope.dataByOwnerUserId };
  if (scope.ownerUserId) dataByOwnerUserId[scope.ownerUserId] = scope.activeData;
  const activeData = dataByOwnerUserId[nextUserId] ?? emptyData();
  delete dataByOwnerUserId[nextUserId];
  return { ownerUserId: nextUserId, activeData, dataByOwnerUserId };
}

export function deactivateLocalPrivateDataScope<Data>(
  scope: LocalPrivateDataScope<Data>,
  emptyData: () => Data,
) {
  if (!scope.ownerUserId) return { ...scope, activeData: emptyData() };
  return {
    ownerUserId: null,
    activeData: emptyData(),
    dataByOwnerUserId: {
      ...scope.dataByOwnerUserId,
      [scope.ownerUserId]: scope.activeData,
    },
  };
}

/** hydration이 늦게 끝나도 auth가 이미 선택한 계정 경계를 되돌리지 않는다. */
export function resolveHydratedLocalPrivateDataScope<Data>(
  persistedScope: LocalPrivateDataScope<Data>,
  requestedOwnerUserId: string | null | undefined,
  emptyData: () => Data,
) {
  if (requestedOwnerUserId === undefined) return persistedScope;
  return requestedOwnerUserId === null
    ? deactivateLocalPrivateDataScope(persistedScope, emptyData)
    : activateLocalPrivateDataScope(persistedScope, requestedOwnerUserId, emptyData);
}

/** 검증된 게스트→회원 승격만 현재 로컬 자료의 소유자를 바꿀 수 있다. */
export function transferLocalPrivateDataScope<Data>(
  scope: LocalPrivateDataScope<Data>,
  previousUserId: string,
  nextUserId: string,
  emptyData: () => Data,
) {
  if (scope.ownerUserId !== previousUserId || scope.dataByOwnerUserId[nextUserId] !== undefined) {
    return activateLocalPrivateDataScope(scope, nextUserId, emptyData);
  }
  const dataByOwnerUserId = { ...scope.dataByOwnerUserId };
  delete dataByOwnerUserId[previousUserId];
  return { ownerUserId: nextUserId, activeData: scope.activeData, dataByOwnerUserId };
}

export function inferLegacyLocalPrivateDataOwner(createdByUserIds: Iterable<string>) {
  const owners = new Set([...createdByUserIds].filter(Boolean));
  if (owners.size === 0) return { status: "empty" as const };
  if (owners.size === 1) return { status: "single-owner" as const, userId: [...owners][0] };
  return { status: "ambiguous" as const };
}
