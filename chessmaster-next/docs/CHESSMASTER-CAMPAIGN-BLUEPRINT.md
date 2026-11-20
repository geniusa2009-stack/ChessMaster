# ChessMaster Campaign Blueprint

Generated from the authoritative catalog (src/features/campaign/lib/catalog.ts). Do not edit by hand.

## Overview
- Worlds: 10
- Chapters: 14
- Levels: 114
- Playable (content-backed) levels: 69
- Status breakdown: {"ready":69,"limited":23,"future_content_required":22}
- Video lessons (all PLANNED, no assets): 48
- Boss challenges: 10

## Educational Philosophy
A connected path: concept → guided practice → independent practice → review → assessment/boss, with prerequisites and spaced review. Only content the verified corpus supports is marked playable; unsupported concepts (piece-movement tutorials, endgame opposition/key-squares, strategic middlegame) are explicitly planned/future_content_required, never faked.

## Worlds & Chapters

### W01 — Chess Foundations
_board, pieces, check & checkmate_
- **CH01 Board & Piece Movement** — 12 levels (12 playable). Objective: Understand the board, coordinates and how each piece moves and captures.  
  _Planned: No verified movement-tutorial content exists in the corpus; awaiting authored lessons._
- **CH02 Check & Checkmate Recognition** — 7 levels (4 playable). Objective: Recognise check and deliver immediate checkmate in one move.

### W02 — Tactical Vision
_recognising winning tactics_
- **CH03 Tactical Vision** — 11 levels (5 playable). Objective: Recognise and play the move that wins material.

### W03 — Checkmate Patterns
_delivering forced mate_
- **CH04 Mate in One** — 9 levels (2 playable). Objective: Deliver forced checkmate in a single move across patterns.
- **CH05 Forced Mating Sequences** — 9 levels (5 playable). Objective: Calculate a forced mate two to three moves deep.

### W04 — Calculation
_calculating forcing sequences_
- **CH06 Calculating Combinations** — 9 levels (4 playable). Objective: Calculate a multi-move forcing sequence to a winning material result.

### W05 — Defensive Thinking
_finding the only defence_
- **CH07 Defensive Resources** — 11 levels (6 playable). Objective: Find the only move that avoids losing material or being mated.

### W06 — Endgame Technique
_converting reduced-material positions_
- **CH08 Endgame Conversion** — 11 levels (7 playable). Objective: Convert a reduced-material position by winning material or promoting.
- **CH09 Endgame Theory (Opposition & Key Squares)** — 1 levels (0 playable). Objective: Master opposition, key squares and theoretical draws in king-and-pawn endings.  
  _Planned: These concepts require a tablebase / exact positional solver not available in this environment; no verified content yet._

### W07 — Opening Knowledge
_principles and verified lines_
- **CH10 Opening Principles & Lines** — 9 levels (7 playable). Objective: Follow a verified opening line and understand its plan: development, centre, king safety.
- **CH11 Opening-Stage Tactics (provisional)** — 9 levels (6 playable). Objective: Apply tactical vision to positions arising in the opening stage.

### W08 — Combined Skills
_multi-concept application_
- **CH12 Combined Skills** — 7 levels (5 playable). Objective: Apply tactical, calculation and defensive skills in mixed positions.

### W09 — Advanced Mastery
_hard verified combinations_
- **CH13 Advanced Combinations** — 7 levels (5 playable). Objective: Solve the hardest verified combinations across domains.

### W10 — Final Challenges
_cumulative assessments_
- **CH14 Final Challenges & Strategic Application** — 2 levels (1 playable). Objective: Cumulative assessments across every taught skill; strategic application remains future content.  
  _Planned: Strategic/positional middlegame instruction has no verified content; only the cumulative boss is playable._

## Progression & Unlock Rules
A level unlocks when all prerequisite levels are passed (server-authoritative). A graded level is passed when the learner solves ≥ its required exercises (server-verified via puzzle_solves / R2). Concept & review levels are ungraded. Mastery reuses R2/R5 skill evidence; no XP-only unlocks.

## Boss Challenges
- **BOSS-CH02** (Check & Checkmate Recognition): assesses mate_in_one; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH03** (Tactical Vision): assesses tactical_recognition; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH05** (Forced Mating Sequences): assesses forced_mate; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH06** (Calculating Combinations): assesses calculation_combinations; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH07** (Defensive Resources): assesses defensive_resources; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH08** (Endgame Conversion): assesses endgame_conversion; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH10** (Opening Principles & Lines): assesses tactical_recognition, calculation_combinations, defensive_resources; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH12** (Combined Skills): assesses tactical_recognition, calculation_combinations, defensive_resources; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH13** (Advanced Combinations): assesses tactical_recognition, calculation_combinations, defensive_resources; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.
- **BOSS-CH14** (Final Challenges & Strategic Application): assesses tactical_recognition, calculation_combinations, defensive_resources; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.

## Final Assessment
World 10 / CH14 provides a cumulative boss across all verified skills. Strategic/positional middlegame instruction is future content.

## Known Educational Limitations
- CH01 Board & Piece Movement: No verified movement-tutorial content exists in the corpus; awaiting authored lessons.
- CH09 Endgame Theory (Opposition & Key Squares): These concepts require a tablebase / exact positional solver not available in this environment; no verified content yet.
- CH14 Final Challenges & Strategic Application: Strategic/positional middlegame instruction has no verified content; only the cumulative boss is playable.
