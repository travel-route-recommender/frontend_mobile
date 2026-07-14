export function toggleUniqueId(ids: readonly string[], targetId: string) {
  const unique = [...new Set(ids)];
  return unique.includes(targetId) ? unique.filter((id) => id !== targetId) : [...unique, targetId];
}

