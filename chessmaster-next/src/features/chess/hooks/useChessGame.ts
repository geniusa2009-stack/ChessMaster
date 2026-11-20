"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessGame } from "@/features/chess/lib/chessCompat";
import { botById, curLevel } from "@/features/chess/lib/bots";
import { chooseBotMove } from "@/features/chess/services/stockfish";
import { submitGameResult, type SubmitOutcome } from "@/features/chess/services/submitResult";
import { sfxMove, sfxCapture, sfxCheck, sfxWin } from "@/features/chess/lib/sounds";
import type { Color, GameResultKind } from "@/features/chess/types";

export interface GameOptions { botId: string; ranked: boolean; timeSeconds: number | null }

export interface GameState {
  fen: string;
  turn: Color;
  status: string;
  history: string[];
  captured: { w: string[]; b: string[] };
  thinking: boolean;
  gameOver: boolean;
  result: GameResultKind | null;
  clocks: { you: number | null; bot: number | null };
  reward: SubmitOutcome | null;
  legalTargets: string[]; // for the selected square
}

const PLAYER: Color = "w";
const BOT: Color = "b";
const START = new ChessGame().fen();

export function useChessGame() {
  const gameRef = useRef<ChessGame>(new ChessGame());
  const optsRef = useRef<GameOptions>({ botId: "rooky", ranked: false, timeSeconds: null });
  const startedAtRef = useRef<number>(0);
  const clientGameIdRef = useRef<string>("");
  const submittedRef = useRef<boolean>(false);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<GameState>({
    fen: START, turn: "w", status: "chess.pressNewGame",
    history: [], captured: { w: [], b: [] }, thinking: false,
    gameOver: false, result: null, clocks: { you: null, bot: null }, reward: null, legalTargets: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const computeCaptured = useCallback((g: ChessGame) => {
    const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const counts: Record<Color, Record<string, number>> = { w: { ...start }, b: { ...start } };
    for (const row of g.board()) for (const sq of row) {
      if (sq && sq.type !== "k") counts[sq.color as Color][sq.type] = (counts[sq.color as Color][sq.type] ?? 0) - 1;
    }
    const missing = (c: Color) => Object.entries(counts[c]).flatMap(([t, n]) => Array(Math.max(0, n)).fill(t));
    // pieces the opponent captured: white's missing shown in black's tray and vice-versa
    return { w: missing("b"), b: missing("w") };
  }, []);

  const statusText = useCallback((g: ChessGame): string => {
    if (g.isCheckmate()) return g.turn() === PLAYER ? "chess.checkmateLost" : "chess.checkmateWon";
    if (g.isStalemate()) return "chess.stalemate";
    if (g.isDraw()) return "chess.draw";
    if (g.isCheck()) return g.turn() === PLAYER ? "chess.youInCheck" : "chess.botInCheck";
    return g.turn() === PLAYER ? "chess.yourMove" : "chess.botThinking";
  }, []);

  const sync = useCallback((extra?: Partial<GameState>) => {
    const g = gameRef.current;
    setState((s) => ({
      ...s,
      fen: g.fen(), turn: g.turn(), history: g.history(),
      captured: computeCaptured(g), status: statusText(g),
      gameOver: g.isGameOver(), ...extra,
    }));
  }, [computeCaptured, statusText]);

  const stopClocks = useCallback(() => {
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
  }, []);

  const finish = useCallback(async (forcedResult?: GameResultKind) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setActive(false);
    stopClocks();
    const g = gameRef.current;
    const result: GameResultKind = forcedResult ?? (g.outcome(PLAYER) ?? "draw");
    if (result === "win") sfxWin();
    const opts = optsRef.current;
    const bot = botById(opts.botId);
    const reward = await submitGameResult({
      clientGameId: clientGameIdRef.current,
      opponentId: bot.id, opponentElo: bot.elo,
      result, ranked: opts.ranked,
      moves: g.history().length,
      durationMs: Math.max(0, Date.now() - startedAtRef.current),
    });
    setState((s) => ({ ...s, gameOver: true, result, reward, thinking: false, status:
      result === "win" ? "chess.victory" : result === "loss" ? "chess.defeat" : "chess.resultDraw" }));
  }, [stopClocks]);

  const doBotMove = useCallback(async () => {
    const g = gameRef.current;
    if (g.isGameOver() || g.turn() !== BOT) return;
    setState((s) => ({ ...s, thinking: true }));
    const mv = await chooseBotMove(g.fen(), curLevel(optsRef.current.botId));
    if (!mv) { setState((s) => ({ ...s, thinking: false })); return; }
    const applied = g.safeMove(mv);
    if (applied) { applied.captured ? sfxCapture() : sfxMove(); if (g.isCheck()) sfxCheck(); }
    sync({ thinking: false });
    if (g.isGameOver()) void finish();
  }, [sync, finish]);

  const playerMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    const g = gameRef.current;
    if (!active || g.turn() !== PLAYER || g.isGameOver()) return false;
    const mv = g.safeMove({ from, to, promotion });
    if (!mv) return false;
    mv.captured ? sfxCapture() : sfxMove();
    if (g.isCheck()) sfxCheck();
    setSelected(null);
    sync({ legalTargets: [] });
    if (g.isGameOver()) { void finish(); return true; }
    setTimeout(() => void doBotMove(), 320);
    return true;
  }, [active, sync, finish, doBotMove]);

  const selectSquare = useCallback((sq: string) => {
    const g = gameRef.current;
    if (!active || g.turn() !== PLAYER) return;
    if (selected) {
      if (sq === selected) { setSelected(null); setState((s) => ({ ...s, legalTargets: [] })); return; }
      const moved = playerMove(selected, sq);
      if (moved) return;
    }
    const piece = g.get(sq);
    if (piece && piece.color === PLAYER) {
      setSelected(sq);
      const targets = g.verboseMoves(sq).map((m) => m.to);
      setState((s) => ({ ...s, legalTargets: targets }));
    } else {
      setSelected(null);
      setState((s) => ({ ...s, legalTargets: [] }));
    }
  }, [active, selected, playerMove]);

  const newGame = useCallback((opts: GameOptions) => {
    stopClocks();
    gameRef.current = new ChessGame();
    optsRef.current = opts;
    startedAtRef.current = Date.now();
    clientGameIdRef.current = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    submittedRef.current = false;
    setSelected(null);
    setActive(true);
    setState({
      fen: gameRef.current.fen(), turn: "w", status: "chess.yourMove", history: [],
      captured: { w: [], b: [] }, thinking: false, gameOver: false, result: null,
      clocks: { you: opts.timeSeconds, bot: opts.timeSeconds }, reward: null, legalTargets: [],
    });
    if (opts.timeSeconds != null) {
      clockRef.current = setInterval(() => {
        setState((s) => {
          const g = gameRef.current;
          if (!g || g.isGameOver()) return s;
          const you = s.clocks.you ?? 0, bot = s.clocks.bot ?? 0;
          if (g.turn() === PLAYER) {
            const nv = you - 1;
            if (nv <= 0) { void finish("loss"); return { ...s, clocks: { ...s.clocks, you: 0 } }; }
            return { ...s, clocks: { ...s.clocks, you: nv } };
          } else {
            const nv = bot - 1;
            if (nv <= 0) { void finish("win"); return { ...s, clocks: { ...s.clocks, bot: 0 } }; }
            return { ...s, clocks: { ...s.clocks, bot: nv } };
          }
        });
      }, 1000);
    }
  }, [stopClocks, finish]);

  const resign = useCallback(() => {
    if (!active || gameRef.current.isGameOver()) return;
    void finish("loss");
  }, [active, finish]);

  useEffect(() => () => stopClocks(), [stopClocks]);

  return { state, selected, active, newGame, resign, selectSquare, playerMove };
}
