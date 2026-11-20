import { NextResponse } from "next/server";
import { getAuthedProfile, isAdmin } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { certRevokeSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

// Certificate revocation (admin only, server-authoritative, idempotent, audited). Reuses the
// certificates.status model from Phase H — no second table. The serial stays stable; the
// verification page (/verify/[serial]) already reflects 'revoked'.
export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!isAdmin(profile)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = certRevokeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 422 });

  const newStatus = parsed.data.revoke ? "revoked" : "valid";
  const admin = createAdminClient();
  const { data: cert } = await admin.from("certificates").select("id, status").eq("serial", parsed.data.serial).maybeSingle();
  if (!cert) return NextResponse.json({ error: "CERT_NOT_FOUND" }, { status: 404 });

  if (cert.status === newStatus) return NextResponse.json({ status: "ok", changed: false, certStatus: newStatus }); // idempotent

  await admin.from("certificates").update({ status: newStatus }).eq("serial", parsed.data.serial);
  await admin.from("audit_logs").insert({
    actor_id: profile!.id, action: parsed.data.revoke ? "cert_revoke" : "cert_reinstate",
    target: parsed.data.serial, detail: { from: cert.status, to: newStatus },
  });
  return NextResponse.json({ status: "ok", changed: true, certStatus: newStatus });
}
