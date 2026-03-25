import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import { importJWK, jwtVerify } from "jose";

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

// --- In-memory auth cache (keyed by token, TTL 5 min) ---

const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedAuth = { user: AuthenticatedUser; expiresAt: number };
const authCache = new Map<string, CachedAuth>();

function getCachedAuth(token: string): AuthenticatedUser | null {
  const entry = authCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(token);
    return null;
  }
  return entry.user;
}

function setCachedAuth(token: string, user: AuthenticatedUser): void {
  authCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });

  // Lazy eviction: remove expired entries when cache grows large
  if (authCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of authCache) {
      if (now > val.expiresAt) authCache.delete(key);
    }
  }
}

// --- Authenticator factory ---

// Parse JWK JSON string into a CryptoKey at startup (async init)
let jwtPublicKeyPromise: Promise<Awaited<ReturnType<typeof importJWK>> | Uint8Array> | null = null;

function initJwtKey(
  env: Pick<ServerEnv, "supabaseJwtSecret">,
): Promise<Awaited<ReturnType<typeof importJWK>> | Uint8Array> | null {
  if (!env.supabaseJwtSecret) return null;

  try {
    const jwk = JSON.parse(env.supabaseJwtSecret);
    return importJWK(jwk, jwk.alg ?? "ES256");
  } catch {
    // Not a JWK JSON — treat as HMAC symmetric secret
    return Promise.resolve(new TextEncoder().encode(env.supabaseJwtSecret));
  }
}

export function createSupabaseRequestAuthenticator(
  env: Pick<ServerEnv, "supabaseAnonKey" | "supabaseJwtSecret" | "supabaseUrl">,
): RequestAuthenticator {
  jwtPublicKeyPromise = initJwtKey(env);

  // Fallback: remote verification when JWT key is not configured
  const createUserClient = jwtPublicKeyPromise
    ? null
    : createUserSupabaseClientFactory(env);

  return {
    async authenticate(request) {
      const accessToken = readBearerToken(request.headers.authorization);
      if (!accessToken) return null;

      // 1. Check cache first
      const cached = getCachedAuth(accessToken);
      if (cached) return cached;

      // 2. Local JWT verification (preferred)
      if (jwtPublicKeyPromise) {
        try {
          const key = await jwtPublicKeyPromise;
          const { payload } = await jwtVerify(accessToken, key, {
            audience: "authenticated",
          });

          const userId = payload.sub;
          const email =
            typeof payload.email === "string" ? payload.email : null;

          if (!userId || !email) return null;

          const user: AuthenticatedUser = {
            accessToken,
            email,
            id: userId,
            userMetadata: isRecord(payload.user_metadata)
              ? (payload.user_metadata as Record<string, unknown>)
              : {},
          };

          setCachedAuth(accessToken, user);
          return user;
        } catch {
          // Invalid / expired token
          return null;
        }
      }

      // 3. Fallback: remote auth.getUser()
      if (createUserClient) {
        const client = createUserClient(accessToken);
        const { data, error } = await client.auth.getUser();

        if (error || !data.user || !data.user.email) return null;

        const user: AuthenticatedUser = {
          accessToken,
          email: data.user.email,
          id: data.user.id,
          userMetadata: isRecord(data.user.user_metadata)
            ? data.user.user_metadata
            : {},
        };

        setCachedAuth(accessToken, user);
        return user;
      }

      return null;
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
