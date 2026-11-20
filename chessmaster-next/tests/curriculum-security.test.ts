import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("curriculum API is auth-gated and scoped to the authenticated user", () => {
  const s = read("app/api/curriculum/route.ts");
  assert.ok(s.includes("getAuthedProfile"), "must authenticate");
  assert.ok(/Unauthorized/.test(s), "must 401 when unauthenticated");
  assert.ok(s.includes("profile.id"), "must scope to the caller");
  // identity is never taken from client input
  assert.equal(/req\.(json|url|nextUrl)/.test(s), false, "curriculum GET must not read client-provided identity/params");
});

test("curriculum API response never serializes a puzzle solution", () => {
  const s = read("app/api/curriculum/route.ts");
  assert.equal(/\.solution\b/.test(s), false, "route must not reference puzzle solutions");
  assert.equal(/\bsolution:/.test(s), false, "route must not emit a solution field");
});

test("server-only curriculum modules are marked server-only", () => {
  for (const p of ["features/curriculum/lib/eligibility.server.ts", "lib/curriculum/aggregate.server.ts"]) {
    assert.ok(read(p).startsWith('import "server-only"'), `${p} must import server-only`);
  }
});

test("client-importable curriculum modules do NOT import the server-only puzzle corpus", () => {
  for (const p of ["features/curriculum/lib/catalog.ts", "features/curriculum/lib/graph.ts",
    "features/curriculum/lib/progress.ts", "features/curriculum/lib/select.ts", "features/curriculum/lib/validate.ts"]) {
    const s = read(p);
    assert.equal(s.includes("data.server"), false, `${p} must not import the server-only corpus`);
    assert.equal(s.includes('"server-only"'), false, `${p} is meant to be client-safe`);
  }
});

test("curriculum does not weaken or redefine R2 evidence thresholds", () => {
  // progress.ts defines its OWN curriculum-layer thresholds but must not touch R2's MIN_EVIDENCE/ALPHA.
  const s = read("features/curriculum/lib/progress.ts");
  assert.equal(/MIN_EVIDENCE\s*=/.test(s), false, "must not redefine R2 MIN_EVIDENCE");
  assert.equal(/ALPHA\s*=/.test(s), false, "must not redefine R2 EWMA alpha");
});
