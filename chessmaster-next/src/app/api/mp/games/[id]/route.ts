import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { serializeGame } from "@/features/multiplayer/lib/serialize";

export const runtime = "nodejs";

// Authoritative game state for reconnect/refetch. Only participants may read it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const { id } = await params;

  const admin = createAdminClient();
  const { data: g } = await admin.from("mp_games").select("*").eq("id", id).maybeSingle();
  if (!g) return NextResponse.json({ error: "GAME_NOT_FOUND" }, { status: 404 });
  if (g.white_player !== profile.id && g.black_player !== profile.id) {
    return NextResponse.json({ error: "NOT_A_PLAYER" }, { status: 403 }); // no id-guess snooping
  }
  const names: { white?: string; black?: string } = {};
  const ids = [g.white_player, g.black_player].filter(Boolean) as string[];
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id,username").in("id", ids);
    for (const p of profs ?? []) { if (p.id === g.white_player) names.white = p.username; if (p.id === g.black_player) names.black = p.username; }
  }
  return NextResponse.json({ game: serializeGame(g, profile.id, names) });
}
