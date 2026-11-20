import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCompletion, findTrap, OPENING_XP, MASTERED_FOR_SILVER } from "../src/features/openings/lib/validate.ts";
import { OPENINGS, getOpening, canonicalLine } from "../src/features/openings/lib/data.ts";
import { openingCompleteSchema } from "../src/lib/validation/schemas.ts";

test("legacy openings remain; corpus expanded to the R6 target of >=25 learning units", () => {
  // R6 expanded opening-learning units from 6 to >=25. The 6 legacy openings must still be present.
  assert.ok(OPENINGS.length >= 25, `expected >=25 opening units, got ${OPENINGS.length}`);
  for (const id of ["italian", "ruy", "najdorf", "french", "qgd", "caro"]) assert.ok(getOpening(id), `missing legacy opening ${id}`);
  for (const o of OPENINGS) assert.ok(o.moveSequence.length >= 2, o.id);
  // every unit has a learning plan/objective and unique id
  assert.equal(new Set(OPENINGS.map((o) => o.id)).size, OPENINGS.length, "duplicate opening ids");
  for (const o of OPENINGS) assert.ok(o.coachBlueprintEn && o.coachBlueprintEn.length > 10, `${o.id} lacks a learning objective`);
});

test("exact canonical line validates as complete", () => {
  const o = getOpening("italian")!;
  const r = validateCompletion(o, canonicalLine(o));
  assert.equal(r.complete, true);
});

test("wrong move in the line is rejected", () => {
  const o = getOpening("italian")!;
  const line = canonicalLine(o).slice();
  line[2] = "a2a3";
  assert.equal(validateCompletion(o, line).complete, false);
});

test("short/partial line is rejected (no completion reward)", () => {
  const o = getOpening("ruy")!;
  assert.equal(validateCompletion(o, canonicalLine(o).slice(0, 4)).complete, false);
});

test("case/whitespace-insensitive line matching", () => {
  const o = getOpening("caro")!;
  const messy = canonicalLine(o).map((m, i) => (i === 0 ? " " + m.toUpperCase() + " " : m));
  assert.equal(validateCompletion(o, messy).complete, true);
});

test("trap lookup finds the legacy trap by move index + wrong move", () => {
  const o = getOpening("qgd")!; // trap at moveIndex 3, wrongMove d5c4
  assert.ok(findTrap(o, 3, "d5c4"));
  assert.equal(findTrap(o, 3, "e7e6"), undefined);
});

test("XP + mastery constants ported (8 XP, 5 for silver)", () => {
  assert.equal(OPENING_XP, 8);
  assert.equal(MASTERED_FOR_SILVER, 5);
});

test("completion payload strips injected xp/mastered/masteredCount", () => {
  const o = getOpening("french")!;
  const parsed = openingCompleteSchema.parse({
    openingId: "french", moves: canonicalLine(o), flawless: true,
    xp: 999999, mastered: true, masteredCount: 99, newCertificates: ["gold"],
  }) as Record<string, unknown>;
  assert.equal("xp" in parsed, false);
  assert.equal("mastered" in parsed, false);
  assert.equal("masteredCount" in parsed, false);
  assert.equal("newCertificates" in parsed, false);
  assert.equal(parsed.flawless, true);
});

test("malformed completion payloads are rejected", () => {
  assert.equal(openingCompleteSchema.safeParse({ openingId: "", moves: ["e2e4"], flawless: true }).success, false);
  assert.equal(openingCompleteSchema.safeParse({ openingId: "italian", moves: [], flawless: true }).success, false);
  assert.equal(openingCompleteSchema.safeParse({ openingId: "italian", moves: ["nope"], flawless: true }).success, false);
  assert.equal(openingCompleteSchema.safeParse({ openingId: "italian", moves: ["e2e4"], flawless: "yes" }).success, false);
});
