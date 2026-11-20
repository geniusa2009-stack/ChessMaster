import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const root = join(import.meta.dirname, "..", "src");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx)$/.test(e)) a.push(p); } return a; }

test("training API routes are auth-gated and scoped to the caller", () => {
  for (const f of walk(join(root, "app", "api", "training"))) {
    const s = readFileSync(f, "utf8");
    assert.ok(s.includes("getAuthedProfile"), `training route not auth-gated: ${f}`);
    assert.ok(s.includes("profile.id"), `training route not scoped to caller: ${f}`);
  }
});
test("training/next never returns a canonical solution", () => {
  const s = read("app", "api", "training", "next", "route.ts");
  assert.equal(/\.solution\b/.test(s), false, "training/next accesses solution data");
});
test("training writes are server-only (record helper is server-only; client can't mutate state)", () => {
  assert.ok(read("lib", "training", "record.ts").includes('import "server-only"'));
  // no client component writes training tables
  for (const f of walk(root)) {
    const s = readFileSync(f, "utf8");
    if (s.includes('"use client"')) {
      assert.equal(s.includes("training_events") || s.includes("review_state"), false, `client file writes training tables: ${f}`);
    }
  }
});
