"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { BoardDemoPlayer } from "@/features/campaign/components/BoardDemoPlayer";
import { FOUNDATION_LESSONS, FOUNDATION_DEMOS, FOUNDATION_ASSESSMENT, FOUNDATION_ASSESSMENT_LEVEL, COMPETENCIES, COMPETENCY_GROUPS } from "@/features/campaign/lib/foundations";

interface CampaignLvl { id: string; state: string }
interface CompResult { competency: string; status: string; lessonId: string | null; minContexts: number; contextsDemonstrated: number }
interface Grade { passed: boolean; score: number; total: number; perItem: { id: string; competency: string; correct: boolean }[];
  perCompetency: CompResult[]; remediation: { competency: string; lessonId: string | null }[] }
// R7.3.2: the attempt is SERVER-ISSUED. /start returns a rotated subset of prompts + a signed token
// that binds those items to this attempt; we render only the issued items and submit the token back.
interface IssuedItem { id: string; competency: string; contextKey: string; type: string; fen: string | null;
  square: string | null; promptAr: string; options: string[]; objectiveKind: string | null; target: string | null }
interface StartPayload { token: string; items: IssuedItem[]; selectedCount: number; poolSize: number;
  mandatoryCompetencies: number; contextsPerCompetency: number }

const COMP_LABEL: Record<string, string> = Object.fromEntries(COMPETENCIES.map((c) => [c.id, c.label]));
const COMP_GROUP: Record<string, string> = Object.fromEntries(COMPETENCIES.map((c) => [c.id, c.group]));
const GROUP_LABEL_AR: Record<string, string> = {
  board: "فهم الرقعة", movement: "حركة القطع", rules: "قواعد الحركة", king_safety: "أمان الملك", special: "النقلات الخاصة",
};
const STATUS_AR: Record<string, string> = {
  demonstrated: "مُتقَن ✓", needs_remediation: "يحتاج تدريب", insufficient_evidence: "أدلة غير كافية", not_attempted: "لم يُحاوَل",
};
const STATUS_COLOR: Record<string, string> = {
  demonstrated: "var(--green)", needs_remediation: "#e0b341", insufficient_evidence: "#e0b341", not_attempted: "var(--muted)",
};

