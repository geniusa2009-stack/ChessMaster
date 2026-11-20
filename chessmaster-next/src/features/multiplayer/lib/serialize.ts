// Builds the client-facing game view. Includes only fields a participant may see and
// computes DISPLAY clocks (authoritative remaining minus live elapsed for the side to move).
import { applyElapsed, type Side } from "@/features/multiplayer/lib/clock";

export interface MpGameRow {
  id: string; white_player: string | null; black_player: string | null;
  status: string; turn: Side; fen: string; moves: string[];
  ranked: boolean; time_control: number | null; white_ms: number | null; black_ms: number | null;
  last_move_at: string | null; version: number; winner: Side | null; is_draw: boolean;
  termination: string | null;
}

export function serializeGame(row: MpGameRow, viewerId: string, names: { white?: string; black?: string }) {
  const mySide: Side | null = row.white_player === viewerId ? "white" : row.black_player === viewerId ? "black" : null;
  let whiteMs = row.white_ms, blackMs = row.black_ms;
  if (row.status === "active" && row.last_move_at) {
    const c = applyElapsed(
      { timeControl: row.time_control, whiteMs: row.white_ms, blackMs: row.black_ms, turn: row.turn, lastMoveAt: Date.parse(row.last_move_at) },
      Date.now()
    );
    whiteMs = c.whiteMs; blackMs = c.blackMs;
  }
  return {
    id: row.id, status: row.status, turn: row.turn, fen: row.fen, moves: row.moves,
    ranked: row.ranked, timeControl: row.time_control, whiteMs, blackMs,
    version: row.version, winner: row.winner, isDraw: row.is_draw, termination: row.termination,
    mySide, whiteName: names.white ?? null, blackName: names.black ?? null,
  };
}
