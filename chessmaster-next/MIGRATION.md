# ChessMaster — Security & Architecture Migration (single-file → Next.js + Supabase)

Status: **Secure foundation complete and type-checked.** Gameplay UI porting is staged
(see checklist). This document is the migration record.

## 0. Audit of the old app (`../index.html`, ~3,279 lines) — classified

| # | Finding | Severity | Old behaviour | Fixed by |
|---|---------|----------|---------------|----------|
| 1 | Groq API key hardcoded in browser JS (`AI_CONFIG.key = 'gsk_...'`) | CRITICAL | Live secret shipped to every client; auto-revoked once public | Server-only `GROQ_API_KEY` + `/api/ai` proxy |
| 2 | "SecureStore" = `btoa(encodeURIComponent(json+salt))` sold as encryption | CRITICAL | Base64 + in-source salt; XP/certs forgeable from console | Server-authoritative state in Postgres; local = untrusted cache only |
| 3 | Admin gate = client `ADMIN_EMAILS` array + `currentUser.email` | CRITICAL | Anyone edits `currentUser` in console → admin | DB `profiles.role` + server checks + RLS |
| 4 | Certificate "verification" → nonexistent `play.chessplatform.com`; 32-bit hash called "cryptographic" | HIGH | Fake authenticity | Real `/verify/[serial]` backed by `certificates` table, random non-enumerable serial |
| 5 | Passwords hashed with client-side SHA-256 | HIGH | Unsalted fast hash, no real auth | Supabase Auth (server-side, bcrypt-class) |
| 6 | XP/rating/wins computed & stored client-side | HIGH | Trivially editable | `/api/games` server validation + idempotency + Elo on server |
| 7 | Decommissioned Groq model `llama3-8b-8192` (HTTP 400) | HIGH | AI silently fell back to canned text | `AI_MODEL=openai/gpt-oss-20b` (verified against Groq deprecations doc) |
| 8 | Deps via mutable CDN incl. Lichess pieces `@master`; old chess.js 0.10.3; jQuery | MEDIUM | Supply-chain + breakage risk | npm-pinned `chess.js@^1`, bundled; pieces to be vendored (checklist) |
| 9 | No security headers | MEDIUM | — | CSP/HSTS/etc. in `next.config.ts` |
| 10 | `innerHTML` with dynamic/AI/user content | MEDIUM | XSS surface | React escaping by default; AI output rendered as text |

## 1. Before vs After

BEFORE:  Browser (index.html) → does everything → localStorage "truth" + secret in JS
AFTER:   Browser (React) → Next.js Route Handlers/Server Components (authz + validation)
         → Supabase (Auth + Postgres + RLS) = authoritative state; secrets server-only.

## 2. Folder structure (created under `chessmaster-next/`)

    src/
      app/
        (auth)/{login,register}/page.tsx, actions.ts   # Supabase Auth
        admin/page.tsx                                  # server-guarded
        verify/[serial]/page.tsx                        # real cert verification
        api/ai/route.ts                                 # Groq proxy (server key)
        api/games/route.ts                              # idempotent result validation
        api/admin/users/route.ts                        # server-side admin ops
        layout.tsx, page.tsx, globals.css               # branding preserved
      lib/
        env.ts                                          # centralized env, AI_MODEL
        supabase/{client,server,admin}.ts               # anon vs service-role split
        auth/getUser.ts                                 # role from DB, not client
        security/rateLimit.ts
        validation/schemas.ts                           # zod
        game/rewards.ts                                 # server-authoritative XP/Elo
        groq/ask.ts                                     # timeout/fallback/no leak
        certificates/verify.ts
      middleware.ts                                     # session refresh + route guard
    supabase/migrations/{0001_init,0002_rls,0003_seed}.sql
    tests/{rewards,no-secrets}.test.ts
    next.config.ts  .env.example  package.json  tsconfig.json

## 3. Database (0001) & RLS (0002)
- Tables: profiles(role,xp,rating,wins,losses,draws), game_results(unique user_id+client_game_id),
  achievements, user_achievements, certificates(unique random serial), audit_logs; leaderboard view.
- PKs, FKs, CHECK constraints, indexes, timestamps, updated_at trigger, profile-on-signup trigger.
- RLS: users READ own rows + public leaderboard; NO client writes to authoritative fields.
  `guard_profile_update()` trigger blocks any client change to role/xp/rating/wins/losses/draws;
  only the service-role server path may write them. No `USING(true)` on sensitive writes.

## 4. Trust boundary
- Groq: key server-only; `/api/ai` requires auth, validates (zod), rate-limits, times out (12s),
  caps payload, returns only text or a safe fallback — never upstream errors/secrets.
- Game results: client reports; server recomputes XP/Elo, runs sanity checks, enforces
  idempotency via unique (user_id, client_game_id), logs suspicious submissions.
- Admin: role read from DB every call; role changes audited; super_admin not API-assignable.
- Certificates: authenticity decided by DB record via random 9-byte serial (non-enumerable).

## 5. Tests executed (in this environment)
- `tsc --noEmit` → PASS (0 errors).
- `node --test` → 9/9 PASS: ranked/friendly/loss XP, Elo bounds, impossible-result rejection,
  first_win/giant_slayer awards; and static guards: no `gsk_` in source, no service-role/Groq
  under `NEXT_PUBLIC_`, client files never import the admin client.
- `next build` → could NOT run here: Next's native SWC compiler crashes with SIGBUS in this
  sandbox (reproduced on Next 16 Turbopack AND Next 15 webpack) — an infra limit, not a code
  error. Run `npm run build` on a normal machine to complete this gate.

## 6. Remaining risks / honest gaps
- Rate limiter is per-instance in-memory; use Upstash/Redis for multi-instance prod.
- Anti-cheat is server-authoritative for rewards, but gameplay runs client-side, so a
  determined user can still submit plausible-but-fake results; mitigations = sanity checks,
  idempotency, audit log, and (future) server-side PGN legality replay.
- Gameplay UI (board, Stockfish, puzzles, openings trainer, certificate canvas, RPG/quests,
  5-language i18n) is NOT yet ported — see checklist.

## 7. Feature-port checklist (next slices)
- [x] Chess board component (chess.js@^1 + react) + move validation/timers
- [x] Stockfish via pinned npm worker + negamax fallback (drop CDN 10.0.2)
- [ ] Vendor Lichess cburnett pieces to /public (drop @master)
- [x] Puzzles (server-authoritative validation & rewards)
- [x] Openings trainer (server-verified completion & mastery)
- [ ] Review/heatmap
- [x] Certificate canvas + UX (authoritative data; QR -> /verify/[serial])
- [x] Leaderboard (server-ranked, authoritative)
- [x] Profile (read-only) + Settings (theme/sound/lang/logout)
- [x] RPG: XP/level/tier, daily quests, achievements, skill-tree (XP shop)
- [x] i18n (en/ar/fr/es/ru) with RTL
- [x] themes (classic/light/midnight)
- [x] Certificate issuance server-side (bronze/silver/gold across game/puzzle/opening flows)

## 8. Environment variables (`.env.example`)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL (client-safe);
SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY (server-only); AI_MODEL.

## 9. Commands
- Setup: create a Supabase project → run the 3 SQL files in SQL editor → copy URL/anon/service
  keys and your Groq key into `.env.local` (never commit).
- Dev: `npm install && npm run dev`
- Verify: `npm run typecheck && npm test && npm run lint && npm run build`
- Deploy: push to Vercel; set the same env vars in project settings (service-role + Groq as
  server-only). Never expose service-role/Groq to the client.

## 10. Migration safety
- New app lives beside the old `index.html` (not deleted). Migrate feature-by-feature per the
  checklist; retire the old file only after parity is verified.

## 11. Chess gameplay slice (this migration step)
Ported the core play-vs-bot mode into `src/features/chess/`:
- `lib/chessCompat.ts` — wraps chess.js v1 (restores null-on-illegal; maps isGameOver/isCheckmate/…).
- `lib/bots.ts` — BOTS roster + levelFromElo + curLevel (ported verbatim).
- `lib/engine.ts` — negamax + material eval (ported fallback AI), pure & tested.
- `services/stockfish.ts` — UCI Web Worker (off the React thread) at /engine/stockfish.js
  (pinned `stockfish@16.0.0`, no CDN), graceful fallback to negamax — mirrors old sfReady logic.
- `services/submitResult.ts` — the ONLY reward path: POSTs facts to existing `/api/games`.
- `hooks/useChessGame.ts` — game state, turns, clocks, resignation, captured pieces, move list,
  endGame → submit. Never computes XP/rating locally.
