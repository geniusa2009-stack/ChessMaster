import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSort, normalizePage, normalizePageSize, rankFor } from "@/features/leaderboard/lib/ranking";
import { levelFromXp, tierFromXp } from "@/lib/progression/level";

export const runtime = "nodejs";

// Authoritative, DB-ranked leaderboard. Reads only PUBLIC columns; no ids/emails leak.
// Sort key is whitelisted and page size clamped, so user params can't drive arbitrary SQL.
export async function GET(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sort = normalizeSort(url.searchParams.get("sort"));
  const page = normalizePage(url.searchParams.get("page"));
  const pageSize = normalizePageSize(url.searchParams.get("pageSize"));
  const offset = (page - 1) * pageSize;

  const admin = createAdminClient();

  // Total player count (for pagination meta).
  const { count: total } = await admin
    .from("profiles").select("id", { count: "exact", head: true });

  // One page, ordered DB-side (indexed). Tie-breakers keep ordering stable & deterministic.
  const secondary = sort === "rating" ? "xp" : "rating";
  const { data: rows, error } = await admin
    .from("profiles")
    .select("id, username, avatar_url, rating, xp, wins, losses, draws")
    .order(sort, { ascending: false })
    .order(secondary, { ascending: false })
    .order("username", { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const entries = (rows ?? []).map((r, i) => ({
    rank: rankFor(offset, i),
    username: r.username,
    avatarUrl: r.avatar_url,
    rating: r.rating,
    xp: r.xp,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    level: levelFromXp(r.xp),
    tier: tierFromXp(r.xp),
    isMe: r.id === profile.id, // computed server-side; other users' ids are NOT returned
  }));

  // Current user's global rank = (# of players strictly ahead on the sort metric) + 1.
  const { data: me } = await admin
    .from("profiles").select("rating, xp, wins").eq("id", profile.id).single();
  const myMetric = (me?.[sort as "rating" | "xp" | "wins"] ?? 0) as number;
  const { count: ahead } = await admin
    .from("profiles").select("id", { count: "exact", head: true }).gt(sort, myMetric);
  const myRank = (ahead ?? 0) + 1;

  return NextResponse.json({
    sort, page, pageSize, total: total ?? 0,
    totalPages: Math.max(1, Math.ceil((total ?? 0) / pageSize)),
    myRank,
    entries,
  });
}
