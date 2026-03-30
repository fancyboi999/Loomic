import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { tool } from "@langchain/core/tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const persistSandboxFileSchema = z.object({
  filePath: z
    .string()
    .describe(
      "Absolute path to the file in the sandbox directory (e.g., /tmp/loomic-sandbox/<runId>/output.png)",
    ),
  title: z
    .string()
    .optional()
    .describe("Optional human-readable title for the file"),
});

export type PersistSandboxFileDeps = {
  createUserClient: (accessToken: string) => SupabaseClient;
  sandboxDir?: string;
};

export function createPersistSandboxFileTool(deps: PersistSandboxFileDeps) {
  return tool(
    async (input, config) => {
      const accessToken = (config as any)?.configurable?.access_token as
        | string
        | undefined;
      const canvasId = (config as any)?.configurable?.canvas_id as
        | string
        | undefined;

      if (!accessToken) {
        return "Error: No access token available. Cannot upload file.";
      }

      // Path traversal guard: restrict reads to sandbox directory
      if (deps.sandboxDir) {
        const resolved = resolve(input.filePath);
        if (!resolved.startsWith(deps.sandboxDir)) {
          return "Error: filePath must be inside the sandbox directory.";
        }
      }

      try {
        const fileStats = await stat(input.filePath);
        if (fileStats.size > MAX_FILE_SIZE) {
          return `Error: File too large (${fileStats.size} bytes). Maximum: ${MAX_FILE_SIZE} bytes.`;
        }

        const fileBuffer = await readFile(input.filePath);
        const ext = extname(input.filePath).toLowerCase();
        const mimeType = MIME_MAP[ext] ?? "application/octet-stream";
        const safeTitle = input.title
          ? input.title.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, "_").slice(0, 100)
          : null;
        const fileName = safeTitle
          ? `${safeTitle}${ext}`
          : basename(input.filePath);

        const storagePath = canvasId
          ? `${canvasId}/generated/${Date.now()}-${fileName}`
          : `uploads/${Date.now()}-${fileName}`;

        const client = deps.createUserClient(accessToken);
        const { data, error } = await client.storage
          .from("project-assets")
          .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (error) {
          return `Error uploading file: ${error.message}`;
        }

        const signedResult = await client.storage
          .from("project-assets")
          .createSignedUrl(data.path, 3600);

        if (signedResult.error || !signedResult.data) {
          return `Error creating signed URL: ${signedResult.error?.message ?? "unknown"}`;
        }

        return JSON.stringify({
          summary: `File uploaded successfully: ${fileName}`,
          url: signedResult.data.signedUrl,
          path: data.path,
          mimeType,
          size: fileBuffer.length,
        });
      } catch (err: any) {
        return `Error reading or uploading file: ${err.message}`;
      }
    },
    {
      name: "persist_sandbox_file",
      description:
        "Upload a file generated in the sandbox (e.g., a PDF or PNG created by Python code execution) " +
        "to persistent storage. Returns a signed URL the user can access. " +
        "Use this after execute() produces an output file you want to share with the user.",
      schema: persistSandboxFileSchema,
    },
  );
}
