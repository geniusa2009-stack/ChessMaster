import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";
import { FOUNDATION_ASSESSMENT, COMPETENCIES, ISSUED_CONTEXTS_PER_COMPETENCY } from "@/features/campaign/lib/foundations";
import { selectAttemptItems } from "@/features/campaign/lib/foundations.select";
import { signAttempt, attemptSigningKey, newAttemptId } from "@/features/campaign/lib/foundations.token.server";

export const runtime = "nodejs";

// R7.3.2: issue a server-SELECTED, server-SIGNED assessment attempt. For every mandatory competency we
// pick 2 distinct contexts, preferring contexts NOT used in the learner's most recently completed
// attempt, so consecutive attempts rotate. Selection uses a cryptographically secure RNG (node:crypto).
// The response carries only client-safe prompts (no answers) plus a signed token that binds the issued
// item ids to this attempt; the submit route verifies that token.
const CONTEXTS_PER_COMPETENCY = ISSUED_CONTEXTS_PER_COMPETENCY; // single source of truth (foundations.ts)
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes to complete the attempt

export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`fastart:${profile.id}:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const admin = createAdminClient();
  // de-prioritise the items seen in the most recently recorded attempt (rotation)
  const { data: last } = await admin.from("foundation_attempt")
    .select("items").eq("user_id", profile.id).eq("assessment_id", "CH01")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const exclude = new Set<string>(
    Array.isArray(last?.items) ? (last!.items as Array<{ id?: string }>).map((i) => i?.id).filter(Boolean) as string[] : [],
  );

  // cryptographically secure RNG in [0,1) for the server selection path (node:crypto, not a PRNG)
  const secureRng = () => randomInt(0, 0x7fffffff) / 0x7fffffff;
  const selection = selectAttemptItems({ perCompetency: CONTEXTS_PER_COMPETENCY, exclude, rng: secureRng });

  // Should never happen while every mandatory competency has >= 2 contexts (enforced by the audit),
  // but fail loudly rather than issue an under-covered attempt.
  if (selection.shortfalls.length > 0) {
    return NextResponse.json({ error: "Insufficient assessment content", shortfalls: selection.shortfalls }, { status: 503 });
  }

  const issued = new Set(selection.itemIds);
  const items = FOUNDATION_ASSESSMENT.filter((p) => issued.has(p.id)).map((p) => ({
    id: p.id, competency: p.competency, contextKey: p.contextKey, type: p.type,
    fen: p.fen ?? null, square: p.square ?? null, promptAr: p.promptAr, options: p.options,
    objectiveKind: p.objectiveKind ?? null, target: p.target ?? null,
  })); // client-safe: prompts only, NO answers / accepted moves

  const now = Date.now();
  const token = signAttempt(
    { aid: newAttemptId(), uid: profile.id, items: selection.itemIds, iat: now, exp: now + TOKEN_TTL_MS },
    attemptSigningKey(),
  );

  return NextResponse.json({
    token,
    items,
    selectedCount: selection.itemIds.length,
    poolSize: FOUNDATION_ASSESSMENT.length,
    mandatoryCompetencies: COMPETENCIES.filter((c) => c.mandatory).length,
    contextsPerCompetency: CONTEXTS_PER_COMPETENCY,
  });
}
