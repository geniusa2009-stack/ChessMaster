import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSerial } from "@/features/certificates/lib/serial";

export interface VerifiedCert {
  serial: string;
  recipientName: string;
  tier: string;
  title: string;
  status: "valid" | "revoked";
  issuedAt: string;
}

// Authenticity is decided by the DB record, never by the client. Lookup is by the
// random non-enumerable `serial`, so certificate IDs can't be guessed sequentially.
export async function verifyCertificate(serial: string): Promise<VerifiedCert | null> {
  if (!isValidSerial(serial)) return null; // shape guard (9 random bytes hex)
  const admin = createAdminClient();
  const { data } = await admin
    .from("certificates")
    .select("serial, recipient_name, tier, title, status, issued_at")
    .eq("serial", serial)
    .single();
  if (!data) return null;
  return {
    serial: data.serial,
    recipientName: data.recipient_name,
    tier: data.tier,
    title: data.title,
    status: data.status,
    issuedAt: data.issued_at,
  };
}
