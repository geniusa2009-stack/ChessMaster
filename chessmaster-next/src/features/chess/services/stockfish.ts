"use client";
// Engine abstraction. Prefers Stockfish (UCI) running in a Web Worker OFF the React
// thread; falls back to the ported negamax if the engine can't load — exactly the
// graceful degradation the old app used (sfReady ? stockfish : negamax).
//
// Stockfish is loaded from a PINNED, self-hosted file at /engine/stockfish.js
// (no CDN, no @master). Copy it once from the pinned npm package:
//   cp node_modules/stockfish/src/stockfish.js public/engine/stockfish.js
// (see package.json "setup:engine"). If the file is absent, negamax is used.
import { ChessGame } from "@/features/chess/lib/chessCompat";
import { bestMove as negamaxBest } from "@/features/chess/lib/engine";
import type { EngineLevel } from "@/features/chess/types";

let worker: Worker | null = null;
let ready = false;
let tried = false;

function initWorker(): Worker | null {
  if (tried) return worker;
  tried = true;
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  try {
    worker = new Worker("/engine/stockfish.js");
    worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : "";
      if (line === "uciok" || line === "readyok") ready = true;
    };
    worker.onerror = () => { ready = false; worker = null; };
    worker.postMessage("uci");
    worker.postMessage("isready");
  } catch {
    worker = null;
  }
  return worker;
}

function stockfishMove(fen: string, level: EngineLevel, timeoutMs: number): Promise<string | null> {
  const w = worker;
  if (!w || !ready) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : "";
      if (line.startsWith("bestmove")) {
        w.removeEventListener("message", onMsg);
        const mv = line.split(/\s+/)[1];
        resolve(mv && mv !== "(none)" ? mv : null);
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage("ucinewgame");
    w.postMessage("setoption name Skill Level value " + Math.round(level.skill));
    w.postMessage("position fen " + fen);
    w.postMessage("go movetime " + Math.round(level.movetime));
    setTimeout(() => { w.removeEventListener("message", onMsg); resolve(null); }, timeoutMs);
  });
}

// Returns the chosen move applied to a clone, as {from,to,promotion}. Never throws.
export async function chooseBotMove(fen: string, level: EngineLevel): Promise<{ from: string; to: string; promotion?: string } | null> {
  initWorker();
  const uci = await stockfishMove(fen, level, Math.max(500, level.movetime + 800));
  if (uci) {
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined };
  }
  // Fallback: ported negamax.
  const g = new ChessGame(fen);
  const m = negamaxBest(g, level);
  return m ? { from: m.from, to: m.to, promotion: m.promotion } : null;
}

export function engineName(): string {
  return worker && ready ? "Stockfish" : "ChessMaster Engine";
}
