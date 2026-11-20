import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalizeSort, normalizePage, normalizePageSize, rankFor, SORT_KEYS, MAX_PAGE_SIZE } from "../src/features/leaderboard/lib/ranking.ts";

test("sort key is a strict whitelist (arbitrary/SQL-ish input falls back to rating)", () => {
  assert.equal(normalizeSort("rating"), "rating");
  assert.equal(normalizeSort("xp"), "xp");
  assert.equal(normalizeSort("wins"), "wins");
  assert.equal(normalizeSort("email"), "rating");             // not allowed -> safe default
  assert.equal(normalizeSort("xp; DROP TABLE profiles;"), "rating"); // injection attempt -> ignored
  assert.equal(normalizeSort(undefined), "rating");
  assert.deepEqual([...SORT_KEYS], ["rating", "xp", "wins"]);
});

test("page is clamped to >= 1", () => {
  assert.equal(normalizePage("1"), 1);
  assert.equal(normalizePage("5"), 5);
  assert.equal(normalizePage("0"), 1);
  assert.equal(normalizePage("-9"), 1);
  assert.equal(normalizePage("abc"), 1);
});

test("page size is clamped to [1, MAX] to prevent enormous queries", () => {
  assert.equal(normalizePageSize("20"), 20);
  assert.equal(normalizePageSize("999999"), MAX_PAGE_SIZE);
  assert.equal(normalizePageSize("0"), 20);
  assert.equal(normalizePageSize("-5"), 20);
  assert.equal(normalizePageSize("nan"), 20);
  assert.ok(MAX_PAGE_SIZE <= 50);
});

test("rank is derived from server offset + index (never client-supplied)", () => {
  assert.equal(rankFor(0, 0), 1);
  assert.equal(rankFor(0, 4), 5);
  assert.equal(rankFor(40, 0), 41);
});

// ---- structural security guarantees ----
const root = join(import.meta.dirname, "..", "src");
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e)) acc.push(p);
  }
  return acc;
}

test("there is NO leaderboard write endpoint (read-only by construction)", () => {
  const routes = walk(join(root, "app", "api")).filter((f) => f.includes("leaderboard"));
  for (const f of routes) {
    const s = readFileSync(f, "utf8");
    assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(s), false, `leaderboard route exposes a write verb: ${f}`);
    assert.ok(/export async function GET/.test(s), `leaderboard route missing GET: ${f}`);
  }
  assert.ok(routes.length >= 1);
});

test("leaderboard route does not select or return private columns", () => {
  const f = join(root, "app", "api", "leaderboard", "route.ts");
  const s = readFileSync(f, "utf8");
  // email / role must never be selected for the public leaderboard
  assert.equal(/\bemail\b/.test(s), false, "leaderboard selects email");
  assert.equal(/\brole\b/.test(s), false, "leaderboard selects role");
  // must go through server auth
  assert.ok(s.includes("getAuthedProfile"), "leaderboard route is not auth-gated");
});

test("leaderboard reuses authoritative tier/level (no duplicate definitions)", () => {
  const f = join(root, "app", "api", "leaderboard", "route.ts");
  const s = readFileSync(f, "utf8");
  assert.ok(s.includes("@/lib/progression/level"), "leaderboard must reuse the shared level/tier lib");
  assert.equal(/function tierFromXp|function levelFromXp/.test(s), false, "leaderboard must not redefine tier/level");
});
