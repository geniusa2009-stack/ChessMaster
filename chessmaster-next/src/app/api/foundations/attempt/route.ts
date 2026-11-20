import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { foundationAttemptSchema } from "@/lib/validation/schemas";
import { gradeFoundation } from "@/features/campaign/lib/foundations.answers.server";
import { authorizeSubmission, attemptSigningKey } from "@/features/campaign/lib/foundations.token.server";
import { persistAttempt, type AttemptRepo } from "@/features/campaign/lib/foundations.persistence.server";
import { supabaseAttemptRepo } from "@/features/campaign/lib/foundations.persistence.supabase.server";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

// Server-authoritative CH01 rules assessment (R7.3.2). The client submits the signed attempt token it
// received from /start plus its chosen answers. The server:
//   1. verifies the token (HMAC + expiry) and that it belongs to THIS authenticated user,
//   2. accepts answers ONLY for the exact item ids the token issued (no arbitrary bank entries),
//   3. grades against positions it recomputes (answers never shipped),
//   4. persists via the SHARED persistence boundary (foundations.persistence.server.ts) — append-only,
//      idempotent on (user_id, attempt_id); replay returns the stored row; the pass latch never
//      downgrades. The SAME boundary is exercised by the real-PostgreSQL integration harness.
// It returns per-item/per-competency results + remediation WITHOUT any answer key.

// R7.3.2.2.1: the real authorization + grading + persistence CONTROL FLOW lives in handleAttempt; POST
// is only the production wiring (rate limit + NextResponse formatting). Route-level security tests call
// handleAttempt with test-only auth/repo doubles injected at the infrastructure boundary — the SAME
// control flow and the SAME shared authorize/grade/persist functions execute (no second route impl).
export interface AttemptHandlerDeps {
  getProfile: () => Promise<{ id: string } | null>;
  signingKey: () => Buffer;
  makeRepo: () => AttemptRepo;
}

export async function handleAttempt(req: Request, deps: AttemptHandlerDeps): Promise<{ status: number; body: unknown }> {
  const profile = await deps.getProfile();
  if (!profile) return { status: 401, body: { error: "Unauthorized" } };

  let body: unknown;
  try { body = await req.json(); } catch { return { status: 400, body: { error: "Invalid JSON" } }; }
  const parsed = foundationAttemptSchema.safeParse(body);
  if (!parsed.success) return { status: 422, body: { error: "Invalid request" } };

  // 1+2. SHARED authorization boundary: verify the signed token, bind it to THIS authenticated user,
  //       and accept answers ONLY for the exact issued item ids. On rejection nothing is graded/written.
  const auth = authorizeSubmission({ token: parsed.data.token, authedUserId: profile.id, answers: parsed.data.answers, key: deps.signingKey() });
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  // 3. grade — restricted to the issued items (evidence can only come from this attempt's items)
  const grade = gradeFoundation(auth.answers, auth.issuedItems);

  // 4. persist through the shared production boundary (idempotent insert + monotonic pass latch +
  //    canonical read-back). Returns the authoritative result incl. the DB-decided replay flag.
  const result = await persistAttempt(deps.makeRepo(), { userId: profile.id, attemptId: auth.attemptId, grade });
  return { status: 200, body: result };
}

export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`fa:${profile.id}:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // Production wiring around the shared control flow. getProfile reuses the already-resolved session
  // identity so the authenticated user cannot change between the rate-limit check and authorization.
  const r = await handleAttempt(req, {
    getProfile: async () => profile,
    signingKey: attemptSigningKey,
    makeRepo: () => supabaseAttemptRepo(createAdminClient()),
  });
  return NextResponse.json(r.body, { status: r.status });
}
