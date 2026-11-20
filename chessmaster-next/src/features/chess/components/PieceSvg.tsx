"use client";
import React from "react";

// Self-contained Unicode-glyph piece set (no CDN, no @master). Sized relative to the board
// container (10% of the board's inline size ≈ fits one 12.5% cell) so it scales fluidly with
// the responsive board. Vendoring the exact cburnett SVGs is a tracked follow-up.
const GLYPH: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};

export const PieceSvg = React.memo(function PieceSvg({ code }: { code: string }) {
  const glyph = GLYPH[code];
  if (!glyph) return null;
  const isWhite = code[0] === "w";
  return (
    <span
      aria-hidden
      style={{
        fontSize: "10cqw",
        lineHeight: 1,
        userSelect: "none",
        color: isWhite ? "#f8f8f8" : "#2a2724",
        textShadow: isWhite ? "0 1px 2px rgba(0,0,0,.55)" : "0 1px 1px rgba(255,255,255,.25)",
        pointerEvents: "none",
      }}
    >
      {glyph}
    </span>
  );
});
