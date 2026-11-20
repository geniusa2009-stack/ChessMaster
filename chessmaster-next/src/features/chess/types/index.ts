export type Color = "w" | "b";
export type Square = string; // e.g. "e4"
export type GameMode = "play"; // this slice ports the core "play vs bot" mode only

export interface BotDef {
  id: string;
  name: string;
  elo: number;
  locked?: boolean;
  xp?: number;          // XP required to unlock (display only; unlock is server-side later)
  style?: "aggressive" | "defensive" | "random";
}

export interface EngineLevel {
  skill: number;
  movetime: number;
  depth: number;
  blunder: number;
  elo: number;
  aggr?: boolean;
}

export type GameResultKind = "win" | "loss" | "draw";

export interface MoveLite {
  from: Square;
  to: Square;
  promotion?: string;
  color: Color;
  captured?: string;
  san: string;
  flags: string;
}