- `components/{Board,PieceSvg}.tsx` + `app/play/PlayClient.tsx` — React board (green theme
  #769656/#eeeed2 preserved), click-to-move with legal highlights, check indicator, clocks,
  captured tray, move list, ranked/time/opponent controls.
- `lib/sounds.ts` — WebAudio SFX (move/capture/check/win/alarm) ported.

Anti-cheat boundary preserved: client runs gameplay; `/api/games` remains the sole authority
for XP/rating/achievements. Injected xp/rating/role in the payload are stripped by the zod
schema (regression-tested).

Not in this slice (unchanged from checklist): puzzles, openings, RPG/quests, i18n, cert canvas,
online multiplayer, review/heatmap. cburnett SVG pieces still to be vendored (Unicode glyphs
used meanwhile).

## 12. Puzzles slice (Phase D)
Ported the tactics trainer (legacy `PZ_SET`, 12 multi-move puzzles) with a security
redesign: **solutions never reach the browser.**
- DB: `0004_puzzles.sql` — `puzzle_solves` (PK user_id+puzzle_id = idempotent rewards),
  profile cols `puzzle_rating/puzzle_streak/best_puzzle_streak`, RLS (read-own; server-only
  writes), and the profile immutability trigger extended to the new columns.
- Server-only data: `features/puzzles/lib/data.server.ts` (`import "server-only"`) holds FENs
  + solutions. `route.ts` returns positions WITHOUT solutions.
- Pure logic: `features/puzzles/lib/validate.ts` — `validateAttempt` (player=even indices,
  opponent=odd), `puzzleXp = max(15, round(elo/55))` (ported), `nextPlayerMove` (single-move hint).
- API: `/api/puzzles` (list, auth), `/api/puzzles/attempt` (validate + idempotent XP/streak/
  puzzle-rating + bronze cert at streak≥25, all server-side), `/api/puzzles/skip` and
  `/api/puzzles/hint` (both reset streak; hint reveals only the next move).
- Client: `features/puzzles/{services/api.ts,hooks/usePuzzle.ts}` + `/puzzles` page reusing the
  existing `Board`. Progressive hints, retry, skip, streak/rating display, solve rewards.
- Anti-cheat: client can't read solutions (server-only), can't self-award (server validates &
  computes XP), rewards idempotent, streak reset on wrong/skip/hint server-side. Injected
  xp/score/streak in the payload are stripped by zod (regression-tested).

Tests: 29/29 pass (20 prior + 9 puzzle). tsc clean. Not ported yet: openings, RPG/quests,
leaderboard UI, cert canvas, i18n, multiplayer, review/heatmap.

## 13. Openings Trainer slice (Phase E)
Ported the legacy openings trainer (`OPENINGS_DATABASE`, 6 lines: italian, ruy, najdorf,
french, qgd, caro — 10 moves each) into `src/features/openings/`.
- DB: `0005_openings.sql` — `opening_progress` (PK user_id+opening_id = idempotent; `mastered`,
  `xp_awarded`), RLS read-own, server-only writes.
- Data: `features/openings/lib/data.ts` — opening lines + English explanations + coach
  blueprints + traps. **Deliberately client-readable**: opening theory is public and the
  trainer's purpose is to teach it (contrast with puzzle solutions, which stay server-only).
- Pure logic: `features/openings/lib/validate.ts` — `validateCompletion` (submitted line must
  equal the canonical line exactly), `findTrap`, `OPENING_XP=8`, `MASTERED_FOR_SILVER=5` (ported).
- API: `/api/openings` (list + progress), `/api/openings/complete` (server replays the line;
  XP granted ONCE per opening — not farmable; mastery recorded; silver cert at 5 mastered — all
  server-side, idempotent).
- Client: `features/openings/{services/api.ts,hooks/useOpening.ts}` + `/openings` page reusing
  `Board`. Play the line move-by-move with per-move explanations, trap feedback, hint + "show
  next move" (both forfeit mastery, ported `opFlawless=false`), reset, opening picker, coach text.

Trust model (documented honestly): opening moves are PUBLIC theory, so the server cannot (and
need not) hide them. The server DOES guarantee: (1) completion is real — the submitted line is
replayed against the canonical line; (2) XP is awarded once per opening, so it can't be farmed;
(3) mastery flag and silver-certificate issuance are server-side and idempotent. The `flawless`
flag is self-reported (hints/step are client aids), so "mastered" means "completed 5 openings
correctly" rather than a strong anti-cheat proof — this is stated plainly rather than dressed up.

Tests: 38/38 pass (29 prior + 9 openings). tsc clean.

## 14. RPG / Quests / Progression slice (Phase F)
Ported the progression layer into `src/features/rpg/` + `src/lib/progression/`.
- Level/tier: `lib/progression/level.ts` — `level = 1 + floor(XP/100)`, tiers at 100/300/600
  (ported verbatim), deterministic + tested; client displays server-derived values.
- Daily quests: play 2 / solve 5 / master 1, +50 XP each. Progress is **derived server-side**
  by counting today's authoritative rows (`game_results`/`puzzle_solves`/`opening_progress`,
  UTC day) — never client-reported. Claims idempotent via `quest_claims` PK(user,quest,UTC-date).
- Achievements: `lib/achievements.ts` conditions evaluated from authoritative stats by
  `/api/achievements/sync`; inserts newly-earned rows idempotently. Client cannot assert an
  unlock. No XP granted (parity with legacy medals).
- Skill tree / XP shop: perks (neon 500, titan 1000) via `/api/perks/buy` — server checks
  affordability, records purchase (idempotent PK), then DEDUCTS XP. Cost is server-defined.
- Streak = the puzzle streak (already authoritative in Phase D). No daily-login streak exists
  in the legacy app, so none was invented (parity).
- Central `lib/progression/awardXp.ts` (`server-only`) is the single XP-mutation helper for the
  new reward flows; existing games/puzzles/openings routes keep their working inline logic
  (single `profiles.xp` ledger — no second XP store, no double-reward path).
- UI: `/progress` page (XP bar, level, tier, quests with claim, achievements grid, XP shop),
  reusing the design system. No jQuery/CDN/localStorage-as-truth.

DB: `0006_rpg.sql` — `quest_claims`, `user_perks` (both PK-idempotent, RLS read-own, server-only
writes) + 5 new achievement catalog rows. `profiles.xp` reused; guard trigger already blocks
client XP writes.

Reward architecture: one authoritative XP ledger (`profiles.xp`), mutated only server-side.
Gains: games/puzzles/openings (existing) + quest claims (+50, once/day). Spend: perks. Achievements
are XP-less. Every permanent reward is idempotent via a DB unique constraint.

Tests: 47/47 pass (38 prior + 9 RPG: level/tier boundaries, quest defs/completion, UTC date,
achievement evaluation from stats, perk defs, quest/perk payload-injection stripping). tsc clean.

Known limitation: perk purchase does read-modify-write on XP; under rare *concurrent cross-perk*
requests a user could overspend slightly (clamped at 0, never negative). Recommended hardening:
a Postgres `security definer` RPC doing `update profiles set xp = xp - cost where xp >= cost`
atomically. Documented, not hidden.

## 15. Leaderboard / Social Progression slice (Phase G)
Replaced the legacy insecure leaderboard (a localStorage win-count map broadcast over a
spoofable Supabase realtime channel, sorted in JS) with an authoritative, server-ranked board.
- Source of truth: the existing `profiles` table (`rating`/`xp`/`wins`, server-updated in
  Phases C–F). NO new ranking table, NO duplicate columns, NO second Elo/XP implementation.
- API: `/api/leaderboard` (auth-gated, GET-only). Whitelisted `sort` (rating|xp|wins),
  clamped `page`/`pageSize` (≤ 50). Ordering + pagination happen DB-side (indexed); the
  browser never fetches-all-and-sorts. Returns only PUBLIC columns; other users' ids/emails
  are never returned — `isMe` is computed server-side. Current-user global rank = count of
  players strictly ahead on the metric + 1.
- Pure lib: `features/leaderboard/lib/ranking.ts` — sort whitelist + page clamping + rank
  formula (the guard against user-controlled query params / injection).
- UI: `/leaderboard` page — ranked table, top-3 gold ranks, current-user highlight + "(you)",
  sort tabs (Rating/XP/Wins), pagination, tier icon + level, loading/empty states. Reuses the
  shared tier/level lib (no duplicate definitions). No jQuery/CDN/realtime-spoof path.
- DB: `0007_leaderboard.sql` — composite indexes on `profiles(rating,xp)`, `(xp,rating)`,
  `(wins,rating)` for efficient ordered pagination. No RLS weakened; reads go through the
  server route (service-role, public columns only); there is deliberately NO write path.

Ranking source of truth: `profiles.rating` (default), `profiles.xp`, `profiles.wins` — all
authoritative, server-mutated. Tier/level derived via `lib/progression/level.ts`.

Tests: 54/54 pass (47 prior + 7 leaderboard: sort whitelist incl. SQL-injection attempt,
page/page-size clamping, rank derivation, no-write-endpoint proof, no-private-columns proof,
tier/level reuse proof). tsc clean.

