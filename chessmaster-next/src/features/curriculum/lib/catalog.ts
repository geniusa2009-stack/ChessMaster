// R5 curriculum catalog. A static, typed skill graph layered over the audited 202-puzzle corpus
// and the existing R2 training engine. Contains NO puzzle solutions and NO per-user state — it is
// safe to import on the client. Eligible puzzle IDs/counts are computed SERVER-SIDE from the
// server-only corpus (see eligibility.server.ts); this file only declares the skills, their
// prerequisites, learning objectives (i18n keys), and the rule that maps a puzzle to its skill.
//
// Honesty rules baked in:
//  - Every skill maps to content that the R4/R4.1 solver actually verified for that objective.
//  - `opening_stage_tactics` is PROVISIONAL: the opening-domain puzzles are tactical positions that
//    arise in the opening stage; we do NOT have verified opening-LINE identity for them, so the
//    curriculum does not claim to teach opening theory. (Canonical opening lines live in the
//    separate openings trainer.)
//  - Motif-specific skills (pins, skewers, deflection, interference, opposition, key squares,
//    opening principles) have NO verified puzzle content and are declared `unavailable` rather than
//    filled with unrelated puzzles.
import type { Domain } from "@/features/training/lib/domains";

export type MappingConfidence = "verified" | "provisional";
export type CoverageStatus = "available" | "limited" | "insufficient" | "unavailable";

export interface CurriculumSkill {
  id: string;
  domain: Domain;
  nameKey: string;         // i18n key
  objectiveKey: string;    // i18n key — an observable capability
  prerequisites: string[]; // skill ids
  confidence: MappingConfidence;
}

// Skills backed by genuinely verified content. Ordered as a sensible learning progression.
export const SKILLS: CurriculumSkill[] = [
  { id: "mate_in_one",            domain: "checkmate_patterns", nameKey: "curr.skill.mate_in_one",            objectiveKey: "curr.obj.mate_in_one",            prerequisites: [],                        confidence: "verified" },
  { id: "forced_mate",            domain: "checkmate_patterns", nameKey: "curr.skill.forced_mate",            objectiveKey: "curr.obj.forced_mate",            prerequisites: ["mate_in_one"],            confidence: "verified" },
  { id: "tactical_recognition",   domain: "tactical_vision",    nameKey: "curr.skill.tactical_recognition",   objectiveKey: "curr.obj.tactical_recognition",   prerequisites: [],                        confidence: "verified" },
  { id: "calculation_combinations", domain: "calculation",      nameKey: "curr.skill.calculation_combinations", objectiveKey: "curr.obj.calculation_combinations", prerequisites: ["tactical_recognition"], confidence: "verified" },
  { id: "defensive_resources",    domain: "defensive_play",     nameKey: "curr.skill.defensive_resources",    objectiveKey: "curr.obj.defensive_resources",    prerequisites: [],                        confidence: "verified" },
  { id: "endgame_conversion",     domain: "endgame",            nameKey: "curr.skill.endgame_conversion",     objectiveKey: "curr.obj.endgame_conversion",     prerequisites: [],                        confidence: "verified" },
  { id: "opening_stage_tactics",  domain: "opening_knowledge",  nameKey: "curr.skill.opening_stage_tactics",  objectiveKey: "curr.obj.opening_stage_tactics",  prerequisites: [],                        confidence: "provisional" },
];

// Skills that are part of the intended taxonomy but have NO verified content yet. Declared so the
// UI/report can show them honestly as "future content required" — never filled with unrelated items.
export const UNAVAILABLE_SKILLS: { id: string; domain: Domain; nameKey: string }[] = [
  { id: "pins_and_skewers",   domain: "tactical_vision", nameKey: "curr.skill.pins_and_skewers" },
  { id: "deflection_overload", domain: "tactical_vision", nameKey: "curr.skill.deflection_overload" },
  { id: "opposition_key_squares", domain: "endgame",     nameKey: "curr.skill.opposition_key_squares" },
  { id: "opening_principles", domain: "opening_knowledge", nameKey: "curr.skill.opening_principles" },
];

export const SKILL_IDS = new Set(SKILLS.map((s) => s.id));
export function getSkill(id: string): CurriculumSkill | undefined { return SKILLS.find((s) => s.id === id); }

// Deterministic, pure puzzle -> skill mapping. Depends only on the puzzle's authoritative
// (audited) domain + theme — never on the solution. Returns null if nothing applies (never happens
// for the current corpus; kept total for safety).
export function skillForPuzzle(p: { domain: string; theme: string }): string | null {
  switch (p.domain) {
    case "checkmate_patterns": return /^mateIn1$/i.test(p.theme) ? "mate_in_one" : "forced_mate";
    case "tactical_vision":    return "tactical_recognition";
    case "calculation":        return "calculation_combinations";
    case "defensive_play":     return "defensive_resources";
    case "endgame":            return "endgame_conversion";
    case "opening_knowledge":  return "opening_stage_tactics";
    default:                   return null;
  }
}

// Coverage status from a verified-eligible item count. Documented, defensible thresholds (NOT
// marketing): >=15 supports progression across difficulties + spaced review; 5-14 is practice-only;
// 1-4 cannot accumulate reliable evidence; 0 is unavailable. Provisional skills are capped at
// "limited" no matter the count, because the mapping confidence itself is provisional.
export function coverageStatus(eligibleCount: number, confidence: MappingConfidence): CoverageStatus {
  let s: CoverageStatus;
  if (eligibleCount === 0) s = "unavailable";
  else if (eligibleCount < 5) s = "insufficient";
  else if (eligibleCount < 15) s = "limited";
  else s = "available";
  if (confidence === "provisional" && s === "available") s = "limited";
  return s;
}
