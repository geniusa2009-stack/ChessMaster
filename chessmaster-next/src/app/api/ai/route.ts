import { NextResponse } from "next/server";
import { aiRequestSchema } from "@/lib/validation/schemas";
import { askGroq } from "@/lib/groq/ask";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

// A friendly, non-secret fallback so gameplay never breaks if AI is down.
const FALLBACKS = [
  "Play with purpose, champion. Control the center.",
  "Every master was once a beginner. Keep going.",
  "Think before you move — your king will thank you.",
];

export async function POST(req: Request) {
  // Auth required: only signed-in users can spend our AI budget.
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit per user + IP.
  const rl = rateLimit(`ai:${profile.id}:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });

  // Payload size guard + schema validation.
  const raw = await req.text();
  if (raw.length > 8000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const r = await askGroq(parsed.data.prompt, parsed.data.system);
  if (!r.ok) {
    return NextResponse.json({ text: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)], fallback: true });
  }
  return NextResponse.json({ text: r.text, fallback: false });
}
