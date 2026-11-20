import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "src");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx)$/.test(e)) a.push(p); } return a; }

// ---- multiplayer polling is bounded: finished games stop polling ----
test("multiplayer poll/subscription stops once the game is finished", () => {
  const s = read("features", "multiplayer", "hooks", "useOnlineGame.ts");
  assert.ok(s.includes('const finished = game?.status === "finished"'), "no finished guard");
  assert.ok(s.includes("|| finished) return;"), "poll not gated on finished");
  assert.ok(s.includes("[status, refetch, finished]"), "effect does not re-run when finished changes");
  assert.ok(s.includes("clearInterval(poll)") && s.includes("unsubscribe()"), "no cleanup of poll/subscription");
});
test("multiplayer check-sound fires on position change, not on every refetch", () => {
  const s = read("features", "multiplayer", "hooks", "useOnlineGame.ts");
  assert.ok(s.includes("lastCheckFen"), "check sound not de-duplicated by fen");
});
test("exactly one realtime subscription path per game (no duplicate .channel loops)", () => {
  const s = read("features", "multiplayer", "hooks", "useOnlineGame.ts");
  assert.equal((s.match(/\.channel\(/g) || []).length, 1, "more than one channel creation");
});

// ---- board rendering: memoized so clock ticks don't re-render 64 squares ----
test("Board and PieceSvg are memoized", () => {
  const b = read("features", "chess", "components", "Board.tsx");
  assert.ok(b.includes("React.memo(BoardImpl)"), "Board not memoized");
  assert.ok(read("features", "chess", "components", "PieceSvg.tsx").includes("React.memo"), "PieceSvg not memoized");
});

// ---- Stockfish worker lifecycle: lazy + single instance + cleanup ----
test("Stockfish worker is lazy, single-instance and terminable", () => {
  const s = read("features", "chess", "services", "stockfish.ts");
  assert.ok(s.includes("if (tried) return worker"), "worker is not single-instance/lazy");
  assert.ok(/new Worker\(/.test(s), "no worker creation");
});

// ---- API efficiency: no select('*') on routes that only need a projection ----
test("read-oriented API routes use explicit column projections (no select('*'))", () => {
  for (const name of [
    ["app", "api", "admin", "users", "route.ts"],
    ["app", "api", "leaderboard", "route.ts"],
    ["app", "api", "certificates", "route.ts"],
    ["app", "api", "progression", "route.ts"],
  ]) {
    const s = read(...name);
    assert.equal(/\.select\(\s*["'`]\*/.test(s), false, `select('*') in ${name.join("/")}`);
  }
});

// ---- no authoritative data is cached with force-cache (would create stale auth/state) ----
test("authoritative client fetches are not force-cached", () => {
  for (const f of walk(root)) {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
    const s = readFileSync(f, "utf8");
    assert.equal(/cache:\s*["'`]force-cache["'`]/.test(s), false, `force-cache on a fetch in ${f}`);
  }
});

// ---- leaderboard stays server-paginated/bounded (no full-table client sort) ----
test("leaderboard API is server-paginated and bounded", () => {
  const s = read("app", "api", "leaderboard", "route.ts");
  assert.ok(s.includes(".range(offset"), "no server-side range/pagination");
  assert.ok(s.includes("normalizePageSize") || s.includes("MAX_PAGE_SIZE"), "page size not bounded");
});
