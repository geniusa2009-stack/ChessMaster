// R7 authoritative campaign catalog — the SINGLE source of truth for worlds, chapters, levels,
// video lessons and boss challenges. Client-safe: it references curriculum skill ids + difficulty
// bands + puzzle/opening ids resolved SERVER-SIDE (see eligibility.server.ts); it contains NO puzzle
// solutions. Every report (Markdown + JSON) is generated from this module — never hand-maintained.
//
// Honesty rules baked in:
//  - A level is "content-backed" only if a backing curriculum skill actually has eligible puzzles.
//  - Chapters with no verified backing skill (piece movement, endgame theory, strategic application)
//    are PLANNED / future_content_required — never presented as taught.
//  - opening_stage_tactics stays provisional; the 28 opening lines are project-authored lessons.
//  - Video lessons are PLANNED metadata only: no asset references, no URLs, no fake runtimes.
import type { Domain } from "@/features/training/lib/domains";
import { FOUNDATION_LESSONS, FOUNDATION_DEMOS, FOUNDATION_ASSESSMENT_LEVEL } from "@/features/campaign/lib/foundations";

export type LevelType = "concept" | "guided_practice" | "independent_practice" | "review" | "assessment" | "boss_challenge";
export type PublicationStatus = "ready" | "limited" | "planned" | "future_content_required" | "blocked";
export type Band = "easy" | "medium" | "hard" | "expert";
export type VideoType =
  | "concept_explanation" | "guided_example" | "tactical_demonstration" | "opening_lesson"
  | "endgame_lesson" | "defensive_lesson" | "calculation_lesson" | "level_review" | "chapter_review" | "boss_challenge_explanation";
export type VideoState = "planned" | "outline_ready" | "script_ready" | "recorded" | "editing" | "educational_review" | "approved" | "published";

export interface Level {
  id: string;            // stable, e.g. CH03-L002 (never an array index)
  seq: number;           // global campaign sequence
  worldId: string;
  chapterId: string;
  title: string;
  type: LevelType;
  band: Band | null;     // difficulty band for practice levels; null for concept/review
  status: PublicationStatus;
  prerequisites: string[];     // level ids
  prerequisiteReason: string;
  domain: Domain | null;       // null for planned non-content topics
  skillId: string | null;      // backing curriculum skill (null => planned topic)
  secondarySkillIds: string[];
  learningObjective: string;
  measurableOutcome: string;
  before: string;
  after: string;
  keyConcepts: string[];
  teachingSequence: string[];
  explanationPlan: string;
  commonMistakes: string[];
  minExercises: number;        // required solves for a pass (0 for concept/review-only)
  passCriteria: string;
  masteryCondition: string;
  failureRetry: string;
  remediation: string;         // level id to revisit, or ""
  reviewRule: string;
  videoIds: string[];
  nextLevelId: string | null;
  contentCoverage: "full" | "partial" | "none";
  knownLimitations: string;
  demoIds?: string[];     // CH01 foundation lessons: validated board-demonstration ids
  practiceKindHint?: "puzzles" | "openings" | "lesson" | "rules_assessment"; // CH01 foundation lessons/assessment
}

export interface World { id: string; title: string; theme: string }
export interface Chapter { id: string; worldId: string; title: string; skillId: string | null; backingDomain: Domain | null }

export interface VideoSegment { title: string; relatedObjective: string }
export interface VideoLesson {
  id: string;
  type: VideoType;
  titleEn: string; titleAr: string;
  descriptionEn: string;
  objectiveEn: string; objectiveAr: string;
  skillIds: string[];
  chapterIds: string[];
  levelIds: string[];
  supportingPuzzleSkill: string | null; // which skill's verified puzzles illustrate it (ids resolved server-side)
  keyConcepts: string[];
  productionBrief: { purpose: string; outcome: string; hook: string; outline: string[]; boardDemos: string; misconceptions: string; recap: string; followUp: string; requiredMedia: string; expectedLength: string };
  languageStatus: { en: "supplied" | "missing"; ar: "supplied" | "missing" };
  captionsStatus: "none" | "en" | "ar" | "both";
  transcriptStatus: "none" | "en" | "ar" | "both";
  scriptStatus: "planned" | "outline_ready" | "script_ready";
  state: VideoState;
  asset: null;           // no asset until actually recorded — never a fake URL
  segments: VideoSegment[];
}

