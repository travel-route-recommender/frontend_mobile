export type PreferenceAutoFillDeadlineOptions = {
  timeoutMs: number;
  signal?: AbortSignal;
};

export class PreferenceAutoFillRequestTimeoutError extends Error {
  constructor() {
    super("일정 초안 준비 시간이 제한을 초과했어요.");
    this.name = "PreferenceAutoFillRequestTimeoutError";
  }
}

export class PreferenceAutoFillRequestAbortedError extends Error {
  constructor() {
    super("일정 초안 준비가 취소되었어요.");
    this.name = "PreferenceAutoFillRequestAbortedError";
  }
}

/**
 * 네트워크 공급자가 AbortSignal을 무시하더라도 UI 요청은 반드시 끝나게 한다.
 * timeoutMs는 네트워크 안전 한도이며 일정 품질이나 선호 계산에는 사용하지 않는다.
 */
export function requestPreferenceAutoFillWithDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: PreferenceAutoFillDeadlineOptions,
): Promise<T> {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.floor(options.timeoutMs))
    : 1;

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onParentAbort);
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const onParentAbort = () => {
      controller.abort();
      finish(() => reject(new PreferenceAutoFillRequestAbortedError()));
    };

    if (options.signal?.aborted) {
      onParentAbort();
      return;
    }

    options.signal?.addEventListener("abort", onParentAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new PreferenceAutoFillRequestTimeoutError()));
    }, timeoutMs);

    Promise.resolve()
      .then(() => {
        if (settled) throw new PreferenceAutoFillRequestAbortedError();
        return request(controller.signal);
      })
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
  });
}

export function throwIfPreferenceAutoFillRequestAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new PreferenceAutoFillRequestAbortedError();
}
