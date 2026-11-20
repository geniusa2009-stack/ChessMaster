// XP shop perks (ported: neon pieces 500 XP, unlock Titan bot 1000 XP).
export interface PerkDef { key: string; cost: number; title: string; description: string }

export const PERK_DEFS: PerkDef[] = [
  { key: "neon", cost: 500, title: "Neon Pieces", description: "Cosmetic neon board pieces." },
  { key: "titan", cost: 1000, title: "Unlock Titan", description: "Unlock the Titan 2800 opponent." },
];

export function perkDef(key: string): PerkDef | undefined {
  return PERK_DEFS.find((p) => p.key === key);
}
