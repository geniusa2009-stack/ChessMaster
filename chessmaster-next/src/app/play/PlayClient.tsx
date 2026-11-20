"use client";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages/en";
import { useState } from "react";
import { Board } from "@/features/chess/components/Board";
import { useChessGame } from "@/features/chess/hooks/useChessGame";
import { BOTS } from "@/features/chess/lib/bots";

function fmt(s: number | null) {
  if (s == null) return "∞";
  const v = Math.max(0, s | 0);
  return Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0");
}

export function PlayClient({ username, rating }: { username: string; rating: number }) {
  const t = useT();
  const { state, selected, active, newGame, resign, selectSquare } = useChessGame();
  const [botId, setBotId] = useState("rooky");
  const [ranked, setRanked] = useState(false);
  const [time, setTime] = useState<number | null>(null);

  return (
    <main className="game-layout">
      <section>
        <div className="board-wrap"><Board fen={state.fen} selected={selected} legalTargets={state.legalTargets} onSquare={selectSquare} size={480} /></div>
        <p role="status" aria-live="polite" style={{ marginTop: 10, color: "var(--muted)", minHeight: 22 }}>{t(state.status as MessageKey)}</p>
      </section>

      <aside className="cm-panel" style={{ padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <b>{username}</b><span style={{ color: "var(--muted)" }}>{t("chess.rating", { value: rating })}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{t("chess.you")}: <b>{fmt(state.clocks.you)}</b></span>
          <span>{t("chess.bot")}: <b>{fmt(state.clocks.bot)}</b></span>
        </div>

        {!active && (
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>{t("chess.opponent")}</label>
            <select className="cm-input" value={botId} onChange={(e) => setBotId(e.target.value)}>
              {BOTS.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.elo})</option>)}
            </select>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>{t("chess.time")}</label>
            <select className="cm-input" value={time ?? ""} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t("chess.noTime")}</option>
              <option value="180">{t("chess.min3")}</option>
              <option value="300">{t("chess.min5")}</option>
              <option value="600">{t("chess.min10")}</option>
            </select>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} /> {t("chess.ranked")}
            </label>
            <button className="cm-btn" onClick={() => newGame({ botId, ranked, timeSeconds: time })}>{t("chess.newGame")}</button>
          </div>
        )}

        {active && (
          <button className="cm-btn" style={{ background: "#b3413a", color: "#fff" }} onClick={resign}>{t("chess.resign")}</button>
        )}

        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t("chess.captured")}</div>
          <div style={{ minHeight: 20 }}>{state.captured.b.join(" ")}</div>
          <div style={{ minHeight: 20 }}>{state.captured.w.join(" ")}</div>
        </div>

        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t("chess.moves")}</div>
          <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 14, fontFamily: "monospace" }}>
            {state.history.length === 0 ? "—" : state.history.map((m, i) =>
              i % 2 === 0 ? <span key={i}>{i / 2 + 1}. {m} </span> : <span key={i}>{m} </span>
            )}
          </div>
        </div>

        {state.gameOver && state.reward && (
          <div className="cm-panel" style={{ padding: 12, borderColor: "var(--green)" }}>
            <b>{state.result === "win" ? t("chess.victory") : state.result === "loss" ? t("chess.defeat") : t("chess.resultDraw")}</b>
            {state.reward.status === "ok" ? (
              <div style={{ fontSize: 14, color: "var(--muted)" }}>
                XP {state.reward.xp} ({(state.reward.xpDelta ?? 0) >= 0 ? "+" : ""}{state.reward.xpDelta}) · Rating {state.reward.rating}
                {state.reward.achievements && state.reward.achievements.length > 0 && (
                  <div>Unlocked: {state.reward.achievements.join(", ")}</div>
                )}
              </div>
            ) : state.reward.status === "duplicate" ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Result already recorded.</div>
            ) : (
              <div style={{ fontSize: 13, color: "#e57373" }}>{state.reward.error}</div>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}
