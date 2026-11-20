// R7.3.2 assessment ROTATION selector (R7.3.2.2 coverage-aware). PURE + deterministic given its RNG.
// For every mandatory competency it issues `perCompetency` items from DISTINCT contexts AND guarantees
// the competency's `requiredAxes` are all covered (e.g. a light AND a dark square; a legal AND an illegal
// move). Priority: (1) competency coverage, (2) distinct contexts, (3) required-axis coverage,
// (4) avoid invalid/duplicate items, (5) prefer contexts not in the last attempt, (6) random among ties.
// Rotation preferences NEVER override required-axis coverage.
//
// This module decides only WHICH item ids to issue; it contains no answers. The server (not the client)
// runs it and binds the result into a signed attempt token — the browser cannot choose its own items.
// The RNG is injected so the server can use a cryptographically secure source while tests use a seeded
// one; it must return a float in [0, 1).
import { COMPETENCIES, FOUNDATION_ASSESSMENT, ISSUED_CONTEXTS_PER_COMPETENCY, type AssessPrompt, type Competency } from "@/features/campaign/lib/foundations";

export type Rng = () => number;

// Fisher–Yates using the injected RNG (deterministic for a given RNG sequence).
function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface SelectionResult {
  itemIds: string[];                 // flattened issued item ids
  byCompetency: Record<string, string[]>; // competency -> issued item ids (for audit/tests)
  shortfalls: string[];              // competencies that could not meet distinct-context OR axis coverage
}

// Select `perCompetency` distinct-context items for each mandatory competency. `exclude` is the set of
// item ids from the learner's last completed attempt; those are de-prioritised but still used as
// fallback when a competency does not have enough fresh contexts.
export function selectAttemptItems(opts: {
  perCompetency?: number;
  exclude?: Iterable<string>;
  rng: Rng;
  bank?: AssessPrompt[];
  competencies?: Competency[];
}): SelectionResult {
  const per = opts.perCompetency ?? ISSUED_CONTEXTS_PER_COMPETENCY;
  const exclude = new Set(opts.exclude ?? []);
  const bank = opts.bank ?? FOUNDATION_ASSESSMENT;
  const comps = (opts.competencies ?? COMPETENCIES).filter((c) => c.mandatory);
  const byCompetency: Record<string, string[]> = {};
  const shortfalls: string[] = [];

  for (const c of comps) {
    const items = bank.filter((p) => p.competency === c.id);
    // FRESH (not in the last attempt) contexts are preferred; SEEN ones are the rotation fallback.
    const fresh = shuffle(items.filter((p) => !exclude.has(p.id)), opts.rng);
    const seen = shuffle(items.filter((p) => exclude.has(p.id)), opts.rng);
    const ordered = [...fresh, ...seen]; // preference order: fresh first, then seen
    const requiredAxes = c.requiredAxes ?? [];
    const pickedContexts = new Set<string>();
    const coveredAxes = new Set<string>();
    const picked: string[] = [];
    const take = (p: AssessPrompt) => { pickedContexts.add(p.contextKey); coveredAxes.add(p.axis); picked.push(p.id); };

    // 1) COVERAGE FIRST: cover every required axis with a distinct-context item (fresh preferred).
    for (const axis of shuffle(requiredAxes, opts.rng)) {
      if (coveredAxes.has(axis) || picked.length >= per) continue;
      const cand = ordered.find((p) => p.axis === axis && !pickedContexts.has(p.contextKey));
      if (cand) take(cand);
    }
    // 2) FILL remaining slots with any distinct-context item (fresh preferred).
    for (const p of ordered) {
      if (picked.length >= per) break;
      if (pickedContexts.has(p.contextKey)) continue;
      take(p);
    }

    byCompetency[c.id] = picked;
    const missingAxes = requiredAxes.filter((a) => !coveredAxes.has(a));
    if (picked.length < per) shortfalls.push(`${c.id}: only ${picked.length}/${per} distinct contexts`);
    else if (missingAxes.length) shortfalls.push(`${c.id}: missing required axes ${missingAxes.join(",")}`);
  }

  const itemIds = comps.flatMap((c) => byCompetency[c.id] ?? []);
  return { itemIds, byCompetency, shortfalls };
}
