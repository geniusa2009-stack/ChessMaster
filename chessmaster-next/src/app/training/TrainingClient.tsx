"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/I18nProvider";

interface Skill { domain: string; score: number; confidence: number; attempts: number; sufficient: boolean; trend: string }
interface Dna { domain: string; band: string; score: number | null; note: string }
interface Weakness { theme: string; attempts: number; fails: number; failRate: number }
interface Profile { skills: Skill[]; dna: Dna[]; weaknesses: Weakness[]; dueCount: number; focus: string | null; hasHistory: boolean }
interface Rec { puzzleId: number | null; reason: string; theme?: string; difficulty?: string; contentStatus: string }
interface CurSkill { id: string; domain: string; nameKey: string; objectiveKey: string; confidence: string; prerequisites: string[]; prerequisitesMet: boolean; state: string; reviewDue: boolean; coverage: string; eligible: number; attempts: number; distinctSolved: number }
interface CurRec { skillId: string | null; puzzleId: number | null; reason: string; difficulty?: string; contentStatus: string; skillNameKey: string | null; objectiveKey: string | null }
interface Curriculum { skills: CurSkill[]; unavailableSkills: { id: string; domain: string; nameKey: string }[]; recommendation: CurRec; dueCount: number; hasHistory: boolean }

const nice = (d: string) => d.replace(/_/g, " ");

export function TrainingClient() {
  const t = useT();
  const [p, setP] = useState<Profile | null>(null);
  const [rec, setRec] = useState<Rec | null>(null);
  const [cur, setCur] = useState<Curriculum | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pr, nx, cr] = await Promise.all([fetch("/api/training/profile"), fetch("/api/training/next"), fetch("/api/curriculum")]);
      if (!pr.ok || !nx.ok) { setErr(t("common.signInRequired")); return; }
      setP(await pr.json()); setRec(await nx.json());
      if (cr.ok) setCur(await cr.json());
    } catch { setErr(t("common.networkError")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <main style={{ padding: 40, color: "#e57373" }}>{err}</main>;
  if (!p || !rec) return <main style={{ padding: 40 }}>{t("training.loading")}</main>;

  const reasonKey = ("training.reason." + rec.reason) as "training.reason.progression";

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 20, display: "grid", gap: 20 }}>
      <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("training.title")}</h1>

      <section className="cm-panel" style={{ padding: 20, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("training.focus")}</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{p.focus ? nice(p.focus) : t("training.reason.cold_start")}</div>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>{t(reasonKey)}{rec.difficulty ? ` · ${rec.difficulty}` : ""}</div>
        {rec.puzzleId != null
          ? <Link className="cm-btn" style={{ justifySelf: "start" }} href={`/puzzles?id=${rec.puzzleId}`}>{t("training.start")}</Link>
          : <div style={{ color: "var(--muted)" }}>{t("training.reason.none")}</div>}
      </section>

      {cur && (
        <section className="cm-panel" style={{ padding: 20, display: "grid", gap: 12 }} aria-labelledby="curr-h">
          <h2 id="curr-h" style={{ margin: 0, color: "var(--green-glow)", fontSize: 18 }}>{t("curr.title")}</h2>
          {/* recommended next step, with an explainable reason */}
          <div style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--line)", borderRadius: 8 }} aria-live="polite">
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("curr.recommended")}</div>
            <div style={{ fontWeight: 800 }}>{cur.recommendation.skillNameKey ? t(cur.recommendation.skillNameKey as "curr.title") : t("curr.reason.none")}</div>
            {cur.recommendation.objectiveKey && <div style={{ fontSize: 13 }}>{t("curr.objective")}: {t(cur.recommendation.objectiveKey as "curr.title")}</div>}
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("curr.why")}: {t(("curr.reason." + cur.recommendation.reason) as "curr.reason.none")}{cur.recommendation.difficulty ? ` · ${cur.recommendation.difficulty}` : ""}</div>
            {cur.recommendation.puzzleId != null
              ? <Link className="cm-btn" style={{ justifySelf: "start" }} href={`/puzzles?id=${cur.recommendation.puzzleId}`}>{t("curr.start")}</Link>
              : <div style={{ color: "var(--muted)" }}>{t("curr.noContent")}</div>}
          </div>
          {/* skill ladder */}
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {cur.skills.map((s) => (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 160, fontSize: 14 }}>
                  {t(s.nameKey as "curr.title")}
                  {s.confidence === "provisional" && <em style={{ color: "var(--muted)", fontSize: 11 }}> · {t("curr.provisional")}</em>}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.distinctSolved}/{s.eligible}</span>
                <span aria-label={t(("curr.state." + s.state) as "curr.state.available")} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--line)" }}>
                  {s.reviewDue ? t("curr.reason.review_due").split("—")[0].trim() : t(("curr.state." + s.state) as "curr.state.available")}
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)", width: 80, textAlign: "end" }}>{t(("curr.coverage." + s.coverage) as "curr.coverage.limited")}</span>
              </li>
            ))}
          </ul>
          {/* honest declaration of not-yet-supported skills */}
          {cur.unavailableSkills.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {t("curr.futureContent")}: {cur.unavailableSkills.map((u) => t(u.nameKey as "curr.title")).join(" · ")}
            </div>
          )}
        </section>
      )}

      <section className="cm-panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, color: "var(--green-glow)", fontSize: 18 }}>{t("training.domains")}</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {p.skills.map((s) => (
            <div key={s.domain} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 160, fontSize: 14 }}>{nice(s.domain)}</div>
              <div style={{ flex: 1, background: "#1a1916", height: 10, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: (s.sufficient ? s.score : 0) + "%", height: "100%", background: "var(--green)" }} />
              </div>
              <div style={{ width: 130, textAlign: "end", fontSize: 12, color: "var(--muted)" }}>
                {s.sufficient ? `${s.score} · ${s.trend}` : t("training.insufficient")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cm-panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, color: "var(--green-glow)", fontSize: 18 }}>
          {t("training.weaknesses")} · {t("training.due")}: {p.dueCount}
        </h2>
        {p.weaknesses.length === 0
          ? <div style={{ color: "var(--muted)" }}>{t("training.none")}</div>
          : <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {p.weaknesses.map((w) => (
                <li key={w.theme}>{w.theme}: {w.fails}/{w.attempts} ({Math.round(w.failRate * 100)}%)</li>
              ))}
            </ul>}
      </section>
    </main>
  );
}
