import { normalizeEmail } from "../validation";

export function createStableMockUserId(email: string) {
  const normalized = normalizeEmail(email);
  let hash = 2_166_136_261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `mock-member-${(hash >>> 0).toString(36)}`;
}
