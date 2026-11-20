import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpening } from "@/features/openings/lib/data";
import { validateCompletion, OPENING_XP, MASTERED_FOR_SILVER } from "@/features/openings/lib/validate";
import { openingCompleteSchema } from "@/lib/validation/schemas";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(`op:${profile.id}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = openingCompleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const opening = getOpening(parsed.data.openingId);
  if (!opening) return NextResponse.json({ error: "No such opening" }, { status: 404 });

  // Server-authoritative: the submitted line must match the canonical opening exactly.
  const check = validateCompletion(opening, parsed.data.moves);
  if (!check.complete) return NextResponse.json({ error: "Incomplete or incorrect line" }, { status: 422 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("opening_progress").select("opening_id, mastered, xp_awarded")
    .eq("user_id", profile.id).eq("opening_id", opening.id).maybeSingle();

  const nowMastered = parsed.data.flawless; // self-reported quality; see MIGRATION notes
  let xpAwarded = 0;
  let becameMastered = false;

  if (!existing) {
    xpAwarded = OPENING_XP; // XP granted ONCE per opening (not farmable)
    becameMastered = nowMastered;
    await admin.from("opening_progress").insert({
      user_id: profile.id, opening_id: opening.id, mastered: nowMastered, xp_awarded: xpAwarded,
    });
  } else if (nowMastered && !existing.mastered) {
    becameMastered = true; // upgrade to mastered on a later flawless run (no extra XP)
    await admin.from("opening_progress").update({ mastered: true }).eq("user_id", profile.id).eq("opening_id", opening.id);
  }

  if (xpAwarded > 0) {
    const { data: cur } = await admin.from("profiles").select("xp").eq("id", profile.id).single();
    await admin.from("profiles").update({ xp: Math.max(0, (cur?.xp ?? 0) + xpAwarded) }).eq("id", profile.id);
  }

  // Silver certificate at MASTERED_FOR_SILVER mastered openings (server-side, idempotent).
  const { count: masteredCount } = await admin
    .from("opening_progress").select("*", { count: "exact", head: true })
    .eq("user_id", profile.id).eq("mastered", true);

  const newCertificates: string[] = [];
  if ((masteredCount ?? 0) >= MASTERED_FOR_SILVER) {
    const { error: certErr } = await admin.from("certificates").insert({
      user_id: profile.id, recipient_name: profile.username, tier: "silver",
      title: "Strategic Mastermind", metadata: { reason: `${MASTERED_FOR_SILVER} openings mastered` },
    });
    if (!certErr) newCertificates.push("silver");
  }

  return NextResponse.json({
    status: "ok", xpAwarded, mastered: becameMastered || existing?.mastered === true,
    masteredCount: masteredCount ?? 0, newCertificates,
  });
}
