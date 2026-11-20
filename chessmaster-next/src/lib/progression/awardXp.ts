import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Single authoritative XP mutation path used by server reward flows (quests, perks).
// Reads current xp and writes the clamped new value. Callers must already be authorized.
export async function awardXp(admin: SupabaseClient, userId: string, delta: number): Promise<number> {
  const { data: cur } = await admin.from("profiles").select("xp").eq("id", userId).single();
  const newXp = Math.max(0, (cur?.xp ?? 0) + delta);
  await admin.from("profiles").update({ xp: newXp }).eq("id", userId);
  return newXp;
}
