import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { domainsForEvent, DOMAINS, type Domain } from "@/features/training/lib/domains";
import { computeDomainSkill, type AttemptEvent, type DomainSkill, type Difficulty } from "@/features/training/lib/skill";
import { aggregateByTheme, detectWeaknesses, type ThemeStat } from "@/features/training/lib/mistakes";
import { chessDNA, type DnaEntry } from "@/features/training/lib/dna";

export interface TrainingAggregate {
  skills: DomainSkill[];
  themeStats: ThemeStat[];
  weaknessThemes: string[];
  dna: DnaEntry[];
  dueReviewIds: number[];
  dueCount: number;
  hasHistory: boolean;
}

// One bounded read of the user's recent events + due reviews; all derivation is pure.
export async function buildTrainingAggregate(admin: SupabaseClient, userId: string, now = Date.now()): Promise<TrainingAggregate> {
  const { data: rows } = await admin
    .from("training_events").select("theme, domain, difficulty, outcome, created_at")
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(500);
  const events = rows ?? [];

  // per-domain attempt streams (a mate event feeds checkmate_patterns + calculation, weighted)
  const perDomain = new Map<Domain, AttemptEvent[]>();
  for (const d of DOMAINS) perDomain.set(d, []);
  for (const e of events) {
    for (const { domain, weight } of domainsForEvent(e.theme, (e as { domain?: string | null }).domain)) {
      perDomain.get(domain)!.push({ domain, difficulty: e.difficulty as Difficulty, success: e.outcome === "success", weight: weight });
    }
  }
  const skills = DOMAINS.map((d) => computeDomainSkill(d, perDomain.get(d)!));
  const themeStats = aggregateByTheme(events.map((e) => ({ theme: e.theme, outcome: e.outcome as "success" | "fail" })));
  const weaknessThemes = detectWeaknesses(themeStats).map((s) => s.theme);
  const dna = chessDNA(skills);

  const { data: due } = await admin
    .from("review_state").select("item_id").eq("user_id", userId).eq("item_kind", "puzzle")
    .lte("due_at", new Date(now).toISOString()).limit(200);
  const dueReviewIds = (due ?? []).map((r) => r.item_id);

  return { skills, themeStats, weaknessThemes, dna, dueReviewIds, dueCount: dueReviewIds.length, hasHistory: events.length > 0 };
}
