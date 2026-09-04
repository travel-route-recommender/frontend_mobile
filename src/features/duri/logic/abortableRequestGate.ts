export type AbortableRequestGate = {
  begin: () => AbortController | undefined;
  cancel: () => void;
  finish: (controller: AbortController) => boolean;
  isActive: () => boolean;
  isCurrent: (controller: AbortController) => boolean;
};

export type DuriRequestScope = {
  tripId: string;
  userId: string;
};

export function isSameDuriRequestScope(left: DuriRequestScope, right: DuriRequestScope) {
  return left.tripId === right.tripId && left.userId === right.userId;
}

/**
 * React state가 다시 그려지기 전의 연속 탭도 한 요청만 통과시킨다.
 * 취소된 이전 요청의 finally가 새 요청의 잠금을 풀지 못하도록 요청 소유권도 확인한다.
 */
export function createAbortableRequestGate(): AbortableRequestGate {
  let current: AbortController | undefined;

  return {
    begin() {
      if (current && !current.signal.aborted) return undefined;
      current = new AbortController();
      return current;
    },
    cancel() {
      // 완료 콜백이 아직 도착하지 않았다면 소유권은 남겨 둔다. 그래야
      // blur처럼 같은 scope로 돌아오는 경우 finally가 loading을 해제할 수 있다.
      // 새 begin은 aborted 요청을 즉시 교체하므로 이전 finally가 새 요청을
      // 해제하는 일은 없다.
      current?.abort();
    },
    finish(controller) {
      if (current !== controller) return false;
      current = undefined;
      return true;
    },
    isActive() {
      return Boolean(current && !current.signal.aborted);
    },
    isCurrent(controller) {
      return current === controller && !controller.signal.aborted;
    },
  };
}
