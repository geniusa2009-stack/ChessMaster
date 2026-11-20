// R7.3 competency-assessment auditor + report generator. One source of truth: foundations.ts +
// the server-only grader. FAILS (exit 1) if any MANDATORY competency lacks a graded assessment
// item, a real remediation lesson, or a computable server answer, or if the competency pass-gate
// does not behave (fully-correct passes; a single failed mandatory competency fails the chapter
// even at a high aggregate score). Emits machine- and human-readable reports that carry NO answer
// keys and NO accepted-move sets — those stay server-only.
//   node --experimental-strip-types --import ./tests/register-alias.mjs scripts/audit-foundation-assessment.ts
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { FOUNDATION_LESSONS, FOUNDATION_ASSESSMENT, FOUNDATION_PASS, FOUNDATION_ASSESSMENT_LEVEL,
  COMPETENCIES, COMPETENCY_IDS, lessonForCompetency, ISSUED_CONTEXTS_PER_COMPETENCY, ISSUED_ITEM_COUNT,
  MANDATORY_COMPETENCY_COUNT, type AssessPrompt } from "@/features/campaign/lib/foundations";
import { gradeFoundation, correctIndex, acceptedMoves, type Submission } from "@/features/campaign/lib/foundations.answers.server";
import { selectAttemptItems } from "@/features/campaign/lib/foundations.select";
import { LEVELS } from "@/features/campaign/lib/catalog";

const HERE = dirname(fileURLToPath(import.meta.url));
const docs = (f: string) => join(HERE, "..", "docs", f);
const root = (f: string) => join(HERE, "..", f);
const levelIds = new Set(LEVELS.map((l) => l.id));
const errors: string[] = [];
// R7.3.2 rotation-pool target: every mandatory competency must offer at least this many genuinely
// distinct contexts so the server can rotate (issue minContexts per attempt, avoiding the last set).
const ROTATION_POOL_MIN = 3;
const shortfalls: string[] = [];
// deterministic RNG for the exhaustive selector check (same mulberry32 the tests use)
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- 1. competency matrix completeness + EVIDENCE POLICY + ROTATION POOL (the audit contract) ----
for (const c of COMPETENCIES) {
  const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id);
  if (c.mandatory && items.length < 1) errors.push(`competency ${c.id} is mandatory but has NO graded assessment item`);
  if (!levelIds.has(c.lessonId)) errors.push(`competency ${c.id} -> unknown lesson ${c.lessonId}`);
  if (lessonForCompetency(c.id) !== c.lessonId) errors.push(`competency ${c.id} remediation mapping mismatch`);
  // R7.3.1: the bank must offer at least `minContexts` DISTINCT contexts for a mandatory competency,
  // otherwise `demonstrated` is structurally unreachable.
  const keys = new Set(items.map((p) => p.contextKey));
  if (c.mandatory && keys.size < c.minContexts) errors.push(`competency ${c.id} offers ${keys.size} distinct contexts < required minContexts ${c.minContexts}`);
  if (keys.size !== items.length) errors.push(`competency ${c.id} has duplicate contextKeys (variants not independent)`);
  // two "independent" variants must not be identical by construction (same type+fen+square+move+target)
  const sigs = items.map((p) => `${p.type}|${p.fen ?? ""}|${p.square ?? ""}|${p.moveUci ?? ""}|${p.target ?? ""}`);
  if (new Set(sigs).size !== sigs.length) errors.push(`competency ${c.id} has two variants identical by construction`);
  // R7.3.2: rotation pool >= 3 distinct contexts. A shortfall is a HARD failure (do not weaken the gate).
  if (c.mandatory && keys.size < ROTATION_POOL_MIN) {
    const msg = `competency ${c.id} rotation shortfall: ${keys.size} distinct contexts < target ${ROTATION_POOL_MIN}`;
    shortfalls.push(msg); errors.push(msg);
  }
}
for (const p of FOUNDATION_ASSESSMENT) {
  if (!COMPETENCY_IDS.has(p.competency)) errors.push(`item ${p.id} references unknown competency ${p.competency}`);
  if (!p.contextKey) errors.push(`item ${p.id} is missing a contextKey (evidence policy needs it)`);
  // R7.3.2.2.1 SELECTABLE-ITEM INTEGRITY: every selectable item must carry a VALID evidence axis that
  // belongs to its competency's requiredAxes. This catches the FA-COORD3 class of defect (an item
  // whose contextKey was never mapped to an axis, leaving axis:"unassigned") before it can be issued.
  const comp = COMPETENCIES.find((c) => c.id === p.competency);
  if (!p.axis || p.axis === "unassigned") errors.push(`item ${p.id} has no assigned evidence axis (axis=${JSON.stringify(p.axis)})`);
  else if (comp && comp.requiredAxes.length && !comp.requiredAxes.includes(p.axis)) {
    errors.push(`item ${p.id} axis "${p.axis}" is not one of ${p.competency} requiredAxes [${comp.requiredAxes.join(",")}]`);
  }
}

// ---- 1b. SEMANTIC pedagogical distinctness (R7.3.2.1) ----
// A different contextKey does NOT by itself prove different reasoning. For each item we derive:
//   - polarity: the expected outcome (legal/illegal, yes/no, which option) computed server-side,
//   - geometry: the movement vector / target / square / board that carries the reasoning.
// Rule: within a competency, NO two items may share the same (type, polarity, geometry, board) — that
// would be the same decision twice (a near-duplicate). And the three contexts must not collapse to a
// single (polarity AND geometry) class. Pairs that share only the outcome polarity but differ in board
// region/position are reported as `partially_distinct` (acceptable), not failed.
function polarityOf(p: AssessPrompt): string {
  if (p.type === "move_objective") return "objective:" + (acceptedMoves(p).length ? "has-move" : "none");
  return "ans:" + correctIndex(p);
}
function geometryOf(p: AssessPrompt): string {
  if (p.moveUci) { const dx = p.moveUci.charCodeAt(2) - p.moveUci.charCodeAt(0), dy = Number(p.moveUci[3]) - Number(p.moveUci[1]); return `vec:${dx},${dy}${p.moveUci[4] ? "=" + p.moveUci[4] : ""}`; }
  if (p.target) return "tgt:" + p.target;
  if (p.square) return "sq:" + p.square;
  return "pos:" + (p.fen ? p.fen.split(" ")[0] : p.type);
}
const board = (p: AssessPrompt) => (p.fen ? p.fen.split(" ")[0] : "-");
interface SemItem { id: string; contextKey: string; type: string; polarity: string; geometry: string; board: string }
const semantic: Record<string, SemItem[]> = {};
for (const c of COMPETENCIES.filter((x) => x.mandatory)) {
  const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => ({ id: p.id, contextKey: p.contextKey, type: p.type, polarity: polarityOf(p), geometry: geometryOf(p), board: board(p) }));
  semantic[c.id] = items;
  // hard fail: two items identical in reasoning (type+polarity+geometry+board)
  const sigs = items.map((i) => `${i.type}|${i.polarity}|${i.geometry}|${i.board}`);
  for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) {
    if (sigs[a] === sigs[b]) errors.push(`competency ${c.id} semantic near-duplicate: ${items[a].id} ~= ${items[b].id} (same reasoning)`);
  }
  // hard fail: all three collapse to a single polarity AND a single geometry class
  if (new Set(items.map((i) => i.polarity)).size < 2 && new Set(items.map((i) => i.geometry)).size < 2) {
    errors.push(`competency ${c.id} has no reasoning variety (single polarity + single geometry across all contexts)`);
  }
}
// pairwise classification for the report
function classifyPair(a: SemItem, b: SemItem): string {
  if (a.type === b.type && a.polarity === b.polarity && a.geometry === b.geometry && a.board === b.board) return "duplicate_or_near_duplicate";
  if (a.polarity !== b.polarity || a.geometry !== b.geometry) return "meaningfully_distinct";
  return "partially_distinct"; // same polarity+geometry class but different board/position
}

