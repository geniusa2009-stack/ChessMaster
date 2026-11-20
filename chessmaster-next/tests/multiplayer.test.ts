import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { applyServerMove, turnFromFen } from "../src/features/multiplayer/lib/game.ts";
import { applyElapsed } from "../src/features/multiplayer/lib/clock.ts";
import { computeMpRewards } from "../src/features/multiplayer/lib/rewards.ts";
import { mpMoveSchema, mpFindSchema } from "../src/lib/validation/schemas.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ---- move authority (server recomputes from stored FEN) ----
test("legal move applies and flips turn (server-derived)", () => {
  const r = applyServerMove(START, "e2e4");
  assert.equal(r.ok, true);
  assert.equal(r.turn, "black");
  assert.equal(r.finished, false);
});
test("illegal move is rejected", () => {
  assert.equal(applyServerMove(START, "e2e5").ok, false);
  assert.equal(applyServerMove(START, "a1a8").ok, false);
});
test("checkmate is server-detected with the correct winner (fool's mate)", () => {
  let fen = START;
  for (const uci of ["f2f3", "e7e5", "g2g4"]) fen = applyServerMove(fen, uci).fen!;
  const mate = applyServerMove(fen, "d8h4");
  assert.equal(mate.finished, true);
  assert.equal(mate.winner, "black"); // black delivered mate
  assert.equal(mate.termination, "checkmate");
});
test("turn is derived from FEN, never trusted from client", () => {
  assert.equal(turnFromFen(START), "white");
  assert.equal(turnFromFen(applyServerMove(START, "e2e4").fen!), "black");
});

// ---- clocks (authoritative, server-side elapsed) ----
test("elapsed time is deducted from the side to move", () => {
  const r = applyElapsed({ timeControl: 300, whiteMs: 300000, blackMs: 300000, turn: "white", lastMoveAt: 1000 }, 4000);
  assert.equal(r.whiteMs, 297000); // 3s elapsed
  assert.equal(r.blackMs, 300000);
  assert.equal(r.timedOut, false);
});
test("running out of time is a server-side timeout for the side to move", () => {
  const r = applyElapsed({ timeControl: 300, whiteMs: 2000, blackMs: 300000, turn: "white", lastMoveAt: 1000 }, 10000);
  assert.equal(r.timedOut, true);
  assert.equal(r.whiteMs, 0);
});
test("untimed games never time out", () => {
  const r = applyElapsed({ timeControl: null, whiteMs: null, blackMs: null, turn: "white", lastMoveAt: null }, 999999);
  assert.equal(r.timedOut, false);
});

// ---- rewards (reuse Elo; both sides move; draw symmetric) ----
test("ranked win: winner +30 xp & +rating, loser -10 xp & -rating", () => {
  const r = computeMpRewards({ ranked: true, winner: "white", whiteRating: 1200, blackRating: 1200 });
  assert.equal(r.whiteXpDelta, 30);
  assert.equal(r.blackXpDelta, -10);
  assert.ok(r.whiteRatingDelta > 0 && r.blackRatingDelta < 0);
  assert.equal(r.whiteRatingDelta, -r.blackRatingDelta); // equal ratings => symmetric
});
test("draw: 0 xp both, rating deltas sum ~0", () => {
  const r = computeMpRewards({ ranked: true, winner: null, whiteRating: 1200, blackRating: 1200 });
  assert.equal(r.whiteXpDelta, 0); assert.equal(r.blackXpDelta, 0);
  assert.equal(r.whiteRatingDelta + r.blackRatingDelta, 0);
});
test("casual games never change rating and only reward the winner mildly", () => {
  const r = computeMpRewards({ ranked: false, winner: "white", whiteRating: 1200, blackRating: 1600 });
  assert.equal(r.whiteRatingDelta, 0); assert.equal(r.blackRatingDelta, 0);
  assert.equal(r.whiteXpDelta, 15); assert.equal(r.blackXpDelta, 0);
});

// ---- payload safety ----
test("move payload only accepts uci + expectedVersion; winner/xp/fen stripped", () => {
  const p = mpMoveSchema.parse({ uci: "e2e4", expectedVersion: 3, winner: "white", xp: 999, fen: "hacked", turn: "black" }) as Record<string, unknown>;
  assert.equal("winner" in p, false); assert.equal("xp" in p, false); assert.equal("fen" in p, false); assert.equal("turn" in p, false);
  assert.equal(p.uci, "e2e4");
  assert.equal(mpMoveSchema.safeParse({ uci: "nonsense" }).success, false);
});
test("find payload constrains time control to the supported set", () => {
  assert.equal(mpFindSchema.safeParse({ timeControl: 300, ranked: true }).success, true);
  assert.equal(mpFindSchema.safeParse({ timeControl: 42 }).success, false);
});

// ---- structural security ----
const root = join(import.meta.dirname, "..", "src");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx)$/.test(e)) a.push(p); } return a; }

test("mp API routes are all auth-gated and membership-checked", () => {
  const routes = walk(join(root, "app", "api", "mp"));
  assert.ok(routes.length >= 4);
  for (const f of routes) {
    const s = readFileSync(f, "utf8");
    assert.ok(s.includes("getAuthedProfile"), `mp route not auth-gated: ${f}`);
  }
  // move + resign + get must verify the caller is a player (NOT_A_PLAYER)
  for (const name of ["move", "resign", "route"]) {
    const matches = routes.filter((f) => f.endsWith(`${name}/route.ts`) || (name === "route" && f.endsWith("[id]/route.ts")));
    for (const f of matches) assert.ok(readFileSync(f, "utf8").includes("NOT_A_PLAYER"), `no membership check: ${f}`);
  }
});
test("mp move route uses optimistic version locking (race-safe) and re-derives state", () => {
  const s = readFileSync(join(root, "app", "api", "mp", "games", "[id]", "move", "route.ts"), "utf8");
  assert.ok(s.includes('.eq("version", g.version)'), "no optimistic version guard");
  assert.ok(s.includes("applyServerMove(g.fen"), "does not re-derive from stored FEN");
  assert.ok(s.includes("NOT_YOUR_TURN"), "no turn check");
});
test("finalize applies rewards only on the active->finished transition (idempotent)", () => {
  const s = readFileSync(join(root, "lib", "multiplayer", "finalize.ts"), "utf8");
  assert.ok(s.includes('.eq("status", "active")'), "finalize not guarded by active status");
  assert.ok(s.includes("if (!won) return { applied: false }"), "finalize not idempotent");
});
test("mp client never trusts realtime payloads (refetches authoritative state)", () => {
  const s = readFileSync(join(root, "features", "multiplayer", "hooks", "useOnlineGame.ts"), "utf8");
  assert.ok(s.includes("refetch"), "no authoritative refetch");
  assert.equal(s.includes("payload.winner") || s.includes("payload.fen"), false, "trusts realtime payload fields");
});