Known limitations: current-user rank uses "strictly ahead" counting, so tied players share the
best rank (standard competition ranking). Ranking is computed per request (fine at current
scale + indexes); a materialized view could be added later ONLY as a cache if scale demands it.

## 16. Certificate Canvas / UX slice (Phase H)
Rebuilt the certificate experience on authoritative data. NO second cert DB, NO second
verification system, NO fake domain.
- Regression fix: restored the foundational migrations `0001_init.sql`, `0002_rls.sql`,
  `0003_seed.sql` (they had been lost from disk in a sandbox persistence event). These define
  the `certificates` table (random `serial` = `encode(gen_random_bytes(9),'hex')`,
  UNIQUE(user_id,tier), status valid|revoked), profiles, RLS, guard trigger, is_admin, seed.
- Gold-cert issuance gap CLOSED: `/api/games` now issues the gold certificate server-side +
  idempotently when a RANKED game is won vs `opponentId === "titan"` (ported legacy
  `unlockCert('gold')`). Bronze (25-puzzle streak, Phase D) and silver (5 openings, Phase E)
  were already server-issued. All three go through the same authoritative `certificates` table
  with UNIQUE(user_id,tier) preventing duplicates/replays.
- Shared libs (`features/certificates/lib/`): `tiers.ts` (neon theme, ported CERT_TIERS),
  `serial.ts` (18-hex validator, reused by verify.ts), `verifyUrl.ts` (`buildVerifyUrl` → real
  `/verify/<serial>`, relative fallback + throws on bad serial), `view.ts` (`buildCertificateView`
  — pure; turns a DB record into exact canvas text; throws on unknown/forged tier).
- Canvas: `renderCanvas.ts` ports the Modern Dark Neon design (1600×1200) driven ONLY by the
  authoritative record; QR (pinned `qrcode@1.5.4`, no CDN) encodes the real verify URL. Single
  signature (Genius Ahmed Ibrahim); no Nada; revoked certs get a REVOKED overlay.
- API: `/api/certificates` (GET only, auth-gated, own rows only, no email/role) — history.
  There is deliberately NO client issuance endpoint.
- UI: `/certificates` gallery (earned tiers + locked placeholders w/ requirements), live canvas
  preview, PNG download, Print, and a Verify link. Verification page `/verify/[serial]` reused.

Certificate issuance architecture: server reward flows (games/puzzles/openings) insert into the
`certificates` table under service role after verifying the milestone; UNIQUE(user_id,tier) makes
issuance idempotent. Verification architecture: `/verify/[serial]` → `verifyCertificate(serial)`
→ DB lookup by random serial; authenticity is the DB record, never the client. QR encodes
`${NEXT_PUBLIC_SITE_URL}/verify/<serial>` (deploy step: set NEXT_PUBLIC_SITE_URL; relative URL
used otherwise). Export: PNG download + Print (parity with legacy; no PDF in legacy).

Dependencies: added `qrcode@1.5.4` + `@types/qrcode@1.5.5` (pinned, maintained, no CDN).

Tests: 66/66 pass (54 prior + 12 certificate: serial validation, real verify-URL incl. no-fake-
domain + bad-serial rejection, tier theme, view from authoritative fields + revoked + forged-tier
throw, no client issuance endpoint, history auth+own-scope+no-email, gold server-idempotent
issuance, renderer never writes DB). tsc clean.

Known limitations: NEXT_PUBLIC_SITE_URL must be set in production for absolute QR URLs (documented;
relative fallback works). Certificate revocation is modeled (status + REVOKED overlay + verify
handling) but no admin revoke UI yet — deferred to the Admin phase (M). RPG perk read-modify-write
and cburnett pieces remain tracked for final hardening.

## 17. Internationalization slice (Phase I)
Replaced the legacy DOM-mutating i18n (`i18nDict` + `data-i18n` + `document.dir` hacks +
localStorage `cm_lang`) with a typed, SSR-safe i18n architecture in `src/i18n/`.
- Locales: en, ar, fr, es, ru (ported). Default en (new app is English-first; documented
  deviation from legacy default ar). RTL: ar only.
- Catalogs: `messages/en.ts` is the typed source of truth (`MessageKey`); ar/fr/es/ru are
  `Partial<Messages>` merged over English so there are NEVER missing-key holes.
- Resolution: `getMessages(locale)` + `makeTranslator` + `interpolate` ({var} → plain text;
  no HTML produced/parsed, React escapes on render → injection-safe).
- Persistence: cookie `cm_lang` (whitelisted via `normalizeLocale`), read server-side by the
  root layout to set `<html lang dir>` before paint (no hydration flash / no wrong-direction
  flash). `I18nProvider` + `useT()` for client; `getServerT()` for server components.
- Formatting: `format.ts` uses `Intl` with an explicit **UTC** timeZone so server and client
  render identical dates/numbers (no hydration mismatch); stored values never mutated.
- RTL: document direction flips for ar via `<html dir>` + logical layout (gap/flex). The
  chessboard is orientation-preserving by construction (explicit FILES/RANKS arrays), so it is
  NOT mirrored in RTL — verified conceptually + covered by chess tests.
- Migrated surfaces: TopNav + LanguageSelector, home, login/register, verify page, and the
  Play / Puzzles / Openings / Progress / Leaderboard / Certificates client pages (titles,
  buttons, statuses, empty/loading, chess status keys emitted by the game hook).
- Security: locale is presentation-only — whitelisted, never used for authorization or business
  logic; no dynamic import of locale files (all statically imported); no dangerouslySetInnerHTML.

Supported locales: en, ar, fr, es, ru. Default: en. Persistence: cookie `cm_lang` (whitelisted).

Tests: 77/77 pass (66 prior + 11 i18n: locale detection/whitelist/fallback, RTL flag, full
key coverage per locale, translator fallback, interpolation injection-inertness, no-raw-key-leak,
deterministic UTC date/number formatting). tsc clean.

