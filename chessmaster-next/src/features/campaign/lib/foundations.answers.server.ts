import "server-only";
// SERVER-ONLY grader. Correct answers / accepted move-sets are COMPUTED from positions with
// chess.js and never shipped to the client. Produces per-COMPETENCY results and the authoritative
// competency-gated pass decision: a high aggregate score cannot compensate for a failed mandatory
// competency — the chapter passes only when EVERY mandatory competency is demonstrated.
import { Chess } from "chess.js";
import { FOUNDATION_ASSESSMENT, FOUNDATION_PASS, COMPETENCIES, lessonForCompetency, type AssessPrompt } from "@/features/campaign/lib/foundations";

function tryLegal(fen: string, uci: string): boolean {
  try { const g = new Chess(fen); return !!g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); }
  catch { return false; }
}

// Accepted move set for an objective-specific drill (server-only). Only legal moves that satisfy
// the objective are accepted — a legal-but-irrelevant move is NOT accepted.
export function acceptedMoves(p: AssessPrompt): string[] {
  if (p.type !== "move_objective" || !p.fen) return [];
  let g: Chess; try { g = new Chess(p.fen); } catch { return []; }
  const legal = g.moves({ verbose: true }) as unknown as Array<{ from: string; to: string; captured?: string; promotion?: string }>;
  const uci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? "");
  if (p.objectiveKind === "capture_on") return legal.filter((m) => m.to === p.target && m.captured).map(uci);
  if (p.objectiveKind === "move_to") return legal.filter((m) => m.to === p.target).map(uci);
  return [];
}

// Correct option index for choice/yes-no items (server-only).
export function correctIndex(p: AssessPrompt): number {
  const yes = 0, no = 1;
  if (p.type === "promotion_choices") return 1;
  if (p.type === "square_color") {
    const f = p.square!.charCodeAt(0) - 97, r = Number(p.square![1]) - 1;
    return (f + r) % 2 === 1 ? 0 : 1; // light = odd sum (a1 dark); options[0]=light
  }
  const g = p.fen ? new Chess(p.fen) : null;
  switch (p.type) {
    case "is_check": return g!.inCheck() ? yes : no;
    case "is_checkmate": return g!.isCheckmate() ? yes : no;
    case "is_stalemate": return g!.isStalemate() ? yes : no;
    case "move_legal":
    case "en_passant_legal": return tryLegal(p.fen!, p.moveUci!) ? yes : no;
    case "castling_allowed": {
      const legal = g!.moves({ verbose: true }) as unknown as Array<{ flags: string }>;
      return legal.some((m) => m.flags.includes("k") || m.flags.includes("q")) ? yes : no;
    }
    default: return no;
  }
}

export interface Submission { id: string; answerIndex?: number; uci?: string }
export type CompetencyStatus = "not_attempted" | "insufficient_evidence" | "demonstrated" | "needs_remediation";
export interface CompetencyResult {
  competency: string; status: CompetencyStatus; mandatory: boolean; lessonId: string | null;
  minContexts: number; contextsDemonstrated: number; // distinct correct contexts vs. required
}
export interface ItemEvidence { id: string; competency: string; contextKey: string; correct: boolean; answered: boolean }
export interface Grade {
  score: number; total: number; overallFloorMet: boolean; passed: boolean;
  perItem: ItemEvidence[];
  perCompetency: CompetencyResult[];
  remediation: Array<{ competency: string; lessonId: string | null }>;
}

function itemCorrect(p: AssessPrompt, s: Submission | undefined): boolean {
  if (!s) return false;
  if (p.type === "move_objective") return !!s.uci && acceptedMoves(p).includes(s.uci);
  return s.answerIndex === correctIndex(p);
}

// R7.3.1 EVIDENCE POLICY. A competency is `demonstrated` only when the learner answers correctly in
// at least `minContexts` MEANINGFULLY DISTINCT contexts (distinct `contextKey`). Because evidence is
// counted over DISTINCT context keys, repeating the same item — even correctly, even many times —
// cannot manufacture mastery; the learner must get the rule right in genuinely different situations.
//
// R7.3.2: when `issuedIds` is supplied (the server-selected rotation for this attempt), grading is
// RESTRICTED to those items — a competency's evidence is drawn only from the items the server issued
// for this attempt, so evidence from other attempts or un-issued bank items can never count.
export function gradeFoundation(submissions: Submission[], issuedIds?: string[]): Grade {
  // de-dupe by id (last wins) so a duplicated submission is not double-counted
  const byId = new Map(submissions.map((s) => [s.id, s]));
  const issued = issuedIds ? new Set(issuedIds) : null;
  const bank = issued ? FOUNDATION_ASSESSMENT.filter((p) => issued.has(p.id)) : FOUNDATION_ASSESSMENT;
  const perItem: ItemEvidence[] = bank.map((p) => ({
    id: p.id, competency: p.competency, contextKey: p.contextKey,
    correct: itemCorrect(p, byId.get(p.id)), answered: byId.has(p.id),
  }));
  const score = perItem.filter((x) => x.correct).length;

  const perCompetency: CompetencyResult[] = COMPETENCIES.map((c) => {
    const results = perItem.filter((x) => x.competency === c.id);
    const answered = results.filter((r) => r.answered);
    const correctContexts = new Set(results.filter((r) => r.correct).map((r) => r.contextKey));
    const contextsDemonstrated = correctContexts.size;
    let status: CompetencyStatus;
    if (answered.length === 0) status = "not_attempted";
    else if (contextsDemonstrated >= c.minContexts) status = "demonstrated"; // enough DISTINCT contexts correct
    else if (answered.some((r) => !r.correct)) status = "needs_remediation"; // a wrong answer present
    else status = "insufficient_evidence"; // some correct, but not yet enough distinct contexts
    return { competency: c.id, status, mandatory: c.mandatory, lessonId: c.lessonId, minContexts: c.minContexts, contextsDemonstrated };
  });

  // Display floor is relative to the graded set (the issued rotation, or the whole bank). It is
  // INFORMATIONAL ONLY and never affects the pass decision below.
  const floor = issued ? Math.ceil(bank.length * 0.9) : FOUNDATION_PASS;
  const overallFloorMet = score >= floor;
  // AUTHORITATIVE GATE: every mandatory competency must be demonstrated (its evidence policy met).
  // The aggregate score is informational and can NEVER compensate for an unmet mandatory competency.
  const passed = perCompetency.filter((r) => r.mandatory).every((r) => r.status === "demonstrated");
  const remediation = perCompetency
    .filter((r) => r.mandatory && r.status !== "demonstrated")
    .map((r) => ({ competency: r.competency, lessonId: lessonForCompetency(r.competency) }));

  return { score, total: bank.length, overallFloorMet, passed, perItem, perCompetency, remediation };
}