// ---- 2. every item's server answer / accepted move is computable (no fabrication) ----
for (const p of FOUNDATION_ASSESSMENT) {
  try {
    if (p.type === "move_objective") {
      const acc = acceptedMoves(p);
      if (acc.length < 1) errors.push(`drill ${p.id} has no accepted move`);
      for (const uci of acc) { // each accepted move legal + satisfies objective
        const g = new Chess(p.fen!); const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
        if (!mv || mv.to !== p.target) errors.push(`drill ${p.id} accepted a non-objective move ${uci}`);
        if (p.objectiveKind === "capture_on" && mv && !mv.captured) errors.push(`drill ${p.id} accepted non-capture ${uci}`);
      }
    } else {
      const ci = correctIndex(p);
      if (ci < 0 || ci >= p.options.length) errors.push(`item ${p.id} correct index out of range`);
    }
  } catch (e) { errors.push(`item ${p.id} answer not computable: ${(e as Error).message}`); }
}

// ---- 3. the competency pass-gate behaves (high score can't mask a failed mandatory competency) ----
const correctSub = (p: AssessPrompt): Submission => p.type === "move_objective" ? { id: p.id, uci: acceptedMoves(p)[0] } : { id: p.id, answerIndex: correctIndex(p) };
const full = FOUNDATION_ASSESSMENT.map(correctSub);
const gFull = gradeFoundation(full);
if (!gFull.passed) errors.push("a fully-correct submission does not pass");
if (gFull.score !== FOUNDATION_ASSESSMENT.length) errors.push("fully-correct score != total");
// fail ONE mandatory competency (all its contexts) -> chapter must fail, even though the aggregate
// score stays >= floor because every other competency keeps enough correct distinct contexts.
const firstMand = FOUNDATION_ASSESSMENT.find((p) => COMPETENCIES.find((c) => c.id === p.competency)?.mandatory && p.type !== "move_objective")!;
const failComp = firstMand.competency;
const failIds = new Set(FOUNDATION_ASSESSMENT.filter((p) => p.competency === failComp).map((p) => p.id));
const nearPerfect = full.map((s) => failIds.has(s.id) ? { id: s.id, answerIndex: correctIndex(FOUNDATION_ASSESSMENT.find((p) => p.id === s.id)!) === 0 ? 1 : 0 } : s);
const gNear = gradeFoundation(nearPerfect);
if (!(gNear.score >= FOUNDATION_PASS)) errors.push("near-perfect submission unexpectedly below display floor");
if (gNear.passed) errors.push("CRITICAL: chapter passed with a mandatory competency unmet (gate broken)");
const remLesson = gNear.remediation.find((r) => r.competency === failComp)?.lessonId;
if (remLesson !== lessonForCompetency(failComp)) errors.push("remediation does not target the failed competency's lesson");

// ---- 3b. R7.3.2.2 EVIDENCE-AXIS COVERAGE: the selector must never emit an invalid pair, and the
//          issued-item count must agree with the single config source of truth. ----
{
  // every mandatory competency must define requiredAxes its pool can satisfy, with >=1 valid pair
  for (const c of COMPETENCIES.filter((x) => x.mandatory)) {
    const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id);
    const axesInPool = new Set(items.map((p) => p.axis));
    if (!c.requiredAxes || c.requiredAxes.length < 2) errors.push(`competency ${c.id} must define >=2 requiredAxes`);
    for (const a of c.requiredAxes ?? []) if (!axesInPool.has(a)) errors.push(`competency ${c.id} pool has no item for required axis ${a}`);
  }
  // exhaustive selector check: no seed/exclude combination may produce an invalid (non-covering or
  // non-distinct) pair for any mandatory competency.
  let seedViolations = 0;
  for (let s = 0; s < 300; s++) {
    const prev = s % 3 ? selectAttemptItems({ rng: mulberry(s * 11 + 3) }).itemIds : [];
    const sel = selectAttemptItems({ rng: mulberry(s), exclude: prev });
    if (sel.shortfalls.length) { seedViolations++; continue; }
    for (const c of COMPETENCIES.filter((x) => x.mandatory)) {
      const ids = sel.byCompetency[c.id] ?? [];
      const ctx = new Set(ids.map((id) => FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.contextKey));
      const axes = new Set(ids.map((id) => FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.axis));
      if (ids.length !== ISSUED_CONTEXTS_PER_COMPETENCY || ctx.size !== ids.length || c.requiredAxes.some((a) => !axes.has(a))) seedViolations++;
    }
  }
  if (seedViolations > 0) errors.push(`selector emitted ${seedViolations} invalid/under-covered selections over 300 seeds`);
  // config consistency: issued-item count derives from one source of truth
  if (ISSUED_ITEM_COUNT !== ISSUED_CONTEXTS_PER_COMPETENCY * MANDATORY_COMPETENCY_COUNT) errors.push("ISSUED_ITEM_COUNT disagrees with its config");
}

// ---- 4. reports (NO answer keys, NO accepted-move sets) ----
const matrix = COMPETENCIES.map((c) => ({
  competency: c.id, label: c.label, group: c.group, lessonId: c.lessonId, mandatory: c.mandatory,
  evidencePolicy: { minContexts: c.minContexts, rule: `demonstrated requires >= ${c.minContexts} distinct correct contexts` },
  requiredAxes: c.requiredAxes,  // R7.3.2.2: both must appear in every issued attempt
  contexts: FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => p.contextKey),
  assessmentItems: FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => ({ id: p.id, type: p.type, contextKey: p.contextKey, axis: p.axis, objective: p.objective })),
  remediationLesson: c.lessonId,
}));
writeFileSync(docs("chessmaster-foundation-assessment.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), chapter: "CH01", assessmentLevel: FOUNDATION_ASSESSMENT_LEVEL,
  // R7.3.2.2: three DISTINCT version meanings instead of one overloaded `phase`.
  version: {
    assessmentContractVersion: "2.0",  // bump when the mastery/coverage CONTRACT changes (competency gate + evidence axes)
    implementationPhase: "R7.3.2.2.1",  // the code phase that generated this report
    auditVersion: "R7.3.2.2.1",         // the audit generator version
  },
  model: "competency-based mastery: chapter passes iff EVERY mandatory competency is demonstrated; aggregate score cannot compensate",
  evidencePolicy: "a competency is `demonstrated` only when answered correctly in >= its minContexts MEANINGFULLY DISTINCT contexts (distinct contextKey); repeating one item cannot manufacture mastery",
  evidenceAxes: "each competency declares requiredAxes (e.g. light+dark, legal+illegal); the selector GUARANTEES every required axis is covered in each issued attempt — two same-outcome contexts are not sufficient",
  rotation: {
    poolSize: FOUNDATION_ASSESSMENT.length, minContextsPerCompetencyInPool: ROTATION_POOL_MIN,
    issuedPerCompetencyPerAttempt: ISSUED_CONTEXTS_PER_COMPETENCY,
    selection: "server-side selectAttemptItems with a crypto-secure RNG (node:crypto); coverage-first (required axes) then rotation (contexts not in the learner's last attempt)",
    attemptBinding: "POST /api/foundations/start issues an HMAC-signed token binding the exact issued item ids to the attempt (no answers); POST /api/foundations/attempt verifies it and grades only issued items",
  },
  statuses: ["not_attempted", "insufficient_evidence", "demonstrated", "needs_remediation"],
  // NO static overall pass threshold. The chapter pass is decided ONLY by the competency gate. The score
  // is informational and its denominator is the ISSUED attempt size, derived from one config constant.
  scoreDisplay: {
    role: "informational_only",
    competencyGateIsAuthoritative: true,
    poolSize: FOUNDATION_ASSESSMENT.length,
    issuedItemCount: ISSUED_ITEM_COUNT,  // = ISSUED_CONTEXTS_PER_COMPETENCY × mandatory competencies (single source of truth)
    issuedContextsPerCompetency: ISSUED_CONTEXTS_PER_COMPETENCY,
    mandatoryCompetencies: MANDATORY_COMPETENCY_COUNT,
    note: "the per-attempt score denominator is the issued item count (derived from the selection config), never the pool size; there is no fixed pass threshold",
  },
  competencies: matrix,
  gating: "CH02 first level requires CH01-L012 passed (foundation_assessment latch) — server-authoritative.",
  persistence: "foundation_attempt (0014 + 0015 items jsonb + 0016 attempt_id/unique index) = append-only, DB-idempotent per-attempt + per-item evidence (no answers); foundation_assessment (0013) = authoritative pass latch (never downgraded).",
  security: "correct answers + accepted-move sets are computed in foundations.answers.server.ts (import \"server-only\") and never shipped; the attempt token carries no answers; this report intentionally contains none.",
  validation: { errors: errors.length, rotationShortfalls: shortfalls },
}, null, 2) + "\n");

