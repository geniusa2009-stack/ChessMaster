// Authoritative clock math. The browser timer is display-only; the SERVER deducts elapsed
// wall-clock time between the last transition and now. Pure + testable.
export type Side = "white" | "black";

export interface ClockState {
  timeControl: number | null; // base seconds, null = untimed
  whiteMs: number | null;
  blackMs: number | null;
  turn: Side;
  lastMoveAt: number | null;  // epoch ms of the last authoritative transition
}

export interface ClockResult {
  whiteMs: number | null;
  blackMs: number | null;
  timedOut: boolean;          // the player *to move* ran out before acting
}

// Deduct elapsed time from the side to move. If they have <= 0 left, they timed out.
export function applyElapsed(state: ClockState, now: number): ClockResult {
  if (state.timeControl == null || state.whiteMs == null || state.blackMs == null || state.lastMoveAt == null) {
    return { whiteMs: state.whiteMs, blackMs: state.blackMs, timedOut: false };
  }
  const elapsed = Math.max(0, now - state.lastMoveAt);
  if (state.turn === "white") {
    const remaining = state.whiteMs - elapsed;
    if (remaining <= 0) return { whiteMs: 0, blackMs: state.blackMs, timedOut: true };
    return { whiteMs: remaining, blackMs: state.blackMs, timedOut: false };
  } else {
    const remaining = state.blackMs - elapsed;
    if (remaining <= 0) return { whiteMs: state.whiteMs, blackMs: 0, timedOut: true };
    return { whiteMs: state.whiteMs, blackMs: remaining, timedOut: false };
  }
}
