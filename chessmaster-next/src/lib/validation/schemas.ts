import { z } from "zod";

// AI proxy input
export const aiRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  system: z.string().max(2000).optional(),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;

// Game result submission — client REPORTS outcome; server recomputes rewards.
export const gameResultSchema = z.object({
  clientGameId: z.string().uuid(),                 // idempotency key per game
  opponentId: z.string().min(1).max(32),
  opponentElo: z.number().int().min(100).max(4000),
  result: z.enum(["win", "loss", "draw"]),
  ranked: z.boolean(),
  moves: z.number().int().min(0).max(600),
  durationMs: z.number().int().min(0).max(1000 * 60 * 60 * 12),
  pgn: z.string().max(20000).optional(),
});
export type GameResult = z.infer<typeof gameResultSchema>;

// Puzzle attempt: client sends the puzzle id and the UCI moves IT played.
// It never sends xp/score/streak — the server derives those.
export const puzzleAttemptSchema = z.object({
  puzzleId: z.number().int().positive(),
  playerMoves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).min(1).max(10),
});
export const puzzleIdSchema = z.object({ puzzleId: z.number().int().positive() });
export const puzzleHintSchema = z.object({
  puzzleId: z.number().int().positive(),
  playerMovesCount: z.number().int().min(0).max(10),
});

// Opening completion: client submits the line it played + a self-reported flawless flag.
// The server VERIFIES the line against the canonical opening; xp/mastery are server-derived.
export const openingCompleteSchema = z.object({
  openingId: z.string().min(1).max(32),
  moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)).min(1).max(40),
  flawless: z.boolean(),
});

// RPG: claim a daily quest / buy a perk. Only the identifier is accepted — the server
// derives progress, reward amount, and cost. Never trust client xp/reward/cost.
export const foundationAttemptSchema = z.object({
  assessmentId: z.literal("CH01").optional(),
  // R7.3.2: the signed attempt token issued by POST /api/foundations/start. It binds the submitted
  // answers to the exact server-issued items; the server rejects a submission without a valid token.
  token: z.string().min(1).max(4096),
  answers: z.array(z.object({
    id: z.string().min(1).max(32),
    answerIndex: z.number().int().min(0).max(3).optional(),
    uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/).optional(),
  })).min(1).max(80),
});

export const questClaimSchema = z.object({ questKey: z.enum(["play", "puzzles", "openings"]) });
export const perkBuySchema = z.object({ perkKey: z.string().min(1).max(32) });

// Multiplayer: the client sends only a move (UCI) + an optional expected version for
// optimistic concurrency. It never sends winner/turn/fen/rating/xp/clock — the server
// derives all of those.
export const mpMoveSchema = z.object({
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  expectedVersion: z.number().int().min(0).optional(),
});
export const mpFindSchema = z.object({
  timeControl: z.union([z.literal(180), z.literal(300), z.literal(600)]).nullable().optional(),
  ranked: z.boolean().optional(),
});

// Admin: users-list query (whitelisted sort + bounded pagination + optional search) and
// certificate revocation (serial only; status/winner/etc. are server-decided).
export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["created_at", "rating", "xp", "username"]).default("created_at"),
  search: z.string().max(40).optional(),
});
export const certRevokeSchema = z.object({
  serial: z.string().regex(/^[a-f0-9]{18}$/),
  revoke: z.boolean().default(true),
});