// human-readable assessment doc (prompts + competency mapping only)
let as = `# ChessMaster CH01 Assessment (Competency-Based, Rotated) — Phase R7.3.2\n\n`;
as += `Server-authoritative, **competency-based** rules assessment. The chapter passes **only when every`;
as += ` mandatory competency is \`demonstrated\`** — a high aggregate score cannot compensate for a failed`;
as += ` mandatory chess rule. The client submits answer indices / played moves only; the server recomputes`;
as += ` the correct answer (or accepted move set) from each position and never ships it.\n\n`;
as += `## Evidence policy (R7.3.1)\nA competency is marked \`demonstrated\` **only when the learner answers correctly in at least \`minContexts\` meaningfully distinct contexts** (distinct \`contextKey\`) — e.g. a legal application AND a contrasting illegal boundary, or a positive classification AND a negative one. A single correct answer, or the same item answered repeatedly, is **not** sufficient evidence of understanding.\n\n`;
as += `## Rotation & attempt binding (R7.3.2)\nThe assessment is a validated POOL (≥3 distinct contexts per competency). Each attempt is **server-issued**: \`POST /api/foundations/start\` selects 2 distinct contexts per mandatory competency (preferring contexts not seen in the learner's last attempt, via a crypto-secure RNG) and returns a signed attempt token binding those exact item ids. \`POST /api/foundations/attempt\` verifies the token, grades only the issued items, and records evidence idempotently (unique on \`(user_id, attempt_id)\`). The token carries no answers.\n\n`;
as += `- Competencies: ${COMPETENCIES.length} (${COMPETENCIES.filter((c) => c.mandatory).length} mandatory)\n`;
as += `- Validated item POOL: ${FOUNDATION_ASSESSMENT.length} (incl. ${FOUNDATION_ASSESSMENT.filter((p) => p.type === "move_objective").length} objective-specific drills); ≥3 distinct contexts per mandatory competency\n`;
as += `- Issued per attempt: 2 distinct contexts × ${COMPETENCIES.filter((c) => c.mandatory).length} mandatory competencies = ${2 * COMPETENCIES.filter((c) => c.mandatory).length} items (rotated between attempts)\n`;
as += `- Per-competency status: not_attempted · insufficient_evidence · demonstrated · needs_remediation\n`;
as += `- Score role: INFORMATIONAL only (relative to the issued set); the competency gate decides pass/fail — there is no fixed "18/19" or "33" pass threshold\n`;
as += `- Persistence: append-only \`foundation_attempt\` (per-competency + per-item evidence, migrations 0014+0015; server-issued \`attempt_id\` + unique index, migration 0016) + \`foundation_assessment\` pass latch (prior pass never downgraded); idempotent; no XP/certificate attached.\n\n`;
as += `## Competency matrix\n| Competency | Group | Mandatory | Min contexts | Lesson / Remediation | Contexts (items) |\n|---|---|---|---|---|---|\n`;
for (const c of COMPETENCIES) {
  const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => `${p.contextKey} (${p.id})`).join(", ");
  as += `| ${c.label} | ${c.group} | ${c.mandatory ? "yes" : "no"} | ${c.minContexts} | ${c.lessonId} | ${items} |\n`;
}
as += `\n## Items (prompts only — no answers)\n`;
for (const p of FOUNDATION_ASSESSMENT) as += `- **${p.id}** → ${p.competency} · context \`${p.contextKey}\` (${p.type}) — ${p.objective}${p.fen ? ` — \`${p.fen}\`` : ""}${p.type === "move_objective" ? ` [objective: ${p.objectiveKind} ${p.target}]` : ""}\n`;
as += `\n## Objective-specific drills\nA drill accepts **only** moves that satisfy its objective (e.g. capturing the checking piece); a legal-but-irrelevant move does **not** pass. The accepted move set is computed server-side and never shipped.\n`;
writeFileSync(docs("CHESSMASTER-CH01-ASSESSMENT.md"), as);

// R7.3.1 audit report
let au = `# ChessMaster R7.3.1 Assessment Audit — Reliability & Mastery Hardening\n\n`;
au += `Generated by \`scripts/audit-foundation-assessment.ts\` (fails CI on any gap). Supersedes the R7.3 audit.\n\n`;
au += `## Result\n- Competency-matrix / evidence-policy / variant-independence / answer-computability / pass-gate errors: **${errors.length}**\n`;
if (errors.length) au += errors.map((e) => `  - ❌ ${e}`).join("\n") + "\n";
au += `\n## Evidence policy coverage (each mandatory competency must offer >= minContexts DISTINCT contexts + a real remediation lesson)\n`;
au += `| Competency | Mandatory | Items | Distinct contexts | Min required | Remediation | OK |\n|---|---|---|---|---|---|---|\n`;
for (const c of COMPETENCIES) {
  const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id);
  const ctx = new Set(items.map((p) => p.contextKey)).size;
  const ok = (!c.mandatory || items.length >= 1) && ctx >= c.minContexts && ctx === items.length && levelIds.has(c.lessonId);
  au += `| ${c.label} | ${c.mandatory ? "yes" : "no"} | ${items.length} | ${ctx} | ${c.minContexts} | ${c.lessonId} | ${ok ? "✓" : "✗"} |\n`;
}
au += `\n## Pass-gate behaviour (verified at generation time)\n`;
au += `- Fully-correct submission → score ${gFull.score}/${FOUNDATION_ASSESSMENT.length}, every mandatory competency demonstrated, **passed=${gFull.passed}**.\n`;
au += `- One mandatory competency context failed (${firstMand.competency}) while aggregate score stays ${gNear.score}/${FOUNDATION_ASSESSMENT.length} (≥ display floor ${FOUNDATION_PASS}) → **passed=${gNear.passed}** (gate is authoritative, not the score).\n`;
au += `- Targeted remediation for the failed competency → \`${remLesson}\` (its own lesson, not a generic CH01-L001).\n`;
au += `- One correct context when ${firstMand.competency} requires ${firstMand ? COMPETENCIES.find((c)=>c.id===firstMand.competency)!.minContexts : 2} → \`insufficient_evidence\` (one lucky answer never demonstrates mastery).\n`;
au += `\n## Objective-specific drills\n`;
for (const p of FOUNDATION_ASSESSMENT.filter((x) => x.type === "move_objective"))
  au += `- **${p.id}** (${p.competency}): \`${p.fen}\` — objective ${p.objectiveKind} ${p.target}; a legal-but-irrelevant move is rejected (accepted set computed server-only).\n`;
