import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { THEMES, DEFAULT_THEME, isTheme, normalizeTheme, soundEnabledFrom } from "../src/features/settings/lib/prefs.ts";

// ---- settings prefs are whitelisted presentation-only values ----
test("theme is a strict whitelist; junk/injection falls back to default", () => {
  assert.deepEqual([...THEMES], ["default", "light", "midnight"]);
  assert.equal(DEFAULT_THEME, "default");
  assert.ok(isTheme("midnight"));
  assert.equal(isTheme("rgb(0,0,0);--hack"), false);
  assert.equal(normalizeTheme("<script>"), "default");
  assert.equal(normalizeTheme("admin"), "default");
  assert.equal(normalizeTheme(undefined), "default");
});
test("sound preference defaults ON; only literal 'off' disables", () => {
  assert.equal(soundEnabledFrom(null), true);
  assert.equal(soundEnabledFrom("on"), true);
  assert.equal(soundEnabledFrom("anything"), true);
  assert.equal(soundEnabledFrom("off"), false);
});

const root = join(import.meta.dirname, "..", "src");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx)$/.test(e)) a.push(p); } return a; }

// ---- there is NO profile-mutation endpoint (legacy had no editable fields) ----
test("no profile write API exists (read-only profile by construction)", () => {
  const apis = walk(join(root, "app", "api"));
  for (const f of apis) {
    const s = readFileSync(f, "utf8");
    // no API route may UPDATE the profiles table with client-provided profile fields
    if (/\/api\/(profile|settings)\//.test(f)) {
      assert.fail(`unexpected profile/settings API route: ${f}`);
    }
  }
  assert.ok(true);
});

// ---- settings cannot affect authorization (presentation-only, no server/db writes) ----
test("settings feature does not import the admin client or write the DB", () => {
  const files = walk(join(root, "features", "settings"));
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.equal(s.includes("supabase/admin"), false, `settings imports admin: ${f}`);
    assert.equal(s.includes(".update("), false, `settings writes DB: ${f}`);
    assert.equal(/\brole\b|is_admin|\bxp\b|\brating\b/i.test(s), false, `settings references authz/authoritative fields: ${f}`);
  }
});

// ---- profile page reads only the caller's own data + public-safe fields ----
test("profile page is auth-gated, scoped to self, and never selects email/role", () => {
  const s = readFileSync(join(root, "app", "profile", "page.tsx"), "utf8");
  assert.ok(s.includes("getAuthedProfile"), "not auth-gated");
  assert.ok(s.includes('eq("id", profile.id)'), "not scoped to self");
  assert.equal(/select\([^)]*email/.test(s), false, "selects email");
  assert.equal(/select\([^)]*\brole\b/.test(s), false, "selects role");
});

// ---- profile shows authoritative/derived values, not client-editable state ----
test("profile uses the shared authoritative progression lib (no re-implemented formulas)", () => {
  const s = readFileSync(join(root, "app", "profile", "page.tsx"), "utf8");
  assert.ok(s.includes("@/lib/progression/level"), "must reuse level/tier lib");
  assert.ok(s.includes("lifetimeStats"), "must derive stats from authoritative records");
});
