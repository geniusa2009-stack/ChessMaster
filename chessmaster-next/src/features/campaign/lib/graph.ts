// Pure prerequisite-graph utilities for the campaign (deterministic, no I/O).
import { LEVELS, type Level } from "@/features/campaign/lib/catalog";

export function missingPrereqs(levels: Level[] = LEVELS): { level: string; missing: string }[] {
  const ids = new Set(levels.map((l) => l.id));
  const out: { level: string; missing: string }[] = [];
  for (const l of levels) for (const p of l.prerequisites) if (!ids.has(p)) out.push({ level: l.id, missing: p });
  return out;
}

export function detectCycle(levels: Level[] = LEVELS): string[] {
  const byId = new Map(levels.map((l) => [l.id, l]));
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] = [];
  const visit = (id: string): boolean => {
    const l = byId.get(id); if (!l) return false;
    color.set(id, 1); stack.push(id);
    for (const p of l.prerequisites) {
      const c = color.get(p) ?? 0;
      if (c === 1) { cycle = stack.slice(stack.indexOf(p)).concat(p); return true; }
      if (c === 0 && visit(p)) return true;
    }
    color.set(id, 2); stack.pop(); return false;
  };
  for (const l of levels) if ((color.get(l.id) ?? 0) === 0) if (visit(l.id)) break;
  return cycle;
}

export function isAcyclic(levels: Level[] = LEVELS): boolean { return detectCycle(levels).length === 0; }