export interface BossChallenge {
  id: string; chapterId: string; title: string;
  assessedSkills: string[]; learningObjectives: string[];
  prerequisiteLevels: string[]; structure: string[];
  passRequirement: string; retry: string; remediation: string; unlockReward: string;
  minExercises: number;
}

// ---------------------------------------------------------------------------------------------
// WORLDS
// ---------------------------------------------------------------------------------------------
export const WORLDS: World[] = [
  { id: "W01", title: "Chess Foundations", theme: "board, pieces, check & checkmate" },
  { id: "W02", title: "Tactical Vision", theme: "recognising winning tactics" },
  { id: "W03", title: "Checkmate Patterns", theme: "delivering forced mate" },
  { id: "W04", title: "Calculation", theme: "calculating forcing sequences" },
  { id: "W05", title: "Defensive Thinking", theme: "finding the only defence" },
  { id: "W06", title: "Endgame Technique", theme: "converting reduced-material positions" },
  { id: "W07", title: "Opening Knowledge", theme: "principles and verified lines" },
  { id: "W08", title: "Combined Skills", theme: "multi-concept application" },
  { id: "W09", title: "Advanced Mastery", theme: "hard verified combinations" },
  { id: "W10", title: "Final Challenges", theme: "cumulative assessments" },
];

// Per-chapter authoring data. `skillId` null => planned topic with no verified backing content.
interface ChapterSpec {
  id: string; worldId: string; title: string; skillId: string | null; domain: Domain | null;
  bands: Band[];                 // which difficulty bands get an independent-practice level
  objective: string; before: string; after: string;
  keyConcepts: string[]; teachingSequence: string[]; explanationPlan: string; commonMistakes: string[];
  boss?: boolean;                // chapter ends in a boss assessment
  plannedReason?: string;        // why the chapter is planned (no verified content)
}

