import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUZZLES } from "@/features/puzzles/lib/data.server";

export const runtime = "nodejs";

// Returns puzzle POSITIONS only — never the solution arrays.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: solves } = await admin
    .from("puzzle_solves").select("puzzle_id").eq("user_id", profile.id);
  const solvedIds = new Set((solves ?? []).map((s) => s.puzzle_id));
  const { data: stats } = await admin
    .from("profiles").select("puzzle_rating, puzzle_streak, best_puzzle_streak").eq("id", profile.id).single();

  const puzzles = PUZZLES.map((p) => ({
    id: p.id, fen: p.fen, theme: p.theme, domain: p.domain, elo: p.elo, objective: p.objective,
    difficulty: p.difficulty, // authoritative verified metadata (never the solution)
    solved: solvedIds.has(p.id),
  }));
  return NextResponse.json({
    puzzles,
    stats: {
      puzzleRating: stats?.puzzle_rating ?? 1200,
      streak: stats?.puzzle_streak ?? 0,
      bestStreak: stats?.best_puzzle_streak ?? 0,
      solvedCount: solvedIds.size,
    },
  });
}
