import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMpRewards } from "@/features/multiplayer/lib/rewards";
import type { Side } from "@/features/multiplayer/lib/clock";

// Atomically transition a game active -> finished and, ONLY if this call won the transition,
// apply rewards once. Concurrent/duplicate finalize calls hit 0 rows and no-op (idempotent).
export async function finalizeGame(
  admin: SupabaseClient,
  game: { id: string; version: number; white_player: string | null; black_player: string | null; ranked: boolean },
  outcome: { winner: Side | null; isDraw: boolean; termination: string },
) {
  const { data: won } = await admin
    .from("mp_games")
    .update({
      status: "finished", winner: outcome.winner, is_draw: outcome.isDraw,
      termination: outcome.termination, finished_at: new Date().toISOString(),
      version: game.version + 1,
    })
    .eq("id", game.id).eq("status", "active").eq("version", game.version)
    .select().maybeSingle();

  if (!won) return { applied: false }; // someone else already finalized — idempotent no-op

  if (game.white_player && game.black_player) {
    const { data: wp } = await admin.from("profiles").select("rating, xp, wins, losses, draws").eq("id", game.white_player).single();
    const { data: bp } = await admin.from("profiles").select("rating, xp, wins, losses, draws").eq("id", game.black_player).single();
    if (wp && bp) {
      const r = computeMpRewards({ ranked: game.ranked, winner: outcome.winner, whiteRating: wp.rating, blackRating: bp.rating });
      await admin.from("profiles").update({
        rating: clampRating(wp.rating + r.whiteRatingDelta), xp: Math.max(0, wp.xp + r.whiteXpDelta),
        wins: wp.wins + (outcome.winner === "white" ? 1 : 0),
        losses: wp.losses + (outcome.winner === "black" ? 1 : 0),
        draws: wp.draws + (outcome.isDraw ? 1 : 0),
      }).eq("id", game.white_player);
      await admin.from("profiles").update({
        rating: clampRating(bp.rating + r.blackRatingDelta), xp: Math.max(0, bp.xp + r.blackXpDelta),
        wins: bp.wins + (outcome.winner === "black" ? 1 : 0),
        losses: bp.losses + (outcome.winner === "white" ? 1 : 0),
        draws: bp.draws + (outcome.isDraw ? 1 : 0),
      }).eq("id", game.black_player);
    }
  }
  return { applied: true };
}
function clampRating(v: number) { return Math.min(4000, Math.max(100, v)); }
