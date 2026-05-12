import { createClient } from "@supabase/supabase-js";
import "server-only";

let _client: ReturnType<typeof createClient> | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — used only for trusted
 * server-side operations (signed URLs, RLS-skipping queries).
 *
 * NEVER import from client components. `server-only` enforces this at build.
 *
 * Env vars are checked at call time (not module load time) so the build does
 * not fail when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent
 * in the local SQLite / demo environment.
 */
export function getServiceClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    _client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
