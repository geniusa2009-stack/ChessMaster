import type { BotDef, EngineLevel } from "@/features/chess/types";

// Ported from the old BOTS roster (elo + persona styles preserved).
export const BOTS: BotDef[] = [
  { id: "rooky", name: "Rooky", elo: 400 },
  { id: "pixel", name: "Pixel", elo: 800 },
  { id: "bolt", name: "Bolt", elo: 1000 },
  { id: "gambler", name: "The Gambler", elo: 900, style: "random" },
  { id: "wall", name: "The Wall", elo: 1500, style: "defensive" },
  { id: "assassin", name: "The Assassin", elo: 2200, style: "aggressive" },
  { id: "zara", name: "Zara", elo: 1800, locked: true, xp: 200 },
  { id: "goro", name: "Goro", elo: 2400, locked: true, xp: 500 },
  { id: "titan", name: "Titan", elo: 2800, locked: true, xp: 1000 },
];

export function botById(id: string): BotDef {
  return BOTS.find((b) => b.id === id) ?? BOTS[0];
}

// Ported verbatim from old levelFromElo().
export function levelFromElo(elo: number): EngineLevel {
  const skill = Math.max(0, Math.min(20, Math.round((elo - 800) / 100)));
  const movetime = Math.max(80, Math.min(600, 80 + Math.max(0, elo - 600) * 0.22));
  const depth = elo < 1000 ? 1 : elo < 1800 ? 2 : 3;
  const blunder = elo < 600 ? 0.35 : elo < 1000 ? 0.22 : elo < 1400 ? 0.12 : elo < 1900 ? 0.05 : 0.0;
  return { skill, movetime, depth, blunder, elo };
}

// Ported from old curLevel(): persona styles tweak blunder rate.
export function curLevel(botId: string): EngineLevel {
  const b = botById(botId);
  const lv = levelFromElo(b.elo);
  if (b.style === "aggressive") { lv.blunder *= 0.3; lv.aggr = true; }
  else if (b.style === "random") { lv.blunder = Math.min(0.6, lv.blunder + 0.28); }
  else if (b.style === "defensive") { lv.blunder *= 0.6; }
  return lv;
}
