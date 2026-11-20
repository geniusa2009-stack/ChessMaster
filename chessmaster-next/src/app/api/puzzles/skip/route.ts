import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Skipping / giving up resets the authoritative streak (ported legacy behavior).
export async function POST() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  await admin.from("profiles").update({ puzzle_streak: 0 }).eq("id", profile.id);
  return NextResponse.json({ status: "ok", streak: 0 });
}
