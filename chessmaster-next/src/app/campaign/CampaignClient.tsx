"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/I18nProvider";

interface Lvl { id: string; worldId: string; chapterId: string; title: string; type: string; band: string | null; domain: string | null; skillId: string | null; objective: string; status: string; state: string; unlocked: boolean; solved: number; required: number; playable: boolean; practiceKind: string; practiceItemIds: (number | string)[]; prerequisites: string[]; nextLevelId: string | null }
interface World { id: string; title: string; theme: string }
interface Chapter { id: string; worldId: string; title: string }
interface Campaign { worlds: World[]; chapters: Chapter[]; levels: Lvl[]; summary: { totalLevels: number; playable: number; passed: number; available: number; locked: number; planned: number } }

const badge = (state: string) => ({
  passed: "var(--green)", available: "var(--green-glow)", in_progress: "#e0b341", locked: "var(--muted)", planned: "var(--muted)",
}[state] ?? "var(--muted)");

export function CampaignClient() {
  const t = useT();
  const [c, setC] = useState<Campaign | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/campaign"); if (!r.ok) { setErr(t("common.signInRequired")); return; } setC(await r.json()); }
    catch { setErr(t("common.networkError")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <main style={{ padding: 40, color: "#e57373" }}>{err}</main>;
  if (!c) return <main style={{ padding: 40 }}>{t("camp.loading")}</main>;

  const stateKey = (s: string) => ("camp.state." + s) as "camp.state.available";

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 20, display: "grid", gap: 20 }}>
      <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("camp.title")}</h1>
      <div style={{ color: "var(--muted)", fontSize: 14 }}>
        {t("camp.summary").replace("{passed}", String(c.summary.passed)).replace("{playable}", String(c.summary.playable)).replace("{planned}", String(c.summary.planned))}
      </div>
      {c.worlds.map((w) => {
        const chapters = c.chapters.filter((ch) => ch.worldId === w.id);
        if (chapters.length === 0) return null;
        return (
          <section key={w.id} aria-labelledby={`w-${w.id}`} className="cm-panel" style={{ padding: 16, display: "grid", gap: 10 }}>
            <h2 id={`w-${w.id}`} style={{ margin: 0, fontSize: 18, color: "var(--green-glow)" }}>{w.title}</h2>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{w.theme}</div>
            {chapters.map((ch) => (
              <div key={ch.id} style={{ display: "grid", gap: 6 }}>
                <h3 style={{ margin: "6px 0 0", fontSize: 15 }}>{ch.title}</h3>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                  {c.levels.filter((l) => l.chapterId === ch.id).map((l) => (
                    <li key={l.id}>
                      <button onClick={() => setOpen(open === l.id ? null : l.id)}
                        aria-expanded={open === l.id}
                        style={{ width: "100%", textAlign: "start", display: "flex", gap: 10, alignItems: "center", background: "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", color: "var(--off-white)", cursor: "pointer" }}>
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: badge(l.state), flex: "0 0 auto" }} />
                        <span style={{ flex: 1, fontSize: 14 }}>{l.title}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{t(stateKey(l.state))}{l.required > 0 && l.playable ? ` · ${l.solved}/${l.required}` : ""}</span>
                      </button>
                      {open === l.id && (
                        <div style={{ padding: "8px 12px", fontSize: 13, display: "grid", gap: 4 }}>
                          <div>{t("camp.objective")}: {l.objective}</div>
                          {l.prerequisites.length > 0 && <div style={{ color: "var(--muted)" }}>{t("camp.prereqs")}: {l.prerequisites.join(", ")}</div>}
                          <div style={{ color: "var(--muted)" }}>{t("camp.videoPlanned")}</div>
                          {l.state === "planned" && <div style={{ color: "var(--muted)" }}>{t("camp.plannedNote")}</div>}
                          {(l.type === "concept" || l.type === "review") && l.state !== "planned" && <div style={{ color: "var(--muted)" }}>{t("camp.limitedNote")}</div>}
                          {l.unlocked && l.playable && l.practiceKind === "puzzles" && l.practiceItemIds.length > 0 && (
                            <Link className="cm-btn" style={{ justifySelf: "start" }} href={`/puzzles?id=${l.practiceItemIds[0]}`}>{t("camp.start")}</Link>
                          )}
                          {l.unlocked && l.playable && l.practiceKind === "openings" && (
                            <Link className="cm-btn" style={{ justifySelf: "start" }} href={`/openings`}>{t("camp.start")}</Link>
                          )}
                          {l.unlocked && (l.practiceKind === "lesson" || l.practiceKind === "rules_assessment") && (
                            <Link className="cm-btn" style={{ justifySelf: "start" }} href={`/foundations`}>{t("camp.start")}</Link>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
