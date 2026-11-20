import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeGame } from "@/lib/multiplayer/finalize";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const { id } = await params;

  const admin = createAdminClient();
  const { data: g } = await admin.from("mp_games").select("*").eq("id", id).maybeSingle();
  if (!g) return NextResponse.json({ error: "GAME_NOT_FOUND" }, { status: 404 });
  const mySide = g.white_player === profile.id ? "white" : g.black_player === profile.id ? "black" : null;
  if (!mySide) return NextResponse.json({ error: "NOT_A_PLAYER" }, { status: 403 });
  if (g.status !== "active") return NextResponse.json({ error: "GAME_NOT_ACTIVE" }, { status: 409 });

  const winner = mySide === "white" ? "black" : "white";
  const res = await finalizeGame(admin, g, { winner, isDraw: false, termination: "resign" });
  // Idempotent: repeated resigns hit the finished guard and award nothing extra.
  return NextResponse.json({ status: res.applied ? "ok" : "already_finished", winner });
}
