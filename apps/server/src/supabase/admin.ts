import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@loomic/shared";

import type { ServerEnv } from "../config/env.js";

export type AdminSupabaseClient = SupabaseClient<Database>;

export function createAdminSupabaseClient(
  env: Pick<ServerEnv, "supabaseServiceRoleKey" | "supabaseUrl">,
): AdminSupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase admin access.",
    );
  }

  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
