import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isForcedMateInPlies } from "../src/features/content/lib/validate.ts";
import { provesForcedMate } from "../src/features/content/lib/solver.ts";

// FORCED-mate proof for the 16 hand-authored mates. Each is proven forced by the fast quiescence
// solver (sound + complete for mates whose attacker moves are all checks); the two quiet-move rook
// ladders (which the forcing solver intentionally cannot certify) fall back to the full-width
// AND/OR solver on their tiny endgame positions. Same rigor as before, bounded runtime.
const SRC = readFileSync(join(import.meta.dirname, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(SRC.slice(SRC.indexOf("[{"), SRC.indexOf("}]") + 2)) as
  { id: number; fen: string; solution: string[]; theme: string; origin: string }[];

test("every hand-authored mate is a forced mate of its declared length", () => {
  const authored = PUZZLES.filter((p) => p.origin === "project_authored");
  assert.equal(authored.length, 16);
  for (const p of authored) {
    const plies = p.solution.length;
    const byForcing = provesForcedMate(p.fen, plies);
    if (byForcing === plies) continue; // proven forced by the quiescence solver
    // quiet-move mate (rook ladders): prove full-width
    assert.ok(isForcedMateInPlies(p.fen, plies), `authored mate #${p.id} is not a forced mate in ${plies} plies`);
  }
});
