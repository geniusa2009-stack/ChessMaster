# ChessMaster Curriculum & Adaptive Learning Path (Phase R5)

An evidence-based learning path layered over the audited 202-puzzle corpus and the existing R2
adaptive engine. It adds structure (skills, prerequisites, objectives), an explainable selector, and
honest coverage reporting — **without generating new content, changing the 202 count, or weakening
any R2 evidence threshold.**

Reproduce the audit:

```
npx tsc --noEmit
node --experimental-strip-types --import ./tests/register-alias.mjs scripts/audit-curriculum.ts   # writes docs/curriculum-audit.json
node --test --experimental-strip-types --import ./tests/register-alias.mjs tests/curriculum.test.ts tests/curriculum-security.test.ts
```

## Semantic audit (puzzle → skill)
Every puzzle is mapped to exactly one skill by a pure, deterministic rule over its **audited**
domain + theme (`skillForPuzzle`), never over the solution. Result: 202 mapped, 0 unmapped,
0 excluded. Confidence: **162 verified**, **40 provisional**.

| Skill | Domain | Items | Difficulties | Coverage | Confidence |
|---|---|---:|---|---|---|
| mate_in_one | checkmate_patterns | 20 | easy→hard | available | verified |
| forced_mate | checkmate_patterns | 39 | easy→expert | available | verified |
| tactical_recognition | tactical_vision | 57 | easy→expert | available | verified |
| calculation_combinations | calculation | 20 | easy→expert | available | verified |
| defensive_resources | defensive_play | 10 | easy→expert | **limited** | verified |
| endgame_conversion | endgame | 16 | easy→expert | available | verified |
| opening_stage_tactics | opening_knowledge | 40 | easy→expert | **limited** | **provisional** |

### Key semantic corrections / honesty calls
- **Opening is provisional, not an opening-theory course.** The opening-domain puzzles are tactical
  positions arising in the opening stage; we do NOT have verified opening-line identity (a FEN does
  not establish move history), so the curriculum never claims to teach opening theory. Provisional
  mappings are capped at "limited" coverage regardless of count. Canonical opening lines live in the
  separate openings trainer, not here.
- **Endgame = conversion only.** `endgame_conversion` is backed by solver-verified forced
  material/promotion endings. Positional concepts (opposition, key squares) are **not** derivable
  from this corpus and are declared `future_content_required`, not filled with unrelated puzzles.
- **Motif skills without evidence are declared unavailable:** pins/skewers, deflection/overload,
  opposition/key-squares, opening principles. They appear in the taxonomy as
  `future_content_required` and carry zero content (enforced by the validator).
- The R4.1 defensive reclassification (id 165) flows through: it maps to `defensive_resources`.

## Skill graph & prerequisites
Acyclic. Prerequisites are instructional, not arbitrary:
`mate_in_one → forced_mate`, `tactical_recognition → calculation_combinations`. All other skills are
entry points. Topological order:
`mate_in_one, tactical_recognition, defensive_resources, endgame_conversion, opening_stage_tactics, forced_mate, calculation_combinations`.
The validator rejects unknown/duplicate ids, missing prereq refs, cycles, orphans, objective-less
skills, and any skill presented as teachable with zero content.

## Progression model (derived — no new tables)
Per-skill state is computed from evidence the system already records (training_events, puzzle_solves,
review_state) via `computeSkillProgress`. States: `locked` (prereq not proficient) · `available` ·
`needs_more_evidence` (1–4 attempts) · `practicing` (≥5 attempts, not yet proficient) · `proficient`
(≥min(5,eligible) distinct solves AND ≥5 attempts AND ≥70% success), with a `review_due` overlay.
These curriculum-layer thresholds are **additional and documented**; R2's own thresholds
(MIN_EVIDENCE=5, EWMA alpha) are untouched. One correct answer never grants proficiency; a skip
never advances state.

## Adaptive selection (deterministic, explainable, reuses R2)
`selectCurriculumNext` chooses a skill from the graph + progression, then delegates to R2's existing
`selectNext` for the puzzle within that skill. Priority: **due review → weakness → progression /
cold-start → reinforcement → none**. Cold-start enters at an unlocked entry skill (mate_in_one).
Locked skills are never selected. `buildCurriculumSession` yields a bounded session of DISTINCT
puzzles. Everything is pure and deterministic; the selector never returns a solution or an id outside
the corpus. Complexity is linear in the candidate set; no per-request engine search.

## Content scarcity (honest states)
Coverage states use documented thresholds: `available` ≥15 verified items; `limited` 5–14 (or any
provisional skill); `insufficient` 1–4; `unavailable` 0. defensive_resources (10) and
opening_stage_tactics (provisional) are reported as **limited**; the four concept skills are
**unavailable**. No label or threshold was changed to inflate coverage.

## What is NOT established
- No human pedagogical review has been performed; all mappings are automated / metadata-supported.
- The curriculum validator checks **structural** correctness only, not pedagogical quality.
- calculation / defensive / endgame remain thin (carried from R4.1); reported, not hidden.

---
## R6 update — coverage after content expansion
Puzzle corpus 202 → 271; opening-learning units 6 → 28. Per-skill eligible items now:
mate_in_one 20, forced_mate 39, tactical_recognition 57, **calculation_combinations 35**,
**defensive_resources 34**, **endgame_conversion 46**, opening_stage_tactics 40 (provisional).
The previously-limited calculation, defensive, and endgame skills are now "available". Mapping,
graph, prerequisites, and the selector are unchanged; new puzzles flow in through the existing
`skillForPuzzle` rule. endgame_conversion remains conversion-only (opposition/key-squares still
future_content_required); opening_stage_tactics remains provisional (no opening-theory claim — the
28 opening-line units are the verified opening content).
