import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { mpFindSchema } from "@/lib/validation/schemas";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Matchmaking: join the oldest compatible WAITING game (not your own) atomically, else
// create one. The atomic conditional UPDATE (status must still be 'waiting') is what makes
// two simultaneous joiners safe — only one flips the row to 'active'.
export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const rl = rateLimit(`mpfind:${profile.id}:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const parsed = mpFindSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 422 });
  const timeControl = parsed.data.timeControl ?? null;
  const ranked = parsed.data.ranked ?? true;

  const admin = createAdminClient();

  // If already waiting/active in a game, return it (no duplicate creation).
  const { data: existing } = await admin
    .from("mp_games").select("id,status")
    .or(`white_player.eq.${profile.id},black_player.eq.${profile.id}`)
    .in("status", ["waiting", "active"]).limit(1).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, status: existing.status });

  // Try to claim an open seat (a few candidates to survive contention).
  const { data: candidates } = await admin
    .from("mp_games").select("id,version")
    .eq("status", "waiting").is("black_player", null).neq("white_player", profile.id)
    .is("time_control", timeControl === null ? null : timeControl).eq("ranked", ranked)
    .order("created_at", { ascending: true }).limit(5);

  for (const c of candidates ?? []) {
    const startedAt = new Date().toISOString();
    const ms = timeControl == null ? null : timeControl * 1000;
    const { data: claimed } = await admin
      .from("mp_games")
      .update({ black_player: profile.id, status: "active", started_at: startedAt, last_move_at: startedAt, white_ms: ms, black_ms: ms, version: c.version + 1 })
      .eq("id", c.id).eq("status", "waiting").is("black_player", null).eq("version", c.version)
      .select().maybeSingle();
    if (claimed) return NextResponse.json({ id: claimed.id, status: "active" });
  }

  // Nothing to join — create a waiting game as white.
  const { data: created, error } = await admin
    .from("mp_games").insert({ white_player: profile.id, status: "waiting", turn: "white", fen: START_FEN, ranked, time_control: timeControl })
    .select().single();
  if (error || !created) return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  return NextResponse.json({ id: created.id, status: "waiting" });
}
