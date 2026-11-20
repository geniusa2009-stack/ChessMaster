import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { adminUsersQuerySchema, certRevokeSchema } from "../src/lib/validation/schemas.ts";

// ---- query/payload validation (whitelists + bounds) ----
test("admin users query: sort is whitelisted, pagination bounded", () => {
  assert.equal(adminUsersQuerySchema.safeParse({ sort: "rating", page: 2, pageSize: 20 }).success, true);
  assert.equal(adminUsersQuerySchema.safeParse({ sort: "email; DROP TABLE profiles" }).success, false); // injection -> rejected
  assert.equal(adminUsersQuerySchema.safeParse({ sort: "password" }).success, false);
  assert.equal(adminUsersQuerySchema.safeParse({ pageSize: 99999 }).success, false); // bounded: oversized rejected
  assert.equal(adminUsersQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(adminUsersQuerySchema.parse({}).sort, "created_at"); // default
});
test("cert revoke payload: serial shape enforced, status is server-decided", () => {
  assert.equal(certRevokeSchema.safeParse({ serial: "a1b2c3d4e5f6a7b8c9" }).success, true);
  assert.equal(certRevokeSchema.safeParse({ serial: "bad" }).success, false);
  const p = certRevokeSchema.parse({ serial: "a1b2c3d4e5f6a7b8c9", revoke: true, status: "valid", winner: "x" }) as Record<string, unknown>;
  assert.equal("status" in p, false); // client cannot set the resulting status directly
  assert.equal("winner" in p, false);
});

// ---- structural authorization guarantees ----
const root = join(import.meta.dirname, "..", "src");
function walk(d: string, a: string[] = []): string[] { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, a); else if (/\.(ts|tsx)$/.test(e)) a.push(p); } return a; }

test("every admin API route independently enforces isAdmin server-side", () => {
  const routes = walk(join(root, "app", "api", "admin"));
  assert.ok(routes.length >= 2);
  for (const f of routes) {
    const s = readFileSync(f, "utf8");
    // every exported handler must gate on isAdmin (not a client flag/email)
    assert.ok(s.includes("isAdmin("), `admin route missing isAdmin gate: ${f}`);
    assert.equal(/body\.(isAdmin|role|email)\b/.test(s), false, `admin route trusts a client role/email field: ${f}`);
  }
});
test("admin page is server-gated with a redirect for non-admins", () => {
  const s = readFileSync(join(root, "app", "admin", "page.tsx"), "utf8");
  assert.ok(s.includes("isAdmin(profile)") && s.includes("redirect"), "admin page not server-gated");
});
test("no legacy client-side admin model (ADMIN_EMAILS / email comparison) in the new app", () => {
  for (const f of walk(join(root))) {
    const s = readFileSync(f, "utf8");
    assert.equal(s.includes("ADMIN_EMAILS"), false, `legacy ADMIN_EMAILS present: ${f}`);
  }
});
test("admin user list selects explicit columns, never select('*') and no password/secret columns", () => {
  const s = readFileSync(join(root, "app", "api", "admin", "users", "route.ts"), "utf8");
  assert.equal(/\.select\(\s*["'`]\*/.test(s), false, "uses select('*')");
  assert.equal(/password|token|secret|service_role/i.test(s), false, "selects/handles secret columns");
});
test("certificate revocation is idempotent and audited", () => {
  const s = readFileSync(join(root, "app", "api", "admin", "certificates", "revoke", "route.ts"), "utf8");
  assert.ok(s.includes("changed: false"), "revoke not idempotent (no no-op path)");
  assert.ok(s.includes("audit_logs"), "revoke not audited");
  assert.ok(s.includes('isAdmin('), "revoke not admin-gated");
});
