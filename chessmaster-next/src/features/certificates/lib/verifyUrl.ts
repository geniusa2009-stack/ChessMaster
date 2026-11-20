// Builds the REAL verification URL for a certificate's QR code. No fake domains.
// Falls back to a relative path when no site URL is configured (documented deploy step).
import { isValidSerial } from "@/features/certificates/lib/serial";

export function buildVerifyUrl(siteUrl: string | undefined, serial: string): string {
  if (!isValidSerial(serial)) throw new Error("invalid serial");
  const base = (siteUrl || "").replace(/\/+$/, "");
  return base ? `${base}/verify/${serial}` : `/verify/${serial}`;
}
