import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isValidSerial, SERIAL_RE } from "../src/features/certificates/lib/serial.ts";
import { buildVerifyUrl } from "../src/features/certificates/lib/verifyUrl.ts";
import { buildCertificateView } from "../src/features/certificates/lib/view.ts";
import { TIER_THEME, TIER_ORDER, tierTheme } from "../src/features/certificates/lib/tiers.ts";

const CERT = {
  serial: "a1b2c3d4e5f6a7b8c9", recipientName: "Genius Ahmed", tier: "gold",
  title: "Grandmaster Slayer", status: "valid" as const, issuedAt: "2026-09-30T10:00:00.000Z",
};

// ---- serial ----
test("serial validation accepts 18-hex, rejects everything else", () => {
  assert.ok(isValidSerial("a1b2c3d4e5f6a7b8c9"));
  assert.equal(isValidSerial("A1B2C3D4E5F6A7B8C9"), false); // uppercase not from gen_random_bytes hex
  assert.equal(isValidSerial("short"), false);
  assert.equal(isValidSerial("g1b2c3d4e5f6a7b8c9"), false); // 'g' not hex
  assert.equal(isValidSerial("a1b2c3d4e5f6a7b8c9zz"), false);
  assert.equal(isValidSerial(""), false);
  assert.ok(SERIAL_RE.test("a1b2c3d4e5f6a7b8c9")); // exactly 18 hex chars matches
});

// ---- QR verify URL (real route, no fake domain) ----
test("verify URL uses the real /verify/<serial> route", () => {
  assert.equal(buildVerifyUrl("https://chessmaster.app", CERT.serial), "https://chessmaster.app/verify/a1b2c3d4e5f6a7b8c9");
  assert.equal(buildVerifyUrl("https://x.com/", CERT.serial), "https://x.com/verify/a1b2c3d4e5f6a7b8c9"); // trailing slash trimmed
  assert.equal(buildVerifyUrl("", CERT.serial), "/verify/a1b2c3d4e5f6a7b8c9"); // relative fallback
});
test("verify URL never contains the legacy fake domain", () => {
  const u = buildVerifyUrl("https://chessmaster.app", CERT.serial);
  assert.equal(u.includes("chessplatform.com"), false);
});
test("verify URL rejects a malformed serial (cannot smuggle junk into the QR)", () => {
  assert.throws(() => buildVerifyUrl("https://x.com", "not-a-serial"));
});

// ---- tiers ----
test("all three tiers present with ported theme", () => {
  assert.deepEqual(TIER_ORDER, ["bronze", "silver", "gold"]);
  assert.equal(TIER_THEME.gold.title, "Grandmaster Slayer");
  assert.equal(TIER_THEME.bronze.title, "Tactical Prodigy");
  assert.equal(TIER_THEME.silver.title, "Strategic Mastermind");
  assert.equal(tierTheme("nope"), undefined);
});

// ---- view is built from authoritative fields only ----
test("certificate view reflects the DB record; date formatted; footer has no Nada", () => {
  const v = buildCertificateView(CERT);
  assert.equal(v.recipientName, "Genius Ahmed");
  assert.equal(v.rankLine, "GRANDMASTER SLAYER");
  assert.match(v.dateStr, /30 September 2026/);
  assert.equal(v.revoked, false);
  assert.equal(v.footer.includes("Nada"), false);
  assert.equal(v.serial, CERT.serial);
});
test("revoked status is reflected in the view", () => {
  assert.equal(buildCertificateView({ ...CERT, status: "revoked" }).revoked, true);
});
test("unknown tier throws (cannot render a forged tier)", () => {
  assert.throws(() => buildCertificateView({ ...CERT, tier: "platinum" }));
});

// ---- structural security: issuance is server-only; history is read-only & private ----
const root = join(import.meta.dirname, "..", "src");
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, acc); else if (/\.(ts|tsx)$/.test(e)) acc.push(p); }
  return acc;
}
test("no client-callable certificate ISSUANCE endpoint exists", () => {
  const certRoutes = walk(join(root, "app", "api")).filter((f) => f.includes("/certificates/") && !f.includes("/admin/")); // admin revoke is an authorized mutation, not client issuance
  for (const f of certRoutes) {
    const s = readFileSync(f, "utf8");
    assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(s), false, `certificate route exposes a write verb: ${f}`);
  }
});
test("certificate history route is auth-gated and scoped to the caller", () => {
  const f = join(root, "app", "api", "certificates", "route.ts");
  const s = readFileSync(f, "utf8");
  assert.ok(s.includes("getAuthedProfile"), "not auth-gated");
  assert.ok(s.includes('eq("user_id", profile.id)'), "not scoped to own user");
  assert.equal(/\bemail\b/.test(s), false, "leaks email");
});
test("gold certificate issuance is server-side + idempotent (in games route)", () => {
  const s = readFileSync(join(root, "app", "api", "games", "route.ts"), "utf8");
  assert.ok(s.includes('tier: "gold"'), "gold issuance missing");
  assert.ok(s.includes('opponentId === "titan"') && s.includes("result.ranked"), "gold condition not server-derived");
});
test("client renderer never writes to the DB (presentation only)", () => {
  const s = readFileSync(join(root, "features", "certificates", "lib", "renderCanvas.ts"), "utf8");
  assert.equal(s.includes("supabase/admin"), false);
  assert.equal(s.includes(".insert("), false);
});
