import { afterEach, describe, expect, it } from "vitest";

import type { AssetObject } from "@loomic/shared";

import { buildApp } from "../src/app.js";
import type { AuthenticatedUser } from "../src/supabase/user.js";
import type { UploadService } from "../src/features/uploads/upload-service.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

const STUB_ASSET: AssetObject = {
  id: "asset-1",
  bucket: "project-assets",
  objectPath: "ws-1/1234567890-test.png",
  mimeType: "image/png",
  byteSize: 1024,
  workspaceId: "ws-1",
  projectId: null,
  createdAt: "2026-03-24T00:00:00.000Z",
};

const STUB_SIGNED_URL = "https://storage.example.com/signed/test.png?token=abc";

describe("upload routes", () => {
  it("POST /api/uploads accepts a file and returns asset", async () => {
    const authUser = stubUser();
    const uploadService = createUploadServiceStub();

    const app = buildUploadApp({
      auth: createAuthStub(authUser),
      uploadService,
      viewerService: createViewerServiceStub(authUser),
    });

    const boundary = "----TestBoundary";
    const body = buildMultipartBody(boundary, {
      fieldName: "file",
      filename: "test.png",
      contentType: "image/png",
      content: Buffer.from("fake-png-data"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const result = response.json() as { asset: AssetObject; signedUrl: string };
    expect(result.asset.id).toBe("asset-1");
    expect(result.signedUrl).toBe(STUB_SIGNED_URL);
  });

  it("GET /api/uploads/:assetId/url returns signed URL", async () => {
    const authUser = stubUser();
    const uploadService = createUploadServiceStub();

    const app = buildUploadApp({
      auth: createAuthStub(authUser),
      uploadService,
      viewerService: createViewerServiceStub(authUser),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/uploads/asset-1/url",
      headers: { authorization: `Bearer ${authUser.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json() as { signedUrl: string };
    expect(result.signedUrl).toBe(STUB_SIGNED_URL);
  });

  it("DELETE /api/uploads/:assetId deletes an asset", async () => {
    const authUser = stubUser();
    const uploadService = createUploadServiceStub();

    const app = buildUploadApp({
      auth: createAuthStub(authUser),
      uploadService,
      viewerService: createViewerServiceStub(authUser),
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/uploads/asset-1",
      headers: { authorization: `Bearer ${authUser.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildUploadApp({
      auth: createAuthStub(null),
      uploadService: createUploadServiceStub(),
      viewerService: createViewerServiceStub(null),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/uploads/asset-1/url",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("rejects unsupported file types", async () => {
    const authUser = stubUser();

    const app = buildUploadApp({
      auth: createAuthStub(authUser),
      uploadService: createUploadServiceStub(),
      viewerService: createViewerServiceStub(authUser),
    });

    const boundary = "----TestBoundary";
    const body = buildMultipartBody(boundary, {
      fieldName: "file",
      filename: "test.exe",
      contentType: "application/octet-stream",
      content: Buffer.from("fake-data"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/uploads",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "upload_failed" },
    });
  });
});

function stubUser() {
  return {
    accessToken: "upload-test-token",
    email: "user@example.com",
    id: "user-1",
    userMetadata: {},
  };
}

function createUploadServiceStub(): UploadService {
  return {
    async uploadFile() {
      return { asset: STUB_ASSET, signedUrl: STUB_SIGNED_URL };
    },
    async getSignedUrl() {
      return STUB_SIGNED_URL;
    },
    async deleteAsset() {},
  };
}

function createViewerServiceStub(
  user: { id: string } | null,
) {
  return {
    async ensureViewer() {
      return {
        profile: {
          id: user?.id ?? "user-1",
          email: "user@example.com",
          displayName: "Test User",
          avatarUrl: null,
        },
        workspace: {
          id: "ws-1",
          name: "Personal",
          type: "personal" as const,
          ownerUserId: user?.id ?? "user-1",
        },
        membership: {
          workspaceId: "ws-1",
          userId: user?.id ?? "user-1",
          role: "owner" as const,
        },
      };
    },
  };
}

function buildUploadApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof buildApp>> {
  const app = buildApp({
    env: {
      port: 3001,
      version: "9.9.9-test",
      webOrigin: "http://localhost:3000",
    },
    ...overrides,
  });
  appsUnderTest.add(app);
  return app;
}

function createAuthStub(user: {
  accessToken: string;
  email: string;
  id: string;
  userMetadata: Record<string, unknown>;
} | null) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      if (!user) return null;
      if (request.headers.authorization === `Bearer ${user.accessToken}`) {
        return user;
      }
      return null;
    },
  };
}

function buildMultipartBody(
  boundary: string,
  file: {
    fieldName: string;
    filename: string;
    contentType: string;
    content: Buffer;
  },
): Buffer {
  const parts: Buffer[] = [];
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  parts.push(file.content);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(parts);
}
