import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BackHandler, Platform, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { AppHeader, SecondaryButton } from "../../../components/common";
import { ErrorState, LoadingState } from "../../../components/feedback";
import { environment } from "../../../config/environment";
import type { Place } from "../../../domain";
import type { DuriAnalysisInput } from "../../../duri/duri-analysis";
import { queryClient } from "../../../query/queryClient";
import { queryKeys } from "../../../query/keys";
import { apiClient, ApiError } from "../../../services/apiClient";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import { plainDuriUserText } from "../presentation/plainDuriUserText";
import { useDuriStore } from "../../../store/useDuriStore";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import { formatTripDateRange } from "../../../utils/formatters";
import { workspaceScheduleService } from "../../workspace/services/workspaceDataPolicy";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { fetchApiTripDetail, type ApiTripDetailData } from "../../trips/tripRoomApi";
import { resolveAreaCodeForRegion, searchBackendPlaces } from "../../places/services/placeApi";
import { ensureTripDocumentStoreHydrated, useTripDocumentHydrationState, useTripDocumentStore, type TravelDocument } from "../../trip-documents";
import { syncDuriIssueTodos } from "../../trip-todos/services/tripTodoAutomationService";
import { syncApiDuriIssueTodos } from "../../trip-todos/services/apiDuriTodoAutomationService";
import { getDuriTodoResolvableDedupePrefixes, isDuriIssueTodoActionable } from "../../trip-todos/logic/todoAutomation";
import { DuriTechnicalDetailsModal } from "../components/DuriTechnicalDetailsModal";
import { PreferenceAutoFillCard } from "../components/PreferenceAutoFillCard";
import { DuriAnalysisIntro } from "../components/DuriAnalysisIntro";
import { DuriAnalysisReport } from "../components/DuriAnalysisReport";
import { DuriScrollPage } from "../components/DuriPageShell";
import { StaleSuggestionNotice } from "../components/StaleSuggestionNotice";
import { createDuriAnalysisSnapshot, createDuriInputFingerprint, getDuriAnalysisAvailability } from "../logic/analysisSnapshot";
import { createDuriAnalysisSession } from "../logic/analysisSession";
import { buildApiDuriAnalysisInput } from "../logic/apiAnalysisInput";
import { buildDuriAnalysisInputWithDocuments, isDuriAnalysisCompletionCurrent } from "../logic/analysisInput";
import { resolveDuriBackAction } from "../logic/duriNavigation";
import {
  buildPreferenceAutoFillSuggestionEnvelope,
  planPreferenceAutoFill,
  shouldAugmentPreferenceAutoFillWithDiscovery,
  type PreferenceAutoFillPlan,
  type PreferenceAutoFillRequest,
} from "../logic/preferenceAutoFill";
import {
  PreferenceAutoFillRequestAbortedError,
  PreferenceAutoFillRequestTimeoutError,
  requestPreferenceAutoFillWithDeadline,
  throwIfPreferenceAutoFillRequestAborted,
} from "../logic/preferenceAutoFillAsync";
import { createAbortableRequestGate } from "../logic/abortableRequestGate";
import { duriAnalysisService } from "../services/duriAnalysisService";
import { enrichPreferenceAutoFillCandidateEvidence } from "../services/duriEvidenceService";
import { useDuriAnalysisStore } from "../store/useDuriAnalysisStore";

const EMPTY_TRAVEL_DOCUMENTS: TravelDocument[] = [];
const itineraryTypeLabel: Record<string, string> = {
  place: "장소 일정",
  meal: "식사",
  rest: "휴식",
  transport: "이동",
  reservation: "예약 일정",
};
// 네트워크·기기 탐색 안전 한도일 뿐 선호 점수나 일정 품질의 magic weight가 아니다.
const DISCOVERY_FETCH_LIMIT = 50;
const DISCOVERY_POOL_LIMIT = 24;
const DISCOVERABLE_TOUR_CONTENT_TYPES = new Set([12, 14, 15, 28, 38, 39]);
// 네트워크가 멈춰도 미리보기 UI가 영구 대기하지 않게 하는 단계별 안전 한도다.
// 이 값들은 선호·체류시간·장소 수 계산에는 참여하지 않는다.
const AUTO_FILL_SERVER_REFRESH_TIMEOUT_MS = 6_000;
const AUTO_FILL_EVIDENCE_TIMEOUT_MS = 4_000;
const AUTO_FILL_DISCOVERY_TIMEOUT_MS = 4_000;
const ANALYSIS_TOTAL_REQUEST_TIMEOUT_MS = 30_000;

type TechnicalDetailsTarget = { kind: "overview" } | { kind: "issue"; issueId: string };
type AutoFillPlanContext = {
  plan: PreferenceAutoFillPlan;
  request: PreferenceAutoFillRequest;
  input: DuriAnalysisInput;
  userId: string;
};

function errorMessage(error: unknown) {
  return plainDuriUserText(toUserFacingApiErrorMessage(error, "두리 요청을 처리하지 못했어요. 기존 일정은 변경되지 않았어요."));
}

function supplementalAutoFillEvidence(data: ApiTripDetailData | undefined) {
  return Object.fromEntries((data?.room.members ?? [])
    .filter((member) => member.travelTypeTags.length > 0)
    .map((member) => [member.userId, { source: "travel-type-snapshot" as const, tags: member.travelTypeTags }]));
}

function apiCandidateBody(place: Place) {
  const tourContentId = place.id.match(/^tour:(\d+)$/)?.[1]
    ?? (/^\d+$/.test(place.id) ? place.id : undefined);
  if (tourContentId) {
    return {
      tourContentId,
      ...(place.contentTypeId !== undefined ? { contentTypeId: place.contentTypeId } : {}),
    };
  }
  return /^[a-f\d]{24}$/i.test(place.id) ? { placeId: place.id } : undefined;
}