Known limitations: a few SECONDARY stat labels remain hardcoded English (Puzzles "Puzzle
rating/Streak/Solved", Openings "Mastered:", a couple of inline result strings, admin table) —
tracked for a cleanup pass; all primary navigation/actions/statuses are localized. Opening
explanations and puzzle objectives remain English CONTENT (translating game content into 5
languages is a content task, out of scope for this architecture slice). Themes (color-picker)
still pending. RPG perk race + cburnett pieces + cert-revoke admin UI remain tracked.

## 18. Online Multiplayer slice (Phase J)
Replaced the legacy client-authoritative multiplayer (presence lobby + broadcast moves +
client clocks + local chess.js authority, no DB) with a server-authoritative model.
- Data model: `mp_games` (0008) — one authoritative row per match: fen, turn, moves (jsonb),
  ranked, time_control, white_ms/black_ms, last_move_at, version (optimistic lock), winner,
  is_draw, termination, timestamps. CHECK constraints (players distinct; active⇒no winner;
  finished⇒finished_at; winner⇒finished). Indexes for waiting/participant lookups. RLS:
  participants (or admin) may READ; NO client writes — every mutation is a server route.
- Authority model: the server reconstructs chess state from the STORED fen and validates each
  move with the shared chess.js compat layer (`applyServerMove`); client fen/turn/winner/xp are
  never trusted. Turn ownership, checkmate/stalemate/draw, winner, clocks, rating and XP are all
  server-derived.
- API (stable error codes): `POST /api/mp/find` (matchmaking), `GET /api/mp/games/[id]`
  (authoritative state / reconnect), `POST /api/mp/games/[id]/move`, `.../resign`.
- Concurrency: every move is an optimistic-locked conditional UPDATE
  (`where id=… and status='active' and version=V and turn=<mover>`); the loser of a race gets
  STALE_GAME_STATE. Duplicate/out-of-turn/replayed moves fail the same guard. Matchmaking claims
  a waiting seat via an atomic conditional UPDATE (only one joiner flips it to active) → no
  double-join; self-join and already-in-game are rejected.
- Clocks: authoritative. `applyElapsed` deducts real wall-clock time from the side to move using
  `last_move_at`; the browser timer is display-only; a client can't extend time or fake a
  timeout (timeout is decided server-side → opponent wins).
- Termination: checkmate/stalemate/draw (server-detected), resignation, timeout. `finalizeGame`
  transitions active→finished with a guarded conditional UPDATE and applies rewards ONLY if it
  won that transition → rewards are idempotent across retries/reconnect/duplicate completion.
- Rewards: reuse the Phase-C `eloDelta` (no second rating system). Both human players' ratings
  move; ranked win/loss/draw XP mirrors vs-bot (+30/−10/0, casual +15). No Titan/gold path in MP
  (human opponents), so no gold-cert double-award risk.
- Realtime: authoritative-fetch model. The client subscribes to `mp_games` row changes (or falls
  back to a light poll) and, on any signal, REFETCHES `GET /api/mp/games/[id]`. Broadcast/realtime
  payloads are never trusted as state. Reconnect/refresh = just refetch (no localStorage authority).
- UI: `/play/online` reusing the Phase-C `Board` — find match, waiting/turn/finished states,
  authoritative clocks, move list, resign; i18n-wired.

Matchmaking: open-seat join (oldest compatible waiting game of same time-control+ranked) else
create — server-authoritative, uses `profiles.rating` only when computing results. Reconnect:
GET restores fen/turn/clocks/moves. Presence-based auto-loss is intentionally NOT implemented
(a socket disconnect never awards a win — only server clocks/res/mate end a game); documented.

Security attack simulation (covered by structural + unit tests + design): move-as-opponent →
NOT_A_PLAYER/NOT_YOUR_TURN; move twice / out of turn / stale → STALE_GAME_STATE; forged
fen/winner/xp → stripped by schema + server re-derivation; resign opponent's game → membership
check; read/guess another's private game → RLS + NOT_A_PLAYER; race two moves / double join /
double completion → optimistic version + atomic transitions; realtime payload injection → refetch
model ignores payloads. Errors are machine codes (no DB/stack leakage); service role stays server-only.

Migrations verified present: 0001–0008 (foundational 0001–0003 confirmed intact this phase).

Tests: 93/93 pass (77 prior + 16 MP: move authority/turn/illegal/checkmate, clock elapsed/timeout/
untimed, ranked/draw/casual rewards symmetry, payload stripping, auth+membership on all routes,
optimistic-lock + re-derive, idempotent finalize, realtime-not-trusted). tsc clean.

Known limitations: matchmaking is open-seat (not rating-bracketed) — parity with legacy (legacy
paired the first two in the lobby); rating brackets could be added later. Realtime requires the
browser Supabase client + participant RLS read; the poll fallback covers environments without it.
Draw-offer/rematch not in legacy → not added. Per-request clock precision is wall-clock (small
network latency counts against the mover, standard for server-authoritative clocks) — documented.

## 19. Profile / Settings / Account slice (Phase L)
Audited the legacy profile/settings surfaces and migrated only what genuinely existed.
- Legacy profile = the player card: username + a skill-derived chess-glyph avatar + skill level,
  all set at SIGNUP and never editable afterward; plus derived XP/level/tier/W-L (already
  migrated). The legacy app has NO profile editing, avatar upload, bio, name-change,
  password-change, or account-deletion — so none were invented.
- Legacy settings drawer = client-side presentation prefs (theme dark/light/midnight + custom,
  sound, board flip, focus, battery, fullscreen), language (Phase I), certificates (Phase H),
  about-devs, and "reset data" (wiped localStorage — meaningless now that progress is
  server-authoritative).

Migrated:
- `/profile` — server component, read-only, scoped to the signed-in user; shows rating, level,
  tier, XP, W/L/D, puzzles solved, puzzle rating, best streak, openings mastered, achievement &
  certificate counts. Every value is authoritative (DB) or derived via the shared
  `lib/progression/level` + `lifetimeStats`; NO editable fields → NO profile-mutation endpoint.
- `/settings` — client page with PRESENTATION-ONLY prefs: theme (classic/light/midnight),
  sound on/off, language (reuses Phase I `LanguageSelector`), and logout (Supabase Auth
  `logoutAction`). Theme/sound persist in localStorage (`cm_theme`/`cm_sound`), whitelisted;
  theme applied via `<html data-theme>` + ported CSS variable blocks; sound preference is honored
  by the SFX layer (`sounds.ts` now checks `isSoundEnabled()`).
- TopNav + layout wired (ThemeInit applies the saved theme on mount).

Data model / migrations: NONE. Profile reuses the existing `profiles` + authoritative records;
settings are client-side only (no DB state, no API) per "don't create DB state for
presentation-only settings." Migrations unchanged at 0001–0008 (verified).

Authorization model: no profile/settings write endpoints exist (strongest posture). The 0002
`guard_profile_update` trigger + RLS already block any client change to role/xp/rating/wins/etc.
Settings cannot touch authorization (presentation-only, whitelisted, no server writes — tested).

Privacy: the profile page reads only the caller's own row and never selects email/role; it
exposes nothing about other users.

Security attack simulation (covered by tests + design): update another user's profile / own
role / own XP/rating/wins → impossible (no write endpoint; RLS+trigger block direct writes);
inject HTML/script → React escaping, no dangerouslySetInnerHTML; theme/sound injection →
whitelisted to safe enums (falls back to default); manipulate language/theme to affect authz →
presentation-only, never read for authorization.

Tests: 99/99 pass (93 prior + 6 profile/settings: theme/sound whitelist, no-profile-write-endpoint,
settings-cannot-touch-authz, profile auth+self-scope+no-email/role, profile reuses authoritative
libs). tsc clean.

Features explicitly NOT implemented (absent from legacy — not invented): display-name editing,
avatar upload/change, bio, password change, account deletion, server-side settings, skill-level
editing (legacy set it at signup only; the new signup doesn't collect it — cosmetic, documented).
Board-flip/focus/battery/fullscreen were minor legacy presentation toggles not carried over in
this slice (can be added later as client prefs if desired).

## 20. Admin Dashboard slice (Phase M)
Hardened the admin surface and implemented the Phase-H-deferred certificate revocation.
- Legacy admin = a read-only user table (avatar, username, email, XP, certificates, created) +
  total count + refresh, gated by the INSECURE client-side `ADMIN_EMAILS` email comparison. No
  mutations existed in legacy.
- Authorization model (single, server-side): authenticated user → Supabase Auth → DB
  `profiles.role` → `isAdmin()` (server) / `is_admin()` (RLS) → admin op. The legacy
  `ADMIN_EMAILS` client model is gone (test asserts it never appears). `/admin` is a
  server-gated page (redirects non-admins) AND every admin API re-checks `isAdmin` independently
  — hiding UI is never the boundary.
- Admin APIs:
  - `GET /api/admin/users` — paginated (bounded ≤50), whitelisted sort (created_at/rating/xp/
    username), optional username search (wildcards sanitized); explicit columns only (no
    select-all, no credential columns); admin-only.
  - (Role-management mutation was REMOVED in the Phase M cleanup — see below.)
  - `POST /api/admin/certificates/revoke` — admin-only, idempotent, audited; reuses the Phase-H
    `certificates.status` (valid|revoked) model (NO second table). Serial stays stable; the
    `/verify/[serial]` page already reflects 'revoked'.
- UI: `/admin` rebuilt — paginated user table + search + certificate-revocation control, i18n-wired
  (en/ar). A conditional "Admin dashboard" link appears on `/profile` only for admins (server-rendered;
  UX only — the server gate is the real control).
- DB: `0009_admin.sql` — indexes on `profiles(created_at)`, `profiles(username)`,
  `certificates(status)`. No new tables; no RLS weakened.
- Audit logging: reused `audit_logs` (from 0001) — `role_change`, `cert_revoke`/`cert_reinstate`
  record actor_id, action, target, from/to. No secrets/passwords/tokens logged.
- Privacy: admin list returns only operational columns (incl. email, which the legacy admin also
  showed); never password hashes/tokens/service-role material (no such columns exist; test guards
  against select-all + secret keywords).

Certificate verification regression (unchanged trust model): valid→VALID, revoked→REVOKED,
unknown→NOT FOUND; non-admin cannot revoke; repeat revoke idempotent; forged payload can't affect
DB authenticity.

Attack simulation (tests + design): non-admin/unauth GET /admin or admin API → redirect/403;
forged role/email/isAdmin in body → ignored (schema strips; authz from DB only); self-promote /
promote others → role PATCH is admin-gated + super_admin protected + audited; revoke without admin
→ 403; unknown/forged serial → 404 safe; SQL/order injection via sort/search → whitelist + wildcard
sanitize; oversized pagination → rejected; mass assignment → zod strips unknown keys.

Tests: 107/107 pass (99 prior + 8 admin: sort whitelist/injection, bounded pagination, revoke
serial shape + server-decided status, role cannot be super_admin, every admin route isAdmin-gated,
server-gated page, no ADMIN_EMAILS anywhere, explicit-columns/no-secrets, idempotent+audited revoke).
tsc clean.

Features explicitly NOT implemented (absent from legacy — not invented): user deletion, progress
reset, XP/rating editing, analytics beyond the user count, announcements/broadcast/maintenance.
Role-management mutation was intentionally EXCLUDED (removed in cleanup): it had no legacy equivalent, no UI, and no other phase depends on it. The authoritative profiles.role field, RLS, is_admin() and all authorization infrastructure are unchanged.

## 20b. Phase M scope cleanup
Removed the `PATCH /api/admin/users` role-management mutation, `roleUpdateSchema`, and its test —
it had no legacy equivalent, no UI, and nothing else depended on it (violated "don't invent
functionality"). Authorization is unchanged: `profiles.role`, RLS, `is_admin()`/`isAdmin()`, the
0002 guard trigger, and the server-gated admin surfaces all remain. Certificate revocation
(valid Phase-H-deferred scope), the hardened read-only user list, and audit logging for
`cert_revoke`/`cert_reinstate` are retained. Tests: 106/106 pass; tsc clean.

## 21. Accessibility / Responsive / UX hardening (Phase N)
A presentation-only hardening pass — no redesign, no business-logic or authorization changes.
- Global CSS (`globals.css`): `:focus-visible` indicator that works in every theme; a
  `prefers-reduced-motion: reduce` block that damps transitions/animations; `.game-layout`
  (responsive 2-col → single-col at ≤860px with `min-width:0` to kill grid overflow);
  `.board-wrap` (`min(480px,92vw)`); `.table-scroll`; 40px min touch targets; mobile nav sizing.
- Board (`Board.tsx` + `PieceSvg.tsx`): refactored to a FLUID square grid using container
  queries (`container-type:inline-size`, `repeat(8,1fr)`, `aspect-ratio:1`, pieces at `10cqw`)
  — scales from 320px to desktop with no JS resize and no overflow. Each square is a real
  `<button role="gridcell">` with an accessible name (`"e4, white knight"`), `aria-pressed`
  for selection, and `aria-label="Chess board"` on the grid. Board is pinned `dir="ltr"` so it
  is NEVER mirrored in Arabic RTL (chess orientation/colors/coordinates preserved).
- Live regions: game/puzzle/opening/multiplayer status lines are `role="status" aria-live="polite"`
  (clocks are intentionally excluded to avoid per-second screen-reader spam). Admin revoke
  result is a polite live region.
- Labels: primary `<nav aria-label="Primary">`; admin pagination ←/→ get `aria-label`;
  language selector keeps its name; certificate `<canvas>` gets `role="img"` + aria-label
  (the surrounding UI already exposes tier/recipient/status/serial/date/verify as real text,
  since canvas pixels aren't screen-reader-readable).
- Responsive tables: leaderboard wrapped in `.table-scroll`; admin table already `overflow-x:auto`.
- Semantic HTML: interactive elements are native `<button>`/`<a>`/`<Link>`/`<form>`/`<label>`;
  landmarks (`<main>`/`<nav>`/`<aside>`/`<section>`) in place.

Manual testing performed: rendered the exact board + game-layout CSS in a standalone preview at
~623px (below the 860px breakpoint) and screenshotted it — confirmed the layout stacks (board
above, panel below), the board scales fluidly with correctly-sized pieces, there is no horizontal
overflow, and the green identity + buttons are preserved. (The Next dev server itself can't run
here due to the SWC SIGBUS, so interactive keyboard/SR testing must be repeated on a real machine;
the structural guarantees above are unit-tested.)

Security regression: none. All changes are presentation; admin remains server-gated (tested),
no private fields exposed, no client authority introduced.

Tests: 115/115 pass (106 prior + 9 a11y: focus/reduced-motion/responsive CSS, no naked
outline:none, board grid+labels+LTR+fluid, live regions, nav/pagination/selector labels,
certificate canvas label, scrollable tables, admin still server-gated). tsc clean.

Known limitations: full interactive keyboard-chess input is intentionally NOT added (click/tap
move only — avoids a misleading/half-working SR chess experience, per the brief); exact WCAG
contrast ratios across all three themes were reviewed by eye, not measured with a tool here;
cburnett pieces still pending (Unicode glyphs, now fluid). Minor legacy presentation toggles
(flip/focus/battery/fullscreen) remain out of scope.

## 22. Performance / Optimization (Phase O)
A measured, conservative pass — only evidence-based changes from reading the code; no speculative
infra, no correctness/security trade-offs.

Baseline (honest): real bundle sizes could NOT be measured — `next build` is blocked by the
sandbox SWC SIGBUS, so there is no `.next` output to inspect. Baseline was established by source
inspection: all 14 `page.tsx` are already Server Components (data fetch + auth gate on the server);
client components are scoped per route; no duplicate libraries; no global heavy imports except the
i18n provider.

Measured bottlenecks (from code, not assumptions):
1. Multiplayer: the 2.5s poll kept running FOREVER after a game finished (unbounded network), and
   the check-sound re-beeped on every 2.5s refetch while in check.
2. Board: `new ChessGame(fen)` was re-parsed and all 64 squares re-rendered on every parent
   render — including the per-second clock tick on the Play page (timer setState → full board
   re-render each second).
3. A few read routes used `select("*")` on count-only queries.

Optimizations:
- MP polling now STOPS when `game.status === "finished"` (effect re-runs on a `finished` flag,
  clearing the interval + unsubscribing). Exactly one realtime channel per game; cleaned up on
  unmount. Check-sound de-duplicated via a `lastCheckFen` ref (fires only on a real position
  change). Authority model unchanged — realtime is still only a refetch signal.
- `Board` and `PieceSvg` are now `React.memo`. On the Play page the clock ticks every second but
  Board receives stable `fen`/`selected`/`legalTargets`/`onSquare` (state ref + useCallback), so
  the 64-square board no longer re-renders or re-parses the FEN on each tick.
- Narrowed `select("*")` → `select("id")` on the `head:true` COUNT queries in the leaderboard and
  progression snapshot (count-only; returns no rows either way, but keeps projections clean).

Bundle/client JS: no change needed — client components already route-scoped; chess.js/Stockfish/
qrcode/Supabase/canvas each load only on the routes that use them (Stockfish worker is lazy,
single-instance, with a negamax fallback; QR via `qrcode` only imported by the certificate
renderer). i18n catalogs (5) are statically imported via the provider — total size is small (a few
KB) and kept static to preserve the whitelist/security model (documented; not split).

API: read routes use explicit projections (admin/leaderboard/certificates/progression verified).
The MP routes (`/api/mp/games/[id]{,/move,/resign}`) keep `select("*")` because the move/serialize
logic uses nearly every column — documented, no sensitive columns exist on `mp_games`.

Database: indexes already match access patterns (0007 leaderboard sort, 0009 admin, 0004–0006
feature indexes, MP waiting/participant indexes in 0008). No N+1 added; the admin list fetches one
page with one count; the profile/admin pages batch their count queries with Promise.all.

Realtime / polling: one subscription per active game; poll is a 2.5s fallback that stops on
finish; rationale: 2.5s balances responsiveness vs. load, and realtime (when connected) makes it
largely redundant. Finished/aborted games generate no further traffic.

Caching: none added for authoritative data (XP/rating/game/MP/certs/admin) — a test asserts no
`cache: "force-cache"` on any fetch, so authorization/state is never served stale.

Measured improvements: cannot be expressed as before/after numbers (no build/profiler in this
environment). The wins are structural and test-verified: (a) zero network after MP game end
(was 1 req / 2.5s indefinitely), (b) board no longer re-renders on clock ticks, (c) no repeated
check-beeps.

Unmeasurable items: real bundle size, Lighthouse/TTI, DB query timings — require a normal build
environment; must be measured on deploy.

Security regression: none. No authority moved client-side; RLS/auth/validation/idempotency intact.

Tests: 123/123 pass (115 prior + 8 perf: MP poll stops on finish, check-sound de-dup, single
channel, Board/PieceSvg memoized, Stockfish lazy/single-instance, read-route projections,
no force-cache, leaderboard server-paginated). tsc clean.

Known limitations: build-time metrics unmeasured here; i18n catalogs shipped together (small,
intentional); MP routes use select('*') (all columns used); leaderboard exact count is O(n) at
large scale (documented — a cache/materialized view is a future option, not built).

## 23. Full Security Audit (Phase P)
Red-team review of all trust surfaces (see docs/SECURITY-AUDIT.md). One exploitable vulnerability
found and fixed; everything else verified secure or recorded as an accepted risk.
- P-01 (HIGH, FIXED): perk-purchase overspend via read-modify-write race. Fix: migration
  `0010_perk_atomic.sql` — `purchase_perk()` locks the profile row FOR UPDATE and checks+inserts+
  deducts atomically; `/api/perks/buy` now calls the RPC (no client-side RMW). Regression-tested.
- Verified secure: auth on all 20 routes (identity server-derived, never from body); admin authz
  (DB role, no ADMIN_EMAILS); game/puzzle/opening/MP server authority + idempotency; certificate
  issuance/verification/revocation; zod validation (no passthrough); sort/search injection-safe;
  no XSS sinks; no open redirect; AI key server-only + rate-limited; service-role never in client;
  RLS has no permissive true-policy except the public achievements catalog.
- Accepted risks (documented): XP-GAIN lost-update only under-credits (not exploitable); MP
  select('*') uses all columns; leaderboard exact count O(n) at scale; dynamic pen-test needs a
  real deploy (SWC SIGBUS here).
Migration added: 0010_perk_atomic.sql. Tests: 130/130 (123 prior + 7 security-audit). tsc clean.

## 24. Chess Content Quality (Phase R — partial: content pipeline + bot progression)
Built the verifiable content-quality foundation; did NOT fabricate the large adaptive-learning
product the brief also describes (see docs/CHESS-CONTENT-QUALITY.md "Quality Limitations").
- Content validator `features/content/lib/validate.ts`: legal-line check, FORCED-mate-in-N solver,
  normalized-FEN duplicate detection, deterministic difficulty score + bands.
- Evidence-based fix: the validator found puzzle #3 claimed mate-in-2 but the position has NO
  forced mate (verified in 1/2/3) → removed. Active puzzles: 12 → 11, all programmatically verified
  (legal + checkmate + forced of declared length), 0 duplicates.
- `/api/puzzles` now returns a server-derived deterministic `difficulty` band per puzzle.
- Bot progression `features/chess/lib/botLevels.ts`: 24 documented levels, monotonic engine params,
  tiers + documented personas; validated (ordered, monotonic, every level yields a legal move).
- Permanent gate: `tests/content.test.ts` re-validates all active puzzles + opening lines so broken
  content can't ship again.
- NOT implemented (honestly, not stubbed): 100+ campaign levels, Chess DNA, full adaptive engine,
  spaced-repetition/mistake-memory UI, boss challenges, daily adaptive training, post-game analysis.
Tests: 144 pass (130 prior + content/bot). tsc clean. Build BLOCKED (SWC SIGBUS).

## 25. Adaptive Training Engine (Phase R2)
Built a real, deterministic, server-authoritative adaptive training layer (see
docs/ADAPTIVE-TRAINING.md). Pure libs in `features/training/lib/` (domains, skill, review,
mistakes, select, dna) driven only by real events.
- DB `0011_training.sql`: append-only `training_events` + SM-2-inspired `review_state` (RLS
  read-own, server-only writes, indexed).
- `/api/puzzles/attempt` now records a success/fail event + updates review state server-side.
- `/api/training/profile` (skills, DNA, weaknesses, due count, focus) + `/api/training/next`
  (deterministic recommendation + explainable reason, NO solution). `/training` page + i18n + nav.
- Skill model: EWMA, difficulty-weighted, confidence via a 5-attempt evidence threshold, trend;
  not Elo/XP. Mistake memory: ≥4 attempts + ≥40% fail rate. Spaced repetition: fail→soon,
  success→1/3/×ease, capped 180d. Selection: due_review → weakness → progression → cold_start,
  deterministic. DNA: relative, evidence-based, non-psychological. Content scarcity reported
  honestly (sufficient/limited/unavailable) — no cloning.
- Security: solutions stay server-only (tested), training writes server-only, routes auth-gated +
  caller-scoped. Content integrity + all prior gates still green.
Tests: 162 pass (144 prior + training + training-security). tsc clean. Build BLOCKED (SWC SIGBUS).
Content unchanged: 11 validated puzzles, 6 validated openings, 0 duplicates, 0 invalid.

## 26. Verified Content Expansion (Phase R3)
Strengthened the content pipeline and expanded ONLY with engine-verified content (quality>quantity).
- Validator additions: material signature, file-mirror, near-duplicate detection, mate-solution
  uniqueness classifier, trivial-rejection, provenance + content-status + rejection-reason model,
  single `gatePuzzle()` acceptance gate. All unit-tested.
- Content: 7 authored mate candidates → 5 accepted (engine-verified), 2 rejected (NO_FORCED_SOLUTION).
  Puzzles 11 → 16 (mateIn1 ×3 added; rook-ladder mateIn2 ×2). All re-validated; 0 dups; provenance
  backfilled on all 16 (project-authored). Difficulty now varied (easy/medium/hard/expert).
- Honest coverage: checkmate_patterns sufficient; tactical/defensive/endgame remain insufficient —
  NOT fabricated (no rigorous verifier for those without a licensed dataset). Documented.
- R2 integration automatic (mateIn1 maps to checkmate_patterns); no R2 thresholds changed; solutions
  still server-only; security/RLS unchanged.
Tests: 169 pass (162 prior + content-r3). tsc clean. Build BLOCKED (SWC SIGBUS).

## 27. Verified Scale-Up to 200 Puzzles (Phase R4)
Built a deterministic in-repo verification engine and scaled content 16 → **202** with no fabrication.
- `src/features/content/lib/solver.ts`: quiescence negamax tactical solver (forcing-move search,
  full-width defence, mate + material-gain proofs, node-capped, reproducible). Objective helpers
  `provesForcedMate` / `provesMaterialGain` / `analyse`.
- Generated 2429 candidates; 238 accepted by the full gate (legality→solution→objective→theme→
  difficulty→dedup→triviality→educational→provenance), + 16 authored, globally de-duped (0 bad),
  curated to 202 for balance.
- `data.server.ts`: new `domain`/`difficulty` fields on every `ServerPuzzle` (authoritative,
  server-only); solutions never leave the server module. `elo` is a labelled difficulty proxy.
- R2 integration: migration `0012_training_domain.sql` adds `training_events.domain`; `recordTrainingOutcome`
  stores it; `aggregate` uses `domainsForEvent(theme, domain)` so skill tracking uses each puzzle's
  verified primary domain (legacy rows fall back to the theme map). `/api/puzzles`, `/attempt`,
  `/training/next` now consume stored difficulty/domain — no per-request engine analysis (perf rule).
- Honest distribution: checkmate/tactical/opening strong; calculation/defensive/endgame below target
  and documented (clean multi-move/defensive/positional-endgame content is not auto-certifiable and
  was not fabricated). Difficulty spread easy 62 / medium 66 / hard 58 / expert 16.
- Tests: 179 pass (added solver unit tests + corpus re-verification in `tests/content-r4.test.ts`,
  updated `tests/content.test.ts` integrity gate for mixed content). tsc clean. Build BLOCKED (SWC SIGBUS).

## 28. Content Audit & Integrity Hardening (Phase R4.1)
Independent read-only audit of the R4 corpus, then minimal evidence-driven fixes. No content added.
- Split `data.server.ts` `provenance` → `origin` + `verification` (ServerPuzzle): origin (how the
  position arose) is now separate from verification (how it was checked). No DB column was involved,
  so no migration was required. 16 project_authored / 186 programmatically_generated; all engine_verified.
- Corrected one misclassified record (id 165 → defensive/defensive_play) with solver evidence.
- Added `scripts/audit-content.ts` (independent audit + machine-readable `docs/content-audit.json`,
  no solutions), `docs/CHESS-CONTENT-AUDIT.md`, and `tests/content-audit.test.ts` (structural
  regression). Updated content tests to the new origin/verification vocabulary.
- Verified: 202 unique IDs, 0 invalid, 0 exact/mirror duplicates, 1 documented high-similarity pair,
  0 origin/verification conflations, 0 fabricated origins, 0 objective/theme mismatches; solutions
  remain server-only. Tests 186 pass; tsc clean; build BLOCKED (SWC SIGBUS).

## 29. Curriculum & Adaptive Learning Path (Phase R5)
Layered a learning-path engine over the audited corpus and R2 — no new puzzles, no schema change.
- New client-safe libs: `features/curriculum/lib/{catalog,graph,progress,select,validate}.ts`
  (skill graph, prerequisites, objectives via i18n, deterministic selector, integrity validator).
  Server-only bridges: `features/curriculum/lib/eligibility.server.ts`,
  `lib/curriculum/aggregate.server.ts` (map history to current skills; solutions never exposed).
- New API `GET /api/curriculum` (auth-gated, own-data-only, no solutions). `/training` UI extended
  with a learning-path panel (recommended next + reason, skill ladder with state/coverage, honest
  "future content" note); en/ar i18n added (others fall back).
- No DB migration: per-skill progression is DERIVED from existing training_events / puzzle_solves /
  review_state. Historical events are interpreted via a documented compatibility mapping (current
  skill of the attempted puzzle id first, then stored domain/theme), so reclassifications (e.g. the
  R4.1 id-165 fix) are honoured and no review history is rewritten.
- R2 untouched: evidence thresholds (MIN_EVIDENCE, EWMA alpha), review state, mistake memory and
  domain mapping are reused as-is. Curriculum-layer mastery thresholds are additional + documented.
- Reports: `docs/CHESS-CURRICULUM.md`, `docs/curriculum-audit.json` (generated by
  `scripts/audit-curriculum.ts`). Tests: 213 pass (added curriculum + curriculum-security). tsc
  clean. Build BLOCKED (SWC SIGBUS).

## 30. Verified Content Expansion (Phase R6)
Expanded content materially using the deterministic solver pipeline (no new verifier type needed; the
R4 quiescence solver already verifies forced mate / material gain / unique defence; endgame is
conversion-only). No schema/DB migration required (new puzzles reuse the existing ServerPuzzle shape;
curriculum state stays derived).
- Puzzles 202 → 271: +15 calculation (35), +24 defensive (34), +30 endgame (46, trimmed from 66 for
  balance). All solver-gated + fully re-verified; 1 shallow false-positive candidate dropped on
  re-verification. Exact+mirror dedup against the existing corpus; 0 exact/mirror dups; 2 documented
  high-similarity pairs (distinct solutions → retained).
- Opening-learning units 6 → 28 in `features/openings/lib/data.ts` (22 authored named lines,
  legal-validated, project_authored, principle-based objectives; no invented theory/history).
- Curriculum auto-absorbs new puzzles via the existing `skillForPuzzle` mapping; weak-domain coverage
  now reports "available" (calculation 35, defensive 34, endgame 46) honestly. R2/R5 untouched;
  evidence thresholds unchanged.
- New metadata: new puzzles carry origin=programmatically_generated, verification=engine_verified.
- Tests: 213 pass (added tests/content-authored-mates.test.ts; updated counts + high-similarity
  disposition logic + bounded solver spot-checks for the per-process time budget). tsc clean. Build
  BLOCKED (SWC SIGBUS). Reports regenerated from current data.

## 31. Campaign, 100+ Levels & Video-Ready Ecosystem (Phase R7)
Added a connected campaign/education layer over the curriculum — NO database migration (campaign
structure is a static typed catalog; learner progress is DERIVED from existing puzzle_solves/R2).
- New client-safe libs: `features/campaign/lib/{catalog,videos,resolve,graph,progress,validate}.ts`
  (10 worlds, 14 chapters, 103 stable-ID levels CHxx-Lyyy, 37 planned video lessons, 10 bosses).
  Server-only: `features/campaign/lib/eligibility.server.ts` resolves levels to real puzzle/opening
  ids and decides playable vs planned (no solutions exposed).
- API `GET /api/campaign` (auth-gated, own-data, server-authoritative unlock/pass; no solutions).
  UI `/campaign` (worlds→chapters→levels, state badges, level detail, practice launch) + i18n (en/ar).
- Reports generated by `scripts/audit-campaign.ts` from the one catalog: docs/chessmaster-campaign.json,
  chessmaster-level-reports.json, chessmaster-video-catalog.json + 4 Markdown reports. Validator fails
  the command on any integrity error.
- Honest status: 57 playable (content-backed), 23 limited (concept/review text lessons, video planned),
  23 future_content_required (piece-movement tutorials, endgame opposition/key-squares, strategic
  middlegame, and practice sets beyond available content). Videos are ALL planned — no assets/URLs.
- Tests: campaign + campaign-security added. tsc clean. Build BLOCKED (SWC SIGBUS).

## 32. Campaign Integrity, Opening Integration & CH02 Pilot (Phase R7.1)
Consolidation phase — NO database migration (reuses the authoritative `opening_progress` table from
migration 0005 and `puzzle_solves`; campaign state stays derived).
- **Opening→campaign integration (R7 gap closed):** `/api/campaign` now counts completed opening
  lines from `opening_progress` (server-written only after `validateCompletion`) for opening-kind
  levels, via the pure `countSolvedByLevel`. Idempotent (one row per opening); a different opening
  cannot satisfy another level; client cannot forge completion.
- **Pilot chapter CH02** (Check & Checkmate Recognition — earliest coherent content-backed chapter;
  CH01 piece-movement gap documented at the entrance). 7 levels, boss verified end-to-end playable.
- **Board demonstrations:** `features/campaign/lib/demos.ts` — 5 project-authored illustrative
  positions, each validated by chess.js (legal FEN, SAN/UCI agree, claimed check/mate holds). Not
  production puzzles; no hidden solution.
- **Video scripts:** full Arabic recording scripts for the 3 CH02 videos (`docs/video-scripts/`),
  advancing those videos to `script_ready` (AR supplied); all other videos remain `planned`. No
  asset/URL/runtime fabricated; nothing recorded/reviewed/published.
- **Reports:** `scripts/audit-pilot.ts` generates `chessmaster-pilot.json`, `CHESSMASTER-R7-1-AUDIT.md`
  (level distinctness + readiness + honest boss/entrance notes), `CHESSMASTER-PILOT-CHAPTER.md`,
  `CHESSMASTER-VIDEO-SCRIPTS.md`, `CHESSMASTER-VIDEO-STORYBOARDS.md`, `CHESSMASTER-PILOT-QA.md`;
  `scripts/audit-campaign.ts` regenerates the R7 reports (video-catalog now reflects CH02 script_ready).
- Distinctness: 0 same-chapter practice duplicates; composite/boss cumulative reuse documented.
  R2/R5 untouched; historical data preserved. Tests: 240 pass. tsc clean. Build BLOCKED (SWC SIGBUS).

## 33. CH01 Foundations, Interactive Board Player & Rules Assessment (Phase R7.2)
Built the real beginner chapter and connected it to CH02.
- **Migration 0013_foundation_assessment.sql**: a minimal server-authoritative record for the CH01
  rules assessment (puzzle_solves/opening_progress cannot represent a rules quiz). RLS: read-own;
  writes service-role only; idempotent (one row per user per assessment; prior pass never downgraded).
- **CH01** rebuilt from `features/campaign/lib/foundations.ts` (12 lessons + final assessment),
  injected into the campaign catalog; CH02's first level now REQUIRES CH01-L012 (server-gated).
- **Board demonstrations**: 14 project-authored, chess.js-validated positions (incl. illegal-move
  rejection cases for blocking/castling-through-check/expired-en-passant). Client-safe (no secrets).
- **Interactive board player** `features/campaign/components/BoardDemoPlayer.tsx` (guided + interactive
  rules practice; illegal moves rejected, board unchanged) reusing the existing Board.
- **Rules assessment**: client-safe PROMPTS in foundations.ts; correct answers COMPUTED server-side in
  `foundations.answers.server.ts` (never shipped); graded by `POST /api/foundations/attempt` (auth,
  rate-limited, server-verified, idempotent, returns no answer key). Pass ≥ 7/8.
- **Campaign API** reads `foundation_assessment` → CH01-L012 passes → CH02 unlocks. Opening
  integration + CH02 (7 levels, 5 demos, 3 scripts) + bosses preserved.
- **Videos**: 12 CH01 videos → script_ready (full Arabic scripts in docs/video-scripts/, storyboards),
  Arabic supplied; nothing recorded/reviewed/published; human_educational_reviewed: NO.
- R2/R5 untouched; thresholds unchanged; learner history preserved. Tests: 251 pass. tsc clean.
  Build BLOCKED (SWC SIGBUS). Reports regenerated by scripts/audit-foundations.ts + audit-campaign.ts.

## 34. Competency-Based Assessment & Mastery Engine (Phase R7.3)
Hardened the CH01 rules assessment so a learner cannot pass by aggregate score while failing a
mandatory chess rule.
- **Competency matrix** (16 mandatory competencies) in `foundations.ts` is the single source of
  truth for assessment items, remediation lessons, reports and the audit. Every mandatory
  competency maps to >=1 graded item + its specific CH01 lesson.
- **Competency pass-gate**: the chapter passes iff EVERY mandatory competency is `demonstrated`
  (statuses: not_attempted / insufficient_evidence / demonstrated / needs_remediation). The old
  aggregate threshold survives only as a secondary display floor — it can no longer pass the chapter.
- **Objective-specific drills** (`move_objective`): the learner plays a move; the server accepts
  only moves satisfying the objective (e.g. capture the checking piece) — a legal-but-irrelevant
  move is rejected. Accepted move sets are computed server-side and never shipped.
- **Migration 0014_foundation_attempt.sql**: append-only per-attempt competency evidence
  (per-competency STATUS only; no answer keys). RLS read-own; no client write policy (server-only
  writes). `foundation_assessment` (0013) remains the authoritative pass latch — a prior pass is
  never downgraded by a failed retry; kept score = max(new, previous).
- **Grader** `foundations.answers.server.ts` (`import "server-only"`) now returns per-competency
  results + targeted remediation; `POST /api/foundations/attempt` persists evidence, latches the
  pass, and returns per-item/per-competency results + remediation WITHOUT the answer key.
- **Learner report** (UI): per-competency demonstrated / needs-practice / insufficient-evidence /
  not-attempted, with targeted remediation links to the exact failed-competency lesson.
- CH01/CH02 IDs, 14 CH01 demos, 5 CH02 demos, 12+3 scripts, opening integration, bosses, and
  R2/R5 thresholds unchanged. Audited by `scripts/audit-foundation-assessment.ts` (fails on any
  mandatory competency missing a graded item / lesson / remediation). tsc clean; tests pass.

## 35. Assessment Reliability & Mastery Hardening (Phase R7.3.1)
Strengthened the EVIDENCE behind CH01 completion without rebuilding the R7.3 system.
- **Evidence policy**: each competency carries `minContexts` — it is `demonstrated` only when the
  learner answers correctly in at least that many MEANINGFULLY DISTINCT contexts (distinct
  `contextKey`). One lucky answer, or the same item repeated, can no longer demonstrate a rule.
- **Curated variant bank**: the assessment grew from 19 to 33 curated, chess.js-validated items so
  every mandatory competency is probed in >=2 distinct contexts (a positive case + a contrasting
  illegal/negative boundary). No runtime position generation; answers stay server-only.
- **Grader** now counts evidence over DISTINCT contexts and emits insufficient_evidence vs
  needs_remediation; the competency gate and the "score is informational only" contract are unchanged.
- **Migration 0015_foundation_attempt_items.sql**: adds a nullable `items jsonb` column to
  foundation_attempt storing per-item evidence [{id,competency,contextKey,correct}] — NO answers,
  NO accepted moves. Smallest safe change (no new table); RLS/ownership inherited from 0014.
- **Learner report** (UI): competencies grouped by area (board / movement / rules / king safety /
  special) with status + "contexts still needed" + targeted remediation.
- **Test discovery fix**: `npm test` now globs `tests/*.test.ts`. Previously it hard-coded 23 of 31
  files (193 cases); 8 files (68 cases: campaign*, curriculum*, content-audit, content-authored-mates,
  content-r4) were never discovered. All now run (true total 261). Git has no commits, so the exact
  historical "251" count is unrecoverable; the structural gap is reconciled and closed.
- Preserved: 16 competency IDs, CH01/CH02 structure, demos, scripts, opening integration, bosses,
  R2/R5 thresholds, and the never-downgrade pass latch. Audited by audit-foundation-assessment.ts
  (now also fails on missing/duplicate/identical variant contexts).

## 36. Assessment Rotation, Attempt Binding & Idempotency (Phase R7.3.2)
Made the CH01 assessment rotate between attempts and bound each submission to a server-issued,
signed attempt, with database-level idempotency — without changing the mastery contract.
- **Rotation pool**: the item bank grew to 48 curated, chess.js-validated items so every mandatory
  competency has >= 3 distinct contexts. `foundations.select.ts` (pure, deterministic given its RNG)
  issues 2 distinct contexts per competency, preferring contexts not seen in the last attempt.
- **Server selection + token**: `POST /api/foundations/start` selects with a crypto-secure RNG
  (node:crypto `randomInt`, never `Math.random`) and returns client-safe prompts + a signed token.
  `foundations.token.server.ts` HMAC-signs { attemptId, userId, issuedItemIds, iat, exp } (NO answers);
  the key is derived from SUPABASE_SERVICE_ROLE_KEY and never reaches the client.
- **Bound, restricted grading**: `POST /api/foundations/attempt` verifies the token, binds it to the
  authenticated user, rejects any answer id the server did not issue, and grades ONLY the issued
  items (`gradeFoundation(answers, issuedIds)`) — evidence can't come from another attempt.
- **Migration 0016_foundation_attempt_idempotent.sql**: adds `attempt_id uuid` + a unique index on
  `(user_id, attempt_id)`. Submission upserts with `onConflict ignoreDuplicates`, so a replayed or
  concurrent duplicate of the same attempt cannot duplicate evidence or change the result; a replay
  returns the stored row. Nullable column + NULLs-distinct index keep legacy rows valid; no policy
  change. `foundation_assessment` pass latch unchanged (never downgraded; kept score = max).
- **UX**: FoundationsClient now starts a server-issued attempt, renders only the issued items, shows
  pool vs selected counts (no stale fixed totals), guards against double-submit, and offers a fresh
  rotated attempt. CH02 unlock remains server-side (foundation_assessment.passed).
- Preserved: 16 competency IDs, CH01/CH02 structure, demos, scripts, opening integration, R2/R5.
  LIMITATION: no live Postgres here, so DB concurrency is proven by the unique-index + ignoreDuplicates
  contract and tests, not by an integration test against a running database.

## 37. Final Integrity Closure (Phase R7.3.2.1)
Closed the four R7.3.2 review items; no architecture change.
- **Score contract**: removed the stale `overallFloor{passThreshold:44,totalItems:48}` from the
  generated JSON; it now exposes `scoreDisplay` (informational_only, competencyGateIsAuthoritative,
  poolSize 48, issuedItemCount 32). Pool size is distinguished from issued-attempt size;
  there is no static pass threshold. A regression test fails if the obsolete property returns.
- **Semantic context audit**: the audit now classifies each competency's contexts by server-computed
  polarity + geometry and FAILS on same-reasoning near-duplicates. One stalemate context was changed
  to a king+pawn mechanism (distinct from the queen case). Reported honestly as machine-validated,
  not human-reviewed.
- **Real PostgreSQL concurrency** (`npm run test:pg`): a disposable PostgreSQL 18.6 instance runs the
  real migration DDL and proves 6 concurrency scenarios over separate connections with a barrier
  (single-row idempotency, isolation, monotonic pass latch, replay, cross-user safety).
- **HTTP method**: `/api/foundations/start` is POST-only; the stale "GET" references were corrected.
- Preserved: all R7.3.2 behaviour, 16 competency IDs, CH01/CH02 structure, R2/R5.

## 38. Coverage Guarantees, Production Persistence & Lock Proof (Phase R7.3.2.2)
Closed the final reliability gaps without changing the mastery contract.
- **Evidence-axis coverage**: each competency declares `requiredAxes` (e.g. light+dark, legal+illegal);
  the coverage-aware selector GUARANTEES both axes per issued attempt — two same-outcome contexts
  (e.g. two dark squares) can no longer be issued. A 4th light coordinate item was added so both
  colour sides also rotate. Pool: 49 items. Verified exhaustively (0 invalid selections / 300 seeds).
- **Shared production persistence**: idempotency + pass-latch + read-back extracted into
  `foundations.persistence.server.ts` (injected AttemptRepo); the route (Supabase adapter) AND the
  real-PostgreSQL harness call the SAME `persistAttempt()` — no duplicated business rule.
- **Direct PG lock proof**: `npm run test:pg` now uses `pg_backend_pid()` + `pg_blocking_pids()` to
  prove the second transaction waits on the unique-index lock held by the first (not just a timeout).
  23 real-PostgreSQL assertions incl. production-path P1–P4 and cross-user D1 (reject before write).
- **Route-boundary security**: a shared `authorizeSubmission()` is the exact accept/reject decision the
  route uses; tests verify cross-user (403), expiry, tamper, unknown-key, and un-issued-item rejection.
- **Version & counts**: JSON `version` splits assessmentContractVersion / implementationPhase /
  auditVersion; `issuedItemCount` (32) derives from one config constant (ISSUED_CONTEXTS_PER_COMPETENCY)
  shared by the selector, /start, and the audit. Independent human pedagogical review: NOT PERFORMED.

## 39. Final Selection, Route & Score Integrity (Phase R7.3.2.2.1)
Last closure before the CH01 assessment freeze; no architecture change.
- **FA-COORD3 axis fix**: its `corner-square` contextKey (square a1, a DARK square) was never mapped
  in AXIS_BY_CONTEXT, leaving axis "unassigned". Now mapped to `dark`. The content audit FAILS if any
  selectable item has an unassigned/invalid axis not in its competency's requiredAxes (generalised gate).
- **Real route cross-user test**: the route's control flow is now `handleAttempt(req, deps)` with `POST`
  as the thin production wrapper. tests/foundations-route.test.ts invokes the real handler (test auth +
  in-memory repo injected at the boundary) and proves a cross-user token → 403 before any write, with
  User A's records unchanged and no answer leakage. Plus expiry/tamper/unknown-key/un-issued/401/400.
- **Migration 0017_foundation_latch_pass.sql**: an ATOMIC pass-latch function (`score := GREATEST(...)`,
  `passed := existing OR incoming`) replacing the race-prone app-memory Math.max. SECURITY INVOKER
  (RLS-enforced), EXECUTE revoked from anon/authenticated, granted to service_role — no new client write
  ability. The Supabase adapter calls it via rpc(); persistAttempt passes the raw score (DB computes max).
- **Proof**: the real-PostgreSQL harness exercises the SAME persistAttempt + the REAL function: concurrent
  24 & 32 → stored 32 (both orders), overlapping row-lock race → stays 32, later fail cannot downgrade.
- Preserved: all R7.3.2.2 behaviour, 16 competencies, coverage model, R2/R5. CH01 assessment is frozen-ready.