export const CHAPTER_SPECS: ChapterSpec[] = [
  // WORLD 1 — Foundations (no verified puzzle content for piece movement: PLANNED)
  { id: "CH01", worldId: "W01", title: "Board & Piece Movement", skillId: null, domain: null, bands: [],
    objective: "Understand the board, coordinates and how each piece moves and captures.",
    before: "No chess knowledge assumed.", after: "The learner can name squares and move every piece legally.",
    keyConcepts: ["files, ranks, diagonals", "piece movement", "captures", "check"],
    teachingSequence: ["board & coordinates", "pawns", "minor pieces", "rooks & queen", "king & check"],
    explanationPlan: "Introduce the board and each piece with simple demonstrations; no tactics yet.",
    commonMistakes: ["confusing file/rank", "illegal bishop/knight moves", "missing a check"],
    plannedReason: "No verified movement-tutorial content exists in the corpus; awaiting authored lessons." },
  { id: "CH02", worldId: "W01", title: "Check & Checkmate Recognition", skillId: "mate_in_one", domain: "checkmate_patterns", bands: ["easy", "medium"],
    objective: "Recognise check and deliver immediate checkmate in one move.",
    before: "Legal moves and what check means.", after: "The learner spots a one-move checkmate reliably.",
    keyConcepts: ["check vs checkmate", "king escape squares", "back-rank idea"],
    teachingSequence: ["what is check", "what makes it mate", "spotting mate in one"],
    explanationPlan: "Contrast check with checkmate; show that mate means no legal reply; practise one-movers.",
    commonMistakes: ["giving check that is not mate", "missing a king escape square", "ignoring interposition"], boss: true },

  // WORLD 2 — Tactical Vision
  { id: "CH03", worldId: "W02", title: "Tactical Vision", skillId: "tactical_recognition", domain: "tactical_vision", bands: ["easy", "medium", "hard", "expert"],
    objective: "Recognise and play the move that wins material.",
    before: "Legal moves, piece values and checkmate recognition.", after: "The learner finds a winning tactic in a variety of positions.",
    keyConcepts: ["undefended pieces", "double attack / fork", "winning material", "discovered attack"],
    teachingSequence: ["spotting loose pieces", "attacking two targets", "winning the exchange", "calculating the grab"],
    explanationPlan: "Teach how to scan for undefended and double-attackable targets, then convert to a material win.",
    commonMistakes: ["grabbing a defended piece", "missing the opponent's recapture", "overlooking a zwischenzug"], boss: true },

  // WORLD 3 — Checkmate Patterns
  { id: "CH04", worldId: "W03", title: "Mate in One", skillId: "mate_in_one", domain: "checkmate_patterns", bands: ["easy", "medium", "hard"],
    objective: "Deliver forced checkmate in a single move across patterns.",
    before: "Checkmate recognition.", after: "The learner reliably finds one-move mates including back-rank and corner patterns.",
    keyConcepts: ["back-rank mate", "corner mate", "support mate"],
    teachingSequence: ["back-rank", "heavy-piece corner", "supported mates"],
    explanationPlan: "Show each mating pattern's geometry and how to confirm the king has no escape.",
    commonMistakes: ["unsupported checking piece", "allowing a flight square", "allowing a block"] },
  { id: "CH05", worldId: "W03", title: "Forced Mating Sequences", skillId: "forced_mate", domain: "checkmate_patterns", bands: ["medium", "hard", "expert"],
    objective: "Calculate a forced mate two to three moves deep.",
    before: "Mate in one.", after: "The learner calculates a short forced mate against every defence.",
    keyConcepts: ["forcing checks", "driving the king", "mating net"],
    teachingSequence: ["forcing the king", "each defence refuted", "the final blow"],
    explanationPlan: "Teach checking sequences that leave the defender no adequate reply, verified against all replies.",
    commonMistakes: ["a non-forcing first move", "missing a defensive interposition", "stalemate instead of mate"], boss: true },

  // WORLD 4 — Calculation
  { id: "CH06", worldId: "W04", title: "Calculating Combinations", skillId: "calculation_combinations", domain: "calculation", bands: ["medium", "hard", "expert"],
    objective: "Calculate a multi-move forcing sequence to a winning material result.",
    before: "Tactical recognition.", after: "The learner calculates the opponent's best reply and reaches a reliable stopping point.",
    keyConcepts: ["candidate moves", "forcing continuations", "opponent's best reply", "stopping point"],
    teachingSequence: ["list candidates", "follow the forcing line", "check the defence", "evaluate the result"],
    explanationPlan: "Teach disciplined calculation: candidates, forcing moves, the critical defence, and when to stop.",
    commonMistakes: ["assuming the opponent cooperates", "stopping calculation too early", "choosing a pretty but refuted line"], boss: true },

  // WORLD 5 — Defensive Thinking
  { id: "CH07", worldId: "W05", title: "Defensive Resources", skillId: "defensive_resources", domain: "defensive_play", bands: ["easy", "medium", "hard", "expert"],
    objective: "Find the only move that avoids losing material or being mated.",
    before: "Tactical recognition (to see the threat).", after: "The learner identifies the threat and the unique saving resource.",
    keyConcepts: ["identifying the threat", "only-move defence", "counterattack as defence"],
    teachingSequence: ["spot the threat", "list defensive candidates", "verify the only adequate one"],
    explanationPlan: "Teach threat-identification first, then comparing defensive candidates to find the one that holds.",
    commonMistakes: ["defending the wrong threat", "a passive move that still loses", "missing an in-between defence"], boss: true },

  // WORLD 6 — Endgame
  { id: "CH08", worldId: "W06", title: "Endgame Conversion", skillId: "endgame_conversion", domain: "endgame", bands: ["easy", "medium", "hard", "expert"],
    objective: "Convert a reduced-material position by winning material or promoting.",
    before: "Basic tactics.", after: "The learner converts a won endgame by force (material gain or promotion).",
    keyConcepts: ["forcing promotion", "winning the last defender", "simplest conversion"],
    teachingSequence: ["identify the winning idea", "force it", "convert cleanly"],
    explanationPlan: "Teach converting concrete, force-verified endings; focus on the forcing path, not general theory.",
    commonMistakes: ["allowing counterplay", "stalemate traps", "promoting into a fork"], boss: true },
  { id: "CH09", worldId: "W06", title: "Endgame Theory (Opposition & Key Squares)", skillId: null, domain: "endgame", bands: [],
    objective: "Master opposition, key squares and theoretical draws in king-and-pawn endings.",
    before: "Endgame conversion.", after: "The learner applies opposition and key-square rules.",
    keyConcepts: ["opposition", "key squares", "triangulation", "theoretical draw"],
    teachingSequence: ["opposition", "key squares", "triangulation", "drawn structures"],
    explanationPlan: "Teach positional endgame rules verified by a tablebase or exact solver.",
    commonMistakes: ["losing the opposition", "wrong-coloured rook-pawn", "misjudging a draw"],
    plannedReason: "These concepts require a tablebase / exact positional solver not available in this environment; no verified content yet." },

  // WORLD 7 — Opening
  { id: "CH10", worldId: "W07", title: "Opening Principles & Lines", skillId: "__openings__", domain: "opening_knowledge", bands: ["easy", "medium", "hard"],
    objective: "Follow a verified opening line and understand its plan: development, centre, king safety.",
    before: "Legal moves and basic tactics.", after: "The learner can play a main opening line and state its plan.",
    keyConcepts: ["development", "centre control", "king safety", "typical plan"],
    teachingSequence: ["opening principles", "a concrete line", "the resulting plan"],
    explanationPlan: "Teach the three principles, then walk a verified line move by move and state the plan.",
    commonMistakes: ["moving the same piece twice", "neglecting king safety", "premature attacks"], boss: true },
  { id: "CH11", worldId: "W07", title: "Opening-Stage Tactics (provisional)", skillId: "opening_stage_tactics", domain: "opening_knowledge", bands: ["easy", "medium", "hard"],
    objective: "Apply tactical vision to positions arising in the opening stage.",
    before: "Tactical recognition.", after: "The learner punishes typical opening mistakes tactically.",
    keyConcepts: ["early development tactics", "punishing a loose move"],
    teachingSequence: ["spot the early tactic", "convert it"],
    explanationPlan: "Practise tactics that arise in the opening; this is tactical practice, NOT verified opening theory.",
    commonMistakes: ["confusing an opening tactic with a theory move"] },

  // WORLD 8 — Combined
  { id: "CH12", worldId: "W08", title: "Combined Skills", skillId: "__mixed__", domain: null, bands: ["medium", "hard"],
    objective: "Apply tactical, calculation and defensive skills in mixed positions.",
    before: "Tactical recognition, calculation and defence.", after: "The learner selects the right skill under uncertainty.",
    keyConcepts: ["skill selection", "mixed tactics/defence/conversion"],
    teachingSequence: ["assess the position", "pick the right method", "execute"],
    explanationPlan: "Mixed practice drawing from several verified skills; teaches when to attack, defend or convert.",
    commonMistakes: ["applying the wrong method", "tunnel vision"], boss: true },

  // WORLD 9 — Advanced
  { id: "CH13", worldId: "W09", title: "Advanced Combinations", skillId: "__advanced__", domain: null, bands: ["hard", "expert"],
    objective: "Solve the hardest verified combinations across domains.",
    before: "All prior chapters.", after: "The learner solves expert-level verified tactics, mates and conversions.",
    keyConcepts: ["deep calculation", "sacrifice", "precise conversion"],
    teachingSequence: ["recognise the idea", "calculate deeply", "convert"],
    explanationPlan: "Hard/expert verified content only; emphasise accuracy and depth.",
    commonMistakes: ["shallow calculation", "missing the quiet move"], boss: true },

  // WORLD 10 — Final
  { id: "CH14", worldId: "W10", title: "Final Challenges & Strategic Application", skillId: "__final__", domain: null, bands: [],
    objective: "Cumulative assessments across every taught skill; strategic application remains future content.",
    before: "Completion of prior worlds.", after: "The learner demonstrates cumulative skill; strategic play is deferred.",
    keyConcepts: ["cumulative assessment", "multi-skill boss"],
    teachingSequence: ["review", "cumulative boss"],
    explanationPlan: "A cumulative boss across all verified skills. Positional/strategic middlegame play is future content.",
    commonMistakes: ["fatigue errors", "misapplying a learned pattern"], boss: true,
    plannedReason: "Strategic/positional middlegame instruction has no verified content; only the cumulative boss is playable." },
];

