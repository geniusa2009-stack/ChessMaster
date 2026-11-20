import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "src");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx|css)$/.test(e)) a.push(p); } return a; }

// ---- global CSS: focus, reduced motion, responsive, no naked outline:none ----
test("globals provide a visible focus indicator and reduced-motion support", () => {
  const css = read("app", "globals.css");
  assert.ok(css.includes(":focus-visible"), "no :focus-visible focus style");
  assert.ok(css.includes("prefers-reduced-motion"), "no reduced-motion handling");
  assert.ok(css.includes(".game-layout") && css.includes("@media (max-width: 860px)"), "no responsive game layout");
  assert.ok(css.includes(".board-wrap") && css.includes("min(480px, 92vw)"), "board is not fluid/capped to viewport");
});
test("no outline:none is left without a visible focus replacement", () => {
  for (const f of walk(root)) {
    if (!f.endsWith(".css")) continue;
    const s = readFileSync(f, "utf8");
    assert.equal(/outline\s*:\s*none/.test(s) && !s.includes(":focus-visible"), false, `outline:none without focus-visible in ${f}`);
  }
});

// ---- board semantics: role=grid + accessible name + fixed LTR orientation (never mirrored) ----
test("board is a labelled grid, LTR-fixed, with per-square accessible names", () => {
  const s = read("features", "chess", "components", "Board.tsx");
  assert.ok(s.includes('role="grid"') && s.includes('aria-label="Chess board"'), "board missing grid role/name");
  assert.ok(s.includes('dir="ltr"'), "board not pinned LTR (must not mirror in RTL)");
  assert.ok(s.includes("aria-label={`${sq}") , "squares lack accessible names");
  assert.ok(s.includes("containerType"), "board not fluid (no container query)");
});

// ---- live regions on dynamic game status (not the per-second clocks) ----
test("game status surfaces are polite live regions", () => {
  for (const f of ["play/PlayClient.tsx", "puzzles/PuzzlesClient.tsx", "openings/OpeningsClient.tsx", "play/online/OnlineClient.tsx"]) {
    const s = read("app", ...f.split("/"));
    assert.ok(s.includes('aria-live="polite"'), `no live region in ${f}`);
  }
});

// ---- icon-only / landmark labels ----
test("primary nav is a labelled landmark and admin pagination icons are labelled", () => {
  assert.ok(read("components", "TopNav.tsx").includes('aria-label="Primary"'), "nav not labelled");
  const admin = read("app", "admin", "AdminClient.tsx");
  assert.ok(admin.includes("aria-label={t(\"lb.prev\")}") && admin.includes("aria-label={t(\"lb.next\")}"), "admin pagination icons unlabelled");
});

// ---- language selector keeps an accessible name ----
test("language selector has an accessible name", () => {
  assert.ok(read("i18n", "LanguageSelector.tsx").includes('aria-label="Language"'));
});

// ---- certificate: accessible equivalent around the canvas ----
test("certificate canvas has an accessible name (canvas pixels are not SR-readable)", () => {
  assert.ok(read("app", "certificates", "CertificatesClient.tsx").includes("aria-label"), "canvas lacks aria-label");
});

// ---- tables are horizontally scrollable on narrow screens ----
test("data tables are wrapped for horizontal scroll on mobile", () => {
  assert.ok(read("app", "leaderboard", "LeaderboardClient.tsx").includes("table-scroll"), "leaderboard table not scrollable");
  assert.ok(read("app", "admin", "AdminClient.tsx").includes("overflowX"), "admin table not scrollable");
});

// ---- security regression guard: admin UI still server-gated ----
test("admin page remains server-gated (UI a11y work did not weaken authz)", () => {
  const s = read("app", "admin", "page.tsx");
  assert.ok(s.includes("isAdmin(profile)") && s.includes("redirect"), "admin page authz weakened");
});
