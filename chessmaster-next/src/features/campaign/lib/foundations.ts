// R7.2 CH01 "Board & Piece Movement" — the real beginner chapter. CLIENT-SAFE: lesson metadata,
// teaching board demonstrations (the demonstrated move IS the lesson — nothing secret), and
// assessment PROMPTS (positions + question, NO answers). The correct assessment answers live in the
// server-only module foundations.answers.server.ts and are evaluated server-side.
//
// Every demonstration is validated by chess.js in tests/foundations.test.ts: legal sequences replay
// and the claimed status (check/mate/stalemate/promotion/castling/en-passant) holds; "rejected"
// demos confirm the attempted move is actually ILLEGAL (chess.js returns null) and the board is
// unchanged. No FEN, SAN, or UCI is fabricated.

export type DemoShows = "movement" | "capture" | "blocking" | "check" | "checkmate" | "stalemate" | "castling" | "en_passant" | "promotion";

export interface FoundationDemo {
  id: string; lessonId: string; title: string;
  fen: string; sideToMove: "w" | "b";
  legal: boolean;                         // true = a legal teaching sequence; false = an illegal-move teaching case
  sequence: Array<{ uci: string; san: string; explain: string }>; // for legal demos
  rejectedUci?: string; rejectReason?: string; // for illegal demos
  shows: DemoShows; highlight: string[]; arrows: Array<[string, string]>;
  observe: string; conclusion: string; provenance: "project_authored";
}
const pa = "project_authored" as const;
const D = (d: Omit<FoundationDemo, "provenance">): FoundationDemo => ({ ...d, provenance: pa });

