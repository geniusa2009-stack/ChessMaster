import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCorpus, structuralAudit } from "../scripts/audit-content.ts";

// Fast, solver-free regression of the R4.1 audit invariants. (The heavy solver re-verification
// lives in content-r4.test.ts and scripts/audit-content.ts.)
const P = loadCorpus();
const A = structuralAudit(P);

test("corpus is 271 production puzzles with unique IDs and no invalid records", () => {
  assert.equal(A.count, 271);
  assert.equal(A.uniqueIds, 271);
  assert.deepEqual(A.duplicateIds, []);
  assert.deepEqual(A.invalid, []);
});

test("origin is tracked SEPARATELY from verification (no conflation, no fabricated external origin)", () => {
  assert.deepEqual(A.originVerificationConflations, [], "a verification value is being used as an origin");
  assert.deepEqual(A.fabricatedOriginClaims, [], "an imported/licensed/public-domain/user origin is claimed with no source");
  // every puzzle has BOTH fields populated from the allowed vocabularies
  assert.ok(Object.keys(A.origin).every((o) => ["project_authored", "programmatically_generated", "imported_licensed", "public_domain", "user_provided", "unknown"].includes(o)));
  assert.ok(Object.keys(A.verification).every((v) => ["engine_verified", "automated_rule_verified", "legal_move_validation", "human_reviewed", "multiple_methods"].includes(v)));
  // honest origin split: 16 authored + 255 generated, nothing unknown (every origin is known)
  assert.equal(A.origin["project_authored"], 16);
  assert.equal(A.origin["programmatically_generated"], 255);
  assert.equal(A.origin["unknown"] ?? 0, 0);
});

test("no exact duplicates and no mirror-equivalent positions ship", () => {
  assert.deepEqual(A.exactDuplicates, []);
  assert.deepEqual(A.equivalentPositions, []);
});

test("every high-similarity pair has a documented disposition (none left unresolved)", () => {
  // A pair is only "unresolved" if it shares BOTH structure AND solution (a genuine near-dup).
  // Pairs that merely share a material structure but have different solutions are retained as
  // distinct exercises (documented). None may be left unresolved.
  for (const h of A.highSimilarity) {
    assert.notEqual(h.disposition, "unresolved", `pair ${h.pair} is an unresolved near-duplicate`);
    assert.ok(h.disposition.startsWith("retained:"), `pair ${h.pair} lacks a disposition`);
  }
});

test("objective/theme/domain are consistent — the R4.1 id-165 defensive fix holds", () => {
  assert.deepEqual(A.objectiveThemeMismatches, [], "a defensive objective is attached to a non-defensive theme");
  const p165 = P.find((x) => x.id === 165)!;
  assert.equal(p165.theme, "defensive");
  assert.equal(p165.domain, "defensive_play");
  assert.match(p165.objective, /avoids losing/);
  // defensive theme count now matches the defensive objective count
  const defThemes = P.filter((x) => x.theme === "defensive").length;
  const defObjs = P.filter((x) => /avoids losing/.test(x.objective)).length;
  assert.equal(defThemes, defObjs);
});

test("all six training domains still carry content after the audit fixes", () => {
  for (const d of ["tactical_vision", "calculation", "checkmate_patterns", "defensive_play", "endgame", "opening_knowledge"]) {
    assert.ok((A.domain[d] ?? 0) > 0, `domain ${d} empty`);
  }
});
