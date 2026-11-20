import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "src");
const mig = join(root, "..", "supabase", "migrations");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx)$/.test(e)) a.push(p); } return a; }

// ---- P-01: perk purchase is now atomic (no read-modify-write overspend) ----
test("P-01: perk purchase delegates to the atomic DB function (no RMW deduct)", () => {
  const s = read("app", "api", "perks", "buy", "route.ts");
  assert.ok(s.includes('rpc("purchase_perk"'), "perk route must call the atomic purchase_perk RPC");
  assert.equal(s.includes("awardXp("), false, "perk route must not read-modify-write xp");
  const fn = readFileSync(join(mig, "0010_perk_atomic.sql"), "utf8");
  assert.ok(/for update/i.test(fn), "purchase_perk must lock the profile row (FOR UPDATE)");
  assert.ok(/v_xp < p_cost/.test(fn), "purchase_perk must re-check affordability under the lock");
  assert.ok(/security definer/i.test(fn), "purchase_perk must be security definer");
  assert.ok(/revoke all on function/i.test(fn), "purchase_perk must not be client-executable");
});

// ---- every API route is authenticated ----
test("every API route resolves identity server-side (getAuthedProfile), never from the body", () => {
  for (const f of walk(join(root, "app", "api"))) {
    const s = readFileSync(f, "utf8");
    assert.ok(s.includes("getAuthedProfile"), `route not auth-gated: ${f}`);
    assert.equal(/body\.(userId|user_id|email|role|isAdmin)\b/.test(s), false, `route trusts client identity: ${f}`);
  }
});

// ---- no client-reachable file imports secrets / server-only modules ----
test("no client component imports secrets, admin client, or server-only data", () => {
  for (const f of walk(root)) {
    const s = readFileSync(f, "utf8");
    if (!s.includes('"use client"')) continue;
    for (const bad of ["GROQ_API_KEY", "SERVICE_ROLE", "supabase/admin", ".server", "server-only"]) {
      assert.equal(s.includes(bad), false, `client file ${f} references ${bad}`);
    }
  }
});

// ---- no open redirect: auth actions redirect to a fixed internal path ----
test("login/logout redirect to fixed internal paths (no open redirect via next)", () => {
  const s = read("app", "(auth)", "actions.ts");
  assert.equal(/redirect\(\s*[^)"'`]*next/.test(s), false, "auth action redirects to a user-controlled target");
});

// ---- no dangerous HTML sinks with user-controlled strings ----
test("no dangerouslySetInnerHTML / innerHTML anywhere", () => {
  for (const f of walk(root)) {
    const s = readFileSync(f, "utf8");
    assert.equal(s.includes("dangerouslySetInnerHTML"), false, `dangerouslySetInnerHTML in ${f}`);
    assert.equal(/\.innerHTML\s*=/.test(s), false, `innerHTML assignment in ${f}`);
  }
});

// ---- RLS: no USING(true)/WITH CHECK(true) on user-data tables (achievements catalog is public ref data) ----
test("no permissive true-policies on user-data tables", () => {
  const files = readdirSync(mig).filter((f) => f.endsWith(".sql"));
  for (const f of files) {
    const s = readFileSync(join(mig, f), "utf8").toLowerCase();
    // the only allowed `using (true)` is on the public achievements CATALOG
    const matches = [...s.matchAll(/create policy\s+(\w+)[^;]*?using \(true\)/g)];
    for (const m of matches) {
      assert.ok(m[1].startsWith("ach_"), `permissive true-policy on a non-catalog table (${m[1]}) in ${f}`);
    }
    assert.equal(/with check \(true\)/.test(s), false, `WITH CHECK (true) present in ${f}`);
  }
});

// ---- puzzle solutions never leave the server ----
test("puzzle solutions are server-only and never imported by a client file", () => {
  assert.ok(read("features", "puzzles", "lib", "data.server.ts").includes('import "server-only"'), "puzzle data not server-only");
  for (const f of walk(root)) {
    const s = readFileSync(f, "utf8");
    if (s.includes('"use client"')) assert.equal(s.includes("data.server"), false, `client imports puzzle solutions: ${f}`);
  }
});
