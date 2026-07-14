export function createUniqueEntityId(prefix: string, existingIds: Iterable<string>) {
  const existing = new Set(existingIds);
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 12);
  const base = `${prefix}-${timestamp}-${randomPart}`;
  let candidate = base;
  let collisionIndex = 1;

  while (existing.has(candidate)) {
    candidate = `${base}-${collisionIndex}`;
    collisionIndex += 1;
  }

  return candidate;
}