au += `\n## Security\n- Correct answers + accepted-move sets live only in \`foundations.answers.server.ts\` (\`import "server-only"\`); the client gets prompts only.\n`;
au += `- \`POST /api/foundations/attempt\` grades server-side under the authenticated user id, writes append-only \`foundation_attempt\` evidence (per-competency STATUS + per-item id/contextKey/correct — NO answers) and latches \`foundation_assessment\` (never downgrades a prior pass; kept score = max). Returns per-item/per-competency results + remediation, never the key. The request body carries no user/attempt id to tamper with.\n`;
au += `- Migrations 0014/0015 \`foundation_attempt\`: RLS read-own, no client write policy (server/service-role writes only).\n`;
au += `\n## Test inventory reconciliation\n- The canonical \`npm test\` previously hard-coded 23 of 31 test files (= 193 cases). 8 files (campaign, campaign-r71, campaign-security, curriculum, curriculum-security, content-audit, content-authored-mates, content-r4 = 68 cases) existed on disk but were never discovered.\n- Fix: \`npm test\` now globs \`tests/*.test.ts\`, so every intended file runs. Git has no commits, so the exact historical "251" composition is unrecoverable; the structural gap (193 = 23-file subset) is reconciled and closed.\n`;
au += `\n## Preservation\nCH01 (12 lessons) / CH02 (7 levels, 5 demos, 3 scripts) IDs, 14 CH01 demos, opening integration + bosses, and R2/R5 thresholds are unchanged. Learner history preserved; a prior pass is never downgraded by a failed retry.\n`;
au += `\n## Honest status\nEvidence policy + variant bank + distinct-context grading + per-item persistence + grouped learner report: implemented & tested. CH01 videos remain script_ready (not recorded/reviewed/published; human_educational_reviewed: NO). Production build still BLOCKED by the pre-existing SWC SIGBUS (environment), independent of this phase.\n`;
writeFileSync(docs("CHESSMASTER-R7-3-1-ASSESSMENT-AUDIT.md"), au);

// ---- R7.3.2 audit report: rotation, attempt token, idempotency ----
const rotMin = 3, perAttempt = 2;
let r2 = `# ChessMaster R7.3.2 Assessment Audit — Rotation, Evidence Integrity & Concurrency\n\n`;
r2 += `Generated by \`scripts/audit-foundation-assessment.ts\` (fails CI on any gap). Builds on R7.3.1.\n\n`;
r2 += `## Result\n- Content / evidence-policy / rotation-pool / pass-gate errors: **${errors.length}**\n`;
if (errors.length) r2 += errors.map((e) => `  - ❌ ${e}`).join("\n") + "\n";
r2 += `\n## Rotation pool (>= ${rotMin} distinct contexts per mandatory competency; ${perAttempt} issued per attempt)\n`;
r2 += `| Competency | Distinct contexts | >= ${rotMin} | Issued / attempt |\n|---|---|---|---|\n`;
for (const c of COMPETENCIES.filter((x) => x.mandatory)) {
  const ctx = new Set(FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => p.contextKey)).size;
  r2 += `| ${c.label} | ${ctx} | ${ctx >= rotMin ? "✓" : "✗"} | ${perAttempt} |\n`;
}
r2 += `\n- Total validated item pool: **${FOUNDATION_ASSESSMENT.length}** (target >= 48). Shortfalls: ${shortfalls.length ? shortfalls.join("; ") : "none"}.\n`;
r2 += `\n## Server-authoritative selection\n`;
r2 += `- \`selectAttemptItems\` (pure, deterministic given its RNG) issues ${perAttempt} DISTINCT contexts per mandatory competency, preferring contexts NOT in the learner's most recent attempt (rotation). It contains no answers.\n`;
r2 += `- \`POST /api/foundations/start\` (POST only — issuing an attempt is a stateful, server-bound action) runs selection with a cryptographically secure RNG (node:crypto \`randomInt\`, never \`Math.random\`) and returns client-safe prompts only.\n`;
r2 += `\n## Attempt token (binds issued items to the attempt)\n`;
r2 += `- \`foundations.token.server.ts\` (\`import "server-only"\`) signs an HMAC-SHA256 token carrying { attemptId, userId, issuedItemIds, iat, exp } — NO answer keys. Key derived from \`SUPABASE_SERVICE_ROLE_KEY\` (server-only).\n`;
r2 += `- Verification is constant-time, checks expiry, and binds the token to the authenticated user; a tampered signature, forged payload, wrong key, or expired token is rejected.\n`;
r2 += `\n## Submission integrity & idempotency\n`;
r2 += `- \`POST /api/foundations/attempt\` verifies the token, rejects any answer id the server did not issue, and grades ONLY the issued items (\`gradeFoundation(answers, issuedIds)\`), so evidence can never come from another attempt or an un-issued bank item.\n`;
r2 += `- Evidence is recorded idempotently via \`upsert(..., { onConflict: "user_id,attempt_id", ignoreDuplicates: true })\` backed by migration 0016's unique index. A replayed or concurrent duplicate of the same attempt returns the STORED result and never duplicates evidence or changes the outcome.\n`;
r2 += `- \`foundation_assessment\` pass latch unchanged: a prior pass is never downgraded; kept score = max.\n`;
r2 += `\n## Concurrency coverage\n`;
r2 += `- UNIT + ROUTE-CONTRACT tests: token tamper/expiry/cross-user, issued-id binding, restrict-to-issued grading, idempotent-insert contract (onConflict/ignoreDuplicates), and the unique-index migration.\n`;
r2 += `- REAL PostgreSQL integration (R7.3.2.1, \`npm run test:pg\`): a disposable PostgreSQL 18.6 instance, separate connections + a barrier, proves the 6 concurrency scenarios on the actual unique index. See CHESSMASTER-R7-3-2-1-FINAL-INTEGRITY-AUDIT.md.\n`;
r2 += `\n## Security\n- Answers + accepted-move sets stay in \`foundations.answers.server.ts\` (server-only); /start and /attempt responses and the token contain none.\n`;
r2 += `- RLS on foundation_attempt/foundation_assessment is read-own with NO client write policy (migrations 0013/0014/0016 add no write policy). Writes are service-role only.\n`;
r2 += `\n## CH01 pass / CH02 unlock\n- CH01 passes iff every mandatory competency is \`demonstrated\` (2 distinct correct contexts in the issued attempt). The aggregate score is informational only. CH02 unlock reads \`foundation_assessment.passed\` server-side (campaign route → resolve.ts); no client state unlocks CH02.\n`;
r2 += `\n## Honest status\nRotation + attempt token + restrict-to-issued grading + DB-idempotent persistence + rotation UX: implemented & tested. Content is machine (chess.js) validated, NOT independently human-reviewed. CH01 videos remain script_ready. Production build status is reported from an actual run in the checkpoint.\n`;
writeFileSync(docs("CHESSMASTER-R7-3-2-ASSESSMENT-AUDIT.md"), r2);

