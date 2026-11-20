import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e === ".next") continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx|css)$/.test(e)) acc.push(p);
  }
  return acc;
}

const files = walk(join(import.meta.dirname, "..", "src"));

test("no hardcoded Groq key (gsk_) anywhere in source", () => {
  for (const f of files) assert.ok(!/gsk_[A-Za-z0-9]/.test(readFileSync(f, "utf8")), `secret in ${f}`);
});

test("service-role key is never exposed via NEXT_PUBLIC_", () => {
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(s), `service role leaked in ${f}`);
    assert.ok(!/NEXT_PUBLIC_[A-Z_]*GROQ/.test(s), `groq key leaked in ${f}`);
  }
});

test("client-side files never import the admin (service-role) client", () => {
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    if (s.includes('"use client"')) {
      assert.ok(!s.includes("supabase/admin"), `client file imports admin client: ${f}`);
      assert.ok(!s.includes("GROQ_API_KEY"), `client file references GROQ_API_KEY: ${f}`);
      assert.ok(!s.includes(".server"), `client file imports a server-only (.server) module: ${f}`);
      assert.ok(!/solution\s*:/.test(s), `client file appears to embed puzzle solutions: ${f}`);
    }
  }
});
