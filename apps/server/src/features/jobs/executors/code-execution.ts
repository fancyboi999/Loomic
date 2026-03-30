import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { registerExecutor, type ExecutorContext } from "../job-executor.js";

/** Max combined output (stdout + stderr) kept in memory. */
const MAX_OUTPUT_BYTES = 200_000;

/** Default execution timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Max individual file size to upload (50 MB). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
  ".html": "text/html",
};

type CodeExecutionResult = {
  output: string;
  exit_code: number;
  files: Array<{
    name: string;
    url: string;
    size: number;
    mime_type: string;
  }>;
};

registerExecutor("code_execution", async (jobId, _rawPayload, ctx: ExecutorContext) => {
  const t0 = Date.now();
  const tag = `[code-job:${jobId.slice(0, 8)}]`;
  const lap = (label: string) => console.log(`${tag} ${label} +${Date.now() - t0}ms`);

  // Fetch the full job row from DB (PGMQ message only has job_id/type/workspace_id)
  const admin = ctx.getAdminClient();
  const { data: jobRow } = await admin
    .from("background_jobs")
    .select("created_by, workspace_id, payload")
    .eq("id", jobId)
    .single();

  if (!jobRow) throw new Error(`Job ${jobId} not found in database`);
  lap("db_fetch");

  const payload = (jobRow.payload ?? {}) as {
    command: string;
    workspace_id?: string;
    canvas_id?: string;
  };

  if (!payload.command) throw new Error(`Job ${jobId} has no command in payload`);

  const workspaceId: string = jobRow.workspace_id ?? jobId;

  // Create isolated tmpdir for this execution
  const sandboxDir = join(tmpdir(), `loomic-exec-${jobId.slice(0, 12)}-${randomUUID().slice(0, 8)}`);
  await mkdir(sandboxDir, { recursive: true });
  lap("sandbox_created");

  // Build restricted environment
  const skillsRoot = ctx.env.skillsRoot ?? "/opt/loomic/skills";
  const restrictedEnv: Record<string, string> = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: sandboxDir,
    FONT_DIR: join(skillsRoot, "canvas-design", "canvas-fonts"),
    PYTHONDONTWRITEBYTECODE: "1",
  };

  try {
    // Execute command in isolated subprocess
    lap("exec_start");
    const { output, exitCode } = await runCommand(
      payload.command,
      sandboxDir,
      restrictedEnv,
      DEFAULT_TIMEOUT_MS,
    );
    lap("exec_done");

    // Scan tmpdir for output files and upload them
    const files = await scanAndUploadFiles(sandboxDir, workspaceId, admin, tag);
    lap("files_uploaded");

    const result: CodeExecutionResult = {
      output,
      exit_code: exitCode,
      files,
    };

    lap("total");
    return result as unknown as Record<string, unknown>;
  } finally {
    // Always clean up the sandbox directory
    rm(sandboxDir, { recursive: true, force: true }).catch((err) =>
      console.warn(`${tag} sandbox cleanup failed:`, err.message),
    );
  }
});

/**
 * Run a shell command in a subprocess with restricted env and timeout.
 */
function runCommand(
  command: string,
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    const collectChunk = (chunk: Buffer) => {
      if (totalBytes < MAX_OUTPUT_BYTES) {
        const remaining = MAX_OUTPUT_BYTES - totalBytes;
        chunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining));
      }
      totalBytes += chunk.length;
    };

    child.stdout.on("data", collectChunk);
    child.stderr.on("data", collectChunk);

    child.on("error", (err) => {
      reject(new Error(`Spawn error: ${err.message}`));
    });

    child.on("close", (code, signal) => {
      let output = Buffer.concat(chunks).toString("utf8");
      if (totalBytes > MAX_OUTPUT_BYTES) {
        output += `\n[Output truncated: ${totalBytes} bytes total, showing first ${MAX_OUTPUT_BYTES}]`;
      }

      if (signal === "SIGTERM") {
        resolve({
          output: output + `\n[Process killed: timeout after ${timeoutMs / 1000}s]`,
          exitCode: 137,
        });
      } else {
        resolve({ output, exitCode: code ?? 1 });
      }
    });
  });
}

/**
 * Scan a directory for output files and upload them to Supabase Storage.
 */
async function scanAndUploadFiles(
  dir: string,
  workspaceId: string,
  admin: ReturnType<ExecutorContext["getAdminClient"]>,
  tag: string,
): Promise<CodeExecutionResult["files"]> {
  const uploadedFiles: CodeExecutionResult["files"] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return uploadedFiles;
  }

  for (const entry of entries) {
    const filePath = join(dir, entry);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      if (fileStat.size === 0 || fileStat.size > MAX_FILE_SIZE) continue;

      const ext = extname(entry).toLowerCase();
      const mimeType = MIME_MAP[ext];
      // Only upload known file types (skip temp files, bytecode, etc.)
      if (!mimeType) continue;

      const buffer = await readFile(filePath);
      const timestamp = Date.now();
      const objectPath = `${workspaceId}/generated/${timestamp}-${entry}`;

      const { error: uploadError } = await admin.storage
        .from("project-assets")
        .upload(objectPath, buffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        console.warn(`${tag} upload failed for ${entry}: ${uploadError.message}`);
        continue;
      }

      const { data: urlData } = admin.storage
        .from("project-assets")
        .getPublicUrl(objectPath);

      uploadedFiles.push({
        name: entry,
        url: urlData.publicUrl,
        size: buffer.length,
        mime_type: mimeType,
      });
    } catch (err) {
      console.warn(`${tag} failed processing file ${entry}:`, err);
    }
  }

  return uploadedFiles;
}
