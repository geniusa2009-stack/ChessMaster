import "server-only";
// R7.3.2.2 Supabase adapter for the shared AttemptRepo. Thin: it only maps the narrow repository
// interface onto the real service-role Supabase client used by /api/foundations/attempt. All the
// idempotency / latch / read-back DECISIONS live in foundations.persistence.server.ts (shared with the
// PostgreSQL integration harness). No answers are stored; writes are service-role only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptRepo, StoredAttemptRow } from "@/features/campaign/lib/foundations.persistence.server";

export function supabaseAttemptRepo(admin: SupabaseClient): AttemptRepo {
  return {
    async getAttempt(userId, attemptId) {
      const { data } = await admin.from("foundation_attempt")
        .select("passed, score, total, competencies, items")
        .eq("user_id", userId).eq("attempt_id", attemptId).maybeSingle();
      return (data as StoredAttemptRow | null) ?? null;
    },
    async insertAttemptIfAbsent(row) {
      // onConflict + ignoreDuplicates => INSERT ... ON CONFLICT (user_id, attempt_id) DO NOTHING
      await admin.from("foundation_attempt").upsert({
        user_id: row.userId, assessment_id: "CH01", attempt_id: row.attemptId,
        passed: row.passed, score: row.score, total: row.total,
        competencies: row.competencies, items: row.items,
      }, { onConflict: "user_id,attempt_id", ignoreDuplicates: true });
    },
    async getAssessment(userId) {
      const { data } = await admin.from("foundation_assessment")
        .select("passed, score").eq("user_id", userId).eq("assessment_id", "CH01").maybeSingle();
      return (data as { passed: boolean; score: number } | null) ?? null;
    },
    async upsertAssessmentPass(userId, score, total) {
      // R7.3.2.2.1: ATOMIC DB-side latch (migration 0017). GREATEST(existing, incoming) + passed OR
      // happen inside one statement, so concurrent passing attempts cannot lose the higher score.
      const { error } = await admin.rpc("foundation_latch_pass", {
        p_user: userId, p_assessment: "CH01", p_score: score, p_total: total,
      });
      if (error) throw new Error(`foundation_latch_pass failed: ${error.message}`);
    },
  };
}
