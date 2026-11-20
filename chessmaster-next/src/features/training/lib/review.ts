// Spaced repetition — SM-2-INSPIRED (documented adaptation, not the original SM-2).
// State per (user, item): interval_days, reps, ease (x100), due_at. Deterministic.
//  - fail  -> reps=0, interval=1 day (comes back soon), ease reduced (min 130).
//  - success -> reps 0→1 interval=1; 1→2 interval=3; else interval=round(prev*ease/100); ease +15.
//  - interval capped at 180 days (not scheduled infinitely).
export interface ReviewState {
  intervalDays: number; reps: number; ease: number; // ease is x100 (250 = 2.50)
  dueAt: number; // epoch ms
  lastOutcome?: "success" | "fail";
}

export const DEFAULT_EASE = 250;
const MIN_EASE = 130;
const MAX_INTERVAL = 180;
const DAY = 24 * 60 * 60 * 1000;

export function initialReview(now: number): ReviewState {
  return { intervalDays: 0, reps: 0, ease: DEFAULT_EASE, dueAt: now };
}

export function schedule(prev: ReviewState, outcome: "success" | "fail", now: number): ReviewState {
  if (outcome === "fail") {
    const ease = Math.max(MIN_EASE, prev.ease - 20);
    return { intervalDays: 1, reps: 0, ease, dueAt: now + 1 * DAY, lastOutcome: "fail" };
  }
  const reps = prev.reps + 1;
  let interval: number;
  if (reps === 1) interval = 1;
  else if (reps === 2) interval = 3;
  else interval = Math.round(prev.intervalDays * (prev.ease / 100));
  interval = Math.max(1, Math.min(MAX_INTERVAL, interval));
  const ease = Math.min(400, prev.ease + 15);
  return { intervalDays: interval, reps, ease, dueAt: now + interval * DAY, lastOutcome: "success" };
}

export function isDue(state: { dueAt: number }, now: number): boolean {
  return now >= state.dueAt;
}
