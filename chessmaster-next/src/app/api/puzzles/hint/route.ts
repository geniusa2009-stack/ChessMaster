import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { getPuzzle } from "@/features/puzzles/lib/data.server";
import { nextPlayerMove } from "@/features/puzzles/lib/validate";
import { puzzleHintSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

// Reveals ONLY the next expected player move (not the whole solution). Server-issued;
// requesting a hint resets the streak so hints can't be used to farm rewards.
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = puzzleHintSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const puzzle = getPuzzle(parsed.data.puzzleId);
  if (!puzzle) return NextResponse.json({ error: "No such puzzle" }, { status: 404 });

  const hint = nextPlayerMove(puzzle.solution, parsed.data.playerMovesCount);
  if (!hint) return NextResponse.json({ error: "No hint available" }, { status: 404 });

  const admin = createAdminClient();
  await admin.from("profiles").update({ puzzle_streak: 0 }).eq("id", profile.id);
  return NextResponse.json({ hint });
}
