# ChessMaster CH01 Assessment (Competency-Based, Rotated) — Phase R7.3.2

Server-authoritative, **competency-based** rules assessment. The chapter passes **only when every mandatory competency is `demonstrated`** — a high aggregate score cannot compensate for a failed mandatory chess rule. The client submits answer indices / played moves only; the server recomputes the correct answer (or accepted move set) from each position and never ships it.

## Evidence policy (R7.3.1)
A competency is marked `demonstrated` **only when the learner answers correctly in at least `minContexts` meaningfully distinct contexts** (distinct `contextKey`) — e.g. a legal application AND a contrasting illegal boundary, or a positive classification AND a negative one. A single correct answer, or the same item answered repeatedly, is **not** sufficient evidence of understanding.

## Rotation & attempt binding (R7.3.2)
The assessment is a validated POOL (≥3 distinct contexts per competency). Each attempt is **server-issued**: `POST /api/foundations/start` selects 2 distinct contexts per mandatory competency (preferring contexts not seen in the learner's last attempt, via a crypto-secure RNG) and returns a signed attempt token binding those exact item ids. `POST /api/foundations/attempt` verifies the token, grades only the issued items, and records evidence idempotently (unique on `(user_id, attempt_id)`). The token carries no answers.

- Competencies: 16 (16 mandatory)
- Validated item POOL: 49 (incl. 3 objective-specific drills); ≥3 distinct contexts per mandatory competency
- Issued per attempt: 2 distinct contexts × 16 mandatory competencies = 32 items (rotated between attempts)
- Per-competency status: not_attempted · insufficient_evidence · demonstrated · needs_remediation
- Score role: INFORMATIONAL only (relative to the issued set); the competency gate decides pass/fail — there is no fixed "18/19" or "33" pass threshold
- Persistence: append-only `foundation_attempt` (per-competency + per-item evidence, migrations 0014+0015; server-issued `attempt_id` + unique index, migration 0016) + `foundation_assessment` pass latch (prior pass never downgraded); idempotent; no XP/certificate attached.

## Competency matrix
| Competency | Group | Mandatory | Min contexts | Lesson / Remediation | Contexts (items) |
|---|---|---|---|---|---|
| Board coordinates & orientation | board | yes | 2 | CH01-L001 | light-square (FA-COORD), dark-square (FA-COORD2), light-corner-square (FA-COORD4), corner-square (FA-COORD3) |
| King movement | movement | yes | 2 | CH01-L002 | one-square-legal (FA-KING), two-square-illegal (FA-KING2), diagonal-one-square-legal (FA-KING3) |
| Queen movement | movement | yes | 2 | CH01-L002 | line (FA-QUEEN), diagonal (FA-QUEEN2), knight-shape-illegal (FA-QUEEN3) |
| Rook movement | movement | yes | 2 | CH01-L003 | file (FA-ROOK), rank (FA-ROOK2), diagonal-illegal (FA-ROOK3) |
| Bishop movement | movement | yes | 2 | CH01-L003 | diagonal-legal (FA-BISHOP), straight-illegal (FA-BISHOP2), other-diagonal-legal (FA-BISHOP3) |
| Knight movement (jump) | movement | yes | 2 | CH01-L003 | L-jump-legal (FA-KNIGHT), non-L-illegal (FA-KNIGHT2), other-L-legal (FA-KNIGHT3) |
| Pawn forward movement | movement | yes | 2 | CH01-L004 | double-step (FA-PAWNFWD), blocked-forward (FA-PAWNNOCAP), single-step-legal (FA-PAWN3) |
| Pawn captures | movement | yes | 2 | CH01-L004 | diagonal-capture (DR-PAWNCAP), diagonal-empty-illegal (FA-PAWNCAP-NEG), capture-right (DR-PAWNCAP3) |
| Blocking & occupied squares | rules | yes | 2 | CH01-L005 | slide-blocked (FA-BLOCK), friendly-dest-illegal (FA-BLOCK2), capture-enemy-dest-legal (FA-BLOCK3) |
| Recognising check | king_safety | yes | 2 | CH01-L006 | is-check (FA-CHECK), not-check (FA-CHECK2), knight-check (FA-CHECK3) |
| Legal responses to check | king_safety | yes | 2 | CH01-L007 | capture-checker (DR-CHECKRESP), must-resolve-check (FA-CHECKRESP-MUST), king-sidestep-legal (FA-CHECKRESP3) |
| Recognising checkmate | king_safety | yes | 2 | CH01-L008 | is-mate (FA-MATE), check-not-mate (FA-MATE2), king-rook-box-mate (FA-MATE3) |
| Recognising stalemate | king_safety | yes | 2 | CH01-L008 | is-stalemate (FA-STALE), not-stalemate (FA-STALE2), king-pawn-stalemate (FA-STALE3) |
| Castling rules | special | yes | 2 | CH01-L009 | legal-castle (FA-CASTLE-OK), through-check-illegal (FA-CASTLE-NO), squares-blocked-illegal (FA-CASTLE-BLOCKED) |
| En passant | special | yes | 2 | CH01-L010 | ep-available (FA-EP-OK), ep-expired (FA-EP-NO), ep-available-other-file (FA-EP3) |
| Promotion | special | yes | 2 | CH01-L011 | promotion-choices (FA-PROMO), promotion-move-legal (FA-PROMO-MOVE), underpromotion-legal (FA-PROMO3) |

## Items (prompts only — no answers)
- **FA-COORD** → foundation.board_coordinates · context `light-square` (square_color) — light square by coordinate
- **FA-COORD2** → foundation.board_coordinates · context `dark-square` (square_color) — dark square by coordinate
- **FA-COORD4** → foundation.board_coordinates · context `light-corner-square` (square_color) — light corner square by coordinate
- **FA-KING** → foundation.king_movement · context `one-square-legal` (move_legal) — king moves one square — `4k3/8/8/8/8/8/8/4K3 w - - 0 1`
- **FA-KING2** → foundation.king_movement · context `two-square-illegal` (move_legal) — king cannot move two squares — `4k3/8/8/8/8/8/8/4K3 w - - 0 1`
- **FA-QUEEN** → foundation.queen_movement · context `line` (move_legal) — queen moves in a line — `3qk3/8/8/8/8/8/8/3QK3 w - - 0 1`
- **FA-QUEEN2** → foundation.queen_movement · context `diagonal` (move_legal) — queen moves on a diagonal — `3qk3/8/8/8/8/8/8/3QK3 w - - 0 1`
- **FA-ROOK** → foundation.rook_movement · context `file` (move_legal) — rook moves on a file — `4k3/8/8/8/8/8/8/R3K3 w - - 0 1`
- **FA-ROOK2** → foundation.rook_movement · context `rank` (move_legal) — rook moves on a rank — `4k3/8/8/8/8/8/8/R3K3 w - - 0 1`
- **FA-BISHOP** → foundation.bishop_movement · context `diagonal-legal` (move_legal) — bishop moves on a diagonal — `4k3/8/8/8/8/8/8/2B1K3 w - - 0 1`
- **FA-BISHOP2** → foundation.bishop_movement · context `straight-illegal` (move_legal) — bishop cannot move straight — `4k3/8/8/8/8/8/8/2B1K3 w - - 0 1`
- **FA-KNIGHT** → foundation.knight_movement · context `L-jump-legal` (move_legal) — legal knight move (jump) — `4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1`
- **FA-KNIGHT2** → foundation.knight_movement · context `non-L-illegal` (move_legal) — knight cannot move straight — `4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1`
- **FA-PAWNFWD** → foundation.pawn_movement · context `double-step` (move_legal) — pawn first-move double step — `4k3/8/8/8/8/8/4P3/4K3 w - - 0 1`
- **FA-PAWNNOCAP** → foundation.pawn_movement · context `blocked-forward` (move_legal) — pawn cannot capture forward — `4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1`
- **DR-PAWNCAP** → foundation.pawn_capture · context `diagonal-capture` (move_objective) — capture the pawn diagonally — `4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1` [objective: capture_on d5]
- **FA-PAWNCAP-NEG** → foundation.pawn_capture · context `diagonal-empty-illegal` (move_legal) — pawn cannot move diagonally to an empty square — `4k3/8/8/8/4P3/8/8/4K3 w - - 0 1`
- **FA-BLOCK** → foundation.blocking · context `slide-blocked` (move_legal) — cannot move through own piece — `4k3/8/8/8/8/8/8/R2BK3 w - - 0 1`
- **FA-BLOCK2** → foundation.blocking · context `friendly-dest-illegal` (move_legal) — cannot capture a friendly piece — `4k3/8/8/R7/8/8/8/R3K3 w - - 0 1`
- **FA-CHECK** → foundation.check · context `is-check` (is_check) — recognise check — `4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1`
- **FA-CHECK2** → foundation.check · context `not-check` (is_check) — recognise a non-check position — `4k3/8/8/8/8/8/8/4K2R b - - 0 1`
- **DR-CHECKRESP** → foundation.check_response · context `capture-checker` (move_objective) — capture the checking piece — `4k3/8/8/8/8/5n2/6P1/4K3 w - - 0 1` [objective: capture_on f3]
- **FA-CHECKRESP-MUST** → foundation.check_response · context `must-resolve-check` (move_legal) — a move that ignores the check is illegal — `k3r3/8/8/8/8/8/P7/4K3 w - - 0 1`
- **FA-MATE** → foundation.checkmate · context `is-mate` (is_checkmate) — recognise checkmate — `R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1`
- **FA-MATE2** → foundation.checkmate · context `check-not-mate` (is_checkmate) — a check with an escape is not mate — `R3k3/8/8/8/8/8/8/4K3 b - - 0 1`
- **FA-STALE** → foundation.stalemate · context `is-stalemate` (is_stalemate) — recognise stalemate — `7k/5Q2/7K/8/8/8/8/8 b - - 0 1`
- **FA-STALE2** → foundation.stalemate · context `not-stalemate` (is_stalemate) — a position with a legal move is not stalemate — `4k3/8/8/8/8/8/4P3/4K3 w - - 0 1`
- **FA-CASTLE-OK** → foundation.castling · context `legal-castle` (castling_allowed) — castling legal case — `r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1`
- **FA-CASTLE-NO** → foundation.castling · context `through-check-illegal` (castling_allowed) — castling through check is illegal — `r3k2r/8/8/8/8/5q2/8/R3K2R w KQkq - 0 1`
- **FA-CASTLE-BLOCKED** → foundation.castling · context `squares-blocked-illegal` (castling_allowed) — castling blocked by pieces is illegal — `r3k2r/8/8/8/8/8/8/RB2KB1R w KQkq - 0 1`
- **FA-EP-OK** → foundation.en_passant · context `ep-available` (en_passant_legal) — en passant available — `4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1`
- **FA-EP-NO** → foundation.en_passant · context `ep-expired` (en_passant_legal) — en passant expired — `4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1`
- **FA-PROMO** → foundation.promotion · context `promotion-choices` (promotion_choices) — promotion choices
- **FA-PROMO-MOVE** → foundation.promotion · context `promotion-move-legal` (move_legal) — promotion move is legal — `4k3/P7/8/8/8/8/8/4K3 w - - 0 1`
- **FA-COORD3** → foundation.board_coordinates · context `corner-square` (square_color) — corner square colour
- **FA-KING3** → foundation.king_movement · context `diagonal-one-square-legal` (move_legal) — king moves one square diagonally — `4k3/8/8/8/8/8/8/4K3 w - - 0 1`
- **FA-QUEEN3** → foundation.queen_movement · context `knight-shape-illegal` (move_legal) — queen cannot move like a knight — `3qk3/8/8/8/8/8/8/3QK3 w - - 0 1`
- **FA-ROOK3** → foundation.rook_movement · context `diagonal-illegal` (move_legal) — rook cannot move diagonally — `4k3/8/8/8/8/8/8/R3K3 w - - 0 1`
- **FA-BISHOP3** → foundation.bishop_movement · context `other-diagonal-legal` (move_legal) — bishop on the other diagonal — `4k3/8/8/8/8/8/8/2B1K3 w - - 0 1`
- **FA-KNIGHT3** → foundation.knight_movement · context `other-L-legal` (move_legal) — another legal knight L-move — `4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1`
- **FA-PAWN3** → foundation.pawn_movement · context `single-step-legal` (move_legal) — pawn single forward step — `4k3/8/8/8/8/8/4P3/4K3 w - - 0 1`
- **DR-PAWNCAP3** → foundation.pawn_capture · context `capture-right` (move_objective) — capture to the other side diagonally — `4k3/8/8/5p2/4P3/8/8/4K3 w - - 0 1` [objective: capture_on f5]
- **FA-BLOCK3** → foundation.blocking · context `capture-enemy-dest-legal` (move_legal) — a slider CAN capture an enemy at the end of its path — `4k3/8/8/r7/8/8/8/R3K3 w - - 0 1`
- **FA-CHECK3** → foundation.check · context `knight-check` (is_check) — recognise a knight check — `4k3/8/8/8/8/5n2/8/4K3 w - - 0 1`
- **FA-CHECKRESP3** → foundation.check_response · context `king-sidestep-legal` (move_legal) — move the king to a safe square — `k3r3/8/8/8/8/8/8/4K3 w - - 0 1`
- **FA-MATE3** → foundation.checkmate · context `king-rook-box-mate` (is_checkmate) — recognise a king+rook box mate — `k6R/8/K7/8/8/8/8/8 b - - 0 1`
- **FA-STALE3** → foundation.stalemate · context `king-pawn-stalemate` (is_stalemate) — recognise a king+pawn stalemate (different mechanism from the queen case) — `8/8/8/8/8/k7/p7/K7 w - - 0 1`
- **FA-EP3** → foundation.en_passant · context `ep-available-other-file` (en_passant_legal) — en passant available on another file — `4k3/8/8/4pP2/8/8/8/4K3 w - e6 0 1`
- **FA-PROMO3** → foundation.promotion · context `underpromotion-legal` (move_legal) — underpromotion move is legal — `4k3/P7/8/8/8/8/8/4K3 w - - 0 1`

## Objective-specific drills
A drill accepts **only** moves that satisfy its objective (e.g. capturing the checking piece); a legal-but-irrelevant move does **not** pass. The accepted move set is computed server-side and never shipped.
