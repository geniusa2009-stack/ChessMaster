// Centralized env access. Server-only secrets are read lazily and never bundled
// into client code; their absence fails at request time, not build time.
export const AI_MODEL = process.env.AI_MODEL || "openai/gpt-oss-20b";

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

export function serverEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    groq: process.env.GROQ_API_KEY,
  };
}

export function requireServer<T extends Record<string, string | undefined>>(vals: T): { [K in keyof T]: string } {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vals)) {
    if (!v) throw new Error(`Missing required server env: ${k}`);
    out[k] = v;
  }
  return out as { [K in keyof T]: string };
}
