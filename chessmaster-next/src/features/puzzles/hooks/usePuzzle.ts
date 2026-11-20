"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessGame } from "@/features/chess/lib/chessCompat";
import { sfxMove, sfxCapture, sfxCheck, sfxWin } from "@/features/chess/lib/sounds";
import {
  fetchPuzzles, submitAttempt, skipPuzzle, requestHint,
  type PuzzleListItem, type PuzzleStats,
} from "@/features/puzzles/services/api";
import type { Color } from "@/features/chess/types";

export interface PuzzleUiState {
  loading: boolean;
  error: string | null;
  puzzle: PuzzleListItem | null;
  fen: string;
  playerColor: Color;
  status: "playing" | "solved" | "wrong";
  feedback: string;
  stats: PuzzleStats | null;
  legalTargets: string[];
  hint: { from: string; to: string } | null;
  solvedReward: { xpAwarded: number; streak: number; alreadySolved: boolean; newCertificates?: string[] } | null;
}

export function usePuzzle() {
  const listRef = useRef<PuzzleListItem[]>([]);
  const idxRef = useRef(0);
  const gameRef = useRef<ChessGame>(new ChessGame());
  const playerMovesRef = useRef<string[]>([]);
  const lockRef = useRef(false);

  const [state, setState] = useState<PuzzleUiState>({
    loading: true, error: null, puzzle: null, fen: new ChessGame().fen(),
    playerColor: "w", status: "playing", feedback: "", stats: null,
    legalTargets: [], hint: null, solvedReward: null,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const loadIndex = useCallback((i: number) => {
    const list = listRef.current;
    if (!list.length) return;
    idxRef.current = ((i % list.length) + list.length) % list.length;
    const p = list[idxRef.current];
    gameRef.current = new ChessGame(p.fen);
    playerMovesRef.current = [];
    lockRef.current = false;
    setSelected(null);
    setState((s) => ({
      ...s, puzzle: p, fen: p.fen, playerColor: gameRef.current.turn(),
      status: "playing", feedback: p.objective, legalTargets: [], hint: null, solvedReward: null,
    }));
  }, []);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await fetchPuzzles();
    if ("error" in res) { setState((s) => ({ ...s, loading: false, error: res.error })); return; }
    listRef.current = res.puzzles;
    // start at the first unsolved puzzle, else the first
    const firstUnsolved = res.puzzles.findIndex((p) => !p.solved);
    setState((s) => ({ ...s, loading: false, stats: res.stats }));
    loadIndex(firstUnsolved >= 0 ? firstUnsolved : 0);
  }, [loadIndex]);

  useEffect(() => { void reload(); }, [reload]);

  const applyOpponent = useCallback((uci: string) => {
    const g = gameRef.current;
    const mv = g.safeMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (mv) { mv.captured ? sfxCapture() : sfxMove(); if (g.isCheck()) sfxCheck(); }
    setState((s) => ({ ...s, fen: g.fen() }));
  }, []);

  const onSquare = useCallback(async (sq: string) => {
    if (lockRef.current || state.status !== "playing") return;
    const g = gameRef.current;
    if (g.turn() !== state.playerColor) return;

    if (selected) {
      if (sq === selected) { setSelected(null); setState((s) => ({ ...s, legalTargets: [] })); return; }
      // attempt a move selected -> sq
      const legal = g.verboseMoves(selected).find((m) => m.to === sq);
      if (legal) {
        lockRef.current = true;
        const uci = selected + sq + (legal.promotion ? "q" : "");
        // apply locally for responsiveness
        const mv = g.safeMove({ from: selected, to: sq, promotion: legal.promotion ? "q" : undefined });
        mv?.captured ? sfxCapture() : sfxMove();
        setSelected(null);
        playerMovesRef.current = [...playerMovesRef.current, uci];
        setState((s) => ({ ...s, fen: g.fen(), legalTargets: [], hint: null }));

        const resp = await submitAttempt(state.puzzle!.id, playerMovesRef.current);
        if (resp.status === "wrong") {
          g.undo(); // roll back the illegal-for-puzzle move
          playerMovesRef.current = playerMovesRef.current.slice(0, -1);
          lockRef.current = false;
          setState((s) => ({ ...s, fen: g.fen(), status: "wrong", feedback: "Not the right move — streak reset.", stats: s.stats ? { ...s.stats, streak: 0 } : s.stats }));
          return;
        }
        if (resp.status === "progress" && resp.opponentMove) {
          setTimeout(() => { applyOpponent(resp.opponentMove!); lockRef.current = false; }, 260);
          return;
        }
        if (resp.status === "solved") {
          sfxWin();
          setState((s) => ({
            ...s, status: "solved", feedback: resp.alreadySolved ? "Already solved." : "Solved! +" + (resp.xpAwarded ?? 0) + " XP",
            stats: s.stats ? { ...s.stats, streak: resp.streak ?? s.stats.streak, puzzleRating: resp.puzzleRating ?? s.stats.puzzleRating } : s.stats,
            solvedReward: { xpAwarded: resp.xpAwarded ?? 0, streak: resp.streak ?? 0, alreadySolved: !!resp.alreadySolved, newCertificates: resp.newCertificates },
          }));
          lockRef.current = false;
          return;
        }
        lockRef.current = false;
        return;
      }
    }
    // (re)select
    const piece = g.get(sq);
    if (piece && piece.color === state.playerColor) {
      setSelected(sq);
      setState((s) => ({ ...s, legalTargets: g.verboseMoves(sq).map((m) => m.to) }));
    } else {
      setSelected(null);
      setState((s) => ({ ...s, legalTargets: [] }));
    }
  }, [selected, state.status, state.playerColor, state.puzzle, applyOpponent]);

  const next = useCallback(() => loadIndex(idxRef.current + 1), [loadIndex]);
  const retry = useCallback(() => loadIndex(idxRef.current), [loadIndex]);
  const skip = useCallback(async () => { await skipPuzzle(); setState((s) => ({ ...s, stats: s.stats ? { ...s.stats, streak: 0 } : s.stats })); loadIndex(idxRef.current + 1); }, [loadIndex]);
  const hint = useCallback(async () => {
    if (!state.puzzle) return;
    const h = await requestHint(state.puzzle.id, playerMovesRef.current.length);
    setState((s) => ({ ...s, hint: h, feedback: h ? "Hint: " + h.from + " → " + h.to + " (streak reset)" : s.feedback, stats: s.stats ? { ...s.stats, streak: 0 } : s.stats }));
  }, [state.puzzle]);

  return { state, selected, onSquare, next, retry, skip, hint };
}
