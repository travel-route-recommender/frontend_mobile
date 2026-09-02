export function isDuriAnalysisEntryBlocked(input: {
  loading: boolean;
  engineAvailable: boolean;
  hasExistingSession: boolean;
}) {
  return input.loading || (!input.engineAvailable && !input.hasExistingSession);
}
