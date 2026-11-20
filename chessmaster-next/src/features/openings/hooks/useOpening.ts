"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessGame } from "@/features/chess/lib/chessCompat";
import { sfxMove, sfxCapture, sfxCheck, sfxWin } from "@/features/chess/lib/sounds";
import { canonicalLine } from "@/features/openings/lib/data";
import { findTrap } from "@/features/openings/lib/validate";
import { fetchOpenings, submitCompletion, type OpeningListItem, type OpeningStats } from "@/features/openings/services/api";

export interface OpeningUiState {
  loading: boolean;
  error: string | null;
  opening: OpeningListItem | null;
  fen: string;
  ply: number;
  status: "playing" | "done";
  coach: string;
  explanation: string;
  legalTargets: string[];
  hint: { from: string; to: string } | null;
  stats: OpeningStats | null;
  reward: { xpAwarded: number; mastered: boolean; masteredCount: number; newCertificates: string[] } | null;
}

export function useOpening() {
  const listRef = useRef<OpeningListItem[]>([]);
  const idxRef = useRef(0);
  const gameRef = useRef<ChessGame>(new ChessGame());
  const playedRef = useRef<string[]>([]);
  const flawlessRef = useRef(true);

  const [state, setState] = useState<OpeningUiState>({
    loading: true, error: null, opening: null, fen: new ChessGame().fen(), ply: 0,
    status: "playing", coach: "", explanation: "", legalTargets: [], hint: null, stats: null, reward: null,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const loadIndex = useCallback((i: number) => {
    const list = listRef.current;
    if (!list.length) return;
    idxRef.current = ((i % list.length) + list.length) % list.length;
    const o = list[idxRef.current];
    gameRef.current = new ChessGame();
    playedRef.current = [];
    flawlessRef.current = true;
    setSelected(null);
    setState((s) => ({
      ...s, opening: o, fen: gameRef.current.fen(), ply: 0, status: "playing",
      coach: o.coachBlueprintEn, explanation: "", legalTargets: [], hint: null, reward: null,
    }));
  }, []);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const res = await fetchOpenings();
    if ("error" in res) { setState((s) => ({ ...s, loading: false, error: res.error })); return; }
    listRef.current = res.openings;
    setState((s) => ({ ...s, loading: false, stats: res.stats }));
    loadIndex(0);
  }, [loadIndex]);

  useEffect(() => { void reload(); }, [reload]);

  const finish = useCallback(async () => {
    const o = state.opening;
    if (!o) return;
    sfxWin();
    const resp = await submitCompletion(o.id, playedRef.current, flawlessRef.current);
    if ("error" in resp && resp.error) { setState((s) => ({ ...s, status: "done", coach: resp.error ?? "Could not save." })); return; }
    if (!("status" in resp)) { setState((s) => ({ ...s, status: "done", coach: "Could not save." })); return; }
    setState((s) => ({
      ...s, status: "done",
      coach: flawlessRef.current ? "Line mastered!" : "Line completed.",
      stats: { masteredCount: resp.masteredCount },
      reward: { xpAwarded: resp.xpAwarded, mastered: resp.mastered, masteredCount: resp.masteredCount, newCertificates: resp.newCertificates },
    }));
  }, [state.opening]);

  const onSquare = useCallback((sq: string) => {
    if (state.status !== "playing" || !state.opening) return;
    const g = gameRef.current;
    const line = canonicalLine(state.opening);
    if (state.ply >= line.length) return;

    if (selected) {
      if (sq === selected) { setSelected(null); setState((s) => ({ ...s, legalTargets: [] })); return; }
      const legal = g.verboseMoves(selected).find((m) => m.to === sq);
      if (legal) {
        const uci = selected + sq + (legal.promotion ? "q" : "");
        const expect = line[state.ply];
        if (uci.slice(0, 4) === expect.slice(0, 4)) {
          const mv = g.safeMove({ from: selected, to: sq, promotion: expect[4] });
          mv?.captured ? sfxCapture() : sfxMove();
          if (g.isCheck()) sfxCheck();
          playedRef.current = [...playedRef.current, expect];
          const nextPly = state.ply + 1;
          const explanation = state.opening.moveSequence[state.ply]?.explainEn ?? "";
          setSelected(null);
          setState((s) => ({ ...s, fen: g.fen(), ply: nextPly, explanation, legalTargets: [], hint: null }));
          if (nextPly >= line.length) void finish();
          return;
        }
        // wrong theory move — snap back, mark not flawless, surface trap punishment text if any
        flawlessRef.current = false;
        const trap = findTrap(state.opening, state.ply, uci);
        setSelected(null);
        setState((s) => ({
          ...s, legalTargets: [],
          explanation: trap ? "Trap! The book refutes that with " + trap.punishment.slice(0, 2) + trap.punishment.slice(2, 4) + "." : "Not the book move — try again.",
        }));
        return;
      }
    }
    const piece = g.get(sq);
    if (piece && piece.color === g.turn()) {
      setSelected(sq);
      setState((s) => ({ ...s, legalTargets: g.verboseMoves(sq).map((m) => m.to) }));
    } else {
      setSelected(null);
      setState((s) => ({ ...s, legalTargets: [] }));
    }
  }, [selected, state.status, state.opening, state.ply, finish]);

  // Hints / step disqualify the flawless (mastery) flag — ported from legacy opFlawless=false.
  const hint = useCallback(() => {
    if (!state.opening || state.status !== "playing") return;
    const line = canonicalLine(state.opening);
    const u = line[state.ply];
    if (!u) return;
    flawlessRef.current = false;
    setState((s) => ({ ...s, hint: { from: u.slice(0, 2), to: u.slice(2, 4) } }));
  }, [state.opening, state.ply, state.status]);

  const stepNext = useCallback(() => {
    if (!state.opening || state.status !== "playing") return;
    const g = gameRef.current;
    const line = canonicalLine(state.opening);
    const u = line[state.ply];
    if (!u) return;
    flawlessRef.current = false;
    const mv = g.safeMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    mv?.captured ? sfxCapture() : sfxMove();
    playedRef.current = [...playedRef.current, u];
    const nextPly = state.ply + 1;
    const explanation = state.opening.moveSequence[state.ply]?.explainEn ?? "";
    setState((s) => ({ ...s, fen: g.fen(), ply: nextPly, explanation, hint: null, legalTargets: [] }));
    if (nextPly >= line.length) void finish();
  }, [state.opening, state.ply, state.status, finish]);

  const reset = useCallback(() => loadIndex(idxRef.current), [loadIndex]);
  const select = useCallback((id: string) => {
    const i = listRef.current.findIndex((o) => o.id === id);
    if (i >= 0) loadIndex(i);
  }, [loadIndex]);

  return { state, selected, onSquare, hint, stepNext, reset, select };
}
