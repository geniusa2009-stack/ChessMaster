"use client";
import { useState } from "react";
import { Board } from "@/features/chess/components/Board";
import { useOnlineGame } from "@/features/multiplayer/hooks/useOnlineGame";
import { useT } from "@/i18n/I18nProvider";

function fmt(ms: number | null) {
  if (ms == null) return "∞";
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function OnlineClient() {
  const t = useT();
  const { game, status, error, selected, legalTargets, find, onSquare, resign } = useOnlineGame();
  const [time, setTime] = useState<number | null>(300);

  return (
    <main className="game-layout">
      <section>
        <Board
          fen={game?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}
          selected={selected} legalTargets={legalTargets}
          onSquare={onSquare} size={480}
        />
        <p role="status" aria-live="polite" style={{ marginTop: 10, color: "var(--muted)", minHeight: 22 }}>
          {status === "searching" && "Searching for an opponent…"}
          {status === "in_game" && game && (
            game.status === "waiting" ? "Waiting for an opponent to join…" :
            game.status === "finished"
              ? (game.isDraw ? t("chess.resultDraw") : game.winner === game.mySide ? t("chess.victory") : t("chess.defeat")) + (game.termination ? ` (${game.termination})` : "")
              : (game.turn === game.mySide ? t("chess.yourMove") : t("chess.botThinking"))
          )}
          {error && <span style={{ color: "#e57373" }}> · {error}</span>}
        </p>
      </section>

      <aside className="cm-panel" style={{ padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={{ margin: 0, color: "var(--green-glow)" }}>Online</h2>
        {(!game || game.status === "finished") && (
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>{t("chess.time")}</label>
            <select className="cm-input" value={time ?? ""} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t("chess.noTime")}</option>
              <option value="180">{t("chess.min3")}</option>
              <option value="300">{t("chess.min5")}</option>
              <option value="600">{t("chess.min10")}</option>
            </select>
            <button className="cm-btn" disabled={status === "searching"} onClick={() => find(time, true)}>
              {status === "searching" ? t("common.loading") : "Find match"}
            </button>
          </div>
        )}

        {game && game.status !== "finished" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{game.whiteName ?? "—"} {game.mySide === "white" && `(${t("common.you")})`}</span>
              <b>{fmt(game.whiteMs)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{game.blackName ?? "—"} {game.mySide === "black" && `(${t("common.you")})`}</span>
              <b>{fmt(game.blackMs)}</b>
            </div>
            {game.status === "active" && <button className="cm-btn" style={{ background: "#b3413a", color: "#fff" }} onClick={resign}>{t("chess.resign")}</button>}
          </>
        )}

        {game && (
          <div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{t("chess.moves")}</div>
            <div style={{ maxHeight: 160, overflowY: "auto", fontSize: 13, fontFamily: "monospace" }}>
              {game.moves.length === 0 ? "—" : game.moves.map((m, i) => <span key={i}>{i % 2 === 0 ? `${i / 2 + 1}. ` : ""}{m} </span>)}
            </div>
          </div>
        )}
      </aside>
    </main>
  );
}
