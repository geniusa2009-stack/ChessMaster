// Certificate tier theme (visual identity ported from the legacy CERT_TIERS). Client-safe:
// this is presentation metadata, NOT authority. Authenticity comes from the DB record.
export type CertTier = "bronze" | "silver" | "gold";

export interface TierTheme {
  key: CertTier;
  icon: string;       // chess glyph used as the emblem
  title: string;      // rank name
  tierLabel: string;  // TIER I/II/III
  rarity: string;     // RARE / EPIC / LEGENDARY
  color: string;      // neon accent
  glow: string;       // rgba glow
  requirement: string;
}

export const TIER_THEME: Record<CertTier, TierTheme> = {
  bronze: { key: "bronze", icon: "♞", title: "Tactical Prodigy",     tierLabel: "TIER I",   rarity: "RARE",      color: "#00e5ff", glow: "rgba(0,229,255,0.55)",  requirement: "Solve 25 puzzles in a row." },
  silver: { key: "silver", icon: "♝", title: "Strategic Mastermind", tierLabel: "TIER II",  rarity: "EPIC",      color: "#b96bff", glow: "rgba(185,107,255,0.55)", requirement: "Master 5 opening lines." },
  gold:   { key: "gold",   icon: "♚", title: "Grandmaster Slayer",   tierLabel: "TIER III", rarity: "LEGENDARY", color: "#ffd24a", glow: "rgba(255,210,74,0.60)",  requirement: "Defeat Titan 2800 in a Ranked match." },
};

export const TIER_ORDER: CertTier[] = ["bronze", "silver", "gold"];
export function tierTheme(tier: string): TierTheme | undefined {
  return TIER_THEME[tier as CertTier];
}