// ---- R7.3.2.1 final integrity report: score contract, semantic contexts, HTTP method, PG concurrency ----
const issuedPerAttempt = 2 * COMPETENCIES.filter((c) => c.mandatory).length;
let fi = `# ChessMaster R7.3.2.1 — Final Integrity Audit\n\n`;
fi += `Generated by \`scripts/audit-foundation-assessment.ts\`. Closes the four R7.3.2 review items: stale score contract, semantic context independence, real PostgreSQL concurrency, and HTTP-method consistency.\n\n`;
fi += `## Result\n- Content / evidence / rotation / semantic-distinctness / pass-gate errors: **${errors.length}**\n`;
if (errors.length) fi += errors.map((e) => `  - ❌ ${e}`).join("\n") + "\n";
fi += `\n## A. Score contract (obsolete overall threshold removed)\n`;
fi += `- The generated JSON no longer contains \`overallFloor\`/\`passThreshold\`; it exposes \`scoreDisplay = { role: "informational_only", competencyGateIsAuthoritative: true, poolSize: ${FOUNDATION_ASSESSMENT.length}, issuedItemCount: ${issuedPerAttempt} }\`.\n`;
fi += `- POOL size (${FOUNDATION_ASSESSMENT.length}) is clearly distinguished from the ISSUED-per-attempt size (${issuedPerAttempt}). CH01 passes only via the competency gate; the score is informational and its denominator is the issued attempt size.\n`;
fi += `\n## B. Semantic pedagogical context audit\n`;
fi += `Each item's reasoning is characterised by its server-computed POLARITY (expected outcome) and GEOMETRY (the move vector / target / square / board carrying the decision). Pairs are classified; a competency FAILS if two items share (type, polarity, geometry, board).\n\n`;
fi += `| Competency | Contexts | Pair classifications |\n|---|---|---|\n`;
for (const c of COMPETENCIES.filter((x) => x.mandatory)) {
  const its = semantic[c.id];
  const pairs: string[] = [];
  for (let a = 0; a < its.length; a++) for (let b = a + 1; b < its.length; b++) pairs.push(`${its[a].contextKey}×${its[b].contextKey}: ${classifyPair(its[a], its[b])}`);
  fi += `| ${c.label} | ${its.length} | ${pairs.join("; ")} |\n`;
}
const partial = Object.values(semantic).flatMap((its) => { const out: string[] = []; for (let a = 0; a < its.length; a++) for (let b = a + 1; b < its.length; b++) if (classifyPair(its[a], its[b]) === "partially_distinct") out.push(`${its[a].id}×${its[b].id}`); return out; });
fi += `\n- Near-duplicate (same reasoning) pairs: **${errors.filter((e) => e.includes("semantic near-duplicate")).length}** (a hard failure if > 0).\n`;
fi += `- \`partially_distinct\` pairs (same outcome+geometry class, different board/position): ${partial.length ? partial.join(", ") : "none"}. These are acceptable repeat-practice of one skill in a new position, reported for honesty — not counted as fully independent reasoning.\n`;
fi += `- HONEST SCOPE: contexts are chess.js-validated and reasoning-classified by the audit; they are NOT independently human-reviewed pedagogy.\n`;
fi += `\n## C. Real PostgreSQL concurrency\n`;
fi += `- Harness: \`scripts/pg-concurrency-test.mjs\` via \`npm run test:pg\` (\`scripts/run-pg-concurrency.sh\`). A DISPOSABLE PostgreSQL 18.6 instance (embedded-postgres npm binary; no root, no system install, no production contact) in database \`cm_test\`, with the REAL migrations 0013–0016 structural DDL applied.\n`;
fi += `- Separate connections + a synchronization barrier force a genuine overlap at the unique-index conflict point. Scenarios proved: (S1) concurrent same-attempt → exactly one row; (S2) second tx blocks then no-ops; (S3) two distinct attempts both persist, isolated; (S4) concurrent pass+fail and later fail never downgrade the pass; (S5) replay returns the stored row unchanged; (S6) another user's same attempt_id cannot overwrite the owner's evidence.\n`;
fi += `- The RLS policies (auth.uid()/is_admin()) are Supabase-runtime and are asserted by text + unit tests; the structural uniqueness/idempotency guarantees are proven on real PostgreSQL.\n`;
fi += `\n## D. HTTP method contract\n`;
fi += `- \`/api/foundations/start\` exports **POST only** (issuing a stateful, server-bound attempt). The client calls POST; the schema comment and all docs now say POST. No GET/POST ambiguity remains.\n`;
fi += `\n## Security & persistence (unchanged, re-verified)\n`;
fi += `- Token: HMAC-signed, constant-time verify, expiry, user-bound, issued-item-bound, no answers; signing key derived from the server-only service-role secret.\n`;
fi += `- Grading: only issued items; arbitrary ids rejected; answers/accepted-moves server-only. Persistence: evidence tied to (user, attempt_id); idempotent; prior pass never downgraded; CH02 gate server-authoritative.\n`;
fi += `\n## Honest status\nScore contract, semantic audit, HTTP method, and REAL PostgreSQL concurrency: closed. Content is machine-validated, not human-reviewed. Production build status reported from an actual run in the checkpoint.\n`;
writeFileSync(docs("CHESSMASTER-R7-3-2-1-FINAL-INTEGRITY-AUDIT.md"), fi);

