// Deterministic campaign-integrity validator. Structural correctness only (not pedagogical review).
// Takes the catalog + the resolved content map (puzzle/opening availability) so it runs in tests.
import { LEVELS, CHAPTERS, WORLDS, type Level } from "@/features/campaign/lib/catalog";
import { VIDEO_LESSONS, BOSSES } from "@/features/campaign/lib/videos";
import { missingPrereqs, detectCycle } from "@/features/campaign/lib/graph";

export interface Finding { severity: "error" | "warning"; code: string; detail: string }

export function validateCampaign(resolved: Record<string, { playable: boolean }>): { ok: boolean; findings: Finding[] } {
  const f: Finding[] = [];
  const levelIds = new Set<string>();
  const chapterIds = new Set(CHAPTERS.map((c) => c.id));
  const worldIds = new Set(WORLDS.map((w) => w.id));

  for (const l of LEVELS) {
    if (levelIds.has(l.id)) f.push({ severity: "error", code: "DUP_LEVEL_ID", detail: l.id });
    levelIds.add(l.id);
    if (!/^CH\d\d-L\d\d\d$/.test(l.id)) f.push({ severity: "error", code: "BAD_LEVEL_ID", detail: l.id });
    if (!worldIds.has(l.worldId)) f.push({ severity: "error", code: "BAD_WORLD_REF", detail: `${l.id}->${l.worldId}` });
    if (!chapterIds.has(l.chapterId)) f.push({ severity: "error", code: "BAD_CHAPTER_REF", detail: `${l.id}->${l.chapterId}` });
    if (!l.learningObjective || l.learningObjective.length < 10) f.push({ severity: "error", code: "MISSING_OBJECTIVE", detail: l.id });
    if (!l.measurableOutcome) f.push({ severity: "error", code: "MISSING_OUTCOME", detail: l.id });
    if (l.videoIds.length === 0) f.push({ severity: "error", code: "NO_VIDEO_BRIEF", detail: l.id });
    // a graded, playable level must have practice content + an assessment path in its chapter
    const r = resolved[l.id];
    const graded = l.type === "guided_practice" || l.type === "independent_practice" || l.type === "assessment" || l.type === "boss_challenge";
    if (graded && r && r.playable) {
      // playable graded level must require at least one exercise
      if (l.minExercises < 1) f.push({ severity: "error", code: "PLAYABLE_NO_EXERCISES", detail: l.id });
    }
  }
  // every chapter with playable practice must contain an assessment or boss
  for (const c of CHAPTERS) {
    const lv = LEVELS.filter((x) => x.chapterId === c.id);
    const hasPlayablePractice = lv.some((x) => (x.type === "guided_practice" || x.type === "independent_practice") && resolved[x.id]?.playable);
    const hasAssessment = lv.some((x) => (x.type === "assessment" || x.type === "boss_challenge") && resolved[x.id]?.playable);
    if (hasPlayablePractice && !hasAssessment) f.push({ severity: "error", code: "CHAPTER_NO_ASSESSMENT", detail: c.id });
  }
  // prerequisite graph
  for (const m of missingPrereqs()) f.push({ severity: "error", code: "MISSING_PREREQ", detail: `${m.level}->${m.missing}` });
  const cycle = detectCycle();
  if (cycle.length) f.push({ severity: "error", code: "PREREQ_CYCLE", detail: cycle.join("->") });

  // videos: unique ids, level refs resolve, no asset/url on planned videos
  const vids = new Set<string>();
  for (const v of VIDEO_LESSONS) {
    if (vids.has(v.id)) f.push({ severity: "error", code: "DUP_VIDEO_ID", detail: v.id });
    vids.add(v.id);
    for (const lvId of v.levelIds) if (!levelIds.has(lvId)) f.push({ severity: "error", code: "VIDEO_BAD_LEVEL_REF", detail: `${v.id}->${lvId}` });
    if (v.levelIds.length === 0) f.push({ severity: "error", code: "ORPHAN_VIDEO", detail: v.id });
    if (v.state === "published" && v.asset === null) f.push({ severity: "error", code: "PUBLISHED_WITHOUT_ASSET", detail: v.id });
    if (v.asset !== null) f.push({ severity: "error", code: "UNEXPECTED_VIDEO_ASSET", detail: v.id }); // R7: all planned, no assets
  }
  // every level references at least one existing video
  for (const l of LEVELS) for (const vId of l.videoIds) if (!vids.has(vId)) f.push({ severity: "error", code: "LEVEL_BAD_VIDEO_REF", detail: `${l.id}->${vId}` });

  // bosses: chapter + prereq refs resolve
  for (const b of BOSSES) {
    if (!chapterIds.has(b.chapterId)) f.push({ severity: "error", code: "BOSS_BAD_CHAPTER", detail: b.id });
    for (const p of b.prerequisiteLevels) if (!levelIds.has(p)) f.push({ severity: "error", code: "BOSS_BAD_PREREQ", detail: `${b.id}->${p}` });
    if (b.assessedSkills.length === 0) f.push({ severity: "error", code: "BOSS_NO_SKILLS", detail: b.id });
  }

  return { ok: f.every((x) => x.severity !== "error"), findings: f };
}
