// Video-lesson registry + boss challenges, generated from the authoritative chapter specs. Video
// lessons are PLANNED metadata only — no asset references, no URLs, no runtimes. A video attaches
// later via its stable id without restructuring the campaign. Arabic is first-class but marked
// "missing" until actually supplied (never claimed when absent).
import { CHAPTER_SPECS, LEVELS, type VideoLesson, type BossChallenge, type VideoType } from "@/features/campaign/lib/catalog";
import { FOUNDATION_LESSONS, FOUNDATION_DEMOS } from "@/features/campaign/lib/foundations";

const CONTENT_SKILLS = new Set(["mate_in_one", "forced_mate", "tactical_recognition", "calculation_combinations", "defensive_resources", "endgame_conversion", "opening_stage_tactics"]);

function conceptVideoType(domain: string | null): VideoType {
  switch (domain) {
    case "opening_knowledge": return "opening_lesson";
    case "endgame": return "endgame_lesson";
    case "defensive_play": return "defensive_lesson";
    case "calculation": return "calculation_lesson";
    default: return "concept_explanation";
  }
}

// R7.1 pilot (CH02): Arabic fields supplied + full recording scripts written (docs/video-scripts/),
// so these three videos advance to script_ready. All other videos remain planned. No asset is set
// — scripts exist, nothing has been recorded/reviewed/published.
const PILOT_CHAPTER = "CH02";
const PILOT_AR: Record<string, { titleAr: string; objectiveAr: string }> = {
  "V-CH02-CONCEPT": { titleAr: "الكش والكش مات: المفهوم", objectiveAr: "تمييز الكش عن الكش مات ومعرفة متى يكون الكش نهاية للمباراة." },
  "V-CH02-DEMO": { titleAr: "أمثلة محلولة على الكش مات", objectiveAr: "تنفيذ كش مات في نقلة واحدة عبر أنماط الصف الأخير ومات الصندوق." },
  "V-CH02-REVIEW": { titleAr: "مراجعة تحدي زعيم الفصل", objectiveAr: "الاستعداد لتحدي الزعيم: إيجاد المات في نقلة والتأكد من عدم وجود مهرب." },
};

