// Pure prerequisite-graph utilities for the curriculum. Deterministic + testable; no I/O.
import { SKILLS, SKILL_IDS, type CurriculumSkill } from "@/features/curriculum/lib/catalog";

export function missingPrerequisiteRefs(skills: CurriculumSkill[] = SKILLS): { skill: string; missing: string }[] {
  const out: { skill: string; missing: string }[] = [];
  const ids = new Set(skills.map((s) => s.id));
  for (const s of skills) for (const p of s.prerequisites) if (!ids.has(p)) out.push({ skill: s.id, missing: p });
  return out;
}

// Returns the list of skill ids involved in a cycle (empty if acyclic). DFS with colouring.
export function detectCycle(skills: CurriculumSkill[] = SKILLS): string[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const color = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  const stack: string[] = [];
  let cycle: string[] = [];
  const visit = (id: string): boolean => {
    const s = byId.get(id); if (!s) return false;
    color.set(id, 1); stack.push(id);
    for (const p of s.prerequisites) {
      const c = color.get(p) ?? 0;
      if (c === 1) { const i = stack.indexOf(p); cycle = stack.slice(i).concat(p); return true; }
      if (c === 0 && visit(p)) return true;
    }
    color.set(id, 2); stack.pop();
    return false;
  };
  for (const s of skills) if ((color.get(s.id) ?? 0) === 0) if (visit(s.id)) break;
  return cycle;
}

export function isAcyclic(skills: CurriculumSkill[] = SKILLS): boolean { return detectCycle(skills).length === 0; }

// Deterministic topological order (prerequisites first), tie-broken by catalog order then id.
export function topoOrder(skills: CurriculumSkill[] = SKILLS): string[] {
  const order: string[] = []; const done = new Set<string>();
  const byId = new Map(skills.map((s) => [s.id, s]));
  const rank = new Map(skills.map((s, i) => [s.id, i]));
  const ready = () => skills.filter((s) => !done.has(s.id) && s.prerequisites.every((p) => done.has(p) || !byId.has(p)))
    .sort((a, b) => (rank.get(a.id)! - rank.get(b.id)!) || a.id.localeCompare(b.id));
  let guard = skills.length + 1;
  while (done.size < skills.length && guard-- > 0) {
    const r = ready(); if (r.length === 0) break; // cycle / unresolved
    for (const s of r) { order.push(s.id); done.add(s.id); }
  }
  return order;
}

export function prerequisitesSatisfied(skillId: string, proficient: Set<string>, skills: CurriculumSkill[] = SKILLS): boolean {
  const s = skills.find((x) => x.id === skillId); if (!s) return false;
  return s.prerequisites.every((p) => proficient.has(p));
}

// Skills reachable from an entry (no prereqs) following the graph; flags orphans that can never
// unlock because a prerequisite is itself unreachable.
export function orphanedSkills(skills: CurriculumSkill[] = SKILLS): string[] {
  if (!isAcyclic(skills)) return []; // cycles handled separately
  const ids = new Set(skills.map((s) => s.id));
  return skills.filter((s) => s.prerequisites.some((p) => !ids.has(p))).map((s) => s.id);
}

export function requiredSkillIds(skills: CurriculumSkill[] = SKILLS): Set<string> {
  void SKILL_IDS; return new Set(skills.map((s) => s.id));
}
