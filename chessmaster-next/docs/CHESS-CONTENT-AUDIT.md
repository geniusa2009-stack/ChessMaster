# ChessMaster Content Audit (Phase R4.1)

Independent audit of the R4 production corpus. Method: a separate audit module
(`scripts/audit-content.ts`) with its own logic — deliberately NOT the production gate — so it can
catch defects in the gate itself. It parses the shipped `data.server.ts`, re-derives every count,
re-checks legality/duplication/metadata, and (when run as a script) re-verifies objectives with the
deterministic solver, writing a machine-readable report to `docs/content-audit.json` (no solutions).

Reproduce:

```
npx tsc --noEmit
node --experimental-strip-types scripts/audit-content.ts        # writes docs/content-audit.json
node --test --experimental-strip-types --import ./tests/register-alias.mjs tests/content-audit.test.ts tests/content.test.ts tests/content-r3.test.ts tests/content-r4.test.ts
```

## Corpus (verified from the repository)
- Production puzzles: **202** (unique IDs, 0 duplicate IDs, 0 invalid records, 0 missing fields).
- Domains: checkmate_patterns 59, tactical_vision 57, opening_knowledge 40, calculation 20,
  endgame 16, defensive_play 10.
- Difficulty: easy 62, medium 66, hard 58, expert 16.
- Themes: win_material 102, mateIn2 32, mateIn1 20, fork 16, promotion 13, defensive 10, mateIn3 7,
  discovered_attack 2.

## Origin vs Verification (defect found & fixed)
R4 shipped a single `provenance` field with values `project-authored` and `engine-verified` — which
**conflated origin (how the position came to exist) with verification (how it was checked)**. Fixed
by splitting into two fields:
- `origin`: `project_authored` (16) | `programmatically_generated` (186). No `imported_licensed`,
  `public_domain`, or `user_provided` is claimed (none shipped → no source to fabricate), and nothing
  is `unknown` (every origin is actually known).
- `verification`: `engine_verified` (202) — the deterministic solver proved the stated objective;
  all also pass legal-move validation. **No human pedagogical review is claimed.**

Audit checks now enforce the separation: 0 origin/verification conflations, 0 fabricated external
origins. An engine verification result is recorded alongside origin, never as a substitute for it.

## Correctness re-verification (independent solver pass)
- Legality: 202/202 solutions replay legally; every mate theme ends in terminal checkmate.
- Mates (59): 57 proven by the forcing quiescence solver; **2 authored rook-ladder mates (ids 16, 17)**
  require quiet attacker moves the forcing solver cannot certify — both proven forced by the
  full-width `isForcedMateInPlies` (asserted in `content.test.ts`).
- Material wins (133): all prove a forced ≥200cp gain. **131 resolve at maxPly 6; ids 279 and 281 are
  deep combinations that fully resolve at maxPly 7** (gain 400 and 220 respectively). This is a
  search-depth property, not a content defect — documented, not quarantined.
- Defensive (10): all are genuine unique-save resources (only move holds; alternatives lose ≥250cp).

Solver guarantee (scope): the solver is **sound** (forced results hold against all defences) but
intentionally **incomplete** on quiet-move mates. Reported results are proven within that scope; the
two quiet-move mates are covered by the complementary full-width mate solver.

## Metadata consistency (defect found & fixed)
- **id 165** shipped with `theme: fork` / `domain: calculation` but objective "Find the only move
  that avoids losing". Solver evidence: stand 0, best +70 (only move), second −320, save-margin 390
  — a genuine unique-save **defensive** position, not a fork (a classifier ordering artifact). Fixed
  to `theme: defensive` / `domain: defensive_play`. Defensive theme count now matches the defensive
  objective count (10 = 10). Impact: calculation 21→20, fork 17→16, defensive_play 9→10.
- Objective/theme mismatches now: **0**.

## Duplicate audit (all-pairs, 20,301 pairs)
Methods: exact normalized position; mirror-equivalent board; and an all-pairs structural check
(same material signature + same side to move + ≥60/64 identical squares + same theme).
- Exact duplicates: **0**. Mirror-equivalent positions: **0**.
- High-similarity candidates: **1** — pair (16, 17), the two hand-authored rook-ladder mates.
  Disposition: **retained** — intentional authored teaching variants of the same technique from
  different rook placements; both are distinct, legal, verified forced mates.
- Limitation (stated honestly): the near-duplicate check is structural/material only; it does not
  prove motif-level tactical equivalence. No motif-equivalence guarantee is claimed.

## Candidate accounting (R4 history)
R4 generation artifacts exist in the session workspace (`stats.json`, `corpus.json`, `clean.json`,
`final_puzzles.json`, `audit.json`) and substantiate the reported figures: 2429 processed, 238
validator-accepted + 16 pre-existing = 254 pool, 52 curated-out for balance, 202 production. These
artifacts are **not committed to the repository**, so the generation history is reported as
previously recorded but **not independently reproducible from the repo alone**. The final production
dataset, however, is audited directly here and is fully reproducible.

## Security / secrecy
- Solutions live only in the `server-only` `data.server.ts`; `/api/puzzles` returns positions +
  player-facing metadata (no solution); `.solution` is referenced only in server routes
  (`attempt`, `hint`). The audit report contains no solutions.
- Difficulty, domain, origin, verification are server-controlled; answer validation is server-side.

## Confirmed limitations (not defects)
- Deep material combinations (ids 279, 281) need maxPly 7 to re-verify.
- Two authored mates (16, 17) need the full-width mate solver, not the forcing solver.
- calculation (20), defensive_play (10), endgame (16) remain below R4 target ranges — a corpus
  composition limitation carried from R4, documented there; not re-opened in this audit phase.
