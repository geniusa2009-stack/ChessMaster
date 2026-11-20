import "server-only";
// R7.3.2 signed attempt token. Binds the exact server-ISSUED item ids to one authenticated attempt so
// the submit route can verify the learner answered the items the server chose (not arbitrary bank
// entries) and can detect replays. The token is an HMAC-SHA256 over a compact JSON payload — it carries
// the attempt id, user id, issued item ids, and timestamps, and NEVER any answer key or accepted move.
// The signing key is derived from the server-only SUPABASE_SERVICE_ROLE_KEY (no new secret to manage);
// it never reaches the client. sign/verify take the key explicitly so they are unit-testable.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

export interface AttemptPayload {
  aid: string;      // attempt id (uuid)
  uid: string;      // authenticated user id
  items: string[];  // issued item ids (no answers)
  iat: number;      // issued-at (epoch ms)
  exp: number;      // expiry (epoch ms)
}

const b64url = (b: Buffer) => b.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

// Derive a dedicated signing key from the service-role secret (domain-separated). Server-only.
export function attemptSigningKey(): Buffer {
  const { service } = serverEnv();
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for attempt token signing");
  return createHmac("sha256", "chessmaster-foundation-attempt-v1").update(service).digest();
}

export function signAttempt(payload: AttemptPayload, key: Buffer): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

// Returns the payload if the signature is valid and the token is unexpired, else null. Constant-time
// signature comparison; never throws on malformed input.
export function verifyAttempt(token: string, key: Buffer, nowMs: number = Date.now()): AttemptPayload | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  let given: Buffer;
  try { given = fromB64url(sig); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: AttemptPayload;
  try { payload = JSON.parse(fromB64url(body).toString("utf8")); } catch { return null; }
  if (!payload || typeof payload.aid !== "string" || typeof payload.uid !== "string" || !Array.isArray(payload.items)) return null;
  if (typeof payload.exp !== "number" || nowMs > payload.exp) return null;
  return payload;
}

export function newAttemptId(): string { return randomUUID(); }

// R7.3.2.2 production-shared submission AUTHORIZATION boundary. The /api/foundations/attempt route
// calls this to decide whether a submission may be graded+persisted; route-level security tests call
// the SAME function (not just verifyAttempt) so the cross-user / expiry / tamper / un-issued-item
// rejections are verified at the real boundary. On rejection NOTHING is graded or written.
export type Authz =
  | { ok: false; status: 403 | 422; error: string }
  | { ok: true; attemptId: string; issuedItems: string[]; answers: Array<{ id: string }> };

export function authorizeSubmission(args: {
  token: string; authedUserId: string; answers: Array<{ id: string }>; key: Buffer; nowMs?: number;
}): Authz {
  const payload = verifyAttempt(args.token, args.key, args.nowMs);
  if (!payload) return { ok: false, status: 422, error: "Invalid or expired attempt" };
  if (payload.uid !== args.authedUserId) return { ok: false, status: 403, error: "Attempt does not belong to this user" };
  const issued = new Set(payload.items);
  if (args.answers.some((a) => !issued.has(a.id))) {
    return { ok: false, status: 422, error: "Answer references an item not issued for this attempt" };
  }
  return { ok: true, attemptId: payload.aid, issuedItems: payload.items, answers: args.answers.filter((a) => issued.has(a.id)) };
}