export function FoundationsClient() {
  const t = useT();
  const [states, setStates] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string>(FOUNDATION_LESSONS[0].id);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [drills, setDrills] = useState<Record<string, string>>({}); // move_objective item id -> uci played
  const [grade, setGrade] = useState<Grade | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<StartPayload | null>(null); // server-issued rotation + token
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/campaign"); if (r.ok) { const d = await r.json(); const m: Record<string, string> = {}; for (const l of d.levels as CampaignLvl[]) m[l.id] = l.state; setStates(m); } }
    catch { /* presentation only */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Start (or restart) an attempt: the SERVER selects the rotated items and issues the signed token.
  const startAttempt = useCallback(async () => {
    setErr(null); setStarting(true); setGrade(null); setAnswers({}); setDrills({});
    try {
      const res = await fetch("/api/foundations/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) { setErr(t("common.networkError")); setAttempt(null); return; }
      setAttempt(await res.json() as StartPayload);
    } catch { setErr(t("common.networkError")); setAttempt(null); }
    finally { setStarting(false); }
  }, [t]);

  const submit = async () => {
    if (!attempt || submitting) return;
    setErr(null); setSubmitting(true);
    try {
      const res = await fetch("/api/foundations/attempt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: "CH01", token: attempt.token, answers: attempt.items.map((p) =>
          p.type === "move_objective"
            ? { id: p.id, uci: drills[p.id] ?? "" }
            : { id: p.id, answerIndex: answers[p.id] ?? -1 }) }) });
      if (!res.ok) { setErr(t("common.networkError")); return; }
      setGrade(await res.json()); void load();
    } catch { setErr(t("common.networkError")); }
    finally { setSubmitting(false); }
  };

  const lesson = FOUNDATION_LESSONS.find((l) => l.id === open)!;
  const demos = FOUNDATION_DEMOS.filter((d) => d.lessonId === open);
  const lessonTitle = (id: string | null) => FOUNDATION_LESSONS.find((l) => l.id === id)?.title ?? id ?? "";

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("found.title")}</h1>
      <nav aria-label={t("found.lessons")} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FOUNDATION_LESSONS.map((l) => (
          <button key={l.id} onClick={() => { setOpen(l.id); setGrade(null); }} aria-current={open === l.id}
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: open === l.id ? "var(--green)" : "transparent", color: "var(--off-white)", cursor: "pointer" }}>
            {l.title}{states[l.id] === "passed" ? " ✓" : ""}
          </button>
        ))}
      </nav>

      {open !== FOUNDATION_ASSESSMENT_LEVEL ? (
        <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 10 }} aria-labelledby="les-h">
          <h2 id="les-h" style={{ margin: 0, fontSize: 18 }}>{lesson.title}</h2>
          <div style={{ fontSize: 14 }}>{t("found.objective")}: {lesson.objectiveAr}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{t("found.videoScript")}</div>
          {demos.map((d) => (
            <div key={d.id} style={{ display: "grid", gap: 6, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div>
              {d.legal
                ? <BoardDemoPlayer demo={{ id: d.id, fen: d.fen, sequence: d.sequence, highlight: d.highlight, arrows: d.arrows, conclusion: d.conclusion }} mode="guided" />
                : <div style={{ display: "grid", gap: 6 }}>
                    <BoardDemoPlayer demo={{ id: d.id, fen: d.fen, sequence: [], highlight: d.highlight, arrows: d.arrows, conclusion: d.observe }} mode="guided" />
                    <div style={{ fontSize: 13, color: "#e0b341" }}>محاولة غير قانونية: {d.rejectedUci} — {d.rejectReason}</div>
                  </div>}
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{d.conclusion}</div>
            </div>
          ))}
          <details>
            <summary style={{ cursor: "pointer" }}>{t("found.tryIt")}</summary>
            {demos[0] && <BoardDemoPlayer demo={{ id: demos[0].id + "-practice", fen: demos[0].fen, sequence: [] }} mode="interactive" />}
          </details>
        </section>
      ) : (
        <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 12 }} aria-labelledby="as-h">
          <h2 id="as-h" style={{ margin: 0, fontSize: 18 }}>{t("found.assessment")}</h2>
          {!attempt ? (
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ fontSize: 14, margin: 0 }}>
                اختبار قواعد مُقيَّم على الخادم. يختار الخادم لك مجموعة أسئلة متجدّدة في كل محاولة. لإتمام الفصل يجب
                إثبات <strong>كل</strong> مهارة أساسية إجبارية في موقفين مختلفين على الأقل — المجموع معلومة مساعِدة فقط.
              </p>
              <button className="cm-btn" style={{ justifySelf: "start" }} onClick={startAttempt} disabled={starting}>
                {starting ? "جارٍ التحضير…" : "ابدأ الاختبار"}
              </button>
              {err && <div style={{ color: "#e57373" }}>{err}</div>}
            </div>
          ) : (
          <>
          <div role="status" style={{ fontSize: 12, color: "var(--muted)" }}>
            أسئلة هذه المحاولة: {attempt.selectedCount} (من أصل بنك {attempt.poolSize} سؤالاً) — تغطّي {attempt.mandatoryCompetencies} مهارة إجبارية،
            {" "}بمعدّل {attempt.contextsPerCompetency} موقف لكل مهارة. الأسئلة تتدوّر في كل محاولة.
          </div>
          {attempt.items.map((p, i) => (
            <fieldset key={p.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
              <legend style={{ fontSize: 13 }}>{i + 1}. {p.promptAr}</legend>
              {p.type === "move_objective" ? (
                <div style={{ display: "grid", gap: 4 }}>
                  <BoardDemoPlayer demo={{ id: p.id + "-drill", fen: p.fen!, sequence: [] }} mode="interactive" size={320}
                    onLegal={(uci) => setDrills((d) => ({ ...d, [p.id]: uci }))} />
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {drills[p.id] ? `نقلتك المُسجَّلة: ${drills[p.id]}` : "العب النقلة المطلوبة على الرقعة."}
                    {grade && <span aria-hidden> {grade.perItem.find((x) => x.id === p.id)?.correct ? "✓" : "✗"}</span>}
                  </div>
                </div>
              ) : (
                <>
                  {p.fen && <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "monospace" }}>{p.fen}</div>}
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    {p.options.map((opt, idx) => (
                      <label key={idx} style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
                        <input type="radio" name={p.id} checked={answers[p.id] === idx} onChange={() => setAnswers((a) => ({ ...a, [p.id]: idx }))} /> {opt}
                      </label>
                    ))}
                    {grade && <span aria-hidden>{grade.perItem.find((x) => x.id === p.id)?.correct ? "✓" : "✗"}</span>}
                  </div>
                </>
              )}
            </fieldset>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cm-btn" style={{ justifySelf: "start" }} onClick={submit} disabled={submitting || !!grade}>
              {submitting ? "جارٍ التصحيح…" : t("found.submit")}
            </button>
            <button className="cm-btn" style={{ background: "transparent" }} onClick={startAttempt} disabled={starting || submitting}>
              {grade ? "محاولة جديدة" : "أسئلة أخرى"}
            </button>
          </div>
          {err && <div style={{ color: "#e57373" }}>{err}</div>}
          {grade && (
            <div style={{ display: "grid", gap: 10 }}>
              <div role="status" aria-live="polite" style={{ fontWeight: 700, color: grade.passed ? "var(--green)" : "#e0b341" }}>
                {t("found.score").replace("{score}", String(grade.score)).replace("{total}", String(grade.total))} — {grade.passed ? t("found.passed") : t("found.failed")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                إتمام الفصل يتطلّب إثبات <strong>كل</strong> مهارة أساسية إجبارية في أكثر من موقف — المجموع (score) معلومة مساعِدة فقط ولا يتجاوز بوابة المهارات.
              </div>
              {COMPETENCY_GROUPS.map((grp) => {
                const rows = grade.perCompetency.filter((c) => COMP_GROUP[c.competency] === grp.group);
                if (!rows.length) return null;
                return (
                  <div key={grp.group} aria-label={GROUP_LABEL_AR[grp.group] ?? grp.label} style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--green-glow)" }}>{GROUP_LABEL_AR[grp.group] ?? grp.label}</div>
                    {rows.map((c) => {
                      const need = Math.max(0, c.minContexts - c.contextsDemonstrated);
                      return (
                        <div key={c.competency} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, borderBottom: "1px solid var(--line)", padding: "3px 0" }}>
                          <span>{COMP_LABEL[c.competency] ?? c.competency}</span>
                          <span style={{ color: STATUS_COLOR[c.status] ?? "var(--muted)" }}>
                            {STATUS_AR[c.status] ?? c.status}
                            {c.status !== "demonstrated" && need > 0 ? <span style={{ color: "var(--muted)" }}> — باقي {need} موقف</span> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {grade.remediation.length > 0 && (
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>تدريب موجَّه:</div>
                  {grade.remediation.map((r) => (
                    <button key={r.competency} onClick={() => { if (r.lessonId) { setOpen(r.lessonId); setGrade(null); } }}
                      style={{ textAlign: "start", fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--green-glow)", cursor: "pointer" }}>
                      {COMP_LABEL[r.competency] ?? r.competency} → {lessonTitle(r.lessonId)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </section>
      )}
    </main>
  );
}
