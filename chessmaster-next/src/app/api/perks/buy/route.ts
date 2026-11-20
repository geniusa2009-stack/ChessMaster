import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { perkDef } from "@/features/rpg/lib/perks";
import { perkBuySchema } from "@/lib/validation/schemas";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

// XP shop: server checks affordability, records the purchase idempotently, then DEDUCTS
// XP. Cost is server-defined; the client never supplies xp/cost.
export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`perk:${profile.id}:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = perkBuySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const def = perkDef(parsed.data.perkKey);
  if (!def) return NextResponse.json({ error: "No such perk" }, { status: 404 });

  const admin = createAdminClient();
  // P-01 fix: atomic check-deduct-insert in one row-locked DB transaction (see 0010). This
  // prevents the concurrent cross-perk overspend that the old read-modify-write allowed.
  const { data: result, error } = await admin.rpc("purchase_perk", {
    p_user: profile.id, p_perk: def.key, p_cost: def.cost,
  });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  switch (result as string) {
    case "ok": {
      const { data: prof } = await admin.from("profiles").select("xp").eq("id", profile.id).single();
      return NextResponse.json({ status: "ok", accepted: true, spent: def.cost, xp: prof?.xp ?? 0 });
    }
    case "already_owned": return NextResponse.json({ status: "already_owned", accepted: false });
    case "insufficient":  return NextResponse.json({ error: "Not enough XP" }, { status: 422 });
    default:              return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
