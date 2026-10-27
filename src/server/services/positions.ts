import { type AnyColumn, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";

// Fractional-index ordering (doc 19 §3). Keys are ASCII and must be compared
// byte-wise, so ORDER BY always goes through `byPosition` (COLLATE "C").

export function byPosition(column: AnyColumn) {
  return sql`${column} collate "C"`;
}

/** A key after `last` (or the first key when the list is empty). */
export function keyAfter(last: string | null | undefined) {
  return generateKeyBetween(last ?? null, null);
}

/**
 * A key between two neighbours. Falls back to "after `fallbackLast`" when the
 * neighbours are stale or out of order (e.g. two people dragging at once).
 */
export function keyBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
  fallbackLast: string | null | undefined,
) {
  if (prev && next && prev >= next) return keyAfter(fallbackLast);
  try {
    return generateKeyBetween(prev ?? null, next ?? null);
  } catch {
    return keyAfter(fallbackLast);
  }
}
