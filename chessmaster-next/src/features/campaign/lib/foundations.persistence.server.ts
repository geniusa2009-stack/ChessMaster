import "server-only";
// R7.3.2.2 shared, testable PRODUCTION persistence boundary for a CH01 attempt. The idempotency,
// read-back, pass-latch, and score-preservation DECISIONS live here (one source of truth) so the real
// /api/foundations/attempt route AND the real-PostgreSQL integration harness exercise the SAME logic.
// The database is reached only through the narrow `AttemptRepo` interface, so this module holds no
// privileged DB access of its own and never ships answers to the client.
import { lessonForCompetency } from "@/features/campaign/lib/foundations";
import type { Grade } from "@/features/campaign/lib/foundations.answers.server";

export interface StoredAttemptRow {
  passed: boolean; score: number; total: number;
  competencies: Array<{ competency: string; status: string; contextsDemonstrated?: number; minContexts?: number }>;
  items: Array<{ id: string; competency: string; contextKey: string; correct: boolean }>;
}
// Narrow repository the production route and the test harness both implement.
export interface AttemptRepo {
  getAttempt(userId: string, attemptId: string): Promise<StoredAttemptRow | null>;
  // INSERT ... ON CONFLICT (user_id, attempt_id) DO NOTHING — append-only, idempotent at the DB.
  insertAttemptIfAbsent(row: { userId: string; attemptId: string } & StoredAttemptRow): Promise<void>;
  getAssessment(userId: string): Promise<{ passed: boolean; score: number } | null>;
  // ATOMICALLY latch the pass (R7.3.2.2.1): passed := existing.passed OR true; score := GREATEST(existing,
  // incoming). Implementations MUST perform the max at the DATABASE (single statement / RPC), never a
  // read-then-write in app memory, so concurrent passes cannot lose the higher score. `score` here is
  // the RAW attempt score — the repo, not the caller, computes the maximum.
  upsertAssessmentPass(userId: string, score: number, total: number): Promise<void>;
}

export interface AttemptResult {
  passed: boolean; score: number; total: number;
  perItem: Array<{ id: string; competency: string; contextKey: string; correct: boolean; answered: boolean }>;
  perCompetency: Array<{ competency: string; status: string; mandatory: boolean; lessonId: string | null; minContexts: number; contextsDemonstrated: number }>;
  remediation: Array<{ competency: string; lessonId: string | null }>;
  idempotentReplay: boolean;
}

// Rebuild the public result from a stored row (used for an idempotent replay AND the post-insert
// canonical read-back, so concurrent writers always agree on the stored outcome).
export function summarizeStored(row: StoredAttemptRow, replay: boolean): AttemptResult {
  const perCompetency = (row.competencies ?? []).map((c) => ({
    competency: c.competency, status: c.status, mandatory: true, lessonId: lessonForCompetency(c.competency),
    minContexts: c.minContexts ?? 2, contextsDemonstrated: c.contextsDemonstrated ?? 0,
  }));
  const remediation = perCompetency.filter((c) => c.status !== "demonstrated").map((c) => ({ competency: c.competency, lessonId: c.lessonId }));
  return {
    passed: row.passed, score: row.score, total: row.total,
    perItem: (row.items ?? []).map((i) => ({ id: i.id, competency: i.competency, contextKey: i.contextKey, correct: i.correct, answered: true })),
    perCompetency, remediation, idempotentReplay: replay,
  };
}

function rowFromGrade(userId: string, attemptId: string, grade: Grade): { userId: string; attemptId: string } & StoredAttemptRow {
  return {
    userId, attemptId, passed: grade.passed, score: grade.score, total: grade.total,
    competencies: grade.perCompetency.map((c) => ({ competency: c.competency, status: c.status, contextsDemonstrated: c.contextsDemonstrated, minContexts: c.minContexts })),
    items: grade.perItem.map((i) => ({ id: i.id, competency: i.competency, contextKey: i.contextKey, correct: i.correct })),
  };
}

// THE production persistence decision. Idempotent on (userId, attemptId); replay returns the stored
// result unchanged; a passing grade (or an existing pass) latches passed=true with score=max — a later
// failing/incomplete attempt can never set passed=false. `replayStatus` is decided from the DATABASE,
// never from the client.
export async function persistAttempt(repo: AttemptRepo, args: { userId: string; attemptId: string; grade: Grade }): Promise<AttemptResult> {
  const { userId, attemptId, grade } = args;

  // Replay: a prior row for this attempt is authoritative and is returned unchanged.
  const prior = await repo.getAttempt(userId, attemptId);
  if (prior) return summarizeStored(prior, true);

  // Append-only, idempotent insert (DB enforces single row per (userId, attemptId)).
  await repo.insertAttemptIfAbsent(rowFromGrade(userId, attemptId, grade));

  // Monotonic pass latch: write only when a pass is earned now OR already exists. The repo performs an
  // ATOMIC `score := GREATEST(existing, incoming)` + `passed := existing OR true` at the DB, so we pass
  // the RAW attempt score — no app-memory max (which would race under concurrency). Reading `existing`
  // here only decides WHETHER to latch (so a failing retry after a pass still re-affirms passed=true
  // without creating a row for a first-time failer).
  const existing = await repo.getAssessment(userId);
  if (grade.passed || existing?.passed) {
    await repo.upsertAssessmentPass(userId, grade.score, grade.total);
  }

  // Canonical read-back: if a concurrent request won the insert race, both callers agree on its row.
  const stored = await repo.getAttempt(userId, attemptId);
  return stored ? summarizeStored(stored, false) : summarizeStored(rowFromGrade(userId, attemptId, grade), false);
}
