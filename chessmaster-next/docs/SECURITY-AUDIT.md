# ChessMaster — Phase P Security Audit (red-team)

Scope: the migrated Next.js + Supabase app under `chessmaster-next/`. Method: static code +
migration review across all 28 trust surfaces, exploit-path verification, targeted fixes with
regression tests. Environment limitation: `next build` is blocked by a sandbox SWC SIGBUS, so
dynamic/runtime pen-testing (live DB, real concurrency, browser) could not be executed here;
findings are from code paths + unit-level proofs.

## Trust boundaries
- Identity: Supabase Auth session, resolved server-side via `getAuthedProfile()` (DB role lookup).
  No route trusts user_id/email/role from the body/query/localStorage (verified).
- Authority: all XP/rating/wins/achievements/certificates/game/MP state mutated only by server
  routes using the service-role client AFTER auth; RLS blocks client writes; the 0002
  `guard_profile_update` trigger blocks client edits to authoritative profile columns.
- Secrets: GROQ_API_KEY + SUPABASE_SERVICE_ROLE_KEY are server-only; `admin.ts` is `server-only`;
  no client component imports them (verified).

## Findings

### P-01 — Perk purchase overspend via read-modify-write race
- Severity: HIGH (economy integrity)
- Attack: user fires concurrent POST /api/perks/buy for two different perks; both read the same
  xp, both pass `xp >= cost`, both insert (distinct PKs), both deduct (last-writer-wins) → owns
  both perks for less than their combined cost.
- Precondition: authenticated user, enough XP for one perk, concurrent requests.
- Impact: XP economy bypass (buy more than affordable); lost-update on balance.
- Evidence: former `perks/buy/route.ts` did select xp → check → insert → `awardXp(-cost)`.
- Fix: migration `0010_perk_atomic.sql` adds `purchase_perk(user,perk,cost)` — locks the profile
  row `FOR UPDATE`, re-checks ownership + affordability, inserts + deducts in one transaction;
  route now calls `rpc("purchase_perk")`. Concurrent calls serialize on the lock. `security
  definer`, execute revoked from anon/authenticated.
- Regression test: `tests/security-audit.test.ts` (P-01) — route uses the RPC + no RMW; function
  has FOR UPDATE + affordability re-check + revoke.
- Status: FIXED.

## Verified-secure (no change needed)
- Auth: all 20 API routes auth-gated; identity server-derived.
- Admin: `/admin` + both admin APIs re-check `isAdmin` (DB role); no ADMIN_EMAILS; whitelisted
  sort + sanitized search; super_admin protected; audited.
- Game results (/api/games): result validated, XP/rating server-computed, idempotent via UNIQUE
  (user_id, client_game_id); user_id from session; gold cert idempotent via UNIQUE(user_id,tier).
- Multiplayer: server re-derives chess state from stored FEN; move guarded by optimistic version
  + status + turn; finalize is a one-time active→finished transition (idempotent rewards); RLS
  restricts reads to participants; realtime is refetch-signal only.
- Puzzles: solutions are `server-only`, never client-imported; attempt validated server-side;
  idempotent per (user, puzzle).
- Openings: completion replayed server-side; XP once per opening; `flawless` is self-reported and
  documented as weak (not anti-cheat proof) — accepted by design (public theory).
- Certificates: random 18-hex serial (non-enumerable); issuance/revocation server-only; verify by
  DB; revoked never verifies valid; QR → real /verify/[serial].
- Input validation: every mutating route uses zod; unknown keys stripped (no .passthrough).
- Injection: no raw/dynamic SQL; sort fields whitelisted; search wildcards sanitized; `.or()` uses
  server-derived UUIDs only.
- XSS: no dangerouslySetInnerHTML/innerHTML; React escaping; the one document.write interpolates
  only a canvas data: URL (no user string).
- Open redirect: auth actions redirect to fixed internal paths.
- AI (/api/ai): key server-only; auth + rate-limit + size cap + timeout; upstream errors not
  leaked (generic fallback); model from env (not client-selectable).
- Headers/CSP: next.config sets CSP/HSTS/nosniff/referrer/permissions; CSP allows self + Supabase
  + worker/wasm for Stockfish (documented exceptions).
- Privacy: leaderboard/profile/admin expose only intended columns; no email/role to other users.

## Accepted risks / limitations
- XP-GAIN lost-update: quest-claim / game / MP-finalize use read-modify-write via `awardXp` on
  profile xp. Concurrency there can only UNDER-credit the user (lost +XP), never over-credit — not
  an exploit. Accepted; the 0010 atomic pattern can be extended later if desired.
- `achievements` catalog has `using(true)` SELECT — intentional public reference data (titles),
  no user data. Accepted.
- MP routes use `select('*')` on `mp_games` — all columns are used by move/serialize; the table has
  no sensitive columns. Accepted.
- Leaderboard exact count is O(n) at large scale — documented; cache/materialized view is a future
  option, not built.
- Dynamic pen-testing (live concurrency, browser, build) not runnable in this sandbox (SWC SIGBUS)
  — must be repeated on a real deploy.
- Carried hardening items: cburnett pieces, a few secondary English labels, English game content,
  MP wall-clock precision, tool-measured contrast, interactive browser/SR audit.
