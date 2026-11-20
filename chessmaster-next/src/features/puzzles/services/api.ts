"use client";
// Thin client for the server-authoritative puzzle endpoints. No solutions ever reach
// the client; correctness/rewards are decided server-side.
export interface PuzzleListItem { id: number; fen: string; theme: string; elo: number; objective: string; difficulty: "easy" | "medium" | "hard" | "expert"; solved: boolean }
export interface PuzzleStats { puzzleRating: number; streak: number; bestStreak: number; solvedCount: number }

export async function fetchPuzzles(): Promise<{ puzzles: PuzzleListItem[]; stats: PuzzleStats } | { error: string }> {
  try {
    const res = await fetch("/api/puzzles");
    if (res.status === 401) return { error: "Please sign in." };
    if (!res.ok) return { error: "Failed to load puzzles." };
    return await res.json();
  } catch { return { error: "Network error." }; }
}

export interface AttemptResponse {
  status: "progress" | "solved" | "wrong";
  opponentMove?: string;
  correctThrough?: number;
  xpAwarded?: number;
  xp?: number;
  puzzleRating?: number;
  streak?: number;
  alreadySolved?: boolean;
  newCertificates?: string[];
  error?: string;
}

export async function submitAttempt(puzzleId: number, playerMoves: string[]): Promise<AttemptResponse> {
  try {
    const res = await fetch("/api/puzzles/attempt", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId, playerMoves }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "wrong", error: data?.error || "Rejected" };
    return data as AttemptResponse;
  } catch { return { status: "wrong", error: "Network error." }; }
}

export async function skipPuzzle(): Promise<void> {
  try { await fetch("/api/puzzles/skip", { method: "POST" }); } catch { /* ignore */ }
}

export async function requestHint(puzzleId: number, playerMovesCount: number): Promise<{ from: string; to: string } | null> {
  try {
    const res = await fetch("/api/puzzles/hint", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId, playerMovesCount }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.hint ?? null;
  } catch { return null; }
}
