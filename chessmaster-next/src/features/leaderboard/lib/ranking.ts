// Pure, testable ranking helpers. Sort keys are a strict whitelist (never raw SQL from the
// client) and page size is clamped — this is what keeps user-controlled query params safe.
export const SORT_KEYS = ["rating", "xp", "wins"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export function normalizeSort(v: unknown): SortKey {
  return SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : "rating";
}

export function normalizePage(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function normalizePageSize(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

// Rank from a 0-based offset and row index (DB-ordered), 1-based for display.
export function rankFor(offset: number, indexInPage: number): number {
  return offset + indexInPage + 1;
}
