import type {
  BrandKitAssetCreateRequest,
  BrandKitAssetUpdateRequest,
  BrandKitCreateRequest,
  BrandKitDetail,
  BrandKitAsset,
  BrandKitSummary,
  BrandKitUpdateRequest,
} from "@loomic/shared";

import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";

const BRAND_KIT_BUCKET = "brand-kit-assets";
const SIGNED_URL_EXPIRY_SECONDS = 3600;

const KIT_NOT_FOUND_MESSAGE = "Brand kit not found.";
const KIT_CREATE_FAILED_MESSAGE = "Unable to create brand kit.";
const KIT_UPDATE_FAILED_MESSAGE = "Unable to update brand kit.";
const KIT_DELETE_FAILED_MESSAGE = "Unable to delete brand kit.";
const KIT_QUERY_FAILED_MESSAGE = "Unable to load brand kits.";
const ASSET_NOT_FOUND_MESSAGE = "Brand kit asset not found.";
const ASSET_CREATE_FAILED_MESSAGE = "Unable to create brand kit asset.";

type BrandKitServiceErrorCode =
  | "brand_kit_not_found"
  | "brand_kit_create_failed"
  | "brand_kit_update_failed"
  | "brand_kit_delete_failed"
  | "brand_kit_query_failed"
  | "brand_kit_asset_not_found"
  | "brand_kit_asset_create_failed";

export class BrandKitServiceError extends Error {
  readonly statusCode: number;
  readonly code: BrandKitServiceErrorCode;

  constructor(
    code: BrandKitServiceErrorCode,
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type BrandKitService = {
  listKits(user: AuthenticatedUser): Promise<BrandKitSummary[]>;
  getKit(user: AuthenticatedUser, kitId: string): Promise<BrandKitDetail>;
  createKit(
    user: AuthenticatedUser,
    input: BrandKitCreateRequest,
  ): Promise<BrandKitDetail>;
  updateKit(
    user: AuthenticatedUser,
    kitId: string,
    input: BrandKitUpdateRequest,
  ): Promise<BrandKitDetail>;
  deleteKit(user: AuthenticatedUser, kitId: string): Promise<void>;
  createAsset(
    user: AuthenticatedUser,
    kitId: string,
    input: BrandKitAssetCreateRequest,
  ): Promise<BrandKitAsset>;
  updateAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetId: string,
    input: BrandKitAssetUpdateRequest,
  ): Promise<BrandKitAsset>;
  deleteAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetId: string,
  ): Promise<void>;
  uploadAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetType: "logo" | "image",
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<BrandKitAsset>;
  duplicateKit(
    user: AuthenticatedUser,
    kitId: string,
  ): Promise<BrandKitDetail>;
};