export function buildVideoLessons(): VideoLesson[] {
  const out: VideoLesson[] = [];
  // CH01 foundation lesson videos — one per lesson, Arabic supplied + script_ready (scripts on disk
  // under docs/video-scripts/). No assets; nothing recorded/reviewed/published.
  for (const les of FOUNDATION_LESSONS) {
    const demos = FOUNDATION_DEMOS.filter((d) => d.lessonId === les.id);
    out.push({
      id: `V-${les.id}`, type: les.id.endsWith("L012") ? "level_review" : "concept_explanation",
      titleEn: les.title, titleAr: les.title, descriptionEn: les.objectiveEn,
      objectiveEn: les.objectiveEn, objectiveAr: les.objectiveAr,
      skillIds: [], chapterIds: ["CH01"], levelIds: [les.id], supportingPuzzleSkill: null, keyConcepts: les.concepts,
      productionBrief: {
        purpose: `Teach ${les.title.toLowerCase()} to an absolute beginner.`, outcome: les.objectiveEn,
        hook: `A simple question that reveals why ${les.concepts[0]} matters.`, outline: ["concept", "board demo", "practice", "recap"],
        boardDemos: demos.length ? demos.map((d) => `${d.id} (${d.shows})`).join(", ") : "interactive square/coordinate practice",
        misconceptions: "Beginner misconceptions specific to this rule.", recap: les.objectiveEn,
        followUp: `Complete ${les.id} interactive practice in ChessMaster.`, requiredMedia: "Board diagrams, highlighted squares, arrows, move animation.",
        expectedLength: "estimated 3–6 min",
      },
      languageStatus: { en: "supplied", ar: "supplied" }, captionsStatus: "none", transcriptStatus: "ar",
      scriptStatus: "script_ready", state: "script_ready", asset: null, segments: [],
    });
  }
  for (const ch of CHAPTER_SPECS) {
    if (ch.id === "CH01") continue; // CH01 videos handled above (per lesson)
    const chLevels = LEVELS.filter((l) => l.chapterId === ch.id);
    const skillIds = CONTENT_SKILLS.has(ch.skillId ?? "") ? [ch.skillId!] : [];
    const planned = ch.skillId === null && !!ch.plannedReason;
    const base = {
      skillIds, chapterIds: [ch.id],
      languageStatus: { en: "supplied" as const, ar: "missing" as const }, // EN briefs supplied; AR pending
      captionsStatus: "none" as const, transcriptStatus: "none" as const,
      scriptStatus: "planned" as const, state: "planned" as const, asset: null, segments: [],
    };
    // concept explanation video (supports every level in the chapter)
    out.push({
      id: `V-${ch.id}-CONCEPT`, type: conceptVideoType(ch.domain),
      titleEn: `${ch.title}: Concept`, titleAr: "",
      descriptionEn: `Explains the core idea of "${ch.title}".`,
      objectiveEn: ch.objective, objectiveAr: "",
      levelIds: chLevels.map((l) => l.id), supportingPuzzleSkill: skillIds[0] ?? null, keyConcepts: ch.keyConcepts,
      productionBrief: {
        purpose: `Teach the central idea of ${ch.title.toLowerCase()} before practice.`,
        outcome: ch.after, hook: `Pose a position where ${ch.keyConcepts[0]} decides the game.`,
        outline: ch.teachingSequence, boardDemos: `Demonstrate ${ch.keyConcepts.join(", ")} on verified example positions.`,
        misconceptions: ch.commonMistakes.join("; "), recap: `Recap: ${ch.objective}`,
        followUp: `Then attempt the ${ch.title} practice levels.`,
        requiredMedia: "Board diagrams with highlighted squares and arrows for each demonstrated idea.",
        expectedLength: planned ? "TBD (content not yet available)" : "estimated 4–8 min (based on the outline)",
      },
      ...base,
    });
    if (ch.bands.length > 0) {
      // guided demonstration video
      out.push({
        id: `V-${ch.id}-DEMO`, type: ch.domain === "opening_knowledge" ? "opening_lesson" : "guided_example",
        titleEn: `${ch.title}: Worked Examples`, titleAr: "",
        descriptionEn: `Worked, verified examples of ${ch.title.toLowerCase()}.`,
        objectiveEn: `Walk through solved ${ch.title.toLowerCase()} exercises step by step.`, objectiveAr: "",
        levelIds: chLevels.filter((l) => l.type === "guided_practice" || l.type === "independent_practice").map((l) => l.id),
        supportingPuzzleSkill: skillIds[0] ?? null, keyConcepts: ch.keyConcepts,
        productionBrief: {
          purpose: `Show the solving method on real verified ${ch.title.toLowerCase()} positions.`,
          outcome: "Learner can reproduce the method on new positions.",
          hook: "Start from a position the learner will soon face in practice.",
          outline: ["present the position", "find candidate moves", "calculate the critical line", "confirm the result"],
          boardDemos: "Step through 2–3 verified puzzles of this skill (ids resolved from the server-only corpus).",
          misconceptions: ch.commonMistakes.join("; "), recap: "Recap the repeatable method.",
          followUp: "Attempt the independent-practice levels.", requiredMedia: "Move-by-move board animation with arrows.",
          expectedLength: "estimated 5–10 min",
        },
        ...base, scriptStatus: "planned", state: "planned",
      });
    }
    if (ch.boss || ch.bands.length > 0) {
      out.push({
        id: `V-${ch.id}-REVIEW`, type: ch.boss ? "boss_challenge_explanation" : "chapter_review",
        titleEn: ch.boss ? `${ch.title}: Boss Review` : `${ch.title}: Chapter Review`, titleAr: "",
        descriptionEn: `How to approach the ${ch.title} ${ch.boss ? "boss challenge" : "review & assessment"}.`,
        objectiveEn: `Prepare the learner for the multi-step ${ch.title.toLowerCase()} boss.`, objectiveAr: "",
        levelIds: chLevels.filter((l) => l.type === "boss_challenge" || l.type === "review" || l.type === "assessment").map((l) => l.id),
        supportingPuzzleSkill: skillIds[0] ?? null, keyConcepts: ch.keyConcepts,
        productionBrief: {
          purpose: "Prepare the learner for the cumulative boss.", outcome: "Learner passes the boss.",
          hook: "Preview a boss-style multi-step position.", outline: ["recap the chapter", "boss strategy", "time to attempt"],
          boardDemos: "One representative boss-style sequence.", misconceptions: ch.commonMistakes.join("; "),
          recap: "Recap the chapter before the boss.", followUp: "Attempt the boss.",
          requiredMedia: "Board animation of a representative boss sequence.", expectedLength: "estimated 4–7 min",
        },
        ...base,
      });
    }
  }
  // Apply pilot (CH02) overrides: supply Arabic + advance to script_ready (scripts exist on disk).
  for (const v of out) {
    if (v.chapterIds.includes(PILOT_CHAPTER) && PILOT_AR[v.id]) {
      v.titleAr = PILOT_AR[v.id].titleAr;
      v.objectiveAr = PILOT_AR[v.id].objectiveAr;
      v.languageStatus = { en: "supplied", ar: "supplied" };
      v.transcriptStatus = "ar"; // Arabic transcript drafted from the script
      v.captionsStatus = "none"; // caption TIMING needs real audio — not claimed
      v.scriptStatus = "script_ready";
      v.state = "script_ready"; // scripted, NOT recorded/reviewed/published; asset stays null
    }
  }
  return out;
}

export const VIDEO_LESSONS: VideoLesson[] = buildVideoLessons();

export function buildBosses(): BossChallenge[] {
  const out: BossChallenge[] = [];
  for (const ch of CHAPTER_SPECS) {
    if (!ch.boss) continue;
    const bossLevel = LEVELS.find((l) => l.chapterId === ch.id && l.type === "boss_challenge");
    if (!bossLevel) continue;
    const skillIds = CONTENT_SKILLS.has(ch.skillId ?? "") ? [ch.skillId!] : [];
    out.push({
      id: `BOSS-${ch.id}`, chapterId: ch.id, title: `${ch.title} Boss`,
      assessedSkills: skillIds.length ? skillIds : ["tactical_recognition", "calculation_combinations", "defensive_resources"],
      learningObjectives: [ch.objective],
      prerequisiteLevels: bossLevel.prerequisites, structure: ["recognise the idea", "identify candidate moves", "calculate the critical reply", "find the correct continuation", "avoid the attractive-but-wrong line"],
      passRequirement: `Solve ${bossLevel.minExercises} boss exercises at ${bossLevel.band} difficulty (server-authoritative), each verified correct.`,
      retry: "Retry permitted after remediation.", remediation: "Return to the chapter practice levels.",
      unlockReward: "Unlocks the next chapter.", minExercises: bossLevel.minExercises,
    });
  }
  return out;
}

export const BOSSES: BossChallenge[] = buildBosses();
