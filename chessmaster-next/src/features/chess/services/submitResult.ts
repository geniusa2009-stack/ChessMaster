"use client";
// The ONLY path to permanent rewards is the existing server boundary /api/games.
// The client sends the game FACTS (result/opponent/moves/duration) plus an
// idempotency key. It does NOT send xp/rating — the server computes those.
import type { GameResultKind } from "@/features/chess/types";

export interface SubmitInput {
  clientGameId: string;   // crypto.randomUUID() per game
  opponentId: string;
  opponentElo: number;
  result: GameResultKind;
  ranked: boolean;
  moves: number;
  durationMs: number;
  pgn?: string;
}

export interface SubmitOutcome {
  status: "ok" | "duplicate" | "error";
  accepted?: boolean;
  xp?: number;
  rating?: number;
  xpDelta?: number;
  ratingDelta?: number;
  achievements?: string[];
  error?: string;
}

export async function submitGameResult(input: SubmitInput): Promise<SubmitOutcome> {
  try {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.status === 401) return { status: "error", error: "Please sign in to save results." };
    if (res.status === 429) return { status: "error", error: "Too many requests — slow down." };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "error", error: data?.error || "Result rejected." };
    return data as SubmitOutcome;
  } catch {
    return { status: "error", error: "Network error." };
  }
}