export function createBrandKitService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): BrandKitService {
  async function fetchKitDetail(
    client: UserSupabaseClient,
    kitId: string,
  ): Promise<BrandKitDetail> {
    const { data: kit, error: kitError } = await client
      .from("brand_kits")
      .select("id, name, is_default, guidance_text, cover_url, created_at, updated_at")
      .eq("id", kitId)
      .maybeSingle();

    if (kitError) {
      throw new BrandKitServiceError(
        "brand_kit_not_found",
        KIT_NOT_FOUND_MESSAGE,
        500,
      );
    }

    if (!kit) {
      throw new BrandKitServiceError(
        "brand_kit_not_found",
        KIT_NOT_FOUND_MESSAGE,
        404,
      );
    }

    const { data: assets, error: assetsError } = await client
      .from("brand_kit_assets")
      .select(
        "id, asset_type, display_name, role, sort_order, text_content, file_url, metadata, created_at, updated_at",
      )
      .eq("kit_id", kitId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (assetsError) {
      throw new BrandKitServiceError(
        "brand_kit_query_failed",
        KIT_QUERY_FAILED_MESSAGE,
        500,
      );
    }

    const mappedAssets = (assets ?? []).map(mapAssetRow);

    // Resolve signed URLs for file-based assets (logo/image)
    const fileAssets = mappedAssets.filter((a) => a.file_url);
    if (fileAssets.length > 0) {
      const paths = fileAssets.map((a) => a.file_url!);
      const { data: signedData } = await client.storage
        .from(BRAND_KIT_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

      if (signedData) {
        const urlByPath = new Map(
          signedData
            .filter((e) => e.signedUrl && e.path)
            .map((e) => [e.path, e.signedUrl]),
        );
        for (const asset of fileAssets) {
          const url = urlByPath.get(asset.file_url!);
          if (url) asset.file_url = url;
        }
      }
    }

    return {
      id: kit.id,
      name: kit.name,
      is_default: kit.is_default,
      guidance_text: kit.guidance_text,
      cover_url: kit.cover_url,
      assets: mappedAssets,
      created_at: kit.created_at,
      updated_at: kit.updated_at,
    };
  }

  return {
    async listKits(user) {
      const client = options.createUserClient(user.accessToken);

      const { data: kits, error: kitsError } = await client
        .from("brand_kits")
        .select("id, name, is_default, cover_url, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (kitsError) {
        throw new BrandKitServiceError(
          "brand_kit_query_failed",
          KIT_QUERY_FAILED_MESSAGE,
          500,
        );
      }

      if (!kits.length) {
        return [];
      }

      const { data: assets, error: assetsError } = await client
        .from("brand_kit_assets")
        .select("kit_id, asset_type")
        .in(
          "kit_id",
          kits.map((k) => k.id),
        );

      if (assetsError) {
        throw new BrandKitServiceError(
          "brand_kit_query_failed",
          KIT_QUERY_FAILED_MESSAGE,
          500,
        );
      }

      const countsByKit = new Map<
        string,
        { color: number; font: number; logo: number; image: number }
      >();

      for (const asset of assets ?? []) {
        let counts = countsByKit.get(asset.kit_id);
        if (!counts) {
          counts = { color: 0, font: 0, logo: 0, image: 0 };
          countsByKit.set(asset.kit_id, counts);
        }
        counts[asset.asset_type] += 1;
      }

      return kits.map((kit): BrandKitSummary => ({
        id: kit.id,
        name: kit.name,
        is_default: kit.is_default,
        cover_url: kit.cover_url,
        asset_counts: countsByKit.get(kit.id) ?? {
          color: 0,
          font: 0,
          logo: 0,
          image: 0,
        },
        created_at: kit.created_at,
        updated_at: kit.updated_at,
      }));
    },

    async getKit(user, kitId) {
      const client = options.createUserClient(user.accessToken);
      return fetchKitDetail(client, kitId);
    },

    async createKit(user, input) {
      const client = options.createUserClient(user.accessToken);
      const name = input.name?.trim() || "\u672A\u547D\u540D";

      const { data: kit, error } = await client
        .from("brand_kits")
        .insert({ user_id: user.id, name })
        .select("id")
        .single();

      if (error || !kit) {
        throw new BrandKitServiceError(
          "brand_kit_create_failed",
          KIT_CREATE_FAILED_MESSAGE,
          500,
        );
      }

      return fetchKitDetail(client, kit.id);
    },

    async updateKit(user, kitId, input) {
      const client = options.createUserClient(user.accessToken);

      // If setting as default, clear existing default first
      if (input.is_default === true) {
        const { error: clearError } = await client
          .from("brand_kits")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .eq("is_default", true);

        if (clearError) {
          throw new BrandKitServiceError(
            "brand_kit_update_failed",
            KIT_UPDATE_FAILED_MESSAGE,
            500,
          );
        }
      }

      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.guidance_text !== undefined) payload.guidance_text = input.guidance_text;
      if (input.is_default !== undefined) payload.is_default = input.is_default;

      if (Object.keys(payload).length === 0) {
        return fetchKitDetail(client, kitId);
      }

      const { error: updateError, count } = await client
        .from("brand_kits")
        .update(payload)
        .eq("id", kitId)
        .eq("user_id", user.id);

      if (updateError) {
        throw new BrandKitServiceError(
          "brand_kit_update_failed",
          KIT_UPDATE_FAILED_MESSAGE,
          500,
        );
      }

      if (count === 0) {
        // Supabase returns count=0 when head:true is used; since we don't use
        // head:true the count may be null. Only treat an explicit 0 as not-found.
        // In practice, the fetchKitDetail below will catch not-found scenarios.
      }

      return fetchKitDetail(client, kitId);
    },

    async deleteKit(user, kitId) {
      const client = options.createUserClient(user.accessToken);

      const { data: existing, error: findError } = await client
        .from("brand_kits")
        .select("id")
        .eq("id", kitId)
        .maybeSingle();

      if (findError) {
        throw new BrandKitServiceError(
          "brand_kit_delete_failed",
          KIT_DELETE_FAILED_MESSAGE,
          500,
        );
      }

      if (!existing) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          KIT_NOT_FOUND_MESSAGE,
          404,
        );
      }

      // Clean up storage objects for file-based assets
      const { data: fileAssets } = await client
        .from("brand_kit_assets")
        .select("file_url")
        .eq("kit_id", kitId)
        .not("file_url", "is", null);

      if (fileAssets && fileAssets.length > 0) {
        const paths = fileAssets
          .map((a) => a.file_url)
          .filter((p): p is string => !!p);
        if (paths.length > 0) {
          await client.storage.from(BRAND_KIT_BUCKET).remove(paths);
        }
      }

      const { error: deleteError } = await client
        .from("brand_kits")
        .delete()
        .eq("id", kitId);

      if (deleteError) {
        throw new BrandKitServiceError(
          "brand_kit_delete_failed",
          KIT_DELETE_FAILED_MESSAGE,
          500,
        );
      }
    },

    async createAsset(user, kitId, input) {
      const client = options.createUserClient(user.accessToken);

      // Verify kit exists
      const { data: kit, error: kitError } = await client
        .from("brand_kits")
        .select("id")
        .eq("id", kitId)
        .maybeSingle();

      if (kitError || !kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          KIT_NOT_FOUND_MESSAGE,
          kitError ? 500 : 404,
        );
      }

      // Get max sort_order for this kit + asset_type
      const { data: maxRow } = await client
        .from("brand_kit_assets")
        .select("sort_order")
        .eq("kit_id", kitId)
        .eq("asset_type", input.asset_type)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

      const { data: asset, error: insertError } = await client
        .from("brand_kit_assets")
        .insert({
          kit_id: kitId,
          asset_type: input.asset_type,
          display_name: input.display_name,
          text_content: input.text_content ?? null,
          role: input.role ?? null,
          sort_order: nextSortOrder,
        })
        .select(
          "id, asset_type, display_name, role, sort_order, text_content, file_url, metadata, created_at, updated_at",
        )
        .single();

      if (insertError || !asset) {
        throw new BrandKitServiceError(
          "brand_kit_asset_create_failed",
          ASSET_CREATE_FAILED_MESSAGE,
          500,
        );
      }

      return mapAssetRow(asset);
    },

    async updateAsset(user, kitId, assetId, input) {
      const client = options.createUserClient(user.accessToken);

      const payload: Record<string, unknown> = {};
      if (input.display_name !== undefined) payload.display_name = input.display_name;
      if (input.text_content !== undefined) payload.text_content = input.text_content;
      if (input.role !== undefined) payload.role = input.role;
      if (input.sort_order !== undefined) payload.sort_order = input.sort_order;

      if (Object.keys(payload).length === 0) {
        // Nothing to update, just fetch and return current state
        const { data: current, error } = await client
          .from("brand_kit_assets")
          .select(
            "id, asset_type, display_name, role, sort_order, text_content, file_url, metadata, created_at, updated_at",
          )
          .eq("id", assetId)
          .eq("kit_id", kitId)
          .maybeSingle();

        if (error || !current) {
          throw new BrandKitServiceError(
            "brand_kit_asset_not_found",
            ASSET_NOT_FOUND_MESSAGE,
            error ? 500 : 404,
          );
        }

        return mapAssetRow(current);
      }

      const { data: asset, error: updateError } = await client
        .from("brand_kit_assets")
        .update(payload)
        .eq("id", assetId)
        .eq("kit_id", kitId)
        .select(
          "id, asset_type, display_name, role, sort_order, text_content, file_url, metadata, created_at, updated_at",
        )
        .maybeSingle();

      if (updateError) {
        throw new BrandKitServiceError(
          "brand_kit_update_failed",
          KIT_UPDATE_FAILED_MESSAGE,
          500,
        );
      }

      if (!asset) {
        throw new BrandKitServiceError(
          "brand_kit_asset_not_found",
          ASSET_NOT_FOUND_MESSAGE,
          404,
        );
      }

      return mapAssetRow(asset);
    },

    async deleteAsset(user, kitId, assetId) {
      const client = options.createUserClient(user.accessToken);

      const { data: existing, error: findError } = await client
        .from("brand_kit_assets")
        .select("id, file_url")
        .eq("id", assetId)
        .eq("kit_id", kitId)
        .maybeSingle();

      if (findError) {
        throw new BrandKitServiceError(
          "brand_kit_delete_failed",
          KIT_DELETE_FAILED_MESSAGE,
          500,
        );
      }

      if (!existing) {
        throw new BrandKitServiceError(
          "brand_kit_asset_not_found",
          ASSET_NOT_FOUND_MESSAGE,
          404,
        );
      }

      // Clean up storage object if this asset has a file
      if (existing.file_url) {
        await client.storage.from(BRAND_KIT_BUCKET).remove([existing.file_url]);
      }

      const { error: deleteError } = await client
        .from("brand_kit_assets")
        .delete()
        .eq("id", assetId)
        .eq("kit_id", kitId);

      if (deleteError) {
        throw new BrandKitServiceError(
          "brand_kit_delete_failed",
          KIT_DELETE_FAILED_MESSAGE,
          500,
        );
      }
    },

    async uploadAsset(user, kitId, assetType, fileName, fileBuffer, mimeType) {
      const client = options.createUserClient(user.accessToken);

      // Verify kit exists and belongs to user
      const { data: kit, error: kitError } = await client
        .from("brand_kits")
        .select("id")
        .eq("id", kitId)
        .maybeSingle();

      if (kitError || !kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          KIT_NOT_FOUND_MESSAGE,
          kitError ? 500 : 404,
        );
      }

      // Upload to storage
      const timestamp = Date.now();
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectPath = `${user.id}/${kitId}/${timestamp}-${safeName}`;

      const { error: uploadError } = await client.storage
        .from(BRAND_KIT_BUCKET)
        .upload(objectPath, fileBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new BrandKitServiceError(
          "brand_kit_asset_create_failed",
          `File upload failed: ${uploadError.message}`,
          500,
        );
      }

      // Get max sort_order
      const { data: maxRow } = await client
        .from("brand_kit_assets")
        .select("sort_order")
        .eq("kit_id", kitId)
        .eq("asset_type", assetType)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

      // Create asset record — store object path in file_url
      const displayName = fileName.replace(/\.[^.]+$/, "");
      const { data: asset, error: insertError } = await client
        .from("brand_kit_assets")
        .insert({
          kit_id: kitId,
          asset_type: assetType,
          display_name: displayName,
          file_url: objectPath,
          sort_order: nextSortOrder,
        })
        .select(
          "id, asset_type, display_name, role, sort_order, text_content, file_url, metadata, created_at, updated_at",
        )
        .single();

      if (insertError || !asset) {
        // Clean up uploaded file on DB failure
        await client.storage.from(BRAND_KIT_BUCKET).remove([objectPath]);
        throw new BrandKitServiceError(
          "brand_kit_asset_create_failed",
          ASSET_CREATE_FAILED_MESSAGE,
          500,
        );
      }

      // Generate signed URL for the response
      const { data: urlData } = await client.storage
        .from(BRAND_KIT_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

      const mapped = mapAssetRow(asset);
      if (urlData?.signedUrl) {
        mapped.file_url = urlData.signedUrl;
      }
      return mapped;
    },

    async duplicateKit(user, kitId) {
      const client = options.createUserClient(user.accessToken);

      // Fetch source kit
      const { data: source, error: sourceError } = await client
        .from("brand_kits")
        .select("name, guidance_text")
        .eq("id", kitId)
        .maybeSingle();

      if (sourceError || !source) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          KIT_NOT_FOUND_MESSAGE,
          sourceError ? 500 : 404,
        );
      }

      // Create new kit (never copy is_default)
      const { data: newKit, error: createError } = await client
        .from("brand_kits")
        .insert({
          user_id: user.id,
          name: `${source.name} (副本)`,
          guidance_text: source.guidance_text,
        })
        .select("id")
        .single();

      if (createError || !newKit) {
        throw new BrandKitServiceError(
          "brand_kit_create_failed",
          KIT_CREATE_FAILED_MESSAGE,
          500,
        );
      }

      // Copy non-file assets (colors, fonts) directly
      const { data: assets } = await client
        .from("brand_kit_assets")
        .select("asset_type, display_name, role, sort_order, text_content, file_url, metadata")
        .eq("kit_id", kitId)
        .order("sort_order", { ascending: true });

      if (assets && assets.length > 0) {
        const copies = [];
        for (const asset of assets) {
          let newFileUrl: string | null = null;

          // For file-based assets, copy the storage object
          if (asset.file_url) {
            const ext = asset.file_url.split(".").pop() ?? "bin";
            const newPath = `${user.id}/${newKit.id}/${Date.now()}-copy.${ext}`;
            const { error: copyError } = await client.storage
              .from(BRAND_KIT_BUCKET)
              .copy(asset.file_url, newPath);
            if (!copyError) {
              newFileUrl = newPath;
            }
          }

          copies.push({
            kit_id: newKit.id,
            asset_type: asset.asset_type,
            display_name: asset.display_name,
            role: asset.role,
            sort_order: asset.sort_order,
            text_content: asset.text_content,
            file_url: newFileUrl,
            metadata: asset.metadata,
          });
        }

        await client.from("brand_kit_assets").insert(copies);
      }

      return fetchKitDetail(client, newKit.id);
    },
  };
}

function mapAssetRow(row: {
  id: string;
  asset_type: string;
  display_name: string;
  role: string | null;
  sort_order: number;
  text_content: string | null;
  file_url: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}): BrandKitAsset {
  return {
    id: row.id,
    asset_type: row.asset_type as BrandKitAsset["asset_type"],
    display_name: row.display_name,
    role: row.role,
    sort_order: row.sort_order,
    text_content: row.text_content,
    file_url: row.file_url,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
