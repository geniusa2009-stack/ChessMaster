import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// A user's OWN certificate history (private). No issuance here — issuance is decided
// server-side by the game/puzzle/opening reward flows. GET-only: the client can never
// create or modify a certificate through this endpoint.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .select("serial, tier, title, recipient_name, status, issued_at")
    .eq("user_id", profile.id)
    .order("issued_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const certificates = (data ?? []).map((c) => ({
    serial: c.serial, tier: c.tier, title: c.title,
    recipientName: c.recipient_name, status: c.status, issuedAt: c.issued_at,
  }));
  return NextResponse.json({ certificates });
}
