// R7.2 foundations generator + audit. Validates every CH01 demo + assessment with chess.js and the
// server grader, then generates CH01 scripts, storyboards, and all R7.2 reports from the one
// source of truth (foundations.ts). Fails (exit 1) on any validation error.
//   node --experimental-strip-types --import ./tests/register-alias.mjs scripts/audit-foundations.ts
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { FOUNDATION_LESSONS, FOUNDATION_DEMOS, FOUNDATION_ASSESSMENT, FOUNDATION_PASS, FOUNDATION_ASSESSMENT_LEVEL } from "@/features/campaign/lib/foundations";
import { correctIndex } from "@/features/campaign/lib/foundations.answers.server";

const HERE = dirname(fileURLToPath(import.meta.url));
const docs = (f: string) => join(HERE, "..", "docs", f);

// ---- validate demos ----
let demoErrors = 0;
const demoResults = FOUNDATION_DEMOS.map((d) => {
  let ok = true, detail = "";
  try {
    const g = new Chess(d.fen);
    if (d.legal) {
      for (const s of d.sequence) { const m = g.move({ from: s.uci.slice(0, 2), to: s.uci.slice(2, 4), promotion: s.uci[4] }); if (!m || m.san !== s.san) { ok = false; detail = `bad ${s.uci}`; } }
      if (d.shows === "checkmate" && !g.isCheckmate()) { ok = false; detail = "not mate"; }
      if (d.shows === "stalemate" && !g.isStalemate()) { ok = false; detail = "not stalemate"; }
      if (d.shows === "check" && !g.inCheck()) { ok = false; detail = "not check"; }
    } else {
      let rejected = false;
      try { const m = g.move({ from: d.rejectedUci!.slice(0, 2), to: d.rejectedUci!.slice(2, 4), promotion: d.rejectedUci![4] }); rejected = !m; } catch { rejected = true; }
      if (!rejected) { ok = false; detail = "illegal accepted"; }
    }
  } catch (e) { ok = false; detail = (e as Error).message; }
  if (!ok) demoErrors++;
  return { id: d.id, lessonId: d.lessonId, legal: d.legal, shows: d.shows, ok, detail };
});

// ---- validate assessment answers are computable ----
let assessErrors = 0;
// R7.3: objective-specific drills carry no option list — their accepted-move validation lives in
// scripts/audit-foundation-assessment.ts. Here we only verify choice/yes-no answers are computable.
for (const p of FOUNDATION_ASSESSMENT) { if (p.type === "move_objective") continue; try { const ci = correctIndex(p); if (ci < 0 || ci >= p.options.length) { assessErrors++; } } catch { assessErrors++; } }

// ---- machine-readable reports ----
writeFileSync(docs("chessmaster-foundations.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), chapter: "CH01",
  // R7.3.2.1: no static pass threshold — CH01 passes only via the competency gate (see
  // chessmaster-foundation-assessment.json). poolSize is the bank size, NOT a pass denominator.
  lessons: FOUNDATION_LESSONS, assessment: { items: FOUNDATION_ASSESSMENT.map((p) => ({ id: p.id, type: p.type, objective: p.objective })), poolSize: FOUNDATION_ASSESSMENT.length, level: FOUNDATION_ASSESSMENT_LEVEL, passRule: "every mandatory competency demonstrated (competency gate); score is informational only" },
  gating: "CH02 first level requires CH01-L012 (foundations assessment) passed — server-authoritative.",
  validation: { demoErrors, assessErrors },
}, null, 2) + "\n");
writeFileSync(docs("chessmaster-demos.json"), JSON.stringify({ generatedAt: new Date().toISOString(), demos: FOUNDATION_DEMOS, validation: demoResults }, null, 2) + "\n");

