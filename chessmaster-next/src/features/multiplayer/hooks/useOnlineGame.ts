"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChessGame } from "@/features/chess/lib/chessCompat";
import { sfxMove, sfxCapture, sfxCheck } from "@/features/chess/lib/sounds";
import { createClient } from "@/lib/supabase/client";
import { findMatch, getGame, sendMove, resignGame, type MpGameView } from "@/features/multiplayer/services/api";

// Authoritative-fetch model: the server row is the truth. Realtime (or a light poll fallback)
// only triggers a REFETCH; broadcast payloads are never trusted. Reconnect = just refetch.
export function useOnlineGame() {
  const [game, setGame] = useState<MpGameView | null>(null);
  const [status, setStatus] = useState<"idle" | "searching" | "in_game" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!idRef.current) return;
    const r = await getGame(idRef.current);
    if ("game" in r) { setGame(r.game); setStatus("in_game"); }
  }, []);

  const find = useCallback(async (timeControl: number | null, ranked: boolean) => {
    setStatus("searching"); setError(null);
    const r = await findMatch(timeControl, ranked);
    if ("error" in r) { setError(r.error); setStatus("error"); return; }
    idRef.current = r.id;
    await refetch();
  }, [refetch]);

  // Subscribe to authoritative changes; on any change, refetch. Poll is a fallback @2.5s and
  // STOPS once the game is finished (no unbounded network after game over). Exactly one
  // subscription per active game; cleaned up on unmount / status change.
  const finished = game?.status === "finished";
  useEffect(() => {
    if (!idRef.current || status !== "in_game" || finished) return;
    const id = idRef.current;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      const sb = createClient();
      channel = sb.channel(`mp:${id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mp_games", filter: `id=eq.${id}` }, () => { void refetch(); })
        .subscribe();
    } catch { /* realtime optional */ }
    const poll = setInterval(() => { void refetch(); }, 2500);
    return () => { clearInterval(poll); try { channel?.unsubscribe(); } catch { /* ignore */ } };
  }, [status, refetch, finished]);

  const onSquare = useCallback(async (sq: string) => {
    if (!game || game.status !== "active" || !game.mySide) return;
    if (game.turn !== game.mySide) return; // not your turn (server also enforces)
    const g = new ChessGame(game.fen);
    if (selected) {
      const legal = g.verboseMoves(selected).find((m) => m.to === sq);
      if (legal) {
        const uci = selected + sq + (legal.promotion ? "q" : "");
        setSelected(null);
        // optimistic SFX only; the authoritative board comes from refetch
        const probe = new ChessGame(game.fen).safeMove({ from: selected, to: sq, promotion: legal.promotion ? "q" : undefined });
        probe?.captured ? sfxCapture() : sfxMove();
        const res = await sendMove(game.id, uci, game.version);
        if (!res.ok && res.error) setError(res.error);
        await refetch();
        return;
      }
    }
    const piece = g.get(sq);
    const myColor = game.mySide === "white" ? "w" : "b";
    if (piece && piece.color === myColor) setSelected(sq); else setSelected(null);
  }, [game, selected, refetch]);

  const resign = useCallback(async () => {
    if (!game) return;
    await resignGame(game.id);
    await refetch();
  }, [game, refetch]);

  const legalTargets = (() => {
    if (!game || !selected) return [];
    try { return new ChessGame(game.fen).verboseMoves(selected).map((m) => m.to); } catch { return []; }
  })();

  // Play the check sound only when the POSITION actually changes to a check — not on every
  // 2.5s refetch of the same position (which would beep repeatedly).
  const lastCheckFen = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    if (game.fen !== lastCheckFen.current) {
      lastCheckFen.current = game.fen;
      if (g_check(game)) sfxCheck();
    }
  }, [game]);

  return { game, status, error, selected, legalTargets, find, onSquare, resign, refetch };
}

function g_check(game: MpGameView): boolean {
  try { return new ChessGame(game.fen).isCheck(); } catch { return false; }
}
