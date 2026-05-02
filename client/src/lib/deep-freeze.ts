/**
 * Recursive Object.freeze. Returns the same object frozen (not a copy).
 *
 * Mutation throws in strict mode, fails silently otherwise. Use for canonical
 * config/constant objects (design tokens, route maps, semantic enums).
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}
