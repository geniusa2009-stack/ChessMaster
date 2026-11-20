// Daily quest definitions (ported: play 2 games, solve 5 puzzles, master 1 opening).
// Progress is DERIVED server-side from authoritative event counts — never client-reported.
export type QuestKey = "play" | "puzzles" | "openings";

export interface QuestDef { key: QuestKey; target: number; reward: number; title: string }

export const QUEST_DEFS: QuestDef[] = [
  { key: "play", target: 2, reward: 50, title: "Play 2 Matches" },
  { key: "puzzles", target: 5, reward: 50, title: "Solve 5 Puzzles" },
  { key: "openings", target: 1, reward: 50, title: "Master 1 Opening" },
];

export function questDef(key: string): QuestDef | undefined {
  return QUEST_DEFS.find((q) => q.key === key);
}

export function isQuestComplete(def: QuestDef, progress: number): boolean {
  return progress >= def.target;
}

// UTC calendar day (YYYY-MM-DD). Quests reset at UTC midnight; documented behavior.
export function utcDateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
export function utcMidnightISO(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10) + "T00:00:00.000Z";
}
