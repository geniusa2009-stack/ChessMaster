import "server-only"; // build fails if this is ever imported into a client bundle
import { createClient as createSbClient } from "@supabase/supabase-js";
import { serverEnv, requireServer } from "@/lib/env";

// Service-role client: BYPASSES RLS. Use ONLY inside server handlers AFTER
// server-side authorization. Never import from a client component.
export function createAdminClient() {
  const { url, service } = serverEnv();
  const env = requireServer({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service });
  return createSbClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