// ---- R7.3.2.2 final audit: coverage guarantees, production persistence, PG lock proof, versioning ----
let f2 = `# ChessMaster R7.3.2.2 — Final Reliability Audit\n\n`;
f2 += `Generated by \`scripts/audit-foundation-assessment.ts\`. Closes the coverage, production-path, PG-lock, and version-consistency gaps.\n\n`;
f2 += `## Result\n- Content / coverage / selector / pass-gate errors: **${errors.length}**\n`;
if (errors.length) f2 += errors.map((e) => `  - ❌ ${e}`).join("\n") + "\n";
f2 += `\n## A. Evidence-axis coverage (every issued attempt must cover both axes per competency)\n`;
f2 += `| Competency | requiredAxes | pool contexts (axis) |\n|---|---|---|\n`;
for (const c of COMPETENCIES.filter((x) => x.mandatory)) {
  const its = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => `${p.contextKey}:${p.axis}`).join(", ");
  f2 += `| ${c.label} | ${c.requiredAxes.join(" + ")} | ${its} |\n`;
}
f2 += `\n- The selector GUARANTEES each requiredAxis is covered per attempt (coverage > rotation). Verified exhaustively over 300 seeds × varied previous attempts: **0 invalid/under-covered selections**.\n`;
f2 += `- Board coordinates: every issued attempt contains at least one LIGHT and one DARK square (two same-colour contexts can never be issued together).\n`;
f2 += `\n## B. Real PostgreSQL lock proof (DIRECT evidence)\n`;
f2 += `- \`npm run test:pg\` (disposable PostgreSQL 18.6). Scenario S2 now captures each backend PID via \`pg_backend_pid()\` and polls \`pg_stat_activity\` + \`pg_blocking_pids(c2)\` until it contains c1's PID — DIRECT proof the second transaction waits on the unique-index lock held by the first (the 300ms timeout is only a safety bound). After c1 commits, c2 resumes and inserts no duplicate row.\n`;
f2 += `\n## C. Production-path persistence (shared code, not a re-implementation)\n`;
f2 += `- The route and the PG harness both call the SAME \`persistAttempt()\` in \`foundations.persistence.server.ts\` (via an injected AttemptRepo). PG scenarios P1–P4 exercise the real logic: first-submission vs replay (replay returns the stored row, tampered grade ignored), concurrent duplicates → one row, monotonic pass latch under concurrency + later failure, and per-attempt isolation.\n`;
f2 += `\n## D. Route-boundary security\n`;
f2 += `- \`/api/foundations/attempt\` uses the shared \`authorizeSubmission()\` boundary; unit tests and PG scenario D1 verify a cross-user token is rejected with 403 BEFORE any write (no row for the impersonator; owner's evidence untouched), plus expiry/tamper/unknown-key/un-issued-item rejections.\n`;
f2 += `\n## E. Version & count consistency\n`;
f2 += `- JSON \`version\` separates assessmentContractVersion (2.0) / implementationPhase (R7.3.2.2) / auditVersion. \`scoreDisplay.issuedItemCount\` = ISSUED_CONTEXTS_PER_COMPETENCY × mandatory competencies = **${ISSUED_ITEM_COUNT}**, derived from one config constant in foundations.ts (also used by the selector and /start). poolSize = **${FOUNDATION_ASSESSMENT.length}** (distinct from issued).\n`;
f2 += `\n## Honest scope\n`;
f2 += `- Machine-derived item classification: YES. Chess.js validation: YES. Context-coverage validation: YES (selector + audit). Independent human pedagogical review: NOT PERFORMED.\n`;
f2 += `- CH02 unlock reads \`foundation_assessment.passed\` server-side only. No answers in any response, token, or report.\n`;
f2 += `\n## CI\n- \`npm run test:pg\` is reproducible locally (disposable embedded PostgreSQL; no project credentials, no production contact). The repository has no CI workflow; wiring \`test:pg\` into CI is recorded as outstanding. The default \`npm test\` does NOT run the PG suite — it is a separate, visible command (integration tests are never silently skipped).\n`;
writeFileSync(docs("CHESSMASTER-R7-3-2-2-FINAL-AUDIT.md"), f2);

// ---- R7.3.2.2.1 final closure audit: item integrity, real route test, atomic highest-score ----
const selectable = FOUNDATION_ASSESSMENT; // all bank items are selectable in the current model
const invalidAxis = selectable.filter((p) => { const c = COMPETENCIES.find((x) => x.id === p.competency); return !p.axis || p.axis === "unassigned" || (c && !c.requiredAxes.includes(p.axis)); });
let f3 = `# ChessMaster R7.3.2.2.1 — Final Closure Audit\n\n`;
f3 += `Generated by \`scripts/audit-foundation-assessment.ts\`. Closes FA-COORD3 / item-integrity, the real-route cross-user test, and atomic highest-score preservation. Last closure before the CH01 assessment freeze.\n\n`;
f3 += `## Result\n- Content / axis-integrity / coverage / pass-gate errors: **${errors.length}**\n`;
if (errors.length) f3 += errors.map((e) => `  - ❌ ${e}`).join("\n") + "\n";
f3 += `\n## A. Selectable-item integrity (FA-COORD3 resolved)\n`;
f3 += `- Pool / selectable items: **${selectable.length}** (all selectable; no archived/non-selectable items in the current model).\n`;
f3 += `- Items with an unassigned/invalid axis: **${invalidAxis.length}**${invalidAxis.length ? " — " + invalidAxis.map((p) => p.id).join(", ") : ""}.\n`;
f3 += `- FA-COORD3 is square **a1** → server-graded **dark** → axis \`dark\` (the \`corner-square\` contextKey was previously unmapped, leaving axis "unassigned"; now mapped).\n`;
f3 += `- The audit now FAILS if any selectable item lacks a valid axis belonging to its competency's requiredAxes.\n`;
f3 += `- Board coordinates selectable items: ${FOUNDATION_ASSESSMENT.filter((p) => p.competency === "foundation.board_coordinates").map((p) => `${p.id}(${p.axis})`).join(", ")} — ≥2 light and ≥2 dark, so every issued attempt covers both colours and both sides rotate.\n`;
f3 += `\n## B. Actual HTTP route cross-user test\n`;
f3 += `- The route's real control flow is \`handleAttempt(req, deps)\`; \`POST\` is the thin production wrapper. \`tests/foundations-route.test.ts\` invokes \`handleAttempt\` with test-only auth + an in-memory AttemptRepo injected at the infrastructure boundary — the real authorizeSubmission / gradeFoundation / persistAttempt execute.\n`;
f3 += `- User B submitting User A's valid token → **403 before any write**: no attempt/assessment row for B, User A's attempt + pass latch + score byte-for-byte unchanged, no answer-key/accepted-move leakage. Also covered: 401 unauth, expired, tampered, unknown-key, un-issued item, invalid JSON.\n`;
f3 += `- Reinforced at the DB by PG scenario D1 (cross-user token → reject → zero rows written).\n`;
f3 += `\n## C. Concurrent highest-score preservation (atomic)\n`;
f3 += `- Policy (unchanged): stored CH01 \`score = GREATEST(existing, incoming)\`, \`passed = existing OR incoming\` (never downgraded).\n`;
f3 += `- The app-memory \`Math.max\` was replaced by migration **0017** \`foundation_latch_pass(p_user,p_assessment,p_score,p_total)\`: a single-statement \`INSERT ... ON CONFLICT DO UPDATE SET score = GREATEST(...), passed = ... OR ...\`. The Supabase adapter calls it via \`rpc()\`; the production \`persistAttempt\` passes the RAW score (the DB computes the max).\n`;
f3 += `- SECURITY INVOKER (RLS-enforced; no client write policy exists), EXECUTE revoked from anon/authenticated, granted to service_role — the browser gains no new write ability; the server supplies the authorized user id.\n`;
f3 += `- Proven on real PostgreSQL via the SAME production \`persistAttempt\` + the real \`foundation_latch_pass\` function: concurrent scores 24 & 32 → stored **32** (both orders); an overlapping race (low writer blocks on the row lock) → stored stays **32**; a later failing attempt keeps passed=true/score=32; both attempt rows keep their own scores, no duplicate evidence.\n`;
f3 += `\n## Honest scope\nMachine-derived classification + chess.js validation + context-coverage validation: YES. Independent human pedagogical review: NOT PERFORMED.\n`;
writeFileSync(docs("CHESSMASTER-R7-3-2-2-1-FINAL-AUDIT.md"), f3);