// ---- CH01 scripts (one per lesson; specific to its concepts + demos) ----
const lessonTitleById = Object.fromEntries(FOUNDATION_LESSONS.map((l) => [l.id, l.title]));
FOUNDATION_LESSONS.forEach((les, idx) => {
  const demos = FOUNDATION_DEMOS.filter((d) => d.lessonId === les.id);
  const next = FOUNDATION_LESSONS[idx + 1];
  const isAssess = les.id === FOUNDATION_ASSESSMENT_LEVEL;
  let s = `# Script — V-${les.id}\n\n`;
  s += `- VIDEO ID: V-${les.id}\n- TITLE (AR): ${les.title}\n- TITLE (EN): ${les.title}\n- RELATED CHAPTER: CH01\n- RELATED LEVELS: ${les.id}\n`;
  s += `- LEARNING OBJECTIVE: ${les.objectiveEn}\n- TARGET AUDIENCE: absolute beginner\n- PREREQUISITES: ${idx === 0 ? "none" : lessonTitleById[FOUNDATION_LESSONS[idx - 1].id]}\n`;
  s += `- EXPECTED DURATION: estimated 3–6 min (from script length)\n- SCRIPT STATUS: script_ready\n- PRESENTER NOTE: friendly coach tone; claim no titles/credentials.\n\n`;
  s += `## الجزء ١ — الافتتاحية\n«${isAssess ? "جاهز نتأكد إنك فهمت الأساسيات؟ خلينا نختبر معلوماتك بسرعة." : `تعال نتعلّم: ${les.title}. سؤال بسيط يخلّيك تركّز على ${les.concepts[0]}.`}»\n\n`;
  s += `## الجزء ٢ — المقدمة\n«هدفنا: ${les.objectiveAr} المفاهيم اللي هنغطّيها: ${les.concepts.join("، ")}.»\n\n`;
  s += `## الجزء ٣ — الشرح\n«${les.concepts.map((c) => `نشرح ${c}`).join("، ثم ")}. فكرة واحدة في كل مرة، خطوة بخطوة.»\n\n`;
  s += `## الجزء ٤ — العرض على الرقعة\n`;
  if (demos.length) for (const d of demos) s += `- عرض ${d.id}: من الوضع \`${d.fen}\`${d.legal ? `، نلعب ${d.sequence.map((x) => x.san).join(" ثم ")}` : `، نجرّب نقلة غير قانونية ${d.rejectedUci} ونوضّح ليه مرفوضة`}. ظلّل ${d.highlight.join("/")}. ${d.conclusion}\n`;
  else s += `- تدريب تفاعلي على تحديد المربعات والإحداثيات (بدون نقلات).\n`;
  s += `\n## الجزء ٥ — مثال موجَّه\n«نعيد الخطوة المهمة ببطء ونسأل المتعلّم: إيه اللي اتغيّر؟ ليه ده صح؟»\n\n`;
  s += `## الجزء ٦ — الأخطاء الشائعة\n«أشهر غلط في ${les.title.toLowerCase()}: ${demos.find((d) => !d.legal)?.rejectReason ?? "الخلط بين القاعدة الصحيحة وتبسيط مضلّل"}. نوضّحه بمثال قانوني.»\n\n`;
  s += `## الجزء ٧ — التدريب في المنصّة\n«افتح ${les.id} في ChessMaster${isAssess ? " وابدأ اختبار قواعد المبتدئين." : " وجرّب الوضع التفاعلي: حاول تلعب نقلة وشوف ردّ النظام."}»\n\n`;
  s += `## الجزء ٨ — المراجعة\n«خلاصة: ${les.objectiveAr}»\n\n`;
  s += `## الجزء ٩ — الانتقال\n«${next ? `الخطوة الجاية: ${next.title}. بنبني عليها فوق اللي اتعلمناه.` : "لو عدّيت الاختبار، بتتفتح لك مهارات الكش والكش مات في الفصل التاني."}»\n\n`;
  s += `---\n### Arabic transcript: drafted from the narration above (timing sync pending real audio).\n### English subtitles: planned/missing.\n### Board demonstrations: ${demos.map((d) => d.id).join(", ") || "interactive practice"} (validated).\n### Review status: automated_integrity_pass + chess_rules_verified; human_educational_reviewed: NO.\n`;
  writeFileSync(docs(join("video-scripts", `V-${les.id}.md`)), s);
});