// ---------------------------------------------------------------------------------------------
// BUILDER — expands chapter specs into concrete, fully-specified levels (deterministic, pure).
// Content-backing (playable vs planned) is decided by the server resolver; here we set the
// structural status: planned chapters -> planned/future_content_required; concept/review ->
// limited (text lesson, video planned); practice/assessment -> ready (confirmed by the resolver).
// ---------------------------------------------------------------------------------------------
const bandLabel: Record<Band, string> = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
const CONTENT_SKILLS = new Set(["mate_in_one", "forced_mate", "tactical_recognition", "calculation_combinations", "defensive_resources", "endgame_conversion", "opening_stage_tactics"]);
// Composite/token "skills" are resolved to content server-side (openings lines, or mixed pools).
export const CONTENT_TOKENS = new Set(["__openings__", "__mixed__", "__advanced__", "__final__"]);
const SETS_PER_BAND = 2; // each band becomes 2 progressive practice sets drawing DISTINCT puzzle subsets
const SET_LABEL = ["A", "B", "C", "D"];
function practiceSkillId(chSkill: string | null): string | null {
  if (chSkill && CONTENT_SKILLS.has(chSkill)) return chSkill;
  if (chSkill && CONTENT_TOKENS.has(chSkill)) return chSkill;
  return null;
}

