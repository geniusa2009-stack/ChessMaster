# ChessMaster R7.1 Audit

Generated from the authoritative catalog. Do not edit by hand.

## Campaign level audit (all 103)
- Readiness: {"future_content_required":23,"limited":23,"ready":57}
- Playable (content-backed): 57
- Dangling prerequisite refs: 0 (enforced by the campaign validator)
- Levels missing an objective: 0

## Level distinctness
- Compared 30 same-skill/band/type pairs.
- merge_candidate (identical practice items): 0
- distinct (progressive, different items): 30

No two PRACTICE levels in the same chapter share identical practice items — each practice set is a distinct progressive subset.

### Intentional cumulative reuse (disposition: retained — justified teaching progression)
Composite chapters (CH12 Combined, CH13 Advanced, CH14 Final) and chapter bosses intentionally RE-USE puzzles from earlier skill chapters as cumulative review/assessment under a new application context. This is a documented pedagogical reuse, not disguised new content: no puzzle is counted toward a domain quota more than once (domain counts come from the corpus, not the campaign), and no two primary-practice levels in one chapter repeat a set.

## Campaign entrance
CH01 (Board & Piece Movement) is future_content_required — the campaign has no verified beginner movement tutorial yet. This gap is reported at the entrance; the pilot (CH02) states the assumed prerequisite rather than hiding it.

## Boss execution (honest)
Bosses are playable as CUMULATIVE multi-exercise assessments: each resolves (server-side) to a distinct pool of verified puzzles drawn across difficulties, and passing requires solving the required number with server-verified correctness (reusing the puzzle attempt API). The five-stage description is the conceptual solving method, not five separate gated mini-apps. The pilot boss (CH02-L007) is verified end-to-end playable; all 10 bosses resolve to real content (none is a bare metadata record).
