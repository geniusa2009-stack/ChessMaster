import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { OPENINGS } from "@/features/openings/lib/data";

export const runtime = "nodejs";

// Openings are public theory, so the full lines/explanations are returned for the trainer.
// Progress (completed/mastered) comes from the authoritative DB record.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: progress } = await admin
    .from("opening_progress").select("opening_id, mastered").eq("user_id", profile.id);
  const byId = new Map((progress ?? []).map((p) => [p.opening_id, p.mastered]));

  const openings = OPENINGS.map((o) => ({
    ...o,
    completed: byId.has(o.id),
    mastered: byId.get(o.id) === true,
  }));
  const masteredCount = (progress ?? []).filter((p) => p.mastered).length;
  return NextResponse.json({ openings, stats: { masteredCount } });
}
