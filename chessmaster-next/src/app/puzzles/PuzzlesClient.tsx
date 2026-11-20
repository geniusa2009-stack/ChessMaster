"use client";
import { useT } from "@/i18n/I18nProvider";
import { Board } from "@/features/chess/components/Board";
import { usePuzzle } from "@/features/puzzles/hooks/usePuzzle";

export function PuzzlesClient() {
  const t = useT();
  const { state, selected, onSquare, next, retry, skip, hint } = usePuzzle();

  if (state.loading) return <main style={{ padding: 40 }}>{t("puzzles.loading")}</main>;
  if (state.error) return <main style={{ padding: 40, color: "#e57373" }}>{state.error}</main>;

  const legal = selected ? state.legalTargets : (state.hint ? [state.hint.to] : []);

  return (
    <main className="game-layout">
      <section>
        <div className="board-wrap"><Board fen={state.fen} selected={selected ?? state.hint?.from ?? null} legalTargets={legal} onSquare={onSquare} size={480} /></div>
        <p role="status" aria-live="polite" style={{ marginTop: 10, color: state.status === "wrong" ? "#e57373" : state.status === "solved" ? "var(--green-glow)" : "var(--muted)", minHeight: 22 }}>
          {state.feedback}
        </p>
      </section>

      <aside className="cm-panel" style={{ padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
        <h2 style={{ margin: 0, color: "var(--green-glow)" }}>{t("puzzles.title")}</h2>
        {state.stats && (
          <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
            <div>Puzzle rating: <b>{state.stats.puzzleRating}</b></div>
            <div>Streak: <b>{state.stats.streak}</b> (best {state.stats.bestStreak})</div>
            <div>Solved: <b>{state.stats.solvedCount}</b> / total</div>
          </div>
        )}
        {state.puzzle && (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            #{state.puzzle.id} · {state.puzzle.theme} · {state.puzzle.difficulty} · rated {state.puzzle.elo}
            {state.puzzle.solved && <span style={{ color: "var(--green-glow)" }}> · solved</span>}
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {state.status === "solved"
            ? <button className="cm-btn" onClick={next}>{t("puzzles.next")}</button>
            : <>
                <button className="cm-btn" onClick={hint}>{t("puzzles.hint")}</button>
                <button className="cm-btn" style={{ background: "#3a4b63", color: "#fff" }} onClick={retry}>{t("puzzles.retry")}</button>
                <button className="cm-btn" style={{ background: "#3a4b63", color: "#fff" }} onClick={skip}>{t("puzzles.skip")}</button>
              </>}
        </div>
        {state.solvedReward && !state.solvedReward.alreadySolved && (
          <div className="cm-panel" style={{ padding: 12, borderColor: "var(--green)" }}>
            <b>Solved!</b>
            <div style={{ fontSize: 14, color: "var(--muted)" }}>+{state.solvedReward.xpAwarded} XP · streak {state.solvedReward.streak}</div>
            {state.solvedReward.newCertificates && state.solvedReward.newCertificates.length > 0 && (
              <div style={{ color: "var(--gold)" }}>Certificate unlocked: {state.solvedReward.newCertificates.join(", ")}</div>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}
