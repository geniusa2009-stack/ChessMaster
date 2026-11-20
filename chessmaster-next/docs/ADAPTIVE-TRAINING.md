# ChessMaster — Adaptive Training Engine (Phase R2)

Deterministic, server-authoritative "what should I train next, and why?". All logic lives in pure,
unit-tested libs under `src/features/training/lib/` and is driven only by REAL events — no
fabricated history. Given the same player + content state, it returns the same recommendation.

## Architecture
Client plays puzzles (existing flow) → `/api/puzzles/attempt` records ONE authoritative
`training_event` (success/fail) + updates `review_state` (spaced repetition) server-side →
`/api/training/{profile,next}` aggregate those events (bounded reads) and the pure libs derive
skills, weaknesses, DNA and the next recommendation. The browser never computes authoritative
state and never receives puzzle solutions.

## Skill domains (`domains.ts`, `skill.ts`)
Domains: tactical_vision, calculation, checkmate_patterns, defensive_play, endgame,
opening_knowledge. A theme maps to one+ domains (mateIn2 → checkmate_patterns + 0.5 calculation;
mateIn3 → both at full weight). Honest note: the current validated content is mate puzzles, so
only checkmate_patterns / calculation can accrue evidence; the rest stay "insufficient evidence".

Scoring (deterministic): cold start score 50 / confidence 0. Per attempt, result∈{1,0} is
difficulty-weighted (easy .55 → expert 1.0) into a signal in [0,1]; score = 100·EWMA(α=0.3).
confidence = min(1, attempts/5); below 5 attempts a domain is "insufficient" (no strength/weakness
claimed). trend = compare EWMA(last 3) vs prev 3 once ≥6 attempts. This is a training-skill score,
NOT an Elo and NOT XP.

## Mistake memory (`mistakes.ts`)
Aggregates events per theme → {attempts, fails, failRate}. A weakness requires ≥4 attempts AND
failRate ≥ 0.4 (a single failure is never a weakness). Deterministic ordering.

## Spaced repetition (`review.ts`)
SM-2-INSPIRED (documented adaptation, not the original SM-2). Per (user, puzzle): interval, reps,
ease(×100), due_at. fail → reps 0, interval 1 day, ease −20 (min 130). success → interval 1,3,
then round(prev·ease/100); ease +15; capped at 180 days (never infinite). `isDue` = now ≥ due_at.

## Adaptive selection (`select.ts`)
Deterministic priority with an explainable reason: (1) due_review → (2) weakness (unsolved puzzle
whose theme is a demonstrated weakness) → (3) progression (unsolved nearest the target difficulty)
→ (4) cold_start (easiest unsolved, little/no history). Tie-break by puzzle id. target difficulty
from the checkmate domain score (easy when insufficient). Returns a puzzle id + reason + difficulty,
NEVER a solution. Content scarcity reported as `contentStatus`: sufficient (≥5) / limited (<5) /
unavailable (0) — with the current 11 puzzles it honestly reports "limited" and never clones content.

## Chess DNA (`dna.ts`)
Descriptive, evidence-based, NOT psychological. Each sufficiently-measured domain is banded
relative to the player's OWN measured domains (strong / steady / developing); unmeasured domains
return "insufficient_evidence". No personality labels.

## API
- `GET /api/training/profile` — own skills, DNA, weaknesses, due count, recommended focus (auth, private).
- `GET /api/training/next` — next recommended puzzle id + reason (auth, private, no solution).
Both re-check auth and scope to the caller; service-role writes only; RLS restricts reads to own rows.

## Database (`0011_training.sql`)
- `training_events` (append-only; user_id, kind, ref_id, theme, difficulty, outcome, created_at) —
  indexes (user_id, created_at) and (user_id, theme). RLS read-own; server-only writes.
- `review_state` (PK user_id+item_kind+item_id; interval/reps/ease/due_at) — index (user_id, due_at).
  RLS read-own; server-only writes.

## Security
Puzzle solutions remain server-only (verified by test); training writes go through the server-only
`record.ts` helper; `/api/training/*` are auth-gated + caller-scoped; no client can mutate training
state. Recording is best-effort and never blocks gameplay.

## Limitations (explicit)
- Evidence is currently limited to mate themes (11 puzzles), so most domains will report
  "insufficient evidence" until more validated content exists — by design, not a bug.
- The skill score is a relative training estimate, not a calibrated rating.
- Not built this phase (reserved for later, not stubbed): campaign/100+ levels, boss challenges,
  daily adaptive session composition UI, post-game adaptive analysis.
