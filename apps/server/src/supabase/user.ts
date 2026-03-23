import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";

import type { Database } from "@loomic/shared";

import type { ServerEnv } from "../config/env.js";

export type UserSupabaseClient = SupabaseClient<Database>;

export type AuthenticatedUser = {
  accessToken: string;
  email: string;
  id: string;
  userMetadata: Record<string, unknown>;
};

export type RequestAuthenticator = {
  authenticate(
    request: Pick<FastifyRequest, "headers">,
  ): Promise<AuthenticatedUser | null>;
};

export function createSupabaseRequestAuthenticator(
  env: Pick<ServerEnv, "supabaseAnonKey" | "supabaseUrl">,
): RequestAuthenticator {
  const createUserClient = createUserSupabaseClientFactory(env);

  return {
    async authenticate(request) {
      const accessToken = readBearerToken(request.headers.authorization);

      if (!accessToken) {
        return null;
      }

      const client = createUserClient(accessToken);
      const { data, error } = await client.auth.getUser();

      if (error || !data.user || !data.user.email) {
        return null;
      }

      return {
        accessToken,
        email: data.user.email,
        id: data.user.id,
        userMetadata: isRecord(data.user.user_metadata)
          ? data.user.user_metadata
          : {},
      };
    },
  };
}

export function createUserSupabaseClientFactory(
  env: Pick<ServerEnv, "supabaseAnonKey" | "supabaseUrl">,
) {
  return (accessToken: string): UserSupabaseClient => {
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_ANON_KEY are required for user-scoped Supabase access.",
      );
    }

    return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  };
}

function readBearerToken(
  authorizationHeader: string | string[] | undefined,
): string | null {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
