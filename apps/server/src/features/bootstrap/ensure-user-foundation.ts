import {
  type Json,
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

      const { error: rpcError } = await admin.rpc("bootstrap_viewer", {
        p_user_id: user.id,
        p_email: user.email,
        p_user_meta: user.userMetadata as Json,
      });

      if (rpcError) {
        throw new BootstrapError();
      }

      const workspace = await loadPersonalWorkspace(admin, user.id);

      if (!workspace) {
        throw new BootstrapError();
      }

      const [profile, membership] = await Promise.all([
        loadProfile(admin, user.id),
        loadMembership(admin, workspace.id, user.id),
      ]);

      if (!profile || !membership) {
        throw new BootstrapError();
      }

      return viewerResponseSchema.parse({
        membership,
        profile,
        workspace,
      });
    },
  };
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

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    ownerUserId: data.owner_user_id,
    type: data.type,
  } as const;
}

async function loadProfile(admin: AdminSupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    avatarUrl: data.avatar_url ?? null,
    displayName: data.display_name ?? "Personal",
    email: data.email ?? "",
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

  if (error || !data) {
    return null;
  }

  return {
    role: data.role,
    userId: data.user_id,
    workspaceId: data.workspace_id,
  } as const;
}
