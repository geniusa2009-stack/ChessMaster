"use client";
import { useT } from "@/i18n/I18nProvider";
import { Board } from "@/features/chess/components/Board";
import { useOpening } from "@/features/openings/hooks/useOpening";

const TIER_ICON: Record<string, string> = { beginner: "\u{1F331}", intermediate: "⚔️", advanced: "\u{1F451}" };

export function OpeningsClient() {
  const t = useT();
  const { state, selected, onSquare, hint, stepNext, reset, select } = useOpening();

  if (state.loading) return <main style={{ padding: 40 }}>{t("openings.loading")}</main>;
  if (state.error) return <main style={{ padding: 40, color: "#e57373" }}>{state.error}</main>;

  const legal = selected ? state.legalTargets : (state.hint ? [state.hint.to] : []);
  const o = state.opening;
  const total = o ? o.moveSequence.length : 0;

  return (
    <main className="game-layout">
      <section>
        <div className="board-wrap"><Board fen={state.fen} selected={selected ?? state.hint?.from ?? null} legalTargets={legal} onSquare={onSquare} size={480} /></div>
        <p role="status" aria-live="polite" style={{ marginTop: 10, color: "var(--muted)", minHeight: 22 }}>
          {o && <>Progress: {state.ply} / {total} · </>}{state.explanation}
        </p>
      </section>

      <aside className="cm-panel" style={{ padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={{ margin: 0, color: "var(--green-glow)" }}>{t("openings.title")}</h2>
        <OpeningPicker currentId={o?.id} onPick={select} />

        {o && <p style={{ fontSize: 13, color: "var(--muted)" }}>{state.coach}</p>}
        {state.stats && <div style={{ fontSize: 14 }}>Mastered: <b>{state.stats.masteredCount}</b> / 5 for Silver</div>}

        <div style={{ display: "grid", gap: 8 }}>
          {state.status === "done"
            ? <button className="cm-btn" onClick={reset}>{t("openings.practiceAgain")}</button>
            : <>
                <button className="cm-btn" onClick={hint}>{t("openings.hint")}</button>
                <button className="cm-btn" style={{ background: "#3a4b63", color: "#fff" }} onClick={stepNext}>{t("openings.showNext")}</button>
                <button className="cm-btn" style={{ background: "#3a4b63", color: "#fff" }} onClick={reset}>{t("openings.reset")}</button>
              </>}
        </div>

        {state.reward && (
          <div className="cm-panel" style={{ padding: 12, borderColor: "var(--green)" }}>
            <b>{state.reward.mastered ? "Mastered!" : "Completed"}</b>
            <div style={{ fontSize: 14, color: "var(--muted)" }}>
              {state.reward.xpAwarded > 0 ? `+${state.reward.xpAwarded} XP` : "No new XP (already learned)"} · mastered {state.reward.masteredCount}/5
            </div>
            {state.reward.newCertificates.length > 0 && (
              <div style={{ color: "var(--gold)" }}>Certificate unlocked: {state.reward.newCertificates.join(", ")}</div>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}

// Small standalone picker so the user can switch openings (uses the same fetched list).
import { useEffect, useState } from "react";
import { fetchOpenings, type OpeningListItem } from "@/features/openings/services/api";
function OpeningPicker({ currentId, onPick }: { currentId?: string; onPick: (id: string) => void }) {
  const [items, setItems] = useState<OpeningListItem[]>([]);
  useEffect(() => { void (async () => { const r = await fetchOpenings(); if (!("error" in r)) setItems(r.openings); })(); }, []);
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => onPick(it.id)}
          className="cm-btn"
          style={{ background: it.id === currentId ? "var(--green)" : "#2a2825", color: it.id === currentId ? "#10240a" : "var(--off-white)", textAlign: "left", fontWeight: 600 }}>
          {TIER_ICON[it.tier]} {it.nameEn} {it.mastered ? "★" : it.completed ? "✓" : ""}
        </button>
      ))}
    </div>
  );
}
