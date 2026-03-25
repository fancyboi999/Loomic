import type {
  BrandKitListResponse,
  BrandKitDetailResponse,
  BrandKitCreateRequest,
  BrandKitUpdateRequest,
  BrandKitAssetCreateRequest,
  BrandKitAssetUpdateRequest,
  BrandKitAssetResponse,
} from "@loomic/shared";

import { getServerBaseUrl } from "./env";
import { ApiAuthError, ApiApplicationError } from "./server-api";
import { dedupeRequest } from "./dedupe-request";

// --- Internal helpers (mirrored from server-api.ts, not exported there) ---

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthError();
  }
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

// --- Brand Kit CRUD ---

export function fetchBrandKits(
  accessToken: string,
): Promise<BrandKitListResponse> {
  return dedupeRequest("brand-kits:list", async () => {
    const response = await fetch(`${getServerBaseUrl()}/api/brand-kits`, {
      headers: authHeaders(accessToken),
    });
    if (!response.ok) return handleErrorResponse(response);
    return (await response.json()) as BrandKitListResponse;
  });
}

export async function fetchBrandKit(
  accessToken: string,
  kitId: string,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function createBrandKit(
  accessToken: string,
  data?: BrandKitCreateRequest,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/brand-kits`, {
    method: "POST",
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(data ?? {}),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function updateBrandKit(
  accessToken: string,
  kitId: string,
  data: BrandKitUpdateRequest,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function duplicateBrandKit(
  accessToken: string,
  kitId: string,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/duplicate`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function deleteBrandKit(
  accessToken: string,
  kitId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

// --- Brand Kit Asset CRUD ---

export async function createBrandKitAsset(
  accessToken: string,
  kitId: string,
  data: BrandKitAssetCreateRequest,
): Promise<BrandKitAssetResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets`,
    {
      method: "POST",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}

export async function updateBrandKitAsset(
  accessToken: string,
  kitId: string,
  assetId: string,
  data: BrandKitAssetUpdateRequest,
): Promise<BrandKitAssetResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/${assetId}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}

export async function deleteBrandKitAsset(
  accessToken: string,
  kitId: string,
  assetId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/${assetId}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

export async function uploadBrandKitAsset(
  accessToken: string,
  kitId: string,
  assetType: "logo" | "image",
  file: File,
): Promise<BrandKitAssetResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("asset_type", assetType);

  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/upload`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: formData,
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}
