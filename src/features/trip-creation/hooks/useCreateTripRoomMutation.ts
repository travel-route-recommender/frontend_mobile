import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../query/keys";
import { useAuthSessionStore } from "../../auth/store/useAuthSessionStore";
import { toUserFacingApiErrorMessage } from "../../../services/userFacingApiError";
import type { CreateTripRoomRequest, CreateTripRoomResponse, CreateTripRoomService } from "../services/createTripRoomService";

export type CreateTripRoomMutationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; response: CreateTripRoomResponse }
  | { status: "error"; message: string };

export function useCreateTripRoomMutation(service: CreateTripRoomService) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CreateTripRoomMutationState>({ status: "idle" });
  const inFlight = useRef(false);
  const [setupRetrying, setSetupRetrying] = useState(false);

  const createRoom = useCallback(async (request: CreateTripRoomRequest) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setState({ status: "pending" });
    const userId = useAuthSessionStore.getState().currentSessionUserId;
    try {
      const response = await service.createTripRoom(request);
      setState({ status: "success", response });
      if (response.source === "api" && userId && userId === useAuthSessionStore.getState().currentSessionUserId) {
        // Home and Trips share this cache, including inactive tab queries.
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.apiList(userId), exact: true });
      }
      return response;
    } catch (reason: unknown) {
      const message = toUserFacingApiErrorMessage(reason, "여행방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
      setState({ status: "error", message });
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, [queryClient, service]);

  const retrySetup = useCallback(async (request: CreateTripRoomRequest) => {
    if (inFlight.current || state.status !== "success" || !state.response.setupIssues?.length) return undefined;
    inFlight.current = true;
    setSetupRetrying(true);
    const userId = useAuthSessionStore.getState().currentSessionUserId;
    try {
      const setupIssues = await service.retryTripRoomSetup(
        state.response.roomId,
        request,
        state.response.setupIssues.map((issue) => issue.step),
      );
      setState((current) => current.status === "success" && current.response.roomId === state.response.roomId
        ? {
          status: "success",
          response: {
            ...current.response,
            ...(setupIssues.length ? { setupIssues } : { setupIssues: undefined }),
          },
        }
        : current);
      if (state.response.source === "api" && userId && userId === useAuthSessionStore.getState().currentSessionUserId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.apiList(userId), exact: true });
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(state.response.roomId, userId), exact: true });
      }
      return setupIssues;
    } finally {
      setSetupRetrying(false);
      inFlight.current = false;
    }
  }, [queryClient, service, state]);

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, createRoom, retrySetup, setupRetrying, reset };
}
