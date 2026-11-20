// R7 campaign audit + report generator. Single source of truth = the typed catalog; every report
// (3 JSON + 4 Markdown) is generated here. Parses the verified corpus + openings as text (avoids
// the server-only import) to resolve real practice content. Fails (exit 1) on any validator error.
//   node --experimental-strip-types --import ./tests/register-alias.mjs scripts/audit-campaign.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WORLDS, CHAPTERS, CHAPTER_SPECS, LEVELS, type Level } from "@/features/campaign/lib/catalog";
import { VIDEO_LESSONS, BOSSES } from "@/features/campaign/lib/videos";
import { resolveCampaignPure, type Candidate } from "@/features/campaign/lib/resolve";
import { validateCampaign } from "@/features/campaign/lib/validate";
import { skillForPuzzle } from "@/features/curriculum/lib/catalog";

const HERE = dirname(fileURLToPath(import.meta.url));
const docs = (f: string) => join(HERE, "..", "docs", f);

// ---- parse the verified corpus + openings (text, no server-only import) ----
const PSRC = readFileSync(join(HERE, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(PSRC.slice(PSRC.indexOf("[{"), PSRC.indexOf("}]") + 2)) as { id: number; domain: string; theme: string; difficulty: string }[];
const elig: Record<string, Candidate[]> = {};
for (const p of PUZZLES) { const sk = skillForPuzzle(p); if (!sk) continue; (elig[sk] ??= []).push({ id: p.id, difficulty: p.difficulty }); }
const OSRC = readFileSync(join(HERE, "..", "src", "features", "openings", "lib", "data.ts"), "utf8");
const OPENINGS = (JSON.parse(OSRC.slice(OSRC.indexOf("[{"), OSRC.lastIndexOf("}]") + 2)) as { id: string; tier: string }[]).map((o) => ({ id: o.id, tier: o.tier }));

const resolved = resolveCampaignPure(elig, OPENINGS);
const validation = validateCampaign(resolved);

// ---- status rollups ----
const effStatus = (l: Level) => (l.type === "concept" || l.type === "review") ? l.status : resolved[l.id].status;
const statusCounts: Record<string, number> = {};
for (const l of LEVELS) statusCounts[effStatus(l)] = (statusCounts[effStatus(l)] ?? 0) + 1;
const playable = LEVELS.filter((l) => resolved[l.id].playable).length;

// =================== MACHINE-READABLE REPORTS ===================
const campaignJson = {
  generatedAt: new Date().toISOString(),
  worlds: WORLDS, chapters: CHAPTERS,
  summary: { worlds: WORLDS.length, chapters: CHAPTERS.length, levels: LEVELS.length, playable, statusCounts, videos: VIDEO_LESSONS.length, bosses: BOSSES.length },
  levels: LEVELS.map((l) => ({
    id: l.id, seq: l.seq, worldId: l.worldId, chapterId: l.chapterId, title: l.title, type: l.type, band: l.band,
    status: effStatus(l), domain: l.domain, skillId: l.skillId, objective: l.learningObjective,
    prerequisites: l.prerequisites, nextLevelId: l.nextLevelId, videoIds: l.videoIds,
    practiceKind: resolved[l.id].practiceKind, practiceCount: resolved[l.id].itemCount, minExercises: resolved[l.id].minExercises,
    playable: resolved[l.id].playable,
  })),
  bosses: BOSSES,
  validation,
};
writeFileSync(docs("chessmaster-campaign.json"), JSON.stringify(campaignJson, null, 2) + "\n");

const levelReportsJson = LEVELS.map((l) => ({
  ...l, effectiveStatus: effStatus(l), practiceKind: resolved[l.id].practiceKind,
  practiceItemIds: resolved[l.id].itemIds, practiceCount: resolved[l.id].itemCount, playable: resolved[l.id].playable,
}));
writeFileSync(docs("chessmaster-level-reports.json"), JSON.stringify(levelReportsJson, null, 2) + "\n");

writeFileSync(docs("chessmaster-video-catalog.json"), JSON.stringify({ generatedAt: new Date().toISOString(), count: VIDEO_LESSONS.length, videos: VIDEO_LESSONS }, null, 2) + "\n");

// =================== MARKDOWN REPORTS ===================
const worldTitle = (id: string) => WORLDS.find((w) => w.id === id)?.title ?? id;
const chapterTitle = (id: string) => CHAPTERS.find((c) => c.id === id)?.title ?? id;

// --- blueprint ---
let bp = `# ChessMaster Campaign Blueprint\n\nGenerated from the authoritative catalog (src/features/campaign/lib/catalog.ts). Do not edit by hand.\n\n`;
bp += `## Overview\n- Worlds: ${WORLDS.length}\n- Chapters: ${CHAPTERS.length}\n- Levels: ${LEVELS.length}\n- Playable (content-backed) levels: ${playable}\n- Status breakdown: ${JSON.stringify(statusCounts)}\n- Video lessons (all PLANNED, no assets): ${VIDEO_LESSONS.length}\n- Boss challenges: ${BOSSES.length}\n\n`;
bp += `## Educational Philosophy\nA connected path: concept → guided practice → independent practice → review → assessment/boss, with prerequisites and spaced review. Only content the verified corpus supports is marked playable; unsupported concepts (piece-movement tutorials, endgame opposition/key-squares, strategic middlegame) are explicitly planned/future_content_required, never faked.\n\n`;
bp += `## Worlds & Chapters\n`;
for (const w of WORLDS) {
  bp += `\n### ${w.id} — ${w.title}\n_${w.theme}_\n`;
  for (const c of CHAPTER_SPECS.filter((c) => c.worldId === w.id)) {
    const lv = LEVELS.filter((l) => l.chapterId === c.id);
    const pl = lv.filter((l) => resolved[l.id].playable).length;
    bp += `- **${c.id} ${c.title}** — ${lv.length} levels (${pl} playable). Objective: ${c.objective}${c.plannedReason ? `  \n  _Planned: ${c.plannedReason}_` : ""}\n`;
  }
}
bp += `\n## Progression & Unlock Rules\nA level unlocks when all prerequisite levels are passed (server-authoritative). A graded level is passed when the learner solves ≥ its required exercises (server-verified via puzzle_solves / R2). Concept & review levels are ungraded. Mastery reuses R2/R5 skill evidence; no XP-only unlocks.\n\n`;
bp += `## Boss Challenges\n`;
for (const b of BOSSES) bp += `- **${b.id}** (${chapterTitle(b.chapterId)}): assesses ${b.assessedSkills.join(", ")}; pass: ${b.passRequirement}\n`;
bp += `\n## Final Assessment\nWorld 10 / CH14 provides a cumulative boss across all verified skills. Strategic/positional middlegame instruction is future content.\n\n## Known Educational Limitations\n`;
for (const c of CHAPTER_SPECS.filter((c) => c.plannedReason)) bp += `- ${c.id} ${c.title}: ${c.plannedReason}\n`;
writeFileSync(docs("CHESSMASTER-CAMPAIGN-BLUEPRINT.md"), bp);

// --- level reports (every level, full template) ---
let lr = `# ChessMaster Level Reports\n\nGenerated from the authoritative catalog. Every one of the ${LEVELS.length} levels is below.\n`;
for (const l of LEVELS) {
  const r = resolved[l.id];
  lr += `\n---\n\n## ${l.id} — ${l.title}\n`;
  lr += `- **Level number (seq):** ${l.seq}\n- **World / Chapter:** ${worldTitle(l.worldId)} / ${chapterTitle(l.chapterId)}\n`;
  lr += `- **Type:** ${l.type}\n- **Difficulty band:** ${l.band ?? "n/a"}\n- **Publication status:** ${effStatus(l)}${r.playable ? " (content-backed)" : ""}\n`;
  lr += `- **Prerequisites:** ${l.prerequisites.join(", ") || "none"}\n- **Prerequisite reason:** ${l.prerequisiteReason}\n`;
  lr += `- **Primary domain:** ${l.domain ?? "n/a"}\n- **Primary skill:** ${l.skillId ?? "n/a"}\n- **Secondary skills:** ${l.secondarySkillIds.join(", ") || "none"}\n`;
  lr += `- **Learning objective:** ${l.learningObjective}\n- **Measurable outcome:** ${l.measurableOutcome}\n`;
  lr += `- **Before:** ${l.before}\n- **After:** ${l.after}\n`;
  lr += `- **Key concepts:** ${l.keyConcepts.join(", ")}\n- **Teaching sequence:** ${l.teachingSequence.join(" → ")}\n`;
  lr += `- **Explanation plan:** ${l.explanationPlan}\n- **Common mistakes:** ${l.commonMistakes.join("; ")}\n`;
  lr += `- **Practice material:** ${r.practiceKind === "none" ? "n/a (no graded practice)" : `${r.itemCount} ${r.practiceKind} (ids: ${r.itemIds.join(", ") || "none yet"})`}\n`;
  lr += `- **Practice sequence:** attempt required items in order; wrong move resets streak.\n`;
  lr += `- **Hint strategy:** server-issued next-move hint (resets streak), reusing the puzzle hint route.\n`;
  lr += `- **Assessment:** ${l.minExercises > 0 ? `solve ≥ ${r.minExercises} items` : "none (concept/review)"}\n- **Pass criteria:** ${l.passCriteria}\n- **Mastery condition:** ${l.masteryCondition}\n`;
  lr += `- **Failure / retry:** ${l.failureRetry}\n- **Remediation:** ${l.remediation || "n/a"}\n- **Review rule:** ${l.reviewRule}\n`;
  lr += `- **Video lesson references:** ${l.videoIds.join(", ")}\n`;
  const v = VIDEO_LESSONS.find((x) => x.id === l.videoIds[0]);
  if (v) lr += `- **Video production brief:** ${v.productionBrief.purpose} Outline: ${v.productionBrief.outline.join(" → ")}. Media: ${v.productionBrief.requiredMedia} Length: ${v.productionBrief.expectedLength}. State: ${v.state} (script ${v.scriptStatus}).\n`;
  lr += `- **Next level:** ${l.nextLevelId ?? "none"}\n- **Content coverage:** ${l.contentCoverage}\n- **Known limitations:** ${l.knownLimitations || "none"}\n`;
}
writeFileSync(docs("CHESSMASTER-LEVEL-REPORTS.md"), lr);

// --- video production plan ---
let vp = `# ChessMaster Video Production Plan\n\nGenerated from the catalog. All ${VIDEO_LESSONS.length} videos are PLANNED — no assets, no URLs, no runtimes. Arabic is first-class but marked missing until supplied.\n\n`;
vp += `## Recommended recording order (dependency-aware)\nRecord concept videos before their chapter's demo/boss videos; record foundational chapters (World 1–3) before advanced ones. Shared concept videos support every level in their chapter.\n\n`;
vp += `## Inventory\n`;
for (const v of VIDEO_LESSONS) {
  vp += `\n### ${v.id} — ${v.titleEn}\n`;
  vp += `- Type: ${v.type} | State: ${v.state} | Script: ${v.scriptStatus}\n- Chapters: ${v.chapterIds.join(", ")} | Supports ${v.levelIds.length} levels\n- Skills: ${v.skillIds.join(", ") || "n/a"}\n- Objective (EN): ${v.objectiveEn}\n- Language: EN ${v.languageStatus.en} / AR ${v.languageStatus.ar}; captions ${v.captionsStatus}; transcript ${v.transcriptStatus}\n`;
  vp += `- Brief: ${v.productionBrief.purpose} Hook: ${v.productionBrief.hook} Outline: ${v.productionBrief.outline.join(" → ")}. Demos: ${v.productionBrief.boardDemos} Misconceptions: ${v.productionBrief.misconceptions} Recap: ${v.productionBrief.recap} Follow-up: ${v.productionBrief.followUp} Media: ${v.productionBrief.requiredMedia} Length: ${v.productionBrief.expectedLength}\n`;
}
writeFileSync(docs("CHESSMASTER-VIDEO-PRODUCTION-PLAN.md"), vp);

// --- architecture ---
let arch = `# ChessMaster Campaign Architecture\n\nGenerated summary of the R7 connected educational system.\n\n`;
arch += `## Source of truth\n- \`src/features/campaign/lib/catalog.ts\` — worlds, chapters, levels (stable ids CHxx-Lyyy), video registry inputs, boss inputs.\n- \`videos.ts\` — generated video lessons + bosses.\n- \`resolve.ts\` — pure resolver (level → real puzzle/opening ids, playable vs planned).\n- \`eligibility.server.ts\` — server-only wrapper feeding the verified corpus.\n- \`graph.ts\` / \`progress.ts\` / \`validate.ts\` — acyclic prereqs, server-authoritative state, integrity.\n- \`/api/campaign\` — auth-gated, own-data state. Reports generated by \`scripts/audit-campaign.ts\`.\n\n`;
arch += `## Entity relationships\nLevel —teaches→ Skill; Level —achieves→ Objective; Level —requires→ Prerequisite Level; Level —uses→ Puzzle/Opening; Level —includes→ VideoLesson; VideoLesson —explains→ Objective; Assessment —evaluates→ Objective; TrainingEvidence —updates→ SkillProgress; SkillProgress —unlocks→ Next Level.\n\n`;
arch += `## Video attachment contract\nA video attaches later by setting its \`asset\` + advancing \`state\` to \`published\` for the existing stable video id — no campaign restructuring, no puzzle-id changes. Only approved videos with a real asset may publish; all are PLANNED in R7.\n\n`;
arch += `## Integrity (validator)\n${validation.ok ? "PASS" : "FAIL"} — ${validation.findings.filter((f) => f.severity === "error").length} errors, ${validation.findings.filter((f) => f.severity === "warning").length} warnings.\n`;
writeFileSync(docs("CHESSMASTER-CAMPAIGN-ARCHITECTURE.md"), arch);

// ---- console summary + exit ----
console.log("levels", LEVELS.length, "playable", playable, "statusCounts", JSON.stringify(statusCounts));
console.log("videos", VIDEO_LESSONS.length, "bosses", BOSSES.length);
console.log("validator ok", validation.ok, "errors", validation.findings.filter((f) => f.severity === "error").length);
if (!validation.ok) { console.error("VALIDATION ERRORS", JSON.stringify(validation.findings.filter((f) => f.severity === "error").slice(0, 20))); process.exit(1); }
console.log("wrote docs: campaign.json, level-reports.json, video-catalog.json, 4 markdown reports");
