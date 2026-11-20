import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { utcMidnightISO } from "@/features/rpg/lib/quests";

// Server-derived counts of TODAY's authoritative events (UTC). This is how quest
// progress is computed — from real event rows, not from any client-reported number.
export async function todayCounts(admin: SupabaseClient, userId: string) {
  const since = utcMidnightISO();
  const [games, puzzles, openings] = await Promise.all([
    admin.from("game_results").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since),
    admin.from("puzzle_solves").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("solved_at", since),
    admin.from("opening_progress").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("completed_at", since),
  ]);
  return {
    play: games.count ?? 0,
    puzzles: puzzles.count ?? 0,
    openings: openings.count ?? 0,
  };
}

export async function lifetimeStats(admin: SupabaseClient, userId: string) {
  const [solves, mastered, prof] = await Promise.all([
    admin.from("puzzle_solves").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("opening_progress").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("mastered", true),
    admin.from("profiles").select("wins").eq("id", userId).single(),
  ]);
  return {
    puzzleSolveCount: solves.count ?? 0,
    masteredOpenings: mastered.count ?? 0,
    wins: prof.data?.wins ?? 0,
  };
}
