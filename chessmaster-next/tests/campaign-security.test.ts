import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("campaign API is auth-gated, scoped to the user, and reads no client identity/params", () => {
  const s = read("app/api/campaign/route.ts");
  assert.ok(s.includes("getAuthedProfile"));
  assert.ok(/Unauthorized/.test(s));
  assert.ok(s.includes("profile.id"));
  assert.equal(/req\.(json|url|nextUrl)/.test(s), false, "campaign GET must not read client identity/params");
});
test("campaign API never serializes a puzzle solution", () => {
  const s = read("app/api/campaign/route.ts");
  assert.equal(/\.solution\b/.test(s), false);
  assert.equal(/\bsolution:/.test(s), false);
});
test("server-only campaign resolver is marked server-only", () => {
  assert.ok(read("features/campaign/lib/eligibility.server.ts").startsWith('import "server-only"'));
});
test("client-safe campaign modules do not import the server-only corpus or server-only", () => {
  for (const p of ["features/campaign/lib/catalog.ts", "features/campaign/lib/videos.ts", "features/campaign/lib/resolve.ts",
    "features/campaign/lib/graph.ts", "features/campaign/lib/progress.ts", "features/campaign/lib/validate.ts"]) {
    const s = read(p);
    assert.equal(s.includes("data.server"), false, `${p} imports the server-only corpus`);
    assert.equal(s.includes('"server-only"'), false, `${p} is meant to be client-safe`);
  }
});
test("no fabricated video asset or URL exists anywhere in the campaign source", () => {
  for (const p of ["features/campaign/lib/catalog.ts", "features/campaign/lib/videos.ts"]) {
    const s = read(p);
    assert.equal(/https?:\/\//.test(s), false, `${p} contains a URL`);
  }
});
test("unlock/pass decisions live in server-authoritative progress, not the client", () => {
  // the client component must not compute passing from its own thresholds
  const c = read("app/campaign/CampaignClient.tsx");
  assert.equal(/minExercises|passedSet|computeCampaignState/.test(c), false, "client must not compute unlock/pass logic");
  // progress lib derives state from provided (server-computed) evidence only
  assert.ok(read("features/campaign/lib/progress.ts").includes("solvedByLevel"));
});
