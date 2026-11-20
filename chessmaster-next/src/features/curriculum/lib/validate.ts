// Deterministic curriculum INTEGRITY validator. Structural correctness only — it does NOT and
// cannot establish that a human chess instructor reviewed the curriculum (none has). Takes the
// catalog plus a per-skill eligible-item count map (computed server-side from the corpus) so it can
// be run in tests without importing the server-only puzzle data.
import { SKILLS, UNAVAILABLE_SKILLS, coverageStatus, type CurriculumSkill } from "@/features/curriculum/lib/catalog";
import { missingPrerequisiteRefs, detectCycle, orphanedSkills } from "@/features/curriculum/lib/graph";

export interface IntegrityFinding { severity: "error" | "warning"; code: string; detail: string }

export function validateCurriculum(
  eligibleCounts: Record<string, number>,
  skills: CurriculumSkill[] = SKILLS,
): { ok: boolean; findings: IntegrityFinding[] } {
  const f: IntegrityFinding[] = [];
  const ids = new Set(skills.map((s) => s.id));

  // unknown/duplicate ids
  const seen = new Set<string>();
  for (const s of skills) {
    if (seen.has(s.id)) f.push({ severity: "error", code: "DUPLICATE_SKILL_ID", detail: s.id });
    seen.add(s.id);
    if (!s.id || !/^[a-z0-9_]+$/.test(s.id)) f.push({ severity: "error", code: "BAD_SKILL_ID", detail: s.id });
    if (!s.nameKey) f.push({ severity: "error", code: "MISSING_NAME", detail: s.id });
    if (!s.objectiveKey) f.push({ severity: "error", code: "MISSING_OBJECTIVE", detail: s.id });
  }
  // prerequisite integrity
  for (const m of missingPrerequisiteRefs(skills)) f.push({ severity: "error", code: "MISSING_PREREQ", detail: `${m.skill} -> ${m.missing}` });
  const cycle = detectCycle(skills);
  if (cycle.length) f.push({ severity: "error", code: "PREREQ_CYCLE", detail: cycle.join(" -> ") });
  for (const o of orphanedSkills(skills)) f.push({ severity: "error", code: "ORPHAN_SKILL", detail: o });

  // content backing: a VERIFIED, available skill must actually have eligible items; a skill with 0
  // items must not be presented as teachable.
  for (const s of skills) {
    const n = eligibleCounts[s.id] ?? 0;
    const cov = coverageStatus(n, s.confidence);
    if (n === 0) f.push({ severity: "error", code: "SKILL_WITHOUT_CONTENT", detail: `${s.id} has 0 eligible items` });
    if (s.confidence === "verified" && cov === "insufficient")
      f.push({ severity: "warning", code: "THIN_CONTENT", detail: `${s.id} has only ${n} items (insufficient)` });
  }
  // declared-unavailable skills must NOT accidentally carry content (would mean mis-mapping)
  for (const u of UNAVAILABLE_SKILLS) {
    if ((eligibleCounts[u.id] ?? 0) > 0) f.push({ severity: "error", code: "UNAVAILABLE_HAS_CONTENT", detail: u.id });
    if (ids.has(u.id)) f.push({ severity: "error", code: "UNAVAILABLE_ALSO_ACTIVE", detail: u.id });
  }
  return { ok: f.every((x) => x.severity !== "error"), findings: f };
}