export const FOUNDATION_DEMOS: FoundationDemo[] = [
  D({ id: "DEMO-CH01-KING", lessonId: "CH01-L002", title: "King moves one square", fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "e1e2", san: "Ke2", explain: "الملك يتحرك مربع واحد في أي اتجاه." }], shows: "movement", highlight: ["e1", "e2"], arrows: [["e1", "e2"]],
    observe: "الملك نقل من e1 إلى e2 — مربع واحد بس.", conclusion: "الملك (King) يتحرّك مربعاً واحداً في كل الاتجاهات." }),
  D({ id: "DEMO-CH01-QUEEN", lessonId: "CH01-L002", title: "Queen moves in straight lines", fen: "3qk3/8/8/8/8/8/8/3QK3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "d1d7", san: "Qd7+", explain: "الوزير يتحرّك أي عدد من المربعات في خط مستقيم أو قطري." }], shows: "movement", highlight: ["d1", "d7"], arrows: [["d1", "d7"]],
    observe: "الوزير قطع العمود كله من d1 لـ d7.", conclusion: "الوزير (Queen) أقوى قطعة: صفوف وأعمدة وأقطار." }),
  D({ id: "DEMO-CH01-KNIGHT", lessonId: "CH01-L003", title: "Knight jumps over pieces", fen: "4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "a1b3", san: "Nb3", explain: "الحصان يقفز على شكل حرف L ويتخطّى القطع." }], shows: "movement", highlight: ["a1", "b3", "b2"], arrows: [["a1", "b3"]],
    observe: "الحصان قفز من a1 إلى b3 رغم وجود البيدق على b2.", conclusion: "الحصان (Knight) القطعة الوحيدة اللي بتقفز فوق القطع." }),
  D({ id: "DEMO-CH01-PAWN-FWD", lessonId: "CH01-L004", title: "Pawn moves forward", fen: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "e4e5", san: "e5", explain: "البيدق يتقدّم للأمام مربعاً واحداً." }], shows: "movement", highlight: ["e4", "e5"], arrows: [["e4", "e5"]],
    observe: "البيدق اتقدّم من e4 لـ e5.", conclusion: "البيدق (Pawn) بيتقدّم للأمام، لكنه لا يأخذ للأمام." }),
  D({ id: "DEMO-CH01-PAWN-CAP", lessonId: "CH01-L004", title: "Pawn captures diagonally", fen: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "e4d5", san: "exd5", explain: "البيدق يأخذ قطريّاً فقط." }], shows: "capture", highlight: ["e4", "d5"], arrows: [["e4", "d5"]],
    observe: "البيدق أخذ البيدق الأسود قطريّاً على d5.", conclusion: "البيدق يأخذ قطريّاً — عكس حركته للأمام." }),
  D({ id: "DEMO-CH01-BLOCK", lessonId: "CH01-L005", title: "A piece cannot move through its own army", fen: "4k3/8/8/8/8/8/8/R2BK3 w - - 0 1", sideToMove: "w", legal: false,
    sequence: [], rejectedUci: "a1e1", rejectReason: "الطابية ماتقدرش تعدّي الفيل اللي على d1 — الطريق مسدود.", shows: "blocking", highlight: ["a1", "d1", "e1"], arrows: [["a1", "e1"]],
    observe: "محاولة Ra1–e1 مرفوضة لأن الفيل على d1 بيسدّ الطريق.", conclusion: "معظم القطع لا تقفز فوق غيرها؛ الطريق لازم يكون فاضي." }),
  D({ id: "DEMO-CH01-CHECK", lessonId: "CH01-L006", title: "This is a check (king can run)", fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "a1a8", san: "Ra8+", explain: "الطابية بتهدّد الملك — ده كش." }], shows: "check", highlight: ["a8", "d7", "e7", "f7"], arrows: [["a1", "a8"]],
    observe: "الملك في كش لكن عنده مربعات هروب d7/e7/f7.", conclusion: "الكش (Check) تهديد للملك — مش بالضرورة نهاية." }),
  D({ id: "DEMO-CH01-MATE", lessonId: "CH01-L008", title: "This is checkmate", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "a1a8", san: "Ra8#", explain: "كش بلا مهرب — كش مات." }], shows: "checkmate", highlight: ["a8", "g8", "f7", "g7", "h7"], arrows: [["a1", "a8"]],
    observe: "الملك في كش والبيادق قافلة الهروب — مفيش رد قانوني.", conclusion: "كش مات (Checkmate): كش بدون أي رد قانوني = نهاية المباراة." }),
  D({ id: "DEMO-CH01-STALE", lessonId: "CH01-L008", title: "This is stalemate (not mate)", fen: "7k/5Q2/7K/8/8/8/8/8 b - - 0 1", sideToMove: "b", legal: true,
    sequence: [], shows: "stalemate", highlight: ["h8", "g8", "g7", "h7"], arrows: [],
    observe: "الأسود مش في كش، لكن مفيش عنده أي نقلة قانونية.", conclusion: "التعادل بالخنق (Stalemate): مفيش كش + مفيش نقلة = تعادل، مش مات." }),
  D({ id: "DEMO-CH01-CASTLE-OK", lessonId: "CH01-L009", title: "Kingside castling (legal)", fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "e1g1", san: "O-O", explain: "التبييت: الملك مربعين ناحية الطابية والطابية تقفز جنبه." }], shows: "castling", highlight: ["e1", "g1", "h1", "f1"], arrows: [["e1", "g1"]],
    observe: "الملك e1→g1 والطابية h1→f1 في نقلة واحدة.", conclusion: "التبييت (Castling) ممكن لو الملك والطابية ما اتحرّكوش والمربعات فاضية." }),
  D({ id: "DEMO-CH01-CASTLE-NO", lessonId: "CH01-L009", title: "Castling through check (illegal)", fen: "r3k2r/8/8/8/8/5q2/8/R3K2R w KQkq - 0 1", sideToMove: "w", legal: false,
    sequence: [], rejectedUci: "e1g1", rejectReason: "الملك بيعدّي على f1 المهدَّد بالوزير الأسود — ممنوع التبييت خلال الكش.", shows: "castling", highlight: ["e1", "f1", "g1", "f3"], arrows: [["f3", "f1"]],
    observe: "محاولة O-O مرفوضة لأن f1 مربع مهاجَم.", conclusion: "ممنوع التبييت لو الملك في كش أو بيعدّي على/ينتهي في مربع مهاجَم." }),
  D({ id: "DEMO-CH01-EP-OK", lessonId: "CH01-L010", title: "En passant (legal, same move)", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "e5d6", san: "exd6", explain: "الأخذ بالتجاوز: ناخد البيدق اللي عدّى جنبنا للتوّ." }], shows: "en_passant", highlight: ["e5", "d5", "d6"], arrows: [["e5", "d6"]],
    observe: "البيدق الأبيض أخذ البيدق الأسود بالتجاوز على d6.", conclusion: "الأخذ بالتجاوز (En Passant) متاح فقط في النقلة التالية مباشرة." }),
  D({ id: "DEMO-CH01-EP-NO", lessonId: "CH01-L010", title: "En passant expired (illegal)", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1", sideToMove: "w", legal: false,
    sequence: [], rejectedUci: "e5d6", rejectReason: "فات وقت الأخذ بالتجاوز — مفيش مربع تجاوز متاح.", shows: "en_passant", highlight: ["e5", "d5", "d6"], arrows: [["e5", "d6"]],
    observe: "نفس الموقف لكن من غير فرصة التجاوز — النقلة مرفوضة.", conclusion: "الفرصة بتضيع لو ما استغلّيتهاش فوراً." }),
  D({ id: "DEMO-CH01-PROMO", lessonId: "CH01-L011", title: "Promotion", fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", sideToMove: "w", legal: true,
    sequence: [{ uci: "a7a8q", san: "a8=Q+", explain: "البيدق يوصل الصف الأخير فيترقّى." }], shows: "promotion", highlight: ["a7", "a8"], arrows: [["a7", "a8"]],
    observe: "البيدق على a7 ترقّى لوزير على a8.", conclusion: "الترقية (Promotion): تقدر تختار وزير أو طابية أو فيل أو حصان — مش بس وزير." }),
];
export function demosForLesson(lessonId: string): FoundationDemo[] { return FOUNDATION_DEMOS.filter((d) => d.lessonId === lessonId); }