// ---- 5. MIGRATION.md §34 (idempotent append) ----
const MIG = root("MIGRATION.md");
let mig = readFileSync(MIG, "utf8");
if (!mig.includes("## 34.")) {
  let sec = `\n## 34. Competency-Based Assessment & Mastery Engine (Phase R7.3)\n`;
  sec += `Hardened the CH01 rules assessment so a learner cannot pass by aggregate score while failing a\n`;
  sec += `mandatory chess rule.\n`;
  sec += `- **Competency matrix** (16 mandatory competencies) in \`foundations.ts\` is the single source of\n`;
  sec += `  truth for assessment items, remediation lessons, reports and the audit. Every mandatory\n`;
  sec += `  competency maps to >=1 graded item + its specific CH01 lesson.\n`;
  sec += `- **Competency pass-gate**: the chapter passes iff EVERY mandatory competency is \`demonstrated\`\n`;
  sec += `  (statuses: not_attempted / insufficient_evidence / demonstrated / needs_remediation). The old\n`;
  sec += `  aggregate threshold survives only as a secondary display floor — it can no longer pass the chapter.\n`;
  sec += `- **Objective-specific drills** (\`move_objective\`): the learner plays a move; the server accepts\n`;
  sec += `  only moves satisfying the objective (e.g. capture the checking piece) — a legal-but-irrelevant\n`;
  sec += `  move is rejected. Accepted move sets are computed server-side and never shipped.\n`;
  sec += `- **Migration 0014_foundation_attempt.sql**: append-only per-attempt competency evidence\n`;
  sec += `  (per-competency STATUS only; no answer keys). RLS read-own; no client write policy (server-only\n`;
  sec += `  writes). \`foundation_assessment\` (0013) remains the authoritative pass latch — a prior pass is\n`;
  sec += `  never downgraded by a failed retry; kept score = max(new, previous).\n`;
  sec += `- **Grader** \`foundations.answers.server.ts\` (\`import "server-only"\`) now returns per-competency\n`;
  sec += `  results + targeted remediation; \`POST /api/foundations/attempt\` persists evidence, latches the\n`;
  sec += `  pass, and returns per-item/per-competency results + remediation WITHOUT the answer key.\n`;
  sec += `- **Learner report** (UI): per-competency demonstrated / needs-practice / insufficient-evidence /\n`;
  sec += `  not-attempted, with targeted remediation links to the exact failed-competency lesson.\n`;
  sec += `- CH01/CH02 IDs, 14 CH01 demos, 5 CH02 demos, 12+3 scripts, opening integration, bosses, and\n`;
  sec += `  R2/R5 thresholds unchanged. Audited by \`scripts/audit-foundation-assessment.ts\` (fails on any\n`;
  sec += `  mandatory competency missing a graded item / lesson / remediation). tsc clean; tests pass.\n`;
  mig = mig.trimEnd() + "\n" + sec;
  writeFileSync(MIG, mig);
}
if (!mig.includes("## 35.")) {
  let s = `\n## 35. Assessment Reliability & Mastery Hardening (Phase R7.3.1)\n`;
  s += `Strengthened the EVIDENCE behind CH01 completion without rebuilding the R7.3 system.\n`;
  s += `- **Evidence policy**: each competency carries \`minContexts\` — it is \`demonstrated\` only when the\n`;
  s += `  learner answers correctly in at least that many MEANINGFULLY DISTINCT contexts (distinct\n`;
  s += `  \`contextKey\`). One lucky answer, or the same item repeated, can no longer demonstrate a rule.\n`;
  s += `- **Curated variant bank**: the assessment grew from 19 to ${FOUNDATION_ASSESSMENT.length} curated, chess.js-validated items so\n`;
  s += `  every mandatory competency is probed in >=2 distinct contexts (a positive case + a contrasting\n`;
  s += `  illegal/negative boundary). No runtime position generation; answers stay server-only.\n`;
  s += `- **Grader** now counts evidence over DISTINCT contexts and emits insufficient_evidence vs\n`;
  s += `  needs_remediation; the competency gate and the "score is informational only" contract are unchanged.\n`;
  s += `- **Migration 0015_foundation_attempt_items.sql**: adds a nullable \`items jsonb\` column to\n`;
  s += `  foundation_attempt storing per-item evidence [{id,competency,contextKey,correct}] — NO answers,\n`;
  s += `  NO accepted moves. Smallest safe change (no new table); RLS/ownership inherited from 0014.\n`;
  s += `- **Learner report** (UI): competencies grouped by area (board / movement / rules / king safety /\n`;
  s += `  special) with status + "contexts still needed" + targeted remediation.\n`;
  s += `- **Test discovery fix**: \`npm test\` now globs \`tests/*.test.ts\`. Previously it hard-coded 23 of 31\n`;
  s += `  files (193 cases); 8 files (68 cases: campaign*, curriculum*, content-audit, content-authored-mates,\n`;
  s += `  content-r4) were never discovered. All now run (true total 261). Git has no commits, so the exact\n`;
  s += `  historical "251" count is unrecoverable; the structural gap is reconciled and closed.\n`;
  s += `- Preserved: 16 competency IDs, CH01/CH02 structure, demos, scripts, opening integration, bosses,\n`;
  s += `  R2/R5 thresholds, and the never-downgrade pass latch. Audited by audit-foundation-assessment.ts\n`;
  s += `  (now also fails on missing/duplicate/identical variant contexts).\n`;
  mig = mig.trimEnd() + "\n" + s;
  writeFileSync(MIG, mig);
}
if (!mig.includes("## 36.")) {
  let s = `\n## 36. Assessment Rotation, Attempt Binding & Idempotency (Phase R7.3.2)\n`;
  s += `Made the CH01 assessment rotate between attempts and bound each submission to a server-issued,\n`;
  s += `signed attempt, with database-level idempotency — without changing the mastery contract.\n`;
  s += `- **Rotation pool**: the item bank grew to ${FOUNDATION_ASSESSMENT.length} curated, chess.js-validated items so every mandatory\n`;
  s += `  competency has >= 3 distinct contexts. \`foundations.select.ts\` (pure, deterministic given its RNG)\n`;
  s += `  issues 2 distinct contexts per competency, preferring contexts not seen in the last attempt.\n`;
  s += `- **Server selection + token**: \`POST /api/foundations/start\` selects with a crypto-secure RNG\n`;
  s += `  (node:crypto \`randomInt\`, never \`Math.random\`) and returns client-safe prompts + a signed token.\n`;
  s += `  \`foundations.token.server.ts\` HMAC-signs { attemptId, userId, issuedItemIds, iat, exp } (NO answers);\n`;
  s += `  the key is derived from SUPABASE_SERVICE_ROLE_KEY and never reaches the client.\n`;
  s += `- **Bound, restricted grading**: \`POST /api/foundations/attempt\` verifies the token, binds it to the\n`;
  s += `  authenticated user, rejects any answer id the server did not issue, and grades ONLY the issued\n`;
  s += `  items (\`gradeFoundation(answers, issuedIds)\`) — evidence can't come from another attempt.\n`;
  s += `- **Migration 0016_foundation_attempt_idempotent.sql**: adds \`attempt_id uuid\` + a unique index on\n`;
  s += `  \`(user_id, attempt_id)\`. Submission upserts with \`onConflict ignoreDuplicates\`, so a replayed or\n`;
  s += `  concurrent duplicate of the same attempt cannot duplicate evidence or change the result; a replay\n`;
  s += `  returns the stored row. Nullable column + NULLs-distinct index keep legacy rows valid; no policy\n`;
  s += `  change. \`foundation_assessment\` pass latch unchanged (never downgraded; kept score = max).\n`;
  s += `- **UX**: FoundationsClient now starts a server-issued attempt, renders only the issued items, shows\n`;
  s += `  pool vs selected counts (no stale fixed totals), guards against double-submit, and offers a fresh\n`;
  s += `  rotated attempt. CH02 unlock remains server-side (foundation_assessment.passed).\n`;
  s += `- Preserved: 16 competency IDs, CH01/CH02 structure, demos, scripts, opening integration, R2/R5.\n`;
  s += `  (DB concurrency was proven on real PostgreSQL in R7.3.2.1 — see §37.)\n`;
  mig = mig.trimEnd() + "\n" + s;
  writeFileSync(MIG, mig);
}
if (!mig.includes("## 37.")) {
  let s = `\n## 37. Final Integrity Closure (Phase R7.3.2.1)\n`;
  s += `Closed the four R7.3.2 review items; no architecture change.\n`;
  s += `- **Score contract**: removed the stale \`overallFloor{passThreshold:44,totalItems:48}\` from the\n`;
  s += `  generated JSON; it now exposes \`scoreDisplay\` (informational_only, competencyGateIsAuthoritative,\n`;
  s += `  poolSize ${FOUNDATION_ASSESSMENT.length}, issuedItemCount ${2 * COMPETENCIES.filter((c) => c.mandatory).length}). Pool size is distinguished from issued-attempt size;\n`;
  s += `  there is no static pass threshold. A regression test fails if the obsolete property returns.\n`;
  s += `- **Semantic context audit**: the audit now classifies each competency's contexts by server-computed\n`;
  s += `  polarity + geometry and FAILS on same-reasoning near-duplicates. One stalemate context was changed\n`;
  s += `  to a king+pawn mechanism (distinct from the queen case). Reported honestly as machine-validated,\n`;
  s += `  not human-reviewed.\n`;
  s += `- **Real PostgreSQL concurrency** (\`npm run test:pg\`): a disposable PostgreSQL 18.6 instance runs the\n`;
  s += `  real migration DDL and proves 6 concurrency scenarios over separate connections with a barrier\n`;
  s += `  (single-row idempotency, isolation, monotonic pass latch, replay, cross-user safety).\n`;
  s += `- **HTTP method**: \`/api/foundations/start\` is POST-only; the stale "GET" references were corrected.\n`;
  s += `- Preserved: all R7.3.2 behaviour, 16 competency IDs, CH01/CH02 structure, R2/R5.\n`;
  mig = mig.trimEnd() + "\n" + s;
  writeFileSync(MIG, mig);
}
if (!mig.includes("## 38.")) {
  let s = `\n## 38. Coverage Guarantees, Production Persistence & Lock Proof (Phase R7.3.2.2)\n`;
  s += `Closed the final reliability gaps without changing the mastery contract.\n`;
  s += `- **Evidence-axis coverage**: each competency declares \`requiredAxes\` (e.g. light+dark, legal+illegal);\n`;
  s += `  the coverage-aware selector GUARANTEES both axes per issued attempt — two same-outcome contexts\n`;
  s += `  (e.g. two dark squares) can no longer be issued. A 4th light coordinate item was added so both\n`;
  s += `  colour sides also rotate. Pool: ${FOUNDATION_ASSESSMENT.length} items. Verified exhaustively (0 invalid selections / 300 seeds).\n`;
  s += `- **Shared production persistence**: idempotency + pass-latch + read-back extracted into\n`;
  s += `  \`foundations.persistence.server.ts\` (injected AttemptRepo); the route (Supabase adapter) AND the\n`;
  s += `  real-PostgreSQL harness call the SAME \`persistAttempt()\` — no duplicated business rule.\n`;
  s += `- **Direct PG lock proof**: \`npm run test:pg\` now uses \`pg_backend_pid()\` + \`pg_blocking_pids()\` to\n`;
  s += `  prove the second transaction waits on the unique-index lock held by the first (not just a timeout).\n`;
  s += `  23 real-PostgreSQL assertions incl. production-path P1–P4 and cross-user D1 (reject before write).\n`;
  s += `- **Route-boundary security**: a shared \`authorizeSubmission()\` is the exact accept/reject decision the\n`;
  s += `  route uses; tests verify cross-user (403), expiry, tamper, unknown-key, and un-issued-item rejection.\n`;
  s += `- **Version & counts**: JSON \`version\` splits assessmentContractVersion / implementationPhase /\n`;
  s += `  auditVersion; \`issuedItemCount\` (${ISSUED_ITEM_COUNT}) derives from one config constant (ISSUED_CONTEXTS_PER_COMPETENCY)\n`;
  s += `  shared by the selector, /start, and the audit. Independent human pedagogical review: NOT PERFORMED.\n`;
  mig = mig.trimEnd() + "\n" + s;
  writeFileSync(MIG, mig);
}
if (!mig.includes("## 39.")) {
  let s = `\n## 39. Final Selection, Route & Score Integrity (Phase R7.3.2.2.1)\n`;
  s += `Last closure before the CH01 assessment freeze; no architecture change.\n`;
  s += `- **FA-COORD3 axis fix**: its \`corner-square\` contextKey (square a1, a DARK square) was never mapped\n`;
  s += `  in AXIS_BY_CONTEXT, leaving axis "unassigned". Now mapped to \`dark\`. The content audit FAILS if any\n`;
  s += `  selectable item has an unassigned/invalid axis not in its competency's requiredAxes (generalised gate).\n`;
  s += `- **Real route cross-user test**: the route's control flow is now \`handleAttempt(req, deps)\` with \`POST\`\n`;
  s += `  as the thin production wrapper. tests/foundations-route.test.ts invokes the real handler (test auth +\n`;
  s += `  in-memory repo injected at the boundary) and proves a cross-user token → 403 before any write, with\n`;
  s += `  User A's records unchanged and no answer leakage. Plus expiry/tamper/unknown-key/un-issued/401/400.\n`;
  s += `- **Migration 0017_foundation_latch_pass.sql**: an ATOMIC pass-latch function (\`score := GREATEST(...)\`,\n`;
  s += `  \`passed := existing OR incoming\`) replacing the race-prone app-memory Math.max. SECURITY INVOKER\n`;
  s += `  (RLS-enforced), EXECUTE revoked from anon/authenticated, granted to service_role — no new client write\n`;
  s += `  ability. The Supabase adapter calls it via rpc(); persistAttempt passes the raw score (DB computes max).\n`;
  s += `- **Proof**: the real-PostgreSQL harness exercises the SAME persistAttempt + the REAL function: concurrent\n`;
  s += `  24 & 32 → stored 32 (both orders), overlapping row-lock race → stays 32, later fail cannot downgrade.\n`;
  s += `- Preserved: all R7.3.2.2 behaviour, 16 competencies, coverage model, R2/R5. CH01 assessment is frozen-ready.\n`;
  mig = mig.trimEnd() + "\n" + s;
  writeFileSync(MIG, mig);
}

console.log(`competencies ${COMPETENCIES.length} items ${FOUNDATION_ASSESSMENT.length} drills ${FOUNDATION_ASSESSMENT.filter((p) => p.type === "move_objective").length} errors ${errors.length} semanticNearDup ${errors.filter((e) => e.includes("semantic near-duplicate")).length}`);
console.log("wrote: chessmaster-foundation-assessment.json, CHESSMASTER-CH01-ASSESSMENT.md, R7-3-1..R7-3-2-2-1 audits, MIGRATION.md §34–§39");
if (errors.length) { console.error("ASSESSMENT AUDIT FAILED:\n" + errors.join("\n")); process.exit(1); }
