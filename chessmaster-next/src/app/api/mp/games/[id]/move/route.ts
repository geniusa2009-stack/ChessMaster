import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { mpMoveSchema } from "@/lib/validation/schemas";
import { applyServerMove } from "@/features/multiplayer/lib/game";
import { applyElapsed } from "@/features/multiplayer/lib/clock";
import { finalizeGame } from "@/lib/multiplayer/finalize";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const { id } = await params;
  const rl = rateLimit(`mpmove:${profile.id}:${clientIp(req)}`, 300, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = mpMoveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 422 });

  const admin = createAdminClient();
  const { data: g } = await admin.from("mp_games").select("*").eq("id", id).maybeSingle();
  if (!g) return NextResponse.json({ error: "GAME_NOT_FOUND" }, { status: 404 });

  const mySide = g.white_player === profile.id ? "white" : g.black_player === profile.id ? "black" : null;
  if (!mySide) return NextResponse.json({ error: "NOT_A_PLAYER" }, { status: 403 });
  if (g.status !== "active") return NextResponse.json({ error: "GAME_NOT_ACTIVE" }, { status: 409 });
  if (g.turn !== mySide) return NextResponse.json({ error: "NOT_YOUR_TURN" }, { status: 409 });
  if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== g.version) {
    return NextResponse.json({ error: "STALE_GAME_STATE", version: g.version }, { status: 409 });
  }

  // Authoritative clock: deduct elapsed from the mover; timeout => opponent wins.
  const now = Date.now();
  if (g.time_control != null && g.last_move_at) {
    const c = applyElapsed({ timeControl: g.time_control, whiteMs: g.white_ms, blackMs: g.black_ms, turn: g.turn, lastMoveAt: Date.parse(g.last_move_at) }, now);
    if (c.timedOut) {
      const winner = mySide === "white" ? "black" : "white";
      await finalizeGame(admin, g, { winner, isDraw: false, termination: "timeout" });
      return NextResponse.json({ error: "CLOCK_EXPIRED" }, { status: 409 });
    }
    g.white_ms = c.whiteMs; g.black_ms = c.blackMs;
  }

  // Server reconstructs state from the stored FEN and validates the move (client FEN ignored).
  const out = applyServerMove(g.fen, parsed.data.uci);
  if (!out.ok) return NextResponse.json({ error: "INVALID_MOVE" }, { status: 422 });

  const newMoves = [...(g.moves as string[]), parsed.data.uci];
  // Optimistic-locked write: only succeeds if version + turn are unchanged (race-safe).
  const { data: updated } = await admin
    .from("mp_games")
    .update({ fen: out.fen, turn: out.turn, moves: newMoves, white_ms: g.white_ms, black_ms: g.black_ms, last_move_at: new Date(now).toISOString(), version: g.version + 1 })
    .eq("id", g.id).eq("status", "active").eq("version", g.version).eq("turn", mySide)
    .select().maybeSingle();
  if (!updated) return NextResponse.json({ error: "STALE_GAME_STATE" }, { status: 409 });

  if (out.finished) {
    await finalizeGame(admin, { ...updated }, { winner: out.winner ?? null, isDraw: !!out.isDraw, termination: out.termination! });
  }
  return NextResponse.json({ status: "ok", version: updated.version, fen: updated.fen, turn: updated.turn, finished: !!out.finished });
}
