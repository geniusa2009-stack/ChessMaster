import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPuzzle } from "@/features/puzzles/lib/data.server";
import { validateAttempt, puzzleXp } from "@/features/puzzles/lib/validate";
import { difficultyScore, difficultyBand } from "@/features/content/lib/validate";
import { recordTrainingOutcome } from "@/lib/training/record";
import { puzzleAttemptSchema } from "@/lib/validation/schemas";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(`pz:${profile.id}:${clientIp(req)}`, 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = puzzleAttemptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const puzzle = getPuzzle(parsed.data.puzzleId);
  if (!puzzle) return NextResponse.json({ error: "No such puzzle" }, { status: 404 });

  // Difficulty + domain are authoritative verified metadata stored server-side (no per-request
  // engine analysis — see perf rule). Fall back to the deterministic validator for any legacy row.
  const difficulty = puzzle.difficulty ?? difficultyBand(difficultyScore(puzzle));
  const result = validateAttempt(puzzle.solution, parsed.data.playerMoves);
  const admin = createAdminClient();

  if (result.status === "wrong") {
    // Reset the authoritative streak on a wrong move.
    await admin.from("profiles").update({ puzzle_streak: 0 }).eq("id", profile.id);
    await recordTrainingOutcome(admin, profile.id, puzzle.id, puzzle.theme, difficulty, "fail", puzzle.domain);
    return NextResponse.json({ status: "wrong", correctThrough: result.correctThrough, streak: 0 });
  }

  if (result.status === "progress") {
    return NextResponse.json({ status: "progress", opponentMove: result.opponentMove, correctThrough: result.correctThrough });
  }

  // solved — award idempotently.
  const xp = puzzleXp(puzzle.elo);
  const { error: insErr } = await admin
    .from("puzzle_solves")
    .insert({ user_id: profile.id, puzzle_id: puzzle.id, xp_awarded: xp });

  if (insErr) {
    if (insErr.code === "23505") {
      // Already solved before — no new reward (idempotent).
      const { data: cur } = await admin.from("profiles").select("xp, puzzle_rating, puzzle_streak").eq("id", profile.id).single();
      return NextResponse.json({ status: "solved", alreadySolved: true, xp: cur?.xp, puzzleRating: cur?.puzzle_rating, streak: cur?.puzzle_streak, xpAwarded: 0 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const { data: cur } = await admin
    .from("profiles").select("xp, puzzle_rating, puzzle_streak, best_puzzle_streak").eq("id", profile.id).single();
  const newXp = Math.max(0, (cur?.xp ?? 0) + xp);
  const newRating = Math.min(4000, (cur?.puzzle_rating ?? 1200) + 15);
  const newStreak = (cur?.puzzle_streak ?? 0) + 1;
  const newBest = Math.max(cur?.best_puzzle_streak ?? 0, newStreak);
  await admin.from("profiles").update({
    xp: newXp, puzzle_rating: newRating, puzzle_streak: newStreak, best_puzzle_streak: newBest,
  }).eq("id", profile.id);

  // Bronze certificate at a 25-streak (server-authoritative issuance, idempotent).
  await recordTrainingOutcome(admin, profile.id, puzzle.id, puzzle.theme, difficulty, "success", puzzle.domain);

  const newCerts: string[] = [];
  if (newStreak >= 25) {
    const { error: certErr } = await admin.from("certificates").insert({
      user_id: profile.id, recipient_name: profile.username, tier: "bronze",
      title: "Tactical Prodigy", metadata: { reason: "25 puzzle streak" },
    });
    if (!certErr) newCerts.push("bronze");
  }

  return NextResponse.json({
    status: "solved", alreadySolved: false, xpAwarded: xp,
    xp: newXp, puzzleRating: newRating, streak: newStreak, newCertificates: newCerts,
  });
}
