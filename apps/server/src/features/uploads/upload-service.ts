import type { AssetBucket, AssetObject } from "@loomic/shared";

import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";

/** Buckets configured as public in Supabase — use getPublicUrl instead of signed URLs */
const PUBLIC_BUCKETS = new Set(["project-assets"]);

export class UploadServiceError extends Error {
  readonly statusCode: number;
  readonly code: "upload_failed" | "asset_not_found";

  constructor(
    code: "upload_failed" | "asset_not_found",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type UploadFileInput = {
  bucket: AssetBucket;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  workspaceId: string;
  projectId?: string | undefined;
};

export type UploadService = {
  uploadFile(
    user: AuthenticatedUser,
    input: UploadFileInput,
  ): Promise<{ asset: AssetObject; url: string }>;

  getAssetUrl(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<string>;

  deleteAsset(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<void>;
};

const SIGNED_URL_EXPIRY_SECONDS = 3600;

export function createUploadService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): UploadService {
  return {
    async uploadFile(user, input) {
      const client = options.createUserClient(user.accessToken);

      const objectPath = buildObjectPath(
        input.workspaceId,
        input.projectId,
        input.fileName,
      );

      const { error: storageError } = await client.storage
        .from(input.bucket)
        .upload(objectPath, input.fileBuffer, {
          contentType: input.mimeType,
          upsert: false,
        });

      if (storageError) {
        throw new UploadServiceError(
          "upload_failed",
          `Storage upload failed: ${storageError.message}`,
          500,
        );
      }

      const { data: assetRow, error: insertError } = await client
        .from("asset_objects")
        .insert({
          workspace_id: input.workspaceId,
          bucket: input.bucket,
          object_path: objectPath,
          mime_type: input.mimeType,
          byte_size: input.fileBuffer.length,
          created_by: user.id,
          ...(input.projectId ? { project_id: input.projectId } : {}),
        })
        .select("id, bucket, object_path, mime_type, byte_size, workspace_id, project_id, created_at")
        .single();

      if (insertError || !assetRow) {
        // Clean up the uploaded file on DB insert failure
        await client.storage.from(input.bucket).remove([objectPath]);
        throw new UploadServiceError(
          "upload_failed",
          "Failed to record asset metadata.",
          500,
        );
      }

      const url = await getAssetUrl(client, input.bucket, objectPath);

      return {
        asset: {
          id: assetRow.id,
          bucket: assetRow.bucket as AssetBucket,
          objectPath: assetRow.object_path,
          mimeType: assetRow.mime_type,
          byteSize: assetRow.byte_size,
          workspaceId: assetRow.workspace_id,
          projectId: assetRow.project_id,
          createdAt: assetRow.created_at,
        },
        url,
      };
    },

    async getAssetUrl(user, assetId) {
      const client = options.createUserClient(user.accessToken);

      const { data: assetRow, error } = await client
        .from("asset_objects")
        .select("bucket, object_path")
        .eq("id", assetId)
        .single();

      if (error || !assetRow) {
        throw new UploadServiceError(
          "asset_not_found",
          "Asset not found.",
          404,
        );
      }

      return getAssetUrl(client, assetRow.bucket, assetRow.object_path);
    },

    async deleteAsset(user, assetId) {
      const client = options.createUserClient(user.accessToken);

      const { data: assetRow, error: fetchError } = await client
        .from("asset_objects")
        .select("bucket, object_path")
        .eq("id", assetId)
        .single();

      if (fetchError || !assetRow) {
        throw new UploadServiceError(
          "asset_not_found",
          "Asset not found.",
          404,
        );
      }

      await client.storage
        .from(assetRow.bucket)
        .remove([assetRow.object_path]);

      const { error: deleteError } = await client
        .from("asset_objects")
        .delete()
        .eq("id", assetId);

      if (deleteError) {
        throw new UploadServiceError(
          "upload_failed",
          "Failed to delete asset record.",
          500,
        );
      }
    },
  };
}

function buildObjectPath(
  workspaceId: string,
  projectId: string | undefined,
  fileName: string,
): string {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (projectId) {
    return `${workspaceId}/${projectId}/${timestamp}-${safeName}`;
  }
  return `${workspaceId}/${timestamp}-${safeName}`;
}

async function getAssetUrl(
  client: UserSupabaseClient,
  bucket: string,
  objectPath: string,
): Promise<string> {
  if (PUBLIC_BUCKETS.has(bucket)) {
    const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl;
  }
  // Fallback for private buckets (e.g. user-avatars)
  return createSignedUrl(client, bucket, objectPath);
}

async function createSignedUrl(
  client: UserSupabaseClient,
  bucket: string,
  objectPath: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw new UploadServiceError(
      "upload_failed",
      "Failed to generate signed URL.",
      500,
    );
  }

  return data.signedUrl;
}
