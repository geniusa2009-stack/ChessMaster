"use client";
export interface MpGameView {
  id: string; status: string; turn: "white" | "black"; fen: string; moves: string[];
  ranked: boolean; timeControl: number | null; whiteMs: number | null; blackMs: number | null;
  version: number; winner: "white" | "black" | null; isDraw: boolean; termination: string | null;
  mySide: "white" | "black" | null; whiteName: string | null; blackName: string | null;
}

export async function findMatch(timeControl: number | null, ranked: boolean): Promise<{ id: string; status: string } | { error: string }> {
  try {
    const res = await fetch("/api/mp/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeControl, ranked }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { error: d.error || "SERVER_ERROR" };
    return d;
  } catch { return { error: "NETWORK" }; }
}
export async function getGame(id: string): Promise<{ game: MpGameView } | { error: string }> {
  try {
    const res = await fetch(`/api/mp/games/${id}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { error: d.error || "SERVER_ERROR" };
    return d;
  } catch { return { error: "NETWORK" }; }
}
export async function sendMove(id: string, uci: string, expectedVersion: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/mp/games/${id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uci, expectedVersion }) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, error: d.error };
  } catch { return { ok: false, error: "NETWORK" }; }
}
export async function resignGame(id: string): Promise<void> {
  try { await fetch(`/api/mp/games/${id}/resign`, { method: "POST" }); } catch { /* ignore */ }
}
