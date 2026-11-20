import { NextResponse } from "next/server";
import { gameResultSchema } from "@/lib/validation/schemas";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRewards, validateResult } from "@/lib/game/rewards";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

// Client submits the reported result; the SERVER validates, computes rewards,
// and writes authoritative state. XP/rating are never taken from the client.
export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(`games:${profile.id}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 40000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = gameResultSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  const result = parsed.data;

  const impossible = validateResult(result);
  if (impossible) {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({ actor_id: profile.id, action: "suspicious_result", target: result.clientGameId, detail: { reason: impossible } });
    return NextResponse.json({ error: "Result rejected" }, { status: 422 });
  }

  const admin = createAdminClient();

  // Idempotency: (user_id, client_game_id) is UNIQUE. If it already exists, return prior result.
  const { data: existing } = await admin
    .from("game_results").select("id").eq("user_id", profile.id).eq("client_game_id", result.clientGameId).maybeSingle();
  if (existing) return NextResponse.json({ status: "duplicate", accepted: false });

  // Load current authoritative state.
  const { data: cur, error: curErr } = await admin
    .from("profiles").select("rating, xp, wins, losses, draws").eq("id", profile.id).single();
  if (curErr || !cur) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const { xpDelta, ratingDelta, achievements } = computeRewards({ rating: cur.rating, wins: cur.wins }, result);

  // Insert the immutable result row (also enforces idempotency at the DB level).
  const { error: insErr } = await admin.from("game_results").insert({
    user_id: profile.id,
    client_game_id: result.clientGameId,
    opponent_id: result.opponentId,
    opponent_elo: result.opponentElo,
    result: result.result,
    ranked: result.ranked,
    moves: result.moves,
    duration_ms: result.durationMs,
    pgn: result.pgn ?? null,
    xp_delta: xpDelta,
    rating_delta: ratingDelta,
  });
  if (insErr) {
    if (insErr.code === "23505") return NextResponse.json({ status: "duplicate", accepted: false });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Apply authoritative deltas.
  const newXp = Math.max(0, cur.xp + xpDelta);
  const newRating = Math.min(4000, Math.max(100, cur.rating + ratingDelta));
  await admin.from("profiles").update({
    xp: newXp,
    rating: newRating,
    wins: cur.wins + (result.result === "win" ? 1 : 0),
    losses: cur.losses + (result.result === "loss" ? 1 : 0),
    draws: cur.draws + (result.result === "draw" ? 1 : 0),
  }).eq("id", profile.id);

  if (achievements.length) {
    await admin.from("user_achievements").upsert(
      achievements.map((k) => ({ user_id: profile.id, achievement_key: k })),
      { onConflict: "user_id,achievement_key", ignoreDuplicates: true }
    );
  }

  // Gold certificate: defeating Titan (2800) in a RANKED match — server-authoritative,
  // idempotent (certificates has UNIQUE(user_id, tier)). Ported from legacy unlockCert('gold').
  const newCertificates: string[] = [];
  if (result.result === "win" && result.ranked && result.opponentId === "titan") {
    const { error: certErr } = await admin.from("certificates").insert({
      user_id: profile.id, recipient_name: profile.username, tier: "gold",
      title: "Grandmaster Slayer", metadata: { reason: "Defeated Titan 2800 (ranked)" },
    });
    if (!certErr) newCertificates.push("gold");
  }

  return NextResponse.json({ status: "ok", accepted: true, xp: newXp, rating: newRating, xpDelta, ratingDelta, achievements, newCertificates });
}
