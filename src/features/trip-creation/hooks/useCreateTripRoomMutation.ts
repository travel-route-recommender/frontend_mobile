import { useCallback, useRef, useState } from "react";
import type { CreateTripRoomRequest, CreateTripRoomResponse, CreateTripRoomService } from "../services/createTripRoomService";

export type CreateTripRoomMutationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; response: CreateTripRoomResponse }
  | { status: "error"; message: string };

export function useCreateTripRoomMutation(service: CreateTripRoomService) {
  const [state, setState] = useState<CreateTripRoomMutationState>({ status: "idle" });
  const inFlight = useRef(false);

  const createRoom = useCallback(async (request: CreateTripRoomRequest) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setState({ status: "pending" });
    try {
      const response = await service.createTripRoom(request);
      setState({ status: "success", response });
      return response;
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "여행방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
      setState({ status: "error", message });
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, [service]);

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, createRoom, reset };
}
