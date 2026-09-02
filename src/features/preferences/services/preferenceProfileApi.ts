import { apiClient } from "../../../services/apiClient";
import { parseApiPreferenceCompletionStatus, parseApiPreferenceProfile } from "../logic/apiPreferenceProfile";

export async function fetchApiPreferenceCompletion(signal?: AbortSignal) {
  const status = await apiClient.request<unknown>({ path: "/quiz/status", signal, auth: true });
  return parseApiPreferenceCompletionStatus(status);
}

export async function fetchApiPreferenceProfile(signal?: AbortSignal) {
  const [status, profile] = await Promise.all([
    apiClient.request<unknown>({ path: "/quiz/status", signal, auth: true }),
    apiClient.request<unknown>({ path: "/quiz/me", signal, auth: true }),
  ]);
  return parseApiPreferenceProfile(status, profile);
}
