# ChessMaster Pilot Chapter — CH02

## Selection
Earliest campaign-order chapter that is content-backed (mate_in_one) and coherent. CH01 (piece movement) has no verified content and remains a documented entrance gap; the pilot assumes basic piece movement and states this.

**Entrance gap:** CH01 Board & Piece Movement is future_content_required — a true beginner needs a movement tutorial before CH02. Documented, not hidden.

## Levels (7)
- **CH02-L001** (concept) — limited — Recognise check and deliver immediate checkmate in one move.
- **CH02-L002** (guided_practice, easy) — ready, playable — Recognise check and deliver immediate checkmate in one move. (easy difficulty, set A)
- **CH02-L003** (independent_practice, easy) — future_content_required — Recognise check and deliver immediate checkmate in one move. (easy difficulty, set B)
- **CH02-L004** (independent_practice, medium) — ready, playable — Recognise check and deliver immediate checkmate in one move. (medium difficulty, set A)
- **CH02-L005** (independent_practice, medium) — ready, playable — Recognise check and deliver immediate checkmate in one move. (medium difficulty, set B)
- **CH02-L006** (review) — limited — Retain check & checkmate recognition via spaced review.
- **CH02-L007** (boss_challenge, hard) — ready, playable — Apply check & checkmate recognition under assessment across multiple exercises.

## Videos (3) — scripts ready, NOT recorded
- **V-CH02-CONCEPT** — الكش والكش مات: المفهوم / Check & Checkmate Recognition: Concept — state script_ready, script script_ready, AR supplied, asset none — script: docs/video-scripts/V-CH02-CONCEPT.md
- **V-CH02-DEMO** — أمثلة محلولة على الكش مات / Check & Checkmate Recognition: Worked Examples — state script_ready, script script_ready, AR supplied, asset none — script: docs/video-scripts/V-CH02-DEMO.md
- **V-CH02-REVIEW** — مراجعة تحدي زعيم الفصل / Check & Checkmate Recognition: Boss Review — state script_ready, script script_ready, AR supplied, asset none — script: docs/video-scripts/V-CH02-REVIEW.md

## Board demonstrations (5) — all validated by chess.js
- **DEMO-CH02-01** (V-CH02-CONCEPT, CH02-L001): Ra8+ on `4k3/8/8/8/8/8/8/R3K3 w - - 0 1` → check_escapable. First question for any check: can the king escape? If yes, it is only a check.
- **DEMO-CH02-02** (V-CH02-CONCEPT, CH02-L001): Qe7+ on `4k3/8/8/8/8/8/8/4Q1K1 w - - 0 1` → check_not_mate. Before calling a check 'mate', check whether the checking piece can be captured.
- **DEMO-CH02-03** (V-CH02-DEMO, CH02-L002): Re8# on `6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1` → checkmate. Back-rank mate: a heavy piece checks on the last rank and the king's pawns trap it.
- **DEMO-CH02-04** (V-CH02-DEMO, CH02-L002): Ra8# on `6k1/8/6K1/8/8/8/8/R7 w - - 0 1` → checkmate. A rook mates only when the enemy king's flight squares are also covered — here by the king.
- **DEMO-CH02-05** (V-CH02-REVIEW, CH02-L007): Qd8# on `6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1` → checkmate. Same back-rank idea with the queen — always verify no escape, block or capture before calling mate.

## Boss
- BOSS-CH02: assesses mate_in_one; pass: Solve 5 boss exercises at hard difficulty (server-authoritative), each verified correct.

## Completion & next
Chapter completes when its playable levels + boss are passed (server-authoritative). Completing CH02 unlocks the next chapter in order. Review status: automated_integrity_pass + chess_content_verified (demos validated by chess.js). editorial_review_pending. human_educational_reviewed: NO.
