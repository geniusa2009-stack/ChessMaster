import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schedule, initialReview, DEFAULT_EASE } from "@/features/training/lib/review";

// Records ONE authoritative training event (success/fail) and updates the puzzle's
// spaced-repetition state. Server-only; called from the trusted puzzle-attempt route.
// Best-effort: a failure here must never block the puzzle response, so callers ignore errors.
export async function recordTrainingOutcome(
  admin: SupabaseClient,
  userId: string,
  puzzleId: number,
  theme: string,
  difficulty: "easy" | "medium" | "hard" | "expert",
  outcome: "success" | "fail",
  domain?: string,
): Promise<void> {
  try {
    await admin.from("training_events").insert({
      user_id: userId, kind: "puzzle", ref_id: puzzleId, theme, domain: domain ?? null, difficulty, outcome,
    });
    const now = Date.now();
    const { data: prev } = await admin
      .from("review_state").select("interval_days, reps, ease, due_at")
      .eq("user_id", userId).eq("item_kind", "puzzle").eq("item_id", puzzleId).maybeSingle();
    const prevState = prev
      ? { intervalDays: prev.interval_days, reps: prev.reps, ease: prev.ease, dueAt: Date.parse(prev.due_at) }
      : initialReview(now);
    const next = schedule(prevState, outcome, now);
    await admin.from("review_state").upsert({
      user_id: userId, item_kind: "puzzle", item_id: puzzleId,
      interval_days: next.intervalDays, reps: next.reps, ease: next.ease ?? DEFAULT_EASE,
      due_at: new Date(next.dueAt).toISOString(), last_outcome: outcome, updated_at: new Date(now).toISOString(),
    }, { onConflict: "user_id,item_kind,item_id" });
  } catch { /* training analytics are best-effort; never block gameplay */ }
}
