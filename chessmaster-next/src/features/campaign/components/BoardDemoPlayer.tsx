"use client";
import React, { useMemo, useState } from "react";
import { Board } from "@/features/chess/components/Board";
import { ChessGame } from "@/features/chess/lib/chessCompat";

// Reusable educational board-demonstration player built on the existing Board (no second board
// implementation). Two modes:
//  - guided: step through a validated move sequence (next/prev/replay/reset), with SAN + explanation.
//  - interactive: the learner attempts a move; legality is decided by the real rules (ChessGame),
//    illegal attempts are REJECTED and the board is unchanged (never a fake transition).
// Highlights + SVG arrows overlay the board; orientation is fixed white-bottom (RTL-safe).

export interface DemoStep { uci: string; san: string; explain: string }
export interface DemoSpec {
  id: string; fen: string; sequence: DemoStep[];
  highlight?: string[]; arrows?: Array<[string, string]>; conclusion?: string;
}

const fileIdx = (sq: string) => sq.charCodeAt(0) - 97;        // a..h -> 0..7
const rankRow = (sq: string) => 8 - Number(sq[1]);            // 1..8 -> row 7..0 (white bottom)
const centre = (sq: string) => ({ x: (fileIdx(sq) + 0.5) * 12.5, y: (rankRow(sq) + 0.5) * 12.5 });

function Arrows({ arrows }: { arrows: Array<[string, string]> }) {
  if (!arrows.length) return null;
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="rgba(230,170,40,0.9)" /></marker></defs>
      {arrows.map(([a, b], i) => { const p = centre(a), q = centre(b); return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgba(230,170,40,0.9)" strokeWidth={2} markerEnd="url(#ah)" />; })}
    </svg>
  );
}

export function BoardDemoPlayer({ demo, mode = "guided", size = 420, onLegal, onIllegal }: {
  demo: DemoSpec; mode?: "guided" | "interactive"; size?: number;
  onLegal?: (uci: string) => void; onIllegal?: (uci: string) => void;
}) {
  const [step, setStep] = useState(0); // 0 = initial, n = after nth move
  const [sel, setSel] = useState<string | null>(null);
  const [practiceFen, setPracticeFen] = useState(demo.fen);
  const [status, setStatus] = useState("");

  // guided: compute FEN after `step` moves (validated sequence; never fabricated)
  const guidedFen = useMemo(() => {
    const g = new ChessGame(demo.fen);
    for (let i = 0; i < step && i < demo.sequence.length; i++) {
      const u = demo.sequence[i].uci;
      g.safeMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
    }
    return g.fen();
  }, [demo, step]);

  if (mode === "interactive") {
    const legalTargets = sel
      ? (new ChessGame(practiceFen).moves({ square: sel, verbose: true }) as Array<{ to: string }>).map((m) => m.to)
      : [];
    const onSquare = (sq: string) => {
      if (!sel) { setSel(sq); setStatus(""); return; }
      if (sq === sel) { setSel(null); return; }
      const uci = sel + sq;
      const g = new ChessGame(practiceFen);
      const mv = g.safeMove({ from: sel, to: sq, promotion: "q" });
      if (mv) { setPracticeFen(g.fen()); setStatus(`نقلة قانونية: ${mv.san}`); onLegal?.(uci); }
      else { setStatus("نقلة غير قانونية — القاعدة متمنعش دي. الرقعة ما اتغيّرتش."); onIllegal?.(uci); }
      setSel(null);
    };
    return (
      <div style={{ display: "grid", gap: 8, position: "relative", maxWidth: size }}>
        <div style={{ position: "relative" }}><Board fen={practiceFen} selected={sel} legalTargets={legalTargets} onSquare={onSquare} size={size} /></div>
        <div role="status" aria-live="polite" style={{ minHeight: 20, fontSize: 14 }}>{status}</div>
        <button className="cm-btn" style={{ justifySelf: "start" }} onClick={() => { setPracticeFen(demo.fen); setSel(null); setStatus(""); }}>إعادة ضبط (Reset)</button>
      </div>
    );
  }

  const cur = step > 0 ? demo.sequence[step - 1] : null;
  const curArrows = step === 0 ? (demo.arrows ?? []) : (cur ? [[cur.uci.slice(0, 2), cur.uci.slice(2, 4)]] as Array<[string, string]> : []);
  const curHl = step === 0 ? (demo.highlight ?? []) : (cur ? [cur.uci.slice(0, 2), cur.uci.slice(2, 4)] : []);
  return (
    <div style={{ display: "grid", gap: 8, maxWidth: size }}>
      <div style={{ position: "relative" }}>
        <Board fen={guidedFen} selected={null} legalTargets={curHl} onSquare={() => {}} size={size} />
        <Arrows arrows={curArrows} />
      </div>
      <div role="status" aria-live="polite" style={{ minHeight: 36, fontSize: 14 }}>
        {cur ? <><strong>{cur.san}</strong> — {cur.explain}</> : (demo.conclusion ?? "اضغط التالي لمتابعة العرض.")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="cm-btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label="السابق">⟨ السابق</button>
        <button className="cm-btn" onClick={() => setStep((s) => Math.min(demo.sequence.length, s + 1))} disabled={step >= demo.sequence.length} aria-label="التالي">التالي ⟩</button>
        <button className="cm-btn" onClick={() => setStep(0)} aria-label="إعادة">إعادة التشغيل</button>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>خطوة {step}/{demo.sequence.length}</span>
      </div>
    </div>
  );
}
