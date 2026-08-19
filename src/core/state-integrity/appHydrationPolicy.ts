export type RequiredHydrationDependency = {
  isHydrated: boolean;
  error: Error | null;
};

/** 인증·도메인처럼 앱 진입 전에 반드시 필요한 저장소만 전역 gate로 계산한다. */
export function resolveAppHydrationPolicy(input: {
  required: readonly RequiredHydrationDependency[];
  optional?: readonly RequiredHydrationDependency[];
}) {
  return {
    isHydrated: input.required.every((dependency) => dependency.isHydrated),
    error: input.required.find((dependency) => dependency.error)?.error ?? null,
    optionalErrors: (input.optional ?? []).flatMap((dependency) => dependency.error ? [dependency.error] : []),
  };
}
