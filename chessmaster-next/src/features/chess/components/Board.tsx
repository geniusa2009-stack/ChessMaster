"use client";
import React from "react";
import { ChessGame } from "@/features/chess/lib/chessCompat";
import { PieceSvg } from "./PieceSvg";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
const LIGHT = "#eeeed2";
const DARK = "#769656";
const SEL = "rgba(255,255,80,0.45)";
const TARGET = "rgba(20,85,30,0.35)";

const PIECE_NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

// Fluid, square board. It fills its container up to `size` px and scales down on small screens
// via a container query (no JS resize). Orientation is fixed (white a1 bottom-left) and is
// independent of document RTL — the board is never mirrored for Arabic.
// Memoized: a parent re-render (e.g. a per-second clock tick) does NOT re-parse the FEN or
// re-render 64 squares unless fen/selected/legalTargets/onSquare actually change.
function BoardImpl({
  fen, selected, legalTargets, onSquare, size = 480,
}: {
  fen: string; selected: string | null; legalTargets: string[];
  onSquare: (sq: string) => void; size?: number;
}) {
  const g = new ChessGame(fen);
  const board = g.board(); // board()[0] is rank 8
  const checkSq = g.isCheck() ? findKing(g, g.turn()) : null;

  return (
    <div
      role="grid"
      aria-label="Chess board"
      dir="ltr"
      style={{
        containerType: "inline-size",
        width: "100%",
        maxWidth: size,
        aspectRatio: "1 / 1",
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gridTemplateRows: "repeat(8, 1fr)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,.5)",
      }}
    >
      {RANKS.map((rank, r) =>
        FILES.map((file, c) => {
          const sq = file + rank;
          const piece = board[r][c];
          const isDark = (r + c) % 2 === 1;
          const bg = isDark ? DARK : LIGHT;
          const isSel = selected === sq;
          const isTarget = legalTargets.includes(sq);
          const isCheck = checkSq === sq;
          const pieceLabel = piece ? `${piece.color === "w" ? "white" : "black"} ${PIECE_NAME[piece.type]}` : "empty";
          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              aria-label={`${sq}, ${pieceLabel}`}
              aria-pressed={isSel}
              onClick={() => onSquare(sq)}
              style={{
                background: isCheck ? "rgba(220,60,60,0.6)" : bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", cursor: "pointer", border: "none", padding: 0,
              }}
            >
              {isSel && <span aria-hidden style={{ position: "absolute", inset: 0, background: SEL }} />}
              {isTarget && !piece && (
                <span aria-hidden style={{ position: "absolute", width: "30%", height: "30%", borderRadius: "50%", background: TARGET }} />
              )}
              {isTarget && piece && (
                <span aria-hidden style={{ position: "absolute", inset: "6%", borderRadius: "50%", border: "6cqw solid " + TARGET }} />
              )}
              {piece && <PieceSvg code={piece.color + piece.type} />}
            </button>
          );
        })
      )}
    </div>
  );
}

export const Board = React.memo(BoardImpl);

function findKing(g: ChessGame, color: string): string | null {
  const b = g.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (p && p.type === "k" && p.color === color) return FILES[c] + (8 - r);
  }
  return null;
}