function buildDiscoveryCandidateInput(input: DuriAnalysisInput, sourcePlaces: readonly Place[]) {
  const scheduledPlaceIds = new Set(input.itinerary.flatMap((item) => item.placeId ? [item.placeId] : []));
  const existingCandidatePlaceIds = new Set(input.candidates.map((candidate) => candidate.placeId));
  const unique = new Map<string, Place>();
  sourcePlaces.forEach((place) => {
    if (!place.id.trim() || scheduledPlaceIds.has(place.id) || existingCandidatePlaceIds.has(place.id)) return;
    if (place.contentTypeId !== undefined && !DISCOVERABLE_TOUR_CONTENT_TYPES.has(place.contentTypeId)) return;
    unique.set(place.id, { ...place, regionId: input.trip.regionId });
  });
  const grouped = new Map<string, Place[]>();
  [...unique.values()].sort((left, right) => left.id.localeCompare(right.id)).forEach((place) => {
    const key = place.contentTypeId === undefined
      ? `category:${place.category.trim().toLocaleLowerCase("ko-KR") || "unknown"}`
      : `content:${place.contentTypeId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), place]);
  });
  const queues = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, places]) => [...places]);
  const selected: Place[] = [];
  while (selected.length < DISCOVERY_POOL_LIMIT && queues.some((queue) => queue.length)) {
    queues.forEach((queue) => {
      const place = queue.shift();
      if (place && selected.length < DISCOVERY_POOL_LIMIT) selected.push(place);
    });
  }
  if (!selected.length) return { input, discoveredPlaceIds: [] as string[] };
  return {
    input: {
      ...input,
      placesById: {
        ...input.placesById,
        ...Object.fromEntries(selected.map((place) => [place.id, place])),
      },
      candidates: [
        ...input.candidates,
        ...selected.map((place) => ({
          tripId: input.trip.id,
          placeId: place.id,
          addedByUserIds: [],
          recommendedByDuri: true,
        })),
      ],
    },
    discoveredPlaceIds: selected.map((place) => place.id),
  };
}

async function discoverRegionalPlaces(input: DuriAnalysisInput, apiMode: boolean, signal?: AbortSignal) {
  if (!apiMode) {
    return Object.values(input.placesById).filter((place) => place.regionId === input.trip.regionId);
  }
  const regionId = input.trip.regionId.trim().toLocaleLowerCase("en-US");
  const areaCode = /^\d+$/.test(regionId) ? regionId : resolveAreaCodeForRegion(regionId);
  if (!areaCode) return [];
  try {
    return await searchBackendPlaces({ areaCode, page: 1, limit: DISCOVERY_FETCH_LIMIT, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
}

async function enrichAutoFillEvidenceWithinDeadline(input: DuriAnalysisInput, signal?: AbortSignal) {
  try {
    return await requestPreferenceAutoFillWithDeadline(
      (requestSignal) => enrichPreferenceAutoFillCandidateEvidence(
        input,
        new Date().toISOString(),
        undefined,
        { signal: requestSignal, requestTimeoutMs: AUTO_FILL_EVIDENCE_TIMEOUT_MS },
      ),
      { timeoutMs: AUTO_FILL_EVIDENCE_TIMEOUT_MS, signal },
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    return input;
  }
}

function addCachedServerDataNotice(plan: PreferenceAutoFillPlan) {
  const notice = "새 내용을 불러오는 데 시간이 걸려 화면에 보이는 일정과 의견으로 초안을 만들었어요. 적용하기 전에 최신 내용을 다시 확인해 주세요.";
  return {
    ...plan,
    message: `${plan.message} ${notice}`,
    limitations: [...new Set([...plan.limitations, notice])],
  };
}

export function DuriAnalysisScreen() {
  const router = useRouter();
  const [technicalDetailsTarget, setTechnicalDetailsTarget] = useState<TechnicalDetailsTarget>();
  const autoFillPlanContextRef = useRef<AutoFillPlanContext | undefined>(undefined);
  const analysisRequestGate = useMemo(() => createAbortableRequestGate(), []);
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId ?? "";
  const returnFromDuri = useCallback(() => {
    const action = resolveDuriBackAction(router.canGoBack(), tripId);
    if (action.type === "back") router.back();
    else router.replace(action.href);
  }, [router, tripId]);

  useFocusEffect(useCallback(() => {
    const subscription = Platform.OS === "android"
      ? BackHandler.addEventListener("hardwareBackPress", () => {
          returnFromDuri();
          return true;
        })
      : undefined;
    return () => {
      analysisRequestGate.cancel();
      subscription?.remove();
    };
  }, [analysisRequestGate, returnFromDuri]));
  const apiMode = environment.dataSource === "api";
  const authenticatedUserId = useAuthSessionStore((state) => state.currentSessionUserId) ?? "";
  const apiQuery = useQuery({
    queryKey: queryKeys.trips.detail(tripId, authenticatedUserId),
    queryFn: ({ signal }) => fetchApiTripDetail(tripId, authenticatedUserId, signal),
    enabled: apiMode && Boolean(tripId && authenticatedUserId),
  });
  const localSource = useDuriStore(useShallow((state) => ({
    currentUserId: state.currentUserId,
    usersById: state.usersById,
    placesById: state.placesById,
    tripsById: state.tripsById,
    candidatesByTripId: state.candidatesByTripId,
    itineraryByTripId: state.itineraryByTripId,
    preferenceResultsByUserId: state.preferenceResultsByUserId,
  })));
  const feature = useDuriAnalysisStore(useShallow((state) => ({
    session: state.sessionsByTripId[tripId],
    suggestions: state.suggestionsByTripId[tripId],
    analysisStatus: state.analysisStatusByTripId[tripId] ?? "idle",
    suggestionStatus: state.suggestionStatusByTripId[tripId] ?? "idle",
    analysisError: state.analysisErrorByTripId[tripId],
    suggestionError: state.suggestionErrorByTripId[tripId],
  })));
  const tripDocuments = useTripDocumentStore((state) => state.documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS);
  const documentsHydrated = useTripDocumentHydrationState((state) => state.isHydrated);
  const documentHydrationError = useTripDocumentHydrationState((state) => state.hydrationError);
  const documentCollectionStatus = documentsHydrated ? "loaded" as const : documentHydrationError ? "unavailable" as const : undefined;
  const input = useMemo(() => apiMode
    ? buildApiDuriAnalysisInput(
        apiQuery.data,
        authenticatedUserId,
        documentsHydrated ? tripDocuments : EMPTY_TRAVEL_DOCUMENTS,
        documentCollectionStatus ?? "unavailable",
      )
    : !documentCollectionStatus
      ? undefined
      : buildDuriAnalysisInputWithDocuments(localSource, tripId, tripDocuments, [], documentCollectionStatus),
  [apiMode, apiQuery.data, authenticatedUserId, documentCollectionStatus, documentsHydrated, localSource, tripDocuments, tripId]);
  const currentFingerprint = useMemo(() => input ? createDuriInputFingerprint(createDuriAnalysisSnapshot(input)) : "", [input]);
  const sessionStale = Boolean(feature.session && feature.session.inputFingerprint !== currentFingerprint);
  const apiAuthenticationRejected = apiMode && apiQuery.error instanceof ApiError && apiQuery.error.status === 401;
  const apiRoomForbidden = apiMode && apiQuery.error instanceof ApiError && apiQuery.error.status === 403;
  const apiRefreshFailed = apiMode && Boolean(apiQuery.error && apiQuery.data);
  const scheduleSourceAvailable = apiMode ? Boolean(apiQuery.data?.scheduleSnapshot) && !apiRefreshFailed : workspaceScheduleService.available;
  const engineAvailable = duriAnalysisService.available && scheduleSourceAvailable;
  const availability = useMemo(() => getDuriAnalysisAvailability({ input, engineAvailable }), [engineAvailable, input]);
  const trip = input?.trip;
  const analysisUserId = apiMode ? authenticatedUserId : localSource.currentUserId;
  useLayoutEffect(() => {
    analysisRequestGate.cancel();
    autoFillPlanContextRef.current = undefined;
    return () => analysisRequestGate.cancel();
  }, [analysisRequestGate, analysisUserId, tripId]);
  const autoFillSupplementalEvidence = useMemo(() => supplementalAutoFillEvidence(apiQuery.data), [apiQuery.data]);
  const autoFillSupplementalFingerprint = useMemo(() => JSON.stringify(Object.entries(autoFillSupplementalEvidence)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([memberId, evidence]) => [memberId, [...evidence.tags].sort()])), [autoFillSupplementalEvidence]);
  const affectedEntityLabelsByIssueId = useMemo(() => {
    const session = feature.session;
    if (!session) return {} as Record<string, string[]>;
    const itemById = new Map(session.snapshot.itinerary.map((item) => [item.id, item] as const));
    const memberById = new Map(session.snapshot.members.map((member) => [member.id, member] as const));
    return Object.fromEntries(session.issues.map((issue) => {
      const representedPlaceIds = new Set<string>();
      const itemLabels = issue.affectedItemIds.flatMap((itemId) => {
        const item = itemById.get(itemId);
        if (!item) return [];
        if (item.placeId) representedPlaceIds.add(item.placeId);
        const placeName = item.placeId ? session.snapshot.placesById[item.placeId]?.name : undefined;
        const name = placeName ?? item.note?.trim() ?? itineraryTypeLabel[item.itemType] ?? "일정";
        return [`일정 · ${item.date} ${item.startTime} ${name}`];
      });
      const placeLabels = issue.affectedPlaceIds.flatMap((placeId) => {
        if (representedPlaceIds.has(placeId)) return [];
        const place = session.snapshot.placesById[placeId];
        return place ? [`장소 · ${place.name}`] : [];
      });
      const memberLabels = issue.affectedMemberIds.flatMap((memberId) => {
        const member = memberById.get(memberId);
        return member ? [`동행자 · ${member.name}`] : [];
      });
      return [issue.id, [...new Set([...itemLabels, ...placeLabels, ...memberLabels])]];
    }));
  }, [feature.session]);

  const readLatestAnalysisInput = () => {
    const documents = useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS;
    const documentHydration = useTripDocumentHydrationState.getState();
    const collectionStatus = documentHydration.isHydrated ? "loaded" as const : documentHydration.hydrationError ? "unavailable" as const : undefined;
    if (apiMode) {
      const userId = useAuthSessionStore.getState().currentSessionUserId ?? "";
      return buildApiDuriAnalysisInput(
        queryClient.getQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, userId)),
        userId,
        documentHydration.isHydrated ? documents : EMPTY_TRAVEL_DOCUMENTS,
        collectionStatus ?? "unavailable",
      );
    }
    if (!collectionStatus) return undefined;
    return buildDuriAnalysisInputWithDocuments(useDuriStore.getState(), tripId, documents, [], collectionStatus);
  };

  const readLatestAnalysisUserId = () => apiMode
    ? useAuthSessionStore.getState().currentSessionUserId ?? ""
    : useDuriStore.getState().currentUserId;

  const runAnalysis = async () => {
    if (!input || !availability.canAnalyze) return;
    const controller = analysisRequestGate.begin();
    if (!controller) return;
    if (!useDuriAnalysisStore.getState().beginAnalysis(tripId)) {
      analysisRequestGate.finish(controller);
      return;
    }
    const requestedByUserId = analysisUserId;
    try {
      let requestedInput = input;
      if (apiMode) {
        // 분석 버튼을 누른 시점의 서버 scheduleVersion을 다시 확인한다. 화면 focus 시점의
        // cache만 사용하면 다른 동행자의 변경을 구 버전으로 분석할 수 있다.
        const refreshed = await fetchApiTripDetail(tripId, requestedByUserId, controller.signal);
        if (!refreshed.scheduleSnapshot) {
          throw new Error("최신 일정을 확인하지 못해 분석을 시작하지 않았어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        }
        throwIfPreferenceAutoFillRequestAborted(controller.signal);
        const documentHydration = useTripDocumentHydrationState.getState();
        const collectionStatus = documentHydration.isHydrated ? "loaded" as const : "unavailable" as const;
        const userId = useAuthSessionStore.getState().currentSessionUserId ?? "";
        if (userId !== requestedByUserId) throw new Error("분석 중 로그인 사용자가 변경되어 결과를 저장하지 않았어요.");
        requestedInput = buildApiDuriAnalysisInput(
          refreshed,
          userId,
          documentHydration.isHydrated
            ? useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS
            : EMPTY_TRAVEL_DOCUMENTS,
          collectionStatus,
        ) as typeof input;
        if (!requestedInput) throw new Error("최신 일정에서 분석에 필요한 내용을 확인하지 못했어요.");
        const refreshedAvailability = getDuriAnalysisAvailability({ input: requestedInput, engineAvailable: duriAnalysisService.available });
        if (!refreshedAvailability.canAnalyze) throw new Error(refreshedAvailability.message);
        queryClient.setQueryData(queryKeys.trips.detail(tripId, requestedByUserId), refreshed);
      }
      const requestedFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(requestedInput));
      const session = await requestPreferenceAutoFillWithDeadline(
        (signal) => duriAnalysisService.analyze(requestedInput, signal),
        { timeoutMs: ANALYSIS_TOTAL_REQUEST_TIMEOUT_MS, signal: controller.signal },
      );
      throwIfPreferenceAutoFillRequestAborted(controller.signal);
      const latestInput = readLatestAnalysisInput();
      if (readLatestAnalysisUserId() !== requestedByUserId || !isDuriAnalysisCompletionCurrent({
        requestedFingerprint,
        sessionFingerprint: session.inputFingerprint,
        latestInput,
      })) {
        useDuriAnalysisStore.getState().failAnalysis(tripId, "분석하는 동안 일정이나 첨부 문서가 변경되어 이전 결과를 저장하지 않았어요. 다시 분석해 주세요.");
        return;
      }
      useDuriAnalysisStore.getState().completeAnalysis(session);
      const actionableIssues = session.issues.filter(isDuriIssueTodoActionable);
      // TODO 저장 실패는 분석 결과나 워크스페이스를 되돌리지 않는다.
      if (session.snapshot.trip.status !== "completed" && apiMode) void syncApiDuriIssueTodos({
        roomId: tripId,
        issues: actionableIssues,
        baseRevision: session.inputFingerprint,
        timezone: apiQuery.data?.scheduleSnapshot?.planning?.timezone ?? "Asia/Seoul",
      }).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.trips.todos(tripId, requestedByUserId) })).catch(() => undefined);
      if (session.snapshot.trip.status !== "completed" && !apiMode) void syncDuriIssueTodos({
        tripId,
        issues: actionableIssues,
        createdByUserId: requestedByUserId,
        resolvableDedupePrefixes: getDuriTodoResolvableDedupePrefixes(session.coverage),
        isCurrent: () => {
          if (useDuriAnalysisStore.getState().sessionsByTripId[tripId] !== session) return false;
          if (readLatestAnalysisUserId() !== requestedByUserId) return false;
          const currentInput = readLatestAnalysisInput();
          return isDuriAnalysisCompletionCurrent({
            requestedFingerprint,
            sessionFingerprint: session.inputFingerprint,
            latestInput: currentInput,
          });
        },
      }).catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted || error instanceof PreferenceAutoFillRequestAbortedError) {
        if (analysisRequestGate.finish(controller)) {
          useDuriAnalysisStore.getState().cancelAnalysis(tripId);
        }
        return;
      }
      if (!analysisRequestGate.isCurrent(controller)) return;
      useDuriAnalysisStore.getState().failAnalysis(
        tripId,
        error instanceof PreferenceAutoFillRequestTimeoutError
          ? "외부 이동·운영 정보를 확인하는 데 시간이 오래 걸려 점검을 멈췄어요. 일정은 바뀌지 않았으니 다시 시도해 주세요."
          : errorMessage(error),
      );
    } finally {
      analysisRequestGate.finish(controller);
    }
  };

  const generateSuggestions = async () => {
    const session = useDuriAnalysisStore.getState().sessionsByTripId[tripId];
    if (!session || session.inputFingerprint !== currentFingerprint || !useDuriAnalysisStore.getState().beginSuggestionGeneration(tripId)) return;
    try {
      const suggestions = await duriAnalysisService.generateSuggestions(session);
      const latestInput = readLatestAnalysisInput();
      const latestFingerprint = latestInput ? createDuriInputFingerprint(createDuriAnalysisSnapshot(latestInput)) : "";
      if (latestFingerprint !== session.inputFingerprint) {
        useDuriAnalysisStore.getState().failSuggestionGeneration(tripId, "제안을 계산하는 동안 일정이 변경되었어요. 다시 분석해 주세요.");
        return;
      }
      useDuriAnalysisStore.getState().completeSuggestionGeneration(tripId, session.inputFingerprint, suggestions);
    } catch (error) {
      useDuriAnalysisStore.getState().failSuggestionGeneration(tripId, errorMessage(error));
    }
  };

  const generatePreferenceAutoFill = async (request: PreferenceAutoFillRequest, signal?: AbortSignal) => {
    throwIfPreferenceAutoFillRequestAborted(signal);
    const session = useDuriAnalysisStore.getState().sessionsByTripId[tripId] ?? feature.session;
    const displayedFingerprint = session?.inputFingerprint ?? currentFingerprint;
    const requestedByUserId = readLatestAnalysisUserId();
    let planningInput = readLatestAnalysisInput();
    let supplementalEvidence = autoFillSupplementalEvidence;
    let usedCachedServerData = false;
    let refreshedServerData: ApiTripDetailData | undefined;
    if (apiMode) {
      let refreshedData: ApiTripDetailData | undefined;
      try {
        const candidate = await requestPreferenceAutoFillWithDeadline(
          (requestSignal) => fetchApiTripDetail(tripId, requestedByUserId, requestSignal),
          { timeoutMs: AUTO_FILL_SERVER_REFRESH_TIMEOUT_MS, signal },
        );
        if (!candidate.scheduleSnapshot) throw new Error("최신 일정의 변경 상태를 확인하지 못했어요.");
        throwIfPreferenceAutoFillRequestAborted(signal);
        refreshedData = candidate;
        refreshedServerData = candidate;
      } catch (error) {
        if (signal?.aborted) throw error;
        const cached = queryClient.getQueryData<ApiTripDetailData>(queryKeys.trips.detail(tripId, requestedByUserId));
        if (!cached?.scheduleSnapshot) {
          throw new Error("최신 일정을 확인하지 못해 초안을 만들지 않았어요. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        }
        refreshedData = cached;
        usedCachedServerData = true;
      }
      const documentHydration = useTripDocumentHydrationState.getState();
      const collectionStatus = documentHydration.isHydrated ? "loaded" as const : "unavailable" as const;
      const latestUserId = readLatestAnalysisUserId();
      if (!latestUserId || latestUserId !== requestedByUserId) {
        throw new Error("초안을 계산하는 동안 로그인 사용자가 변경되어 결과를 표시하지 않았어요.");
      }
      planningInput = buildApiDuriAnalysisInput(
        refreshedData,
        latestUserId,
        documentHydration.isHydrated
          ? useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS
          : EMPTY_TRAVEL_DOCUMENTS,
        collectionStatus,
      );
      supplementalEvidence = supplementalAutoFillEvidence(refreshedData);
    }
    throwIfPreferenceAutoFillRequestAborted(signal);
    if (!planningInput || readLatestAnalysisUserId() !== requestedByUserId) {
      throw new Error("최신 일정 또는 사용자 정보를 확인하지 못해 초안을 만들지 않았어요.");
    }
    const latestFingerprint = createDuriInputFingerprint(createDuriAnalysisSnapshot(planningInput));
    if (!displayedFingerprint || displayedFingerprint !== latestFingerprint) {
      // 실제 일정 사실이 달라졌을 때만 캐시를 교체한다. 동일 일정의 최신 의견만
      // 달라진 경우 생성 중 카드 key를 바꾸면 완성된 preview를 받을 컴포넌트가
      // 사라질 수 있으므로 이번 계산에만 최신 의견을 사용한다.
      if (apiMode && refreshedServerData && !usedCachedServerData) {
        queryClient.setQueryData(queryKeys.trips.detail(tripId, requestedByUserId), refreshedServerData);
      }
      throw new Error("일정·예약·문서가 화면을 연 뒤 변경되었어요. 최신 화면에서 초안을 다시 만들어 주세요.");
    }
    let autoFillPlanningInput: DuriAnalysisInput = planningInput;
    if (apiMode) {
      autoFillPlanningInput = await enrichAutoFillEvidenceWithinDeadline(autoFillPlanningInput, signal);
    }
    throwIfPreferenceAutoFillRequestAborted(signal);
    if (readLatestAnalysisUserId() !== requestedByUserId) {
      throw new Error("후보 장소 정보를 확인하는 동안 로그인 사용자가 변경되어 결과를 표시하지 않았어요.");
    }
    const autoFillRequest: PreferenceAutoFillRequest = {
      ...request,
      ...(Object.keys(supplementalEvidence).length ? {
        supplementalPreferenceEvidenceByMemberId: supplementalEvidence,
      } : {}),
    };
    let plan = planPreferenceAutoFill(autoFillPlanningInput, autoFillRequest);
    // 저장 후보가 전혀 없을 때뿐 아니라, 기존 후보가 모두 이미 배치됐거나
    // 지역·고정예약·의견 충돌 때문에 실제 선택 대상이 되지 못한 경우에도
    // 지역 후보를 한 번만 보태 재계산한다. 전역 Hard 오류라면 두 번째 계산도
    // 같은 이유로 안전하게 중단되며 기존 일정은 바뀌지 않는다.
    const shouldTryDiscovery = shouldAugmentPreferenceAutoFillWithDiscovery(plan, request);
    if (shouldTryDiscovery) {
      let regionalPlaces: Place[] = [];
      try {
        regionalPlaces = await requestPreferenceAutoFillWithDeadline(
          (requestSignal) => discoverRegionalPlaces(autoFillPlanningInput, apiMode, requestSignal),
          { timeoutMs: AUTO_FILL_DISCOVERY_TIMEOUT_MS, signal },
        );
      } catch (error) {
        if (signal?.aborted) throw error;
      }
      const discovered = buildDiscoveryCandidateInput(
        autoFillPlanningInput,
        regionalPlaces,
      );
      if (discovered.discoveredPlaceIds.length) {
        autoFillPlanningInput = discovered.input;
        if (apiMode) {
          autoFillPlanningInput = await enrichAutoFillEvidenceWithinDeadline(autoFillPlanningInput, signal);
        }
        throwIfPreferenceAutoFillRequestAborted(signal);
        if (readLatestAnalysisUserId() !== requestedByUserId) {
          throw new Error("지역 후보를 확인하는 동안 로그인 사용자가 변경되어 결과를 표시하지 않았어요.");
        }
        plan = planPreferenceAutoFill(autoFillPlanningInput, {
          ...autoFillRequest,
          transientDiscoveryPlaceIds: discovered.discoveredPlaceIds,
        });
      }
    }
    if (usedCachedServerData) plan = addCachedServerDataNotice(plan);
    throwIfPreferenceAutoFillRequestAborted(signal);
    autoFillPlanContextRef.current = {
      plan,
      request: autoFillRequest,
      input: autoFillPlanningInput,
      userId: requestedByUserId,
    };
    return plan;
  };

  const reviewPreferenceAutoFillPlan = async (
    plan: PreferenceAutoFillPlan,
    _request: PreferenceAutoFillRequest,
    signal?: AbortSignal,
  ) => {
    const context = autoFillPlanContextRef.current;
    if (!context || context.plan !== plan || context.userId !== readLatestAnalysisUserId()) {
      throw new Error("일정 정보가 바뀌어 초안을 다시 확인해야 해요. 초안을 한 번 더 만들어 주세요.");
    }
    throwIfPreferenceAutoFillRequestAborted(signal);
    const discoveryIds = plan.certificate.discoveryCandidatePlaceIds;

    if (discoveryIds.length) {
      if (apiMode) {
        for (const placeId of discoveryIds) {
          const place = context.input.placesById[placeId];
          const body = place ? apiCandidateBody(place) : undefined;
          if (!place || !body) {
            throw new Error("추천 장소를 여행방 후보로 연결할 수 없어 일정은 바꾸지 않았어요. 장소 탐색에서 직접 후보로 담아 주세요.");
          }
          try {
            await apiClient.request<unknown>({
              path: `/rooms/${encodeURIComponent(tripId)}/candidates`,
              method: "POST",
              body,
              signal,
              auth: true,
            });
          } catch (error) {
            const alreadyAdded = error instanceof ApiError
              && ["DUPLICATE_CANDIDATE", "CANDIDATE_ALREADY_EXISTS"].includes(error.code ?? "");
            if (!alreadyAdded) {
              throw new Error("추천 장소를 후보에 담는 중 멈췄어요. 일정은 바뀌지 않았으며, 이미 담긴 장소는 후보 보드에서 확인할 수 있어요.");
            }
          }
        }
      } else {
        for (const placeId of discoveryIds) {
          const result = useDuriStore.getState().addCandidatePlace(tripId, placeId);
          if (result !== "added" && result !== "already-exists") {
            throw new Error("추천 장소를 후보에 담지 못해 일정은 바꾸지 않았어요. 후보 보드에서 장소를 확인해 주세요.");
          }
        }
      }
    }

    let reviewInput: DuriAnalysisInput | undefined;
    let stableRequest = context.request;
    let refreshedReviewData: ApiTripDetailData | undefined;
    let refreshedReviewUserId = "";
    if (apiMode) {
      const userId = useAuthSessionStore.getState().currentSessionUserId ?? "";
      if (!userId || userId !== context.userId) throw new Error("로그인 사용자가 바뀌어 초안 검토를 멈췄어요.");
      const refreshed = await fetchApiTripDetail(tripId, userId, signal);
      throwIfPreferenceAutoFillRequestAborted(signal);
      // 후보 저장으로 factsVersion이 바뀐 결과를 여기서 바로 게시하면 카드 key가
      // 바뀌어 진행 중인 검토 요청 자체가 취소될 수 있다. 검토와 제안 등록이
      // 모두 끝난 뒤, 내비게이션과 같은 동기 구간에서 최신 캐시를 게시한다.
      refreshedReviewData = refreshed;
      refreshedReviewUserId = userId;
      const documentHydration = useTripDocumentHydrationState.getState();
      reviewInput = buildApiDuriAnalysisInput(
        refreshed,
        userId,
        documentHydration.isHydrated
          ? useTripDocumentStore.getState().documentsByTripId[tripId] ?? EMPTY_TRAVEL_DOCUMENTS
          : EMPTY_TRAVEL_DOCUMENTS,
        documentHydration.isHydrated ? "loaded" : "unavailable",
      );
      const freshSupplementalEvidence = supplementalAutoFillEvidence(refreshed);
      stableRequest = {
        ...context.request,
        ...(Object.keys(freshSupplementalEvidence).length
          ? { supplementalPreferenceEvidenceByMemberId: freshSupplementalEvidence }
          : { supplementalPreferenceEvidenceByMemberId: undefined }),
      };
    } else {
      reviewInput = readLatestAnalysisInput();
    }
    if (!reviewInput) throw new Error("최신 일정과 예약 정보를 확인하지 못해 일정은 바꾸지 않았어요.");
    reviewInput = await enrichAutoFillEvidenceWithinDeadline(reviewInput, signal);
    throwIfPreferenceAutoFillRequestAborted(signal);
    if (readLatestAnalysisUserId() !== context.userId) throw new Error("초안을 확인하는 동안 로그인 사용자가 바뀌었어요.");

    const reviewedPlan = planPreferenceAutoFill(reviewInput, stableRequest);
    if (reviewedPlan.status !== "preview-only" || !reviewedPlan.assignments.length) {
      throw new Error(`${reviewedPlan.message} 일정은 바꾸지 않았어요.`);
    }
    if (reviewedPlan.certificate.discoveryCandidatePlaceIds.length) {
      throw new Error("추천 장소를 후보로 다시 확인하지 못해 일정은 바꾸지 않았어요. 후보 보드에서 담긴 장소를 확인한 뒤 다시 시도해 주세요.");
    }
    const session = createDuriAnalysisSession(reviewInput, new Date().toISOString());
    const envelope = buildPreferenceAutoFillSuggestionEnvelope(session, reviewedPlan, new Date().toISOString());
    if (!envelope) throw new Error("초안의 변경 내용을 만들지 못했어요. 일정은 바뀌지 않았습니다.");
    useDuriAnalysisStore.getState().completeAnalysis(session);
    if (!useDuriAnalysisStore.getState().completeSuggestionGeneration(tripId, session.inputFingerprint, [envelope])) {
      throw new Error("최신 분석 결과가 달라져 초안을 다시 만들어야 해요.");
    }
    if (refreshedReviewData && refreshedReviewUserId) {
      queryClient.setQueryData(queryKeys.trips.detail(tripId, refreshedReviewUserId), refreshedReviewData);
    }
    router.push({
      pathname: "/trips/[tripId]/suggestions/[suggestionId]",
      params: { tripId, suggestionId: envelope.suggestion.id },
    });
  };

  if (apiMode && !authenticatedUserId) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={returnFromDuri} /><ErrorState message="로그인 사용자 정보를 확인하지 못했어요." /></DuriScrollPage>;
  if (apiMode && apiQuery.isLoading) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={returnFromDuri} /><LoadingState label="최신 일정을 불러오고 있어요." /></DuriScrollPage>;
  // 401은 API client가 refresh를 시도한 뒤 복구 불가능한 경우에만 남는다.
  // auth store가 정리되는 짧은 동안 오류 문구를 노출하지 않고 Root의
  // 인증 guard가 returnTo를 보존한 로그인 화면으로 이동하게 한다.
  if (apiAuthenticationRejected) return <DuriScrollPage><LoadingState label="로그인 상태를 다시 확인하고 있어요." /></DuriScrollPage>;
  // 다른 계정의 오래된 URL이나 탈퇴한 방은 저장 리포트를 보여주지 않고
  // 현재 계정으로 접근 가능한 여행 목록으로 즉시 복귀시킨다.
  if (apiRoomForbidden) return <Redirect href="/(tabs)/trips" />;
  if (apiMode && !apiQuery.data) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={returnFromDuri} /><ErrorState message={toUserFacingApiErrorMessage(apiQuery.error, "여행방을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")} onRetry={() => void apiQuery.refetch()} /></DuriScrollPage>;
  if (!apiMode && !documentsHydrated && !documentHydrationError) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={returnFromDuri} /><LoadingState label="첨부 문서 확인 상태를 불러오고 있어요." /></DuriScrollPage>;
  if (!trip || !input) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={returnFromDuri} /><ErrorState message="여행방 또는 분석 정보를 찾을 수 없어요." /></DuriScrollPage>;
  if (!trip.members.some((member) => member.userId === analysisUserId)) return <DuriScrollPage><AppHeader title="DURI 일정 점검" onBack={returnFromDuri} /><ErrorState message="이 여행방의 분석 리포트를 볼 권한이 없어요." /></DuriScrollPage>;

  const sourceMessage = apiRefreshFailed
    ? "최신 일정을 확인하지 못했어요. 지금 보이는 결과는 마지막으로 확인한 일정 기준이며, 다시 불러오기 전에는 새 점검을 시작하지 않아요."
    : !apiMode && !workspaceScheduleService.available
      ? workspaceScheduleService.message
      : undefined;
  const engineMessage = !duriAnalysisService.available ? duriAnalysisService.unavailableMessage : undefined;
  const autoFillInputInvalid = availability.status === "invalid-itinerary" || availability.status === "invalid-trip-dates";
  const autoFillDisabled = feature.analysisStatus === "loading" || apiRefreshFailed || trip.status === "completed" || autoFillInputInvalid;
  const autoFillDisabledReason = trip.status === "completed"
    ? "완료된 여행방에서는 초안을 만들지 않아요."
    : apiRefreshFailed
      ? "최신 일정을 다시 불러온 뒤 생성해 주세요."
      : autoFillInputInvalid
        ? availability.message
        : undefined;

  return <DuriScrollPage testID="duri-analysis-screen">
    <AppHeader title="DURI 일정 점검" subtitle={`${trip.title} · ${formatTripDateRange(trip.startDate, trip.endDate)}`} onBack={returnFromDuri} />
    {!engineAvailable ? <View accessibilityRole="alert" style={styles.unavailable}><Text style={styles.unavailableTitle}>{apiRefreshFailed ? "최신 일정 확인이 필요해요" : sourceMessage ? "일정 정보를 확인해 주세요" : "지금은 일정 점검을 시작할 수 없어요"}</Text><Text style={styles.unavailableText}>{sourceMessage ?? engineMessage ?? availability.message}</Text>{apiRefreshFailed ? <SecondaryButton label="최신 일정 다시 불러오기" onPress={() => { void apiQuery.refetch(); }} /> : null}</View> : null}
    {documentHydrationError ? <View accessibilityRole="alert" style={styles.unavailable}><Text style={styles.unavailableTitle}>기기 문서함을 확인하지 못했어요</Text><Text style={styles.unavailableText}>문서·예약 기반 검사는 제외하고 나머지 일정은 점검할 수 있어요. 문서 기반 검사를 복구하려면 다시 불러와 주세요.</Text><SecondaryButton label="문서 다시 불러오기" onPress={() => { void ensureTripDocumentStoreHydrated().catch(() => undefined); }} /></View> : null}

    {!feature.session ? <View style={styles.introStack}>
      {availability.status === "no-itinerary" ? <>
        <PreferenceAutoFillCard key={`intro:${currentFingerprint}:${apiMode ? "api" : "local"}:${autoFillSupplementalFingerprint}:${autoFillDisabled ? "disabled" : "enabled"}`} input={input} disabled={autoFillDisabled} disabledReason={autoFillDisabledReason} onGenerate={generatePreferenceAutoFill} onReviewPlan={reviewPreferenceAutoFillPlan} />
        {feature.analysisError ? <View accessibilityRole="alert" style={styles.retainedError}><Text style={styles.retainedErrorTitle}>이전 점검을 마치지 못했어요</Text><Text style={styles.retainedErrorText}>{plainDuriUserText(feature.analysisError)}</Text></View> : null}
      </> : <>
        <DuriAnalysisIntro
          title="현재 일정을 두리와 함께 점검해보세요"
          message={availability.message}
          error={feature.analysisError ? plainDuriUserText(feature.analysisError) : undefined}
          loading={feature.analysisStatus === "loading"}
          disabled={!availability.canAnalyze}
          onAnalyze={runAnalysis}
          onWorkspace={() => router.push({ pathname: "/trips/[tripId]/workspace", params: { tripId } })}
        />
        <PreferenceAutoFillCard key={`intro:${currentFingerprint}:${apiMode ? "api" : "local"}:${autoFillSupplementalFingerprint}:${autoFillDisabled ? "disabled" : "enabled"}`} input={input} disabled={autoFillDisabled} disabledReason={autoFillDisabledReason} onGenerate={generatePreferenceAutoFill} onReviewPlan={reviewPreferenceAutoFillPlan} />
      </>}
    </View> : null}

    {feature.session && sessionStale ? <View style={styles.staleWrap}>
      {feature.analysisStatus === "error" && feature.analysisError ? <View accessibilityRole="alert" style={styles.retainedError}><Text style={styles.retainedErrorTitle}>다시 점검하지 못했어요</Text><Text style={styles.retainedErrorText}>이전 결과는 보관하고 있어요. {plainDuriUserText(feature.analysisError)}</Text></View> : null}
      <StaleSuggestionNotice variant="analysis" onReanalyze={runAnalysis} />
    </View> : null}

    {feature.session && !sessionStale ? <DuriAnalysisReport
      session={feature.session}
      suggestions={feature.suggestions}
      analysisStatus={feature.analysisStatus}
      analysisError={feature.analysisError}
      suggestionStatus={feature.suggestionStatus}
      suggestionError={feature.suggestionError}
      canAnalyze={availability.canAnalyze}
      affectedEntityLabelsByIssueId={affectedEntityLabelsByIssueId}
      preferenceAutoFillContent={<PreferenceAutoFillCard key={`${feature.session.inputFingerprint}:${apiMode ? "api" : "local"}:${autoFillSupplementalFingerprint}:${autoFillDisabled ? "disabled" : "enabled"}`} input={feature.session.snapshot} disabled={autoFillDisabled} disabledReason={autoFillDisabledReason} onGenerate={generatePreferenceAutoFill} onReviewPlan={reviewPreferenceAutoFillPlan} />}
      onReanalyze={runAnalysis}
      onGenerateSuggestions={generateSuggestions}
      onPreviewSuggestion={(envelope) => router.push({ pathname: "/trips/[tripId]/suggestions/[suggestionId]", params: { tripId, suggestionId: envelope.suggestion.id } })}
      onOpenTechnicalDetails={environment.showDuriDiagnostics
        ? (issueId) => setTechnicalDetailsTarget(issueId ? { kind: "issue", issueId } : { kind: "overview" })
        : undefined}
    /> : null}
    {environment.showDuriDiagnostics && feature.session && technicalDetailsTarget ? <DuriTechnicalDetailsModal
      visible
      session={feature.session}
      issue={technicalDetailsTarget.kind === "issue" ? feature.session.issues.find((issue) => issue.id === technicalDetailsTarget.issueId) : undefined}
      onClose={() => setTechnicalDetailsTarget(undefined)}
    /> : null}
  </DuriScrollPage>;
}

const styles = StyleSheet.create({
  unavailable: { gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.warningSoft, padding: spacing.md },
  unavailableTitle: { ...typography.bodyStrong, color: colors.warning },
  unavailableText: { ...typography.caption, color: colors.textSecondary },
  introStack: { gap: spacing.lg },
  staleWrap: { gap: spacing.sm },
  retainedError: { gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "#F2D3AA", backgroundColor: colors.warningSoft, padding: spacing.md },
  retainedErrorTitle: { ...typography.bodyStrong, color: colors.warning },
  retainedErrorText: { ...typography.caption, color: colors.textSecondary },
});
