// Pure: turns an AUTHORITATIVE certificate record into the exact values the canvas draws.
// The canvas is presentation only; every field here comes from the DB, never the client.
import { tierTheme, type TierTheme } from "@/features/certificates/lib/tiers";

export interface AuthoritativeCert {
  serial: string;
  recipientName: string;
  tier: string;
  title: string;
  status: "valid" | "revoked";
  issuedAt: string; // ISO
}

export interface CertificateView {
  academy: string;
  heading: string;
  recipientName: string;
  rankLine: string;
  rarityLine: string;
  description: string;
  dateStr: string;
  serial: string;
  revoked: boolean;
  theme: TierTheme;
  footer: string;
}

export function buildCertificateView(cert: AuthoritativeCert): CertificateView {
  const theme = tierTheme(cert.tier);
  if (!theme) throw new Error("unknown tier");
  const dateStr = new Date(cert.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  return {
    academy: "CHESSMASTER ACADEMY",
    heading: "CERTIFICATE OF ACHIEVEMENT",
    recipientName: cert.recipientName,
    rankLine: cert.title.toUpperCase(),
    rarityLine: `${theme.rarity}  •  ${theme.tierLabel}`,
    description: theme.requirement,
    dateStr,
    serial: cert.serial,
    revoked: cert.status === "revoked",
    theme,
    footer: "Developed with ♥ by Genius Ahmed Ibrahim",
  };
}
