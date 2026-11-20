// Deterministic level/tier derivation ported from the legacy app. Server-derived;
// the client only displays these. Pure + testable.
export const XP_PER_LEVEL = 100; // legacy: level = 1 + floor(XP/100)

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}
export function xpIntoLevel(xp: number): number {
  return Math.max(0, xp) % XP_PER_LEVEL;
}
export function xpForNextLevel(): number {
  return XP_PER_LEVEL;
}

export type TierKey = "bronze" | "silver" | "gold" | "diamond";
export interface Tier { key: TierKey; icon: string }

// Ported from legacy tierOf(): >=600 diamond, >=300 gold, >=100 silver, else bronze.
export function tierFromXp(xp: number): Tier {
  if (xp >= 600) return { key: "diamond", icon: "\u{1F48E}" };
  if (xp >= 300) return { key: "gold", icon: "\u{1F947}" };
  if (xp >= 100) return { key: "silver", icon: "\u{1F948}" };
  return { key: "bronze", icon: "\u{1F949}" };
}