function videoIdsForChapter(ch: ChapterSpec): { concept: string; demo: string; review: string } {
  return { concept: `V-${ch.id}-CONCEPT`, demo: `V-${ch.id}-DEMO`, review: `V-${ch.id}-REVIEW` };
}

export function buildLevels(): Level[] {
  const levels: Level[] = [];
  let seq = 0;
  for (const ch of CHAPTER_SPECS) {
    // CH01 is the real beginner chapter, built from the foundation lessons (interactive demos +
    // a server-verified rules assessment) rather than the generic puzzle-practice template.
    if (ch.id === "CH01") {
      const fLevels: Level[] = [];
      FOUNDATION_LESSONS.forEach((les, idx) => {
        const isAssess = les.id === FOUNDATION_ASSESSMENT_LEVEL;
        const demoIds = FOUNDATION_DEMOS.filter((d) => d.lessonId === les.id).map((d) => d.id);
        fLevels.push({
          id: les.id, seq: ++seq, worldId: ch.worldId, chapterId: ch.id, title: les.title,
          type: isAssess ? "assessment" : "concept", band: null, status: "ready",
          prerequisites: idx === 0 ? [] : [FOUNDATION_LESSONS[idx - 1].id],
          prerequisiteReason: idx === 0 ? "Entry lesson — no chess knowledge assumed." : "Builds on the previous foundation lesson.",
          domain: null, skillId: isAssess ? "__foundation__" : null, secondarySkillIds: [],
          learningObjective: les.objectiveEn, measurableOutcome: isAssess ? "Pass the server-verified rules assessment." : "Complete the interactive lesson and demonstrations.",
          before: idx === 0 ? "No chess knowledge." : FOUNDATION_LESSONS[idx - 1].title,
          after: les.objectiveEn, keyConcepts: les.concepts,
          teachingSequence: ["concept", "board demonstration", "interactive practice", "recap"],
          explanationPlan: `Teach ${les.title.toLowerCase()} with validated board demonstrations and interactive practice.`,
          commonMistakes: [], minExercises: isAssess ? 1 : 0,
          passCriteria: isAssess ? "Score at least the pass threshold on the rules assessment (server-authoritative)." : "Interactive lesson (ungraded; the gate is the final assessment).",
          masteryCondition: isAssess ? "Foundations completion recorded server-side." : "n/a (lesson)",
          failureRetry: isAssess ? "Retry the assessment; remediation to the relevant lesson." : "Re-read / replay the demonstration.",
          remediation: isAssess ? "CH01-L001" : "", reviewRule: "Foundations are not spaced-review items.",
          videoIds: [`V-${les.id}`], nextLevelId: null,
          contentCoverage: "full", knownLimitations: "",
          demoIds, practiceKindHint: isAssess ? "rules_assessment" : "lesson",
        });
      });
      for (let k = 0; k < fLevels.length; k++) fLevels[k].nextLevelId = fLevels[k + 1]?.id ?? null;
      levels.push(...fLevels);
      continue;
    }
    const planned = ch.skillId === null && !!ch.plannedReason;
    const vids = videoIdsForChapter(ch);
    const chLevels: Level[] = [];
    const mk = (partial: Omit<Level, "seq" | "worldId" | "chapterId" | "nextLevelId">): void => {
      chLevels.push({ ...partial, seq: ++seq, worldId: ch.worldId, chapterId: ch.id, nextLevelId: null });
    };
    const n = (i: number) => `${ch.id}-L${String(i).padStart(3, "0")}`;
    let i = 1;
    // 1) concept level
    mk({
      id: n(i++), title: `${ch.title}: Concepts`, type: "concept", band: null,
      status: planned ? "future_content_required" : "limited",
      prerequisites: [], prerequisiteReason: planned ? "Chapter awaits verified content." : "Introductory concept level.",
      domain: ch.domain, skillId: practiceSkillId(ch.skillId), secondarySkillIds: [],
      learningObjective: ch.objective, measurableOutcome: "Learner proceeds after reading/watching the concept lesson.",
      before: ch.before, after: ch.after, keyConcepts: ch.keyConcepts, teachingSequence: ch.teachingSequence,
      explanationPlan: ch.explanationPlan, commonMistakes: ch.commonMistakes, minExercises: 0,
      passCriteria: "Acknowledge the concept lesson (no graded exercise).", masteryCondition: "n/a (concept only)",
      failureRetry: "Re-read the lesson.", remediation: "", reviewRule: "Not review-scheduled (concept).",
      videoIds: [vids.concept], contentCoverage: planned ? "none" : "partial",
      knownLimitations: planned ? (ch.plannedReason ?? "") : "Text lesson available; explanatory video is planned, not yet recorded.",
    });
    const conceptId = n(i - 1);
    const pSkill = practiceSkillId(ch.skillId);
    let prevPracticeId = conceptId;
    // 2) practice levels: SETS_PER_BAND progressive sets per band (each set draws a DISTINCT puzzle
    //    subset; sets beyond available content are marked planned by the server resolver).
    for (let b = 0; b < ch.bands.length; b++) {
      const band = ch.bands[b];
      for (let s = 0; s < SETS_PER_BAND; s++) {
        const first = b === 0 && s === 0;
        const type: LevelType = first ? "guided_practice" : "independent_practice";
        mk({
          id: n(i++), title: `${ch.title}: ${bandLabel[band]} Practice ${SET_LABEL[s]}`, type, band,
          status: "ready", // confirmed/overridden by the server resolver using real eligibility counts
          prerequisites: [prevPracticeId], prerequisiteReason: first ? "Requires the chapter concept before practising." : "Builds on the previous practice set (progressive difficulty).",
          domain: ch.domain, skillId: pSkill, secondarySkillIds: [],
          learningObjective: `${ch.objective} (${band} difficulty, set ${SET_LABEL[s]})`,
          measurableOutcome: `Solve the required ${band} exercises (distinct set ${SET_LABEL[s]}) with server-verified correctness.`,
          before: ch.before, after: ch.after, keyConcepts: ch.keyConcepts, teachingSequence: ch.teachingSequence,
          explanationPlan: ch.explanationPlan, commonMistakes: ch.commonMistakes,
          minExercises: first ? 3 : 4,
          passCriteria: `Solve at least the required number of ${band} exercises (server-authoritative).`,
          masteryCondition: "Contributes to the backing skill's R2/R5 proficiency (distinct solves + success rate).",
          failureRetry: "Unlimited retries; a wrong move resets the puzzle streak.", remediation: conceptId,
          reviewRule: "Solved items enter R2 spaced repetition and resurface when due.",
          videoIds: [vids.demo], contentCoverage: "full",
          knownLimitations: ch.skillId === "opening_stage_tactics" ? "Provisional mapping: opening-stage tactics, not verified opening theory."
            : ch.skillId === "__openings__" ? "Backed by project-authored verified opening lines (not human-reviewed theory)." : "",
        });
        prevPracticeId = n(i - 1);
      }
    }
    // 3) review level (only for content-backed chapters)
    if (!planned && ch.bands.length > 0) {
      mk({
        id: n(i++), title: `${ch.title}: Review`, type: "review", band: null, status: "limited",
        prerequisites: [conceptId], prerequisiteReason: "Reviews items already practised in this chapter.",
        domain: ch.domain, skillId: practiceSkillId(ch.skillId), secondarySkillIds: [],
        learningObjective: `Retain ${ch.title.toLowerCase()} via spaced review.`,
        measurableOutcome: "Clear all due review items for this skill.", before: ch.after,
        after: "Retained skill after a delay.", keyConcepts: ch.keyConcepts, teachingSequence: ["review due items"],
        explanationPlan: "No new teaching; spaced repetition of previously solved items.", commonMistakes: ch.commonMistakes,
        minExercises: 0, passCriteria: "No review items currently due, or all due items cleared.",
        masteryCondition: "Retention reflected by R2 review state.", failureRetry: "Items reschedule per SM-2.",
        remediation: conceptId, reviewRule: "This level IS the review surface for the chapter.",
        videoIds: [vids.review], contentCoverage: "partial", knownLimitations: "Depends on prior practice; empty until items are due.",
      });
    }
    // 4) assessment / boss
    if (ch.boss) {
      mk({
        id: n(i++), title: `${ch.title}: Chapter Boss`, type: "boss_challenge", band: "hard", status: "ready",
        prerequisites: chLevels.filter((l) => l.type === "independent_practice" || l.type === "guided_practice").map((l) => l.id),
        prerequisiteReason: "Must practise the chapter's exercises before the cumulative boss.",
        domain: ch.domain, skillId: practiceSkillId(ch.skillId), secondarySkillIds: [],
        learningObjective: `Apply ${ch.title.toLowerCase()} under assessment across multiple exercises.`,
        measurableOutcome: "Pass the multi-exercise boss with the required success rate (server-authoritative).",
        before: ch.after, after: "Demonstrated chapter mastery.", keyConcepts: ch.keyConcepts,
        teachingSequence: ["recognise", "calculate", "execute"], explanationPlan: "No new teaching; a graded multi-step assessment.",
        commonMistakes: ch.commonMistakes, minExercises: 5,
        passCriteria: "Solve the required boss exercises at the chapter difficulty (server-verified).",
        masteryCondition: "Boss pass + sufficient R2 evidence in the backing skill.",
        failureRetry: "Retry allowed; remediation to the chapter practice levels on failure.",
        remediation: conceptId, reviewRule: "Boss items are review-eligible like any solved puzzle.",
        videoIds: [vids.review], contentCoverage: "full", knownLimitations: "",
      });
    } else if (!planned && ch.bands.length > 0) {
      // non-boss content chapters still get a plain assessment
      mk({
        id: n(i++), title: `${ch.title}: Assessment`, type: "assessment", band: "medium", status: "ready",
        prerequisites: chLevels.filter((l) => l.type === "independent_practice" || l.type === "guided_practice").map((l) => l.id),
        prerequisiteReason: "Assesses after the chapter's practice.", domain: ch.domain,
        skillId: practiceSkillId(ch.skillId), secondarySkillIds: [],
        learningObjective: `Demonstrate ${ch.title.toLowerCase()} on fresh exercises.`,
        measurableOutcome: "Pass the assessment set (server-authoritative).", before: ch.after,
        after: "Verified chapter skill.", keyConcepts: ch.keyConcepts, teachingSequence: ["assess"],
        explanationPlan: "Graded assessment, no new teaching.", commonMistakes: ch.commonMistakes, minExercises: 4,
        passCriteria: "Solve the required assessment exercises (server-verified).",
        masteryCondition: "Assessment pass + R2 evidence.", failureRetry: "Retry; remediation to practice.",
        remediation: conceptId, reviewRule: "Review-eligible.", videoIds: [vids.review], contentCoverage: "full", knownLimitations: "",
      });
    }
    // wire nextLevelId within chapter
    for (let k = 0; k < chLevels.length; k++) chLevels[k].nextLevelId = chLevels[k + 1]?.id ?? null;
    levels.push(...chLevels);
  }
  // cross-chapter nextLevel: last level of a chapter points to first of the next
  for (let k = 0; k < levels.length; k++) if (levels[k].nextLevelId === null) levels[k].nextLevelId = levels[k + 1]?.id ?? null;
  // R7.2 GATE: CH02 begins only after the CH01 foundations assessment is passed (server-authoritative).
  const firstCh02 = levels.find((l) => l.chapterId === "CH02");
  if (firstCh02 && !firstCh02.prerequisites.includes(FOUNDATION_ASSESSMENT_LEVEL)) {
    firstCh02.prerequisites = [FOUNDATION_ASSESSMENT_LEVEL, ...firstCh02.prerequisites];
    firstCh02.prerequisiteReason = "Requires completing the CH01 Beginner Rules Assessment (foundations).";
  }
  return levels;
}

export const LEVELS: Level[] = buildLevels();
export const CHAPTERS: Chapter[] = CHAPTER_SPECS.map((c) => ({ id: c.id, worldId: c.worldId, title: c.title, skillId: CONTENT_SKILLS.has(c.skillId ?? "") ? c.skillId : null, backingDomain: c.domain }));
export function getLevel(id: string): Level | undefined { return LEVELS.find((l) => l.id === id); }
export function levelsForChapter(chapterId: string): Level[] { return LEVELS.filter((l) => l.chapterId === chapterId); }

// The curriculum skill a chapter draws practice from (resolved to puzzle ids server-side). Special
// tokens __openings__ / __mixed__ / __advanced__ / __final__ are resolved by the server resolver.
export function chapterPracticeSkill(chapterId: string): string | null {
  const c = CHAPTER_SPECS.find((x) => x.id === chapterId);
  return c ? c.skillId : null;
}
