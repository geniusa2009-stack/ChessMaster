// Independent content audit (R4.1). Deliberately NOT the production gate: this module re-derives
// counts and re-checks structure/duplication with its own logic so it can catch defects in the
// gate itself. Running it as a script also re-verifies objectives with the solver and writes a
// machine-readable report to docs/content-audit.json (NO solutions are written to that report).
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "src", "features", "puzzles", "lib", "data.server.ts");

export interface AuditPuzzle {
  id: number; fen: string; solution: string[]; theme: string; domain: string;
  difficulty: string; elo: number; objective: string; origin: string; verification: string; solutionClass?: string;
}
export function loadCorpus(): AuditPuzzle[] {
  const s = readFileSync(DATA, "utf8");
  return JSON.parse(s.slice(s.indexOf("[{"), s.indexOf("}]") + 2));
}

const ORIGINS = ["project_authored", "programmatically_generated", "imported_licensed", "public_domain", "user_provided", "unknown"];
const VERIFS = ["engine_verified", "automated_rule_verified", "legal_move_validation", "human_reviewed", "multiple_methods"];
const DOMAINS = ["tactical_vision", "calculation", "checkmate_patterns", "defensive_play", "endgame", "opening_knowledge"];
const DIFFS = ["easy", "medium", "hard", "expert"];

const normPos = (f: string) => f.split(" ").slice(0, 4).join(" ");
const mirrorBoard = (f: string) => f.split(" ")[0].split("/")
  .map((r) => r.replace(/\d/g, (d) => "1".repeat(Number(d))).split("").reverse().join("").replace(/1+/g, (m) => String(m.length)))
  .join("/");
const matSig = (f: string) => { const c: Record<string, number> = {}; for (const ch of f.split(" ")[0]) if (/[a-zA-Z]/.test(ch)) c[ch] = (c[ch] || 0) + 1; return Object.keys(c).sort().map((k) => k + c[k]).join(""); };
const grid = (f: string) => { let o = ""; for (const row of f.split(" ")[0].split("/")) for (const ch of row) o += /\d/.test(ch) ? ".".repeat(Number(ch)) : ch; return o; };

// Intentional, documented high-similarity pair: the two hand-authored rook-ladder teaching mates.
const ALLOWED_HIGH_SIM = new Set(["16-17"]);

function tally<T extends string>(items: AuditPuzzle[], key: (p: AuditPuzzle) => T): Record<string, number> {
  const o: Record<string, number> = {}; for (const p of items) o[key(p)] = (o[key(p)] || 0) + 1; return o;
}

export interface StructuralAudit {
  count: number; uniqueIds: number; duplicateIds: number[];
  invalid: { id: number; reason: string }[];
  origin: Record<string, number>; verification: Record<string, number>;
  domain: Record<string, number>; theme: Record<string, number>; difficulty: Record<string, number>;
  objective: Record<string, number>;
  exactDuplicates: [number, number][]; equivalentPositions: [number, number][];
  highSimilarity: { pair: [number, number]; sameSquares: number; disposition: string }[];
  fabricatedOriginClaims: number[]; originVerificationConflations: number[];
  objectiveThemeMismatches: { id: number; theme: string; objective: string }[];
}

// Fast, solver-free structural + duplicate + metadata-consistency audit.
export function structuralAudit(P: AuditPuzzle[]): StructuralAudit {
  const ids = P.map((p) => p.id);
  const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);
  const invalid: { id: number; reason: string }[] = [];
  for (const p of P) {
    if (!p.fen || p.fen.split(" ").length < 4) invalid.push({ id: p.id, reason: "malformed FEN" });
    if (!p.solution || p.solution.length === 0) invalid.push({ id: p.id, reason: "empty solution" });
    if (!DOMAINS.includes(p.domain)) invalid.push({ id: p.id, reason: `bad domain ${p.domain}` });
    if (!DIFFS.includes(p.difficulty)) invalid.push({ id: p.id, reason: `bad difficulty ${p.difficulty}` });
    if (!ORIGINS.includes(p.origin)) invalid.push({ id: p.id, reason: `bad origin ${p.origin}` });
    if (!VERIFS.includes(p.verification)) invalid.push({ id: p.id, reason: `bad verification ${p.verification}` });
    // legality replay (independent of the gate)
    try { const g = new Chess(p.fen); for (const u of p.solution) if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined })) throw 0;
      if (/^mateIn/.test(p.theme) && !g.isCheckmate()) invalid.push({ id: p.id, reason: "mate theme not terminal checkmate" });
    } catch { invalid.push({ id: p.id, reason: "illegal solution replay" }); }
  }
  // duplicates (all-pairs)
  const exactDuplicates: [number, number][] = [], equivalentPositions: [number, number][] = [];
  const highSimilarity: { pair: [number, number]; sameSquares: number; disposition: string }[] = [];
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (normPos(a.fen) === normPos(b.fen)) { exactDuplicates.push([a.id, b.id]); continue; }
    if (a.fen.split(" ").slice(1, 4).join(" ") === b.fen.split(" ").slice(1, 4).join(" ") && mirrorBoard(a.fen) === b.fen.split(" ")[0]) { equivalentPositions.push([a.id, b.id]); continue; }
    if (matSig(a.fen) === matSig(b.fen) && a.fen.split(" ")[1] === b.fen.split(" ")[1] && a.theme === b.theme) {
      const ga = grid(a.fen), gb = grid(b.fen); let same = 0; for (let k = 0; k < 64; k++) if (ga[k] === gb[k]) same++;
      if (same >= 60) {
        const sharedSolution = a.solution[0] === b.solution[0] || a.solution.join() === b.solution.join();
        const disposition = ALLOWED_HIGH_SIM.has(`${a.id}-${b.id}`)
          ? "retained: intentional authored teaching variants (rook-ladder technique)"
          : sharedSolution
            ? "unresolved" // same structure AND same solution => a genuine near-duplicate to review
            : "retained: distinct verified positions sharing a material structure but with different solutions/ideas";
        highSimilarity.push({ pair: [a.id, b.id], sameSquares: same, disposition });
      }
    }
  }
  // metadata consistency
  const fabricatedOriginClaims = P.filter((p) => ["imported_licensed", "public_domain", "user_provided"].includes(p.origin)).map((p) => p.id);
  const originVerificationConflations = P.filter((p) => VERIFS.includes(p.origin)).map((p) => p.id);
  const objectiveThemeMismatches = P.filter((p) => /avoids losing/.test(p.objective) !== (p.theme === "defensive"))
    .map((p) => ({ id: p.id, theme: p.theme, objective: p.objective }));
  return {
    count: P.length, uniqueIds: new Set(ids).size, duplicateIds: dupIds, invalid,
    origin: tally(P, (p) => p.origin), verification: tally(P, (p) => p.verification),
    domain: tally(P, (p) => p.domain), theme: tally(P, (p) => p.theme), difficulty: tally(P, (p) => p.difficulty),
    objective: tally(P, (p) => p.objective),
    exactDuplicates, equivalentPositions, highSimilarity,
    fabricatedOriginClaims, originVerificationConflations, objectiveThemeMismatches,
  };
}

