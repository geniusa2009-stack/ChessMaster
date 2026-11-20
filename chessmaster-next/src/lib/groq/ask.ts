import { serverEnv, AI_MODEL } from "@/lib/env";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 12000;

export interface GroqResult { ok: boolean; text: string; error?: string }

// Server-only Groq caller. The key lives in GROQ_API_KEY and never reaches the client.
export async function askGroq(prompt: string, system?: string): Promise<GroqResult> {
  const { groq } = serverEnv();
  if (!groq) return { ok: false, text: "", error: "AI not configured" };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${groq}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.85,
        max_tokens: 200,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      // Do NOT leak upstream body/status details to the client caller.
      console.error("[groq] upstream error", res.status);
      return { ok: false, text: "", error: "AI upstream error" };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return { ok: true, text };
  } catch (e) {
    console.error("[groq] request failed", (e as Error).name);
    return { ok: false, text: "", error: "AI unavailable" };
  } finally {
    clearTimeout(t);
  }
}
