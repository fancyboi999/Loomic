import {
  type ViewerResponse,
  viewerResponseSchema,
} from "@loomic/shared";

import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type { AuthenticatedUser } from "../../supabase/user.js";

const BOOTSTRAP_FAILED_MESSAGE = "Unable to prepare viewer workspace.";

export type ViewerService = {
  ensureViewer(user: AuthenticatedUser): Promise<ViewerResponse>;
};

export class BootstrapError extends Error {
  readonly code = "bootstrap_failed";
  readonly statusCode = 500;

  constructor() {
    super(BOOTSTRAP_FAILED_MESSAGE);
  }
}

export function createViewerService(options: {
  getAdminClient: () => AdminSupabaseClient;
}): ViewerService {
  return {
    async ensureViewer(user) {
      const admin = options.getAdminClient();
      const profileSeed = buildProfileSeed(user);

      const { error: upsertProfileError } = await admin.from("profiles").upsert(
        {
          avatar_url: profileSeed.avatarUrl,
          display_name: profileSeed.displayName,
          email: user.email,
          id: user.id,
        },
        {
          onConflict: "id",
        },
      );

      if (upsertProfileError) {
        throw new BootstrapError();
      }

      const workspace = await ensurePersonalWorkspace(admin, user, profileSeed);
      await ensureWorkspaceMembership(admin, workspace.id, user.id);

      const [profile, membership] = await Promise.all([
        loadProfile(admin, user, profileSeed),
        loadMembership(admin, workspace.id, user.id),
      ]);

      return viewerResponseSchema.parse({
        membership,
        profile,
        workspace,
      });
    },
  };
}

async function ensurePersonalWorkspace(
  admin: AdminSupabaseClient,
  user: AuthenticatedUser,
  profileSeed: {
    avatarUrl: string | null;
    displayName: string;
  },
) {
  const existingWorkspace = await loadPersonalWorkspace(admin, user.id);
  if (existingWorkspace) {
    return existingWorkspace;
  }

  const workspaceName = `${profileSeed.displayName} Workspace`;
  const { data, error } = await admin
    .from("workspaces")
    .insert({
      name: workspaceName,
      owner_user_id: user.id,
      type: "personal",
    })
    .select("id, name, type, owner_user_id")
    .single();

  if (error && !isUniqueViolation(error)) {
    throw new BootstrapError();
  }

  if (data) {
    return {
      id: data.id,
      name: data.name,
      ownerUserId: data.owner_user_id,
      type: data.type,
    } as const;
  }

  const workspace = await loadPersonalWorkspace(admin, user.id);
  if (!workspace) {
    throw new BootstrapError();
  }

  return workspace;
}

async function loadPersonalWorkspace(
  admin: AdminSupabaseClient,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspaces")
    .select("id, name, type, owner_user_id")
    .eq("owner_user_id", userId)
    .eq("type", "personal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new BootstrapError();
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    ownerUserId: data.owner_user_id,
    type: data.type,
  } as const;
}

async function ensureWorkspaceMembership(
  admin: AdminSupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { error } = await admin.from("workspace_members").upsert(
    {
      role: "owner",
      user_id: userId,
      workspace_id: workspaceId,
    },
    {
      onConflict: "workspace_id,user_id",
    },
  );

  if (error) {
    throw new BootstrapError();
  }
}

async function loadProfile(
  admin: AdminSupabaseClient,
  user: AuthenticatedUser,
  profileSeed: {
    avatarUrl: string | null;
    displayName: string;
  },
) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new BootstrapError();
  }

  return {
    avatarUrl: data.avatar_url ?? profileSeed.avatarUrl,
    displayName: data.display_name ?? profileSeed.displayName,
    email: data.email ?? user.email,
    id: data.id,
  } as const;
}

async function loadMembership(
  admin: AdminSupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new BootstrapError();
  }

  return {
    role: data.role,
    userId: data.user_id,
    workspaceId: data.workspace_id,
  } as const;
}

function buildProfileSeed(user: AuthenticatedUser) {
  const displayName = normalizeOptionalString(
    user.userMetadata.display_name,
    user.userMetadata.full_name,
    user.userMetadata.name,
    user.email.split("@")[0],
  );

  return {
    avatarUrl: normalizeOptionalString(user.userMetadata.avatar_url) ?? null,
    displayName: displayName ?? "Personal",
  };
}

function normalizeOptionalString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function isUniqueViolation(error: { code?: string }) {
  return error.code === "23505";
}