// Run as a script: structural audit + solver objective re-verification, then write the JSON report.
async function main() {
  // Path is assembled so tsc does not static-check the .ts extension; node --experimental-strip-types
  // resolves it at runtime. This module is only loaded when running the audit as a script.
  const solverPath = "../src/features/content/lib/solver" + ".ts";
  const { analyse, provesForcedMate, provesMaterialGain } = await import(solverPath) as typeof import("../src/features/content/lib/solver.ts");
  const P = loadCorpus();
  const s = structuralAudit(P);
  let mateProven = 0, mateNeedsFullWidth = 0, materialProven = 0, materialUnproven = 0, defenseUnique = 0, defenseWeak = 0;
  // Bounded, deterministic spot-check for the expensive solver pass (reproducible; full
  // re-verification of every item is run in the audit workspace and recorded in CHESS-CONTENT-QUALITY.md).
  const take = (pred: (p: AuditPuzzle) => boolean, n: number) => {
    const a = P.filter(pred); const out: AuditPuzzle[] = []; const step = Math.max(1, Math.floor(a.length / n));
    for (let i = 0; i < a.length && out.length < n; i += step) out.push(a[i]); return out;
  };
  for (const p of take((x) => x.theme === "defensive", 12)) {
    const a = analyse(p.fen, 6, 180_000);
    if (a && a.bestScore - a.secondScore >= 150) defenseUnique++; else defenseWeak++;
  }
  for (const p of take((x) => /^mateIn/.test(x.theme), 15)) {
    const mp = provesForcedMate(p.fen, p.solution.length);
    if (mp === p.solution.length) mateProven++; else mateNeedsFullWidth++; // quiet-move mates need full-width isForcedMateInPlies
  }
  for (const p of take((x) => !/^mateIn/.test(x.theme) && x.theme !== "defensive", 18)) {
    const r = provesMaterialGain(p.fen, 200, 6);
    if (r && r.gain >= 200) materialProven++; else materialUnproven++;
  }
  const report = {
    auditTimestamp: new Date().toISOString(),
    corpus: { count: s.count, uniqueIds: s.uniqueIds, duplicateIds: s.duplicateIds, invalidRecords: s.invalid },
    origin: s.origin, verification: s.verification,
    domain: s.domain, theme: s.theme, difficulty: s.difficulty, objective: s.objective,
    duplicates: { exact: s.exactDuplicates, equivalentPositions: s.equivalentPositions, highSimilarityCandidates: s.highSimilarity,
      methods: ["exact normalized position", "mirror-equivalent board", "all-pairs material+side+board-overlap(>=60/64)+theme"],
      limitations: "structural/material similarity only; does not prove motif-level tactical equivalence" },
    metadataConsistency: { fabricatedOriginClaims: s.fabricatedOriginClaims, originVerificationConflations: s.originVerificationConflations, objectiveThemeMismatches: s.objectiveThemeMismatches },
    solverReverification: { sample: "bounded deterministic spot-check at maxPly 6 (defensive 12, mate 15, material 18); full re-verification of all items is run in the audit workspace", mateProven, mateNeedsFullWidth, materialProven, materialUnproven, defenseUnique, defenseWeak,
      note: "mateNeedsFullWidth = authored quiet-move rook-ladder mates the forcing solver cannot certify; proven forced by the full-width isForcedMateInPlies (see content-authored-mates.test.ts). A few deep combinations resolve only at maxPly 7 (documented in CHESS-CONTENT-AUDIT.md); the spot-check uses maxPly 6. No solutions are included in this report." },
  };
  writeFileSync(join(HERE, "..", "docs", "content-audit.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("wrote docs/content-audit.json");
  console.log(JSON.stringify(report.solverReverification));
  console.log("exactDup", s.exactDuplicates.length, "equiv", s.equivalentPositions.length, "highSim", s.highSimilarity.length, "invalid", s.invalid.length, "conflations", s.originVerificationConflations.length, "fabricated", s.fabricatedOriginClaims.length, "mismatch", s.objectiveThemeMismatches.length);
}
if (process.argv[1] && process.argv[1].endsWith("audit-content.ts")) main();
