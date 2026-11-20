// Independent curriculum audit (R5). Generated from current code + data — never hand-edited.
// Writes docs/curriculum-audit.json (NO solutions). Reproduce:
//   node --experimental-strip-types scripts/audit-curriculum.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS, UNAVAILABLE_SKILLS, skillForPuzzle, coverageStatus, getSkill } from "@/features/curriculum/lib/catalog";
import { isAcyclic, detectCycle, topoOrder, missingPrerequisiteRefs } from "@/features/curriculum/lib/graph";
import { validateCurriculum } from "@/features/curriculum/lib/validate";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(SRC.slice(SRC.indexOf("[{"), SRC.indexOf("}]") + 2)) as { id: number; domain: string; theme: string; difficulty: string }[];

const counts: Record<string, number> = {};
const diffs: Record<string, Set<string>> = {};
let mapped = 0, unmapped = 0;
for (const s of SKILLS) { counts[s.id] = 0; diffs[s.id] = new Set(); }
for (const p of PUZZLES) {
  const sk = skillForPuzzle(p);
  if (!sk) { unmapped++; continue; }
  mapped++; counts[sk]++; diffs[sk].add(p.difficulty);
}
let verified = 0, provisional = 0;
for (const p of PUZZLES) { const s = getSkill(skillForPuzzle(p) ?? ""); if (s?.confidence === "verified") verified++; else if (s?.confidence === "provisional") provisional++; }

const skills = SKILLS.map((s) => ({
  id: s.id, domain: s.domain, confidence: s.confidence, prerequisites: s.prerequisites,
  eligibleItems: counts[s.id], difficulties: [...diffs[s.id]].sort(),
  coverage: coverageStatus(counts[s.id], s.confidence), hasObjective: !!s.objectiveKey,
}));

const domainCoverage: Record<string, { items: number; skills: number }> = {};
for (const s of SKILLS) {
  domainCoverage[s.domain] ??= { items: 0, skills: 0 };
  domainCoverage[s.domain].items += counts[s.id];
  domainCoverage[s.domain].skills += 1;
}

const report = {
  auditTimestamp: new Date().toISOString(),
  corpus: { productionPuzzles: PUZZLES.length, mapped, unmapped, excluded: 0 },
  mappingConfidence: { verified, provisional },
  skills,
  unavailableSkills: UNAVAILABLE_SKILLS.map((u) => ({ id: u.id, domain: u.domain, status: "future_content_required" })),
  graph: { acyclic: isAcyclic(), cycle: detectCycle(), topoOrder: topoOrder(), missingPrerequisites: missingPrerequisiteRefs() },
  validator: validateCurriculum(counts),
  domainCoverage,
  limitations: [
    "opening_stage_tactics is provisional: opening-stage tactical positions, NOT verified opening theory.",
    "calculation/defensive_play/endgame remain limited in item count (carried from R4.1).",
    "No human pedagogical review performed; all mappings are automated/metadata-supported only.",
    "Concept skills (pins/skewers/deflection/opposition/opening-principles) have no verified content (future_content_required).",
  ],
  notes: "Generated from current catalog + corpus. Contains no puzzle solutions.",
};
writeFileSync(join(HERE, "..", "docs", "curriculum-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log("wrote docs/curriculum-audit.json");
console.log("mapped", mapped, "verified", verified, "provisional", provisional, "validatorOk", report.validator.ok, "acyclic", report.graph.acyclic);
console.log("coverage", JSON.stringify(Object.fromEntries(skills.map((s) => [s.id, `${s.eligibleItems}:${s.coverage}`]))));