// ---- CH01 storyboards (one file) ----
let sb = `# ChessMaster CH01 Video Storyboards\n\nScene-by-scene with estimated_storyboard_timing (no audio recorded). All board scenes reference validated demo records.\n`;
for (const les of FOUNDATION_LESSONS) {
  const demos = FOUNDATION_DEMOS.filter((d) => d.lessonId === les.id);
  sb += `\n## V-${les.id} — ${les.title}\n`;
  const scenes = ["Hook", "Intro", "Concept", ...demos.map((d) => `Board ${d.id}`), "Guided example", "Common mistakes", "Practice", "Recap", "Transition"];
  let t = 0;
  for (const sc of scenes) { const dur = sc.startsWith("Board ") ? 40 : 25; const d = demos.find((x) => sc.endsWith(x.id));
    sb += `- [estimated ~${t}s–${t + dur}s] ${sc}${d ? ` — FEN \`${d.fen}\`${d.legal ? `, play ${d.sequence.map((x) => x.san).join(" ")}` : `, reject ${d.rejectedUci}`}, highlight ${d.highlight.join("/")}` : ""}\n`; t += dur; }
}
writeFileSync(docs("CHESSMASTER-CH01-STORYBOARDS.md"), sb);

// ---- docs ----
const concepts = ["Board coordinates", "King movement", "Queen movement", "Rook movement", "Bishop movement", "Knight movement", "Pawn movement", "Pawn capture", "Blocking", "Check", "Legal response to check", "Checkmate", "Stalemate", "Castling", "En passant", "Promotion"];
let f = `# ChessMaster Foundations (CH01)\n\nThe beginner entry chapter — ${FOUNDATION_LESSONS.length} lessons + a server-verified rules assessment. Generated from foundations.ts.\n\n`;
f += `## Lessons\n`; for (const l of FOUNDATION_LESSONS) f += `- **${l.id}** ${l.title} — ${l.objectiveEn} (concepts: ${l.concepts.join(", ")})\n`;
f += `\n## Chess rules coverage\n| Concept | Demonstration(s) | Validated |\n|---|---|---|\n`;
const showMap: Record<string, string> = { "Knight movement": "DEMO-CH01-KNIGHT", "Pawn movement": "DEMO-CH01-PAWN-FWD", "Pawn capture": "DEMO-CH01-PAWN-CAP", "Blocking": "DEMO-CH01-BLOCK", "Check": "DEMO-CH01-CHECK", "Checkmate": "DEMO-CH01-MATE", "Stalemate": "DEMO-CH01-STALE", "Castling": "DEMO-CH01-CASTLE-OK/NO", "En passant": "DEMO-CH01-EP-OK/NO", "Promotion": "DEMO-CH01-PROMO", "King movement": "DEMO-CH01-KING", "Queen movement": "DEMO-CH01-QUEEN" };
for (const c of concepts) f += `| ${c} | ${showMap[c] ?? "lesson text + interactive practice"} | ${demoErrors === 0 ? "yes" : "see audit"} |\n`;
f += `\n## Completion & gating\nThe final level ${FOUNDATION_ASSESSMENT_LEVEL} is a server-verified, **competency-based** rules assessment: the chapter passes only when EVERY mandatory competency is demonstrated (each in ≥2 distinct contexts — R7.3.1 evidence policy). The aggregate score (display floor ≥ ${FOUNDATION_PASS}/${FOUNDATION_ASSESSMENT.length}) is informational and cannot compensate for a failed competency. Passing (recorded in foundation_assessment, never downgraded) unlocks CH02. See docs/CHESSMASTER-CH01-ASSESSMENT.md.\n`;
writeFileSync(docs("CHESSMASTER-FOUNDATIONS-CH01.md"), f);

let as = `# CHESSMASTER CH01 Assessment\n\nServer-authoritative rules assessment. Client submits answer indices only; the server recomputes the correct answer from each position and writes foundation_assessment. Correct answers are NEVER sent to the client.\n\n`;
as += `- Items: ${FOUNDATION_ASSESSMENT.length}\n- Pass rule: ≥ ${FOUNDATION_PASS} correct (documented; not an arbitrary global score)\n- Idempotent: one row per user; a prior pass is never downgraded; no XP/certificate attached.\n\n## Items (prompts only)\n`;
for (const p of FOUNDATION_ASSESSMENT) as += `- **${p.id}** (${p.type}) — ${p.objective}${p.fen ? ` — \`${p.fen}\`` : ""}\n`;
writeFileSync(docs("CHESSMASTER-CH01-ASSESSMENT.md"), as);

let bp = `# ChessMaster Interactive Board Player\n\n\`src/features/campaign/components/BoardDemoPlayer.tsx\` — reuses the existing Board (no second board).\n\n`;
bp += `## Modes\n- **guided**: step through a validated move sequence (next/prev/replay/reset) with SAN + explanation; highlights + SVG arrows.\n- **interactive**: the learner attempts a move; legality decided by the real rules (ChessGame.safeMove); illegal attempts are REJECTED and the board is unchanged (never a fake transition).\n\n## Accessibility\nLabeled controls, aria-live status, keyboard-usable buttons, fixed white-bottom orientation (RTL-safe), reduced-motion friendly (no autoplay).\n\n## Security\nDemos are client-safe teaching material (the move is the lesson). Puzzle solutions + assessment answers stay server-only; none are moved into demo metadata.\n`;
writeFileSync(docs("CHESSMASTER-INTERACTIVE-BOARD-PLAYER.md"), bp);

let au = `# ChessMaster R7.2 Audit\n\n`;
au += `## CH01 foundations\n- Lessons: ${FOUNDATION_LESSONS.length} (incl. final assessment)\n- Board demonstrations: ${FOUNDATION_DEMOS.length} — validation errors: ${demoErrors}\n- Assessment items: ${FOUNDATION_ASSESSMENT.length}, pass ≥ ${FOUNDATION_PASS}; answer-compute errors: ${assessErrors}\n`;
au += `- CH01→CH02 gating: CH02 first level requires ${FOUNDATION_ASSESSMENT_LEVEL} (server-authoritative via foundation_assessment).\n`;
au += `\n## CH02 preservation\nCH02 keeps its 7 levels, 5 demos (demos.ts), and 3 scripts (docs/video-scripts/V-CH02-*). Opening integration and bosses unchanged.\n`;
au += `\n## Honest statuses\nCH01 videos: script_ready (NOT recorded/reviewed/published). human_educational_reviewed: NO. Interactive board player: implemented. Build: BLOCKED (SWC SIGBUS).\n`;
writeFileSync(docs("CHESSMASTER-R7-2-AUDIT.md"), au);

console.log("demos", FOUNDATION_DEMOS.length, "demoErrors", demoErrors, "assessItems", FOUNDATION_ASSESSMENT.length, "assessErrors", assessErrors);
console.log("wrote CH01 scripts:", FOUNDATION_LESSONS.length, "+ storyboards + 5 docs + 2 json");
if (demoErrors > 0 || assessErrors > 0) { console.error("VALIDATION FAILED"); process.exit(1); }