// ---- Competency matrix (source of truth for assessment, remediation, audit, reports) ----
// R7.3.1: `minContexts` is the EVIDENCE POLICY — a competency is `demonstrated` only when the
// learner answers correctly in at least this many MEANINGFULLY DISTINCT contexts (distinct
// `contextKey` on the items). One lucky answer on a single memorised example is not enough; the
// rule must hold across a positive application AND a contrasting boundary/negative case. `group`
// buckets the competency for the learner-facing report.
export type CompetencyGroup = "board" | "movement" | "rules" | "king_safety" | "special";
// R7.3.2.2: `requiredAxes` is the EVIDENCE-AXIS coverage model. Beyond "2 distinct contexts", a valid
// attempt for this competency must include an item for EACH listed axis value — e.g. board coordinates
// must test BOTH a light and a dark square, check must test BOTH a check and a non-check. This stops the
// selector from issuing two same-outcome items (e.g. two dark squares) that fail to probe the contrast.
export interface Competency { id: string; label: string; lessonId: string; mandatory: boolean; minContexts: number; group: CompetencyGroup; requiredAxes: string[] }
export const COMPETENCIES: Competency[] = [
  { id: "foundation.board_coordinates", label: "Board coordinates & orientation", lessonId: "CH01-L001", mandatory: true, minContexts: 2, group: "board", requiredAxes: ["light", "dark"] },
  { id: "foundation.king_movement", label: "King movement", lessonId: "CH01-L002", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.queen_movement", label: "Queen movement", lessonId: "CH01-L002", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.rook_movement", label: "Rook movement", lessonId: "CH01-L003", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.bishop_movement", label: "Bishop movement", lessonId: "CH01-L003", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.knight_movement", label: "Knight movement (jump)", lessonId: "CH01-L003", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.pawn_movement", label: "Pawn forward movement", lessonId: "CH01-L004", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.pawn_capture", label: "Pawn captures", lessonId: "CH01-L004", mandatory: true, minContexts: 2, group: "movement", requiredAxes: ["capture", "no-capture"] },
  { id: "foundation.blocking", label: "Blocking & occupied squares", lessonId: "CH01-L005", mandatory: true, minContexts: 2, group: "rules", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.check", label: "Recognising check", lessonId: "CH01-L006", mandatory: true, minContexts: 2, group: "king_safety", requiredAxes: ["check", "not-check"] },
  { id: "foundation.check_response", label: "Legal responses to check", lessonId: "CH01-L007", mandatory: true, minContexts: 2, group: "king_safety", requiredAxes: ["valid-response", "must-resolve"] },
  { id: "foundation.checkmate", label: "Recognising checkmate", lessonId: "CH01-L008", mandatory: true, minContexts: 2, group: "king_safety", requiredAxes: ["mate", "not-mate"] },
  { id: "foundation.stalemate", label: "Recognising stalemate", lessonId: "CH01-L008", mandatory: true, minContexts: 2, group: "king_safety", requiredAxes: ["stalemate", "not-stalemate"] },
  { id: "foundation.castling", label: "Castling rules", lessonId: "CH01-L009", mandatory: true, minContexts: 2, group: "special", requiredAxes: ["legal", "illegal"] },
  { id: "foundation.en_passant", label: "En passant", lessonId: "CH01-L010", mandatory: true, minContexts: 2, group: "special", requiredAxes: ["available", "expired"] },
  { id: "foundation.promotion", label: "Promotion", lessonId: "CH01-L011", mandatory: true, minContexts: 2, group: "special", requiredAxes: ["concept", "legal-move"] },
];
// R7.3.2.2 single source of truth for the issued-attempt SIZE. The selector issues this many distinct
// contexts per mandatory competency; /start, the audit, and the generated JSON all derive the issued
// item count from here (never a hardcoded literal that could drift).
export const ISSUED_CONTEXTS_PER_COMPETENCY = 2;
export const MANDATORY_COMPETENCY_COUNT = COMPETENCIES.filter((c) => c.mandatory).length;
export const ISSUED_ITEM_COUNT = ISSUED_CONTEXTS_PER_COMPETENCY * MANDATORY_COMPETENCY_COUNT;
export const COMPETENCY_IDS = new Set(COMPETENCIES.map((c) => c.id));
export function lessonForCompetency(id: string): string | null { return COMPETENCIES.find((c) => c.id === id)?.lessonId ?? null; }
export function competency(id: string): Competency | undefined { return COMPETENCIES.find((c) => c.id === id); }
export const COMPETENCY_GROUPS: Array<{ group: CompetencyGroup; label: string }> = [
  { group: "board", label: "Board understanding" },
  { group: "movement", label: "Piece movement" },
  { group: "rules", label: "Movement rules" },
  { group: "king_safety", label: "King safety" },
  { group: "special", label: "Special moves" },
];

// ---- Assessment PROMPTS (no answers; correct answers are COMPUTED server-only) ----
// type "move_objective" is an OBJECTIVE-SPECIFIC drill: the learner plays a move (uci); the server
// accepts only moves satisfying the objective (objectiveKind + target) — a legal-but-irrelevant
// move does NOT pass. All other types are yes/no or choice questions.
export type AssessType = "is_check" | "is_checkmate" | "is_stalemate" | "move_legal" | "castling_allowed" | "en_passant_legal" | "promotion_choices" | "square_color" | "move_objective";
export type ObjectiveKind = "capture_on" | "move_to";
export interface AssessPrompt {
  id: string; competency: string; objective: string; type: AssessType; contextKey: string;
  fen?: string; moveUci?: string; square?: string; promptAr: string; options: string[];
  objectiveKind?: ObjectiveKind; target?: string; // for move_objective drills
  axis: string; // R7.3.2.2 evidence-axis value (coverage dimension; see Competency.requiredAxes)
}

// R7.3.1 curated variant bank. Every MANDATORY competency is probed in >=2 meaningfully distinct
// contexts (distinct `contextKey`) — e.g. a legal application AND a contrasting illegal boundary,
// or a positive classification AND a negative one — so a single memorised example cannot pass.
// Positions are curated + chess.js-validated (scripts/audit-foundation-assessment.ts); answers and
// accepted-move sets are computed server-only (foundations.answers.server.ts) and never shipped.
// The axis of each item is attached centrally from AXIS_BY_CONTEXT below (one source of truth), so the
// literals stay readable and the coverage model is auditable in one place.
const RAW_ASSESSMENT: Array<Omit<AssessPrompt, "axis">> = [
  // board coordinates: both colours, each in TWO squares so both colour sides rotate (R7.3.2.2)
  { id: "FA-COORD", competency: "foundation.board_coordinates", contextKey: "light-square", objective: "light square by coordinate", type: "square_color", square: "e4", promptAr: "مربع e4 لونه:", options: ["فاتح (light)", "غامق (dark)"] },
  { id: "FA-COORD2", competency: "foundation.board_coordinates", contextKey: "dark-square", objective: "dark square by coordinate", type: "square_color", square: "d4", promptAr: "مربع d4 لونه:", options: ["فاتح (light)", "غامق (dark)"] },
  { id: "FA-COORD4", competency: "foundation.board_coordinates", contextKey: "light-corner-square", objective: "light corner square by coordinate", type: "square_color", square: "h1", promptAr: "مربع h1 (ركن) لونه:", options: ["فاتح (light)", "غامق (dark)"] },
  // king: one-square legal + two-square illegal boundary
  { id: "FA-KING", competency: "foundation.king_movement", contextKey: "one-square-legal", objective: "king moves one square", type: "move_legal", fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", moveUci: "e1e2", promptAr: "هل نقلة الملك Ke1–e2 قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-KING2", competency: "foundation.king_movement", contextKey: "two-square-illegal", objective: "king cannot move two squares", type: "move_legal", fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", moveUci: "e1e3", promptAr: "هل يقدر الملك يتحرّك مربعين Ke1–e3؟", options: ["نعم", "لا"] },
  // queen: straight line + diagonal (both movement patterns)
  { id: "FA-QUEEN", competency: "foundation.queen_movement", contextKey: "line", objective: "queen moves in a line", type: "move_legal", fen: "3qk3/8/8/8/8/8/8/3QK3 w - - 0 1", moveUci: "d1d7", promptAr: "هل نقلة الوزير Qd1–d7 (عمود) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-QUEEN2", competency: "foundation.queen_movement", contextKey: "diagonal", objective: "queen moves on a diagonal", type: "move_legal", fen: "3qk3/8/8/8/8/8/8/3QK3 w - - 0 1", moveUci: "d1h5", promptAr: "هل نقلة الوزير Qd1–h5 (قطري) قانونية؟", options: ["نعم", "لا"] },
  // rook: file + rank (both straight axes)
  { id: "FA-ROOK", competency: "foundation.rook_movement", contextKey: "file", objective: "rook moves on a file", type: "move_legal", fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", moveUci: "a1a5", promptAr: "هل نقلة الطابية Ra1–a5 (عمود) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-ROOK2", competency: "foundation.rook_movement", contextKey: "rank", objective: "rook moves on a rank", type: "move_legal", fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", moveUci: "a1c1", promptAr: "هل نقلة الطابية Ra1–c1 (صف) قانونية؟", options: ["نعم", "لا"] },
  // bishop: diagonal legal + straight illegal boundary
  { id: "FA-BISHOP", competency: "foundation.bishop_movement", contextKey: "diagonal-legal", objective: "bishop moves on a diagonal", type: "move_legal", fen: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", moveUci: "c1f4", promptAr: "هل نقلة الفيل Bc1–f4 (قطري) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-BISHOP2", competency: "foundation.bishop_movement", contextKey: "straight-illegal", objective: "bishop cannot move straight", type: "move_legal", fen: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", moveUci: "c1c4", promptAr: "هل يقدر الفيل يتحرّك في خط مستقيم Bc1–c4؟", options: ["نعم", "لا"] },
  // knight: legal L-jump (over a piece) + non-L illegal boundary
  { id: "FA-KNIGHT", competency: "foundation.knight_movement", contextKey: "L-jump-legal", objective: "legal knight move (jump)", type: "move_legal", fen: "4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1", moveUci: "a1b3", promptAr: "هل نقلة الحصان Na1–b3 قانونية رغم البيدق على b2؟", options: ["نعم", "لا"] },
  { id: "FA-KNIGHT2", competency: "foundation.knight_movement", contextKey: "non-L-illegal", objective: "knight cannot move straight", type: "move_legal", fen: "4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1", moveUci: "a1a3", promptAr: "هل يقدر الحصان يتحرّك في خط مستقيم Na1–a3؟", options: ["نعم", "لا"] },
  // pawn movement: first-move double step + blocked forward (cannot capture forward)
  { id: "FA-PAWNFWD", competency: "foundation.pawn_movement", contextKey: "double-step", objective: "pawn first-move double step", type: "move_legal", fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", moveUci: "e2e4", promptAr: "هل يقدر البيدق يتقدّم خطوتين e2–e4 في أول نقلة؟", options: ["نعم", "لا"] },
  { id: "FA-PAWNNOCAP", competency: "foundation.pawn_movement", contextKey: "blocked-forward", objective: "pawn cannot capture forward", type: "move_legal", fen: "4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1", moveUci: "e4e5", promptAr: "هل يقدر البيدق e4 ياخد البيدق اللي قدامه بنقلة e4–e5؟", options: ["نعم", "لا"] },
  // pawn capture: diagonal capture drill + diagonal-to-empty illegal boundary
  { id: "DR-PAWNCAP", competency: "foundation.pawn_capture", contextKey: "diagonal-capture", objective: "capture the pawn diagonally", type: "move_objective", fen: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", objectiveKind: "capture_on", target: "d5", promptAr: "خُد البيدق الأسود على d5 ببيدقك (العب النقلة على الرقعة).", options: [] },
  { id: "FA-PAWNCAP-NEG", competency: "foundation.pawn_capture", contextKey: "diagonal-empty-illegal", objective: "pawn cannot move diagonally to an empty square", type: "move_legal", fen: "4k3/8/8/8/4P3/8/8/4K3 w - - 0 1", moveUci: "e4d5", promptAr: "من غير قطعة على d5، هل يقدر البيدق يتحرّك قطريّاً e4–d5؟", options: ["نعم", "لا"] },
  // blocking: slide blocked by own piece + friendly-occupied destination illegal
  { id: "FA-BLOCK", competency: "foundation.blocking", contextKey: "slide-blocked", objective: "cannot move through own piece", type: "move_legal", fen: "4k3/8/8/8/8/8/8/R2BK3 w - - 0 1", moveUci: "a1e1", promptAr: "هل تقدر الطابية تلعب Ra1–e1 رغم الفيل على d1؟", options: ["نعم", "لا"] },
  { id: "FA-BLOCK2", competency: "foundation.blocking", contextKey: "friendly-dest-illegal", objective: "cannot capture a friendly piece", type: "move_legal", fen: "4k3/8/8/R7/8/8/8/R3K3 w - - 0 1", moveUci: "a1a5", promptAr: "هل تقدر الطابية a1 تلعب لـ a5 وعليها طابيتك؟", options: ["نعم", "لا"] },
  // check: a checked king + a non-check position
  { id: "FA-CHECK", competency: "foundation.check", contextKey: "is-check", objective: "recognise check", type: "is_check", fen: "4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1", promptAr: "هل الملك في كش؟", options: ["نعم", "لا"] },
  { id: "FA-CHECK2", competency: "foundation.check", contextKey: "not-check", objective: "recognise a non-check position", type: "is_check", fen: "4k3/8/8/8/8/8/8/4K2R b - - 0 1", promptAr: "هل الملك الأسود في كش هنا؟", options: ["نعم", "لا"] },
  // check response: capture the checker (drill) + you MUST resolve the check (unrelated move illegal)
  { id: "DR-CHECKRESP", competency: "foundation.check_response", contextKey: "capture-checker", objective: "capture the checking piece", type: "move_objective", fen: "4k3/8/8/8/8/5n2/6P1/4K3 w - - 0 1", objectiveKind: "capture_on", target: "f3", promptAr: "ملكك في كش من الحصان على f3 — خُد الحصان (العب النقلة).", options: [] },
  { id: "FA-CHECKRESP-MUST", competency: "foundation.check_response", contextKey: "must-resolve-check", objective: "a move that ignores the check is illegal", type: "move_legal", fen: "k3r3/8/8/8/8/8/P7/4K3 w - - 0 1", moveUci: "a2a3", promptAr: "ملكك في كش — هل نقلة البيدق a2–a3 (اللي ما بتفكّش الكش) قانونية؟", options: ["نعم", "لا"] },
  // checkmate: a mate + a check that is NOT mate
  { id: "FA-MATE", competency: "foundation.checkmate", contextKey: "is-mate", objective: "recognise checkmate", type: "is_checkmate", fen: "R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1", promptAr: "هل هذا كش مات؟", options: ["نعم", "لا"] },
  { id: "FA-MATE2", competency: "foundation.checkmate", contextKey: "check-not-mate", objective: "a check with an escape is not mate", type: "is_checkmate", fen: "R3k3/8/8/8/8/8/8/4K3 b - - 0 1", promptAr: "الملك في كش لكن عنده مهرب — هل ده كش مات؟", options: ["نعم", "لا"] },
  // stalemate: a stalemate + a position that is NOT stalemate (side to move has a legal move)
  { id: "FA-STALE", competency: "foundation.stalemate", contextKey: "is-stalemate", objective: "recognise stalemate", type: "is_stalemate", fen: "7k/5Q2/7K/8/8/8/8/8 b - - 0 1", promptAr: "هل هذا تعادل بالخنق (stalemate)؟", options: ["نعم", "لا"] },
  { id: "FA-STALE2", competency: "foundation.stalemate", contextKey: "not-stalemate", objective: "a position with a legal move is not stalemate", type: "is_stalemate", fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", promptAr: "الأبيض عنده نقلات قانونية — هل ده تعادل بالخنق؟", options: ["نعم", "لا"] },
  // castling: legal case + through-check illegal + squares-blocked illegal
  { id: "FA-CASTLE-OK", competency: "foundation.castling", contextKey: "legal-castle", objective: "castling legal case", type: "castling_allowed", fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", promptAr: "هل التبييت القصير O-O قانوني هنا؟", options: ["نعم", "لا"] },
  { id: "FA-CASTLE-NO", competency: "foundation.castling", contextKey: "through-check-illegal", objective: "castling through check is illegal", type: "castling_allowed", fen: "r3k2r/8/8/8/8/5q2/8/R3K2R w KQkq - 0 1", promptAr: "لو الوزير الأسود بيهاجم f1، هل التبييت O-O قانوني؟", options: ["نعم", "لا"] },
  { id: "FA-CASTLE-BLOCKED", competency: "foundation.castling", contextKey: "squares-blocked-illegal", objective: "castling blocked by pieces is illegal", type: "castling_allowed", fen: "r3k2r/8/8/8/8/8/8/RB2KB1R w KQkq - 0 1", promptAr: "لو فيه قطع بين الملك والطابية، هل التبييت قانوني؟", options: ["نعم", "لا"] },
  // en passant: available + expired
  { id: "FA-EP-OK", competency: "foundation.en_passant", contextKey: "ep-available", objective: "en passant available", type: "en_passant_legal", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", moveUci: "e5d6", promptAr: "هل الأخذ بالتجاوز exd6 متاح دلوقتي؟", options: ["نعم", "لا"] },
  { id: "FA-EP-NO", competency: "foundation.en_passant", contextKey: "ep-expired", objective: "en passant expired", type: "en_passant_legal", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1", moveUci: "e5d6", promptAr: "من غير فرصة التجاوز، هل exd6 قانونية؟", options: ["نعم", "لا"] },
  // promotion: available choices + the promotion move itself is legal
  { id: "FA-PROMO", competency: "foundation.promotion", contextKey: "promotion-choices", objective: "promotion choices", type: "promotion_choices", promptAr: "عند الترقية، القطع اللي تقدر تختارها هي:", options: ["وزير فقط", "وزير/طابية/فيل/حصان"] },
  { id: "FA-PROMO-MOVE", competency: "foundation.promotion", contextKey: "promotion-move-legal", objective: "promotion move is legal", type: "move_legal", fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", moveUci: "a7a8q", promptAr: "البيدق على a7 — هل نقلة الترقية a8=Q قانونية؟", options: ["نعم", "لا"] },

  // ---- R7.3.2: third rotation context per competency (pool >= 3 distinct contexts each) ----
  { id: "FA-COORD3", competency: "foundation.board_coordinates", contextKey: "corner-square", objective: "corner square colour", type: "square_color", square: "a1", promptAr: "مربع a1 (ركن الرقعة) لونه:", options: ["فاتح (light)", "غامق (dark)"] },
  { id: "FA-KING3", competency: "foundation.king_movement", contextKey: "diagonal-one-square-legal", objective: "king moves one square diagonally", type: "move_legal", fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", moveUci: "e1d2", promptAr: "هل نقلة الملك Ke1–d2 (قطري مربع واحد) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-QUEEN3", competency: "foundation.queen_movement", contextKey: "knight-shape-illegal", objective: "queen cannot move like a knight", type: "move_legal", fen: "3qk3/8/8/8/8/8/8/3QK3 w - - 0 1", moveUci: "d1e3", promptAr: "هل يقدر الوزير يتحرّك حركة الحصان Qd1–e3؟", options: ["نعم", "لا"] },
  { id: "FA-ROOK3", competency: "foundation.rook_movement", contextKey: "diagonal-illegal", objective: "rook cannot move diagonally", type: "move_legal", fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", moveUci: "a1c3", promptAr: "هل يقدر الطابية تتحرّك قطريّاً Ra1–c3؟", options: ["نعم", "لا"] },
  { id: "FA-BISHOP3", competency: "foundation.bishop_movement", contextKey: "other-diagonal-legal", objective: "bishop on the other diagonal", type: "move_legal", fen: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", moveUci: "c1a3", promptAr: "هل نقلة الفيل Bc1–a3 (قطري آخر) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-KNIGHT3", competency: "foundation.knight_movement", contextKey: "other-L-legal", objective: "another legal knight L-move", type: "move_legal", fen: "4k3/8/8/8/8/8/1P6/N3K3 w - - 0 1", moveUci: "a1c2", promptAr: "هل نقلة الحصان Na1–c2 (حرف L آخر) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-PAWN3", competency: "foundation.pawn_movement", contextKey: "single-step-legal", objective: "pawn single forward step", type: "move_legal", fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", moveUci: "e2e3", promptAr: "هل يقدر البيدق يتقدّم خطوة واحدة e2–e3؟", options: ["نعم", "لا"] },
  { id: "DR-PAWNCAP3", competency: "foundation.pawn_capture", contextKey: "capture-right", objective: "capture to the other side diagonally", type: "move_objective", fen: "4k3/8/8/5p2/4P3/8/8/4K3 w - - 0 1", objectiveKind: "capture_on", target: "f5", promptAr: "خُد البيدق الأسود على f5 ببيدقك (العب النقلة على الرقعة).", options: [] },
  { id: "FA-BLOCK3", competency: "foundation.blocking", contextKey: "capture-enemy-dest-legal", objective: "a slider CAN capture an enemy at the end of its path", type: "move_legal", fen: "4k3/8/8/r7/8/8/8/R3K3 w - - 0 1", moveUci: "a1a5", promptAr: "هل تقدر الطابية a1 تاخد طابية الخصم على a5؟", options: ["نعم", "لا"] },
  { id: "FA-CHECK3", competency: "foundation.check", contextKey: "knight-check", objective: "recognise a knight check", type: "is_check", fen: "4k3/8/8/8/8/5n2/8/4K3 w - - 0 1", promptAr: "هل الملك الأبيض في كش من الحصان؟", options: ["نعم", "لا"] },
  { id: "FA-CHECKRESP3", competency: "foundation.check_response", contextKey: "king-sidestep-legal", objective: "move the king to a safe square", type: "move_legal", fen: "k3r3/8/8/8/8/8/8/4K3 w - - 0 1", moveUci: "e1f1", promptAr: "ملكك في كش — هل نقلة الملك Ke1–f1 (لمربع آمن) قانونية؟", options: ["نعم", "لا"] },
  { id: "FA-MATE3", competency: "foundation.checkmate", contextKey: "king-rook-box-mate", objective: "recognise a king+rook box mate", type: "is_checkmate", fen: "k6R/8/K7/8/8/8/8/8 b - - 0 1", promptAr: "هل هذا كش مات (مات الطابية والملك)؟", options: ["نعم", "لا"] },
  { id: "FA-STALE3", competency: "foundation.stalemate", contextKey: "king-pawn-stalemate", objective: "recognise a king+pawn stalemate (different mechanism from the queen case)", type: "is_stalemate", fen: "8/8/8/8/8/k7/p7/K7 w - - 0 1", promptAr: "الأبيض ليس في كش ولا نقلة قانونية له — هل هذا تعادل بالخنق (stalemate)؟", options: ["نعم", "لا"] },
  { id: "FA-EP3", competency: "foundation.en_passant", contextKey: "ep-available-other-file", objective: "en passant available on another file", type: "en_passant_legal", fen: "4k3/8/8/4pP2/8/8/8/4K3 w - e6 0 1", moveUci: "f5e6", promptAr: "هل الأخذ بالتجاوز fxe6 متاح دلوقتي؟", options: ["نعم", "لا"] },
  { id: "FA-PROMO3", competency: "foundation.promotion", contextKey: "underpromotion-legal", objective: "underpromotion move is legal", type: "move_legal", fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", moveUci: "a7a8n", promptAr: "هل نقلة الترقية لحصان a8=N قانونية؟", options: ["نعم", "لا"] },
];

// R7.3.2.2 evidence-axis assignment (one source of truth), keyed by the globally-unique contextKey.
// Each value is one of its competency's `requiredAxes`, so a valid attempt must cover both axes.
const AXIS_BY_CONTEXT: Record<string, string> = {
  // board coordinates — square colour. a1 (contextKey "corner-square") is a DARK corner; h1
  // ("light-corner-square") is a LIGHT corner. Both colour sides have two squares so both rotate.
  "light-square": "light", "light-corner-square": "light", "dark-square": "dark", "corner-square": "dark",
  // king / queen / rook / bishop / knight / pawn movement — legal vs illegal boundary
  "one-square-legal": "legal", "diagonal-one-square-legal": "legal", "two-square-illegal": "illegal",
  "line": "legal", "diagonal": "legal", "knight-shape-illegal": "illegal",
  "file": "legal", "rank": "legal", "diagonal-illegal": "illegal",
  "diagonal-legal": "legal", "other-diagonal-legal": "legal", "straight-illegal": "illegal",
  "L-jump-legal": "legal", "other-L-legal": "legal", "non-L-illegal": "illegal",
  "double-step": "legal", "single-step-legal": "legal", "blocked-forward": "illegal",
  // pawn capture — a real capture vs a diagonal move with no capture
  "diagonal-capture": "capture", "capture-right": "capture", "diagonal-empty-illegal": "no-capture",
  // blocking — a legal capture at the path end vs blocked/own-dest illegal
  "capture-enemy-dest-legal": "legal", "slide-blocked": "illegal", "friendly-dest-illegal": "illegal",
  // check — in check vs not in check
  "is-check": "check", "knight-check": "check", "not-check": "not-check",
  // check response — a valid response vs an illegal non-response
  "capture-checker": "valid-response", "king-sidestep-legal": "valid-response", "must-resolve-check": "must-resolve",
  // checkmate — mate vs a check with an escape
  "is-mate": "mate", "king-rook-box-mate": "mate", "check-not-mate": "not-mate",
  // stalemate — stalemate vs a position with a legal move
  "is-stalemate": "stalemate", "king-pawn-stalemate": "stalemate", "not-stalemate": "not-stalemate",
  // castling — legal vs illegal
  "legal-castle": "legal", "through-check-illegal": "illegal", "squares-blocked-illegal": "illegal",
  // en passant — available now vs expired
  "ep-available": "available", "ep-available-other-file": "available", "ep-expired": "expired",
  // promotion — the choices concept vs an actual legal promotion move
  "promotion-choices": "concept", "promotion-move-legal": "legal-move", "underpromotion-legal": "legal-move",
};
export const FOUNDATION_ASSESSMENT: AssessPrompt[] = RAW_ASSESSMENT.map((p) => ({ ...p, axis: AXIS_BY_CONTEXT[p.contextKey] ?? "unassigned" }));
// Chapter passes iff EVERY mandatory competency is demonstrated (all its graded items correct).
// A high aggregate score cannot compensate for a failed mandatory competency. `FOUNDATION_PASS`
// remains a secondary overall floor for display/history; the competency gate is authoritative.
export const FOUNDATION_PASS = Math.ceil(FOUNDATION_ASSESSMENT.length * 0.9);
export const FOUNDATION_ASSESSMENT_LEVEL = "CH01-L012";

// CH01 lesson specification (client-safe). The campaign catalog builds Level objects from this.
export interface FoundationLesson { id: string; title: string; objectiveEn: string; objectiveAr: string; concepts: string[] }
export const FOUNDATION_LESSONS: FoundationLesson[] = [
  { id: "CH01-L001", title: "Understanding the Board & Coordinates", objectiveEn: "Identify squares by file/rank and read algebraic coordinates.", objectiveAr: "تمييز المربعات بالملف والصف وقراءة الإحداثيات.", concepts: ["8×8 board", "files a–h", "ranks 1–8", "light/dark squares", "algebraic notation"] },
  { id: "CH01-L002", title: "King & Queen Movement", objectiveEn: "Move the king (one square) and the queen (lines & diagonals).", objectiveAr: "تحريك الملك (مربع واحد) والوزير (خطوط وأقطار).", concepts: ["king one square", "queen any distance straight/diagonal"] },
  { id: "CH01-L003", title: "Rook, Bishop & Knight Movement", objectiveEn: "Move the rook (ranks/files), bishop (diagonals) and the jumping knight.", objectiveAr: "تحريك الطابية والفيل والحصان القافز.", concepts: ["rook straight", "bishop diagonal", "knight L-shape jump"] },
  { id: "CH01-L004", title: "Pawn Movement & Captures", objectiveEn: "Move pawns forward but capture diagonally.", objectiveAr: "البيدق يتقدّم للأمام ويأخذ قطريّاً.", concepts: ["forward move", "first-move double step", "diagonal capture"] },
  { id: "CH01-L005", title: "Blocking & Legal Captures", objectiveEn: "Understand that most pieces cannot pass through others.", objectiveAr: "معظم القطع لا تعدّي فوق غيرها.", concepts: ["blocked paths", "friendly pieces block", "enemy pieces are targets", "knight exception"] },
  { id: "CH01-L006", title: "Understanding Check", objectiveEn: "Recognise when a king is in check.", objectiveAr: "تمييز وجود الملك في كش.", concepts: ["king attacked", "check vs ordinary attack"] },
  { id: "CH01-L007", title: "Responding to Check", objectiveEn: "Respond to check by moving, capturing or blocking.", objectiveAr: "الرد على الكش: تحريك/أخذ/حجب.", concepts: ["move the king", "capture the checker", "block the check"] },
  { id: "CH01-L008", title: "Checkmate & Stalemate", objectiveEn: "Distinguish checkmate from stalemate.", objectiveAr: "التفرقة بين الكش مات والتعادل بالخنق.", concepts: ["checkmate = check + no reply", "stalemate = no check + no move"] },
  { id: "CH01-L009", title: "Castling", objectiveEn: "Castle legally and recognise when castling is forbidden.", objectiveAr: "التبييت القانوني ومتى يُمنع.", concepts: ["king + rook unmoved", "squares empty", "not through/into check"] },
  { id: "CH01-L010", title: "En Passant", objectiveEn: "Perform en passant and know its timing.", objectiveAr: "الأخذ بالتجاوز وتوقيته.", concepts: ["immediate opportunity", "diagonal pawn capture"] },
  { id: "CH01-L011", title: "Promotion", objectiveEn: "Promote a pawn and choose the piece.", objectiveAr: "ترقية البيدق واختيار القطعة.", concepts: ["reach last rank", "choose Q/R/B/N"] },
  { id: "CH01-L012", title: "Beginner Rules Assessment", objectiveEn: "Demonstrate the fundamentals in a graded, server-verified assessment.", objectiveAr: "إثبات الأساسيات في اختبار مُقيَّم ومُتحقَّق على الخادم.", concepts: ["all CH01 rules"] },
];

