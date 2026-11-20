"use client";
import { useT } from "@/i18n/I18nProvider";
import { useCallback, useEffect, useState } from "react";
import { fetchProgression, claimQuest, buyPerk, syncAchievements, type Progression } from "@/features/rpg/services/api";

export function ProgressClient() {
  const t = useT();
  const [data, setData] = useState<Progression | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    await syncAchievements(); // evaluate unlocks from authoritative data on view
    const r = await fetchProgression();
    if ("error" in r) setError(r.error);
    else { setData(r); setError(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const onClaim = async (key: string) => { setBusy("q:" + key); await claimQuest(key); await load(); setBusy(null); };
  const onBuy = async (key: string) => { setBusy("p:" + key); await buyPerk(key); await load(); setBusy(null); };

  if (error) return <main style={{ padding: 40, color: "#e57373" }}>{error}</main>;
  if (!data) return <main style={{ padding: 40 }}>{t("rpg.loading")}</main>;

  const pct = Math.round((data.xpIntoLevel / data.xpForNextLevel) * 100);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 20, display: "grid", gap: 20 }}>
      <section className="cm-panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, color: "var(--green-glow)" }}>Level {data.level}</h1>
          <span style={{ fontSize: 20 }}>{data.tier.icon} {cap(data.tier.key)}</span>
        </div>
        <div style={{ marginTop: 12, background: "#1a1916", borderRadius: 8, height: 16, overflow: "hidden", border: "1px solid var(--line)" }}>
          <div style={{ width: pct + "%", height: "100%", background: "var(--green)" }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
          {data.xp} XP total · {data.xpIntoLevel}/{data.xpForNextLevel} to next level · puzzle streak {data.streak} (best {data.bestStreak})
        </div>
      </section>

      <section className="cm-panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, color: "var(--green-glow)" }}>{t("rpg.dailyQuests")}</h2>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{t("rpg.questsReset")}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {data.quests.map((q) => (
            <div key={q.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{q.title} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({q.progress}/{q.target})</span></div>
                <div style={{ background: "#1a1916", height: 8, borderRadius: 6, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: Math.round((q.progress / q.target) * 100) + "%", height: "100%", background: q.done ? "var(--green)" : "#5a7fb0" }} />
                </div>
              </div>
              <button className="cm-btn" disabled={!q.done || q.claimed || busy === "q:" + q.key}
                style={{ opacity: !q.done || q.claimed ? 0.5 : 1, minWidth: 96 }}
                onClick={() => onClaim(q.key)}>
                {q.claimed ? t("rpg.claimed") : t("rpg.claim", { xp: q.reward })}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="cm-panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, color: "var(--green-glow)" }}>{t("rpg.achievements")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {data.achievements.map((a) => (
            <div key={a.key} title={a.title}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)",
                background: a.earned ? "rgba(129,182,76,.15)" : "rgba(255,255,255,.02)",
                color: a.earned ? "var(--green-glow)" : "var(--muted)", fontWeight: 600, fontSize: 14 }}>
              {a.earned ? "★" : "☆"} {a.title}
            </div>
          ))}
        </div>
      </section>

      <section className="cm-panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, color: "var(--green-glow)" }}>{t("rpg.skillTree")}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {data.perks.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{p.description}</div>
              </div>
              <button className="cm-btn" disabled={p.owned || data.xp < p.cost || busy === "p:" + p.key}
                style={{ opacity: p.owned || data.xp < p.cost ? 0.5 : 1, minWidth: 110 }}
                onClick={() => onBuy(p.key)}>
                {p.owned ? t("rpg.owned") : t("rpg.buy", { cost: p.cost })}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
