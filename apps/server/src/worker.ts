import { bootstrap } from "global-agent";

// Enable HTTP proxy for all outbound requests if GLOBAL_AGENT_HTTP_PROXY is set
bootstrap();

// Native fetch() proxy — needed for @google/generative-ai SDK
if (process.env.GLOBAL_AGENT_HTTP_PROXY) {
  const { ProxyAgent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new ProxyAgent(process.env.GLOBAL_AGENT_HTTP_PROXY));
}

import { randomUUID } from "node:crypto";
import { loadServerEnv } from "./config/env.js";
import { createPgmqClient, type PgmqMessage } from "./queue/pgmq-client.js";
import { createJobService } from "./features/jobs/job-service.js";
import { getExecutor, type ExecutorContext } from "./features/jobs/job-executor.js";
import { createAdminSupabaseClient } from "./supabase/admin.js";
import { createUserSupabaseClientFactory } from "./supabase/user.js";

// Import executors to trigger registration via side effects
import "./features/jobs/executors/code-execution.js";
import "./features/jobs/executors/image-generation.js";
import "./features/jobs/executors/video-generation.js";

import type { BackgroundJobType } from "@loomic/shared";

// Register image/video providers (same as app.ts does)
import { registerImageProvider, registerVideoProvider } from "./generation/providers/registry.js";
import { ReplicateImageProvider } from "./generation/providers/replicate-image.js";
import { ReplicateVideoProvider } from "./generation/providers/replicate-video.js";
import { GoogleImageProvider } from "./generation/providers/google-image.js";
import { GoogleVideoProvider } from "./generation/providers/google-video.js";

// 代码执行由 LocalShellBackend 的内置 execute 工具直接处理，不走 PGMQ。
const QUEUES = ["image_generation_jobs", "video_generation_jobs"] as const;

const QUEUE_TO_TYPE: Record<string, BackgroundJobType> = {
  image_generation_jobs: "image_generation",
  video_generation_jobs: "video_generation",
};

const VT_BY_QUEUE: Record<string, number> = {
  image_generation_jobs: 120,
  video_generation_jobs: 300,
};

async function main() {
  const env = loadServerEnv();

  if (!env.supabaseDbUrl) {
    console.error("SUPABASE_DB_URL is required for worker process.");
    process.exit(1);
  }

  // Register image/video providers (worker needs them too)
  if (env.replicateApiToken) {
    registerImageProvider(new ReplicateImageProvider(env.replicateApiToken));
    registerVideoProvider(new ReplicateVideoProvider(env.replicateApiToken));
  }
  if (env.googleApiKey) {
    registerImageProvider(new GoogleImageProvider(env.googleApiKey));
    registerVideoProvider(new GoogleVideoProvider(env.googleApiKey));
  }

  const pgmq = createPgmqClient(env.supabaseDbUrl);
  const createUserClient = createUserSupabaseClientFactory(env);

  let adminClient: ReturnType<typeof createAdminSupabaseClient> | undefined;
  const getAdminClient = () => {
    adminClient ??= createAdminSupabaseClient(env);
    return adminClient;
  };

  const jobService = createJobService({ createUserClient, getAdminClient, pgmq });

  // Base context — queue/msgId/renewVt are overridden per-message in processMessage()
  const baseCtx: Omit<ExecutorContext, "queue" | "msgId" | "renewVt"> = {
    jobService,
    pgmq,
    getAdminClient,
    env,
  };

  const CONCURRENCY_BY_QUEUE: Record<string, number> = {
    image_generation_jobs: env.workerImageConcurrency ?? 3,
    video_generation_jobs: env.workerVideoConcurrency ?? 2,
  };

  const inFlightByQueue = new Map<string, Set<Promise<void>>>(
    QUEUES.map((q) => [q, new Set()]),
  );

  const pollIntervalMs = env.workerPollIntervalMs ?? 2000;
  const workerId = env.workerId ?? randomUUID().slice(0, 8);
  const tag = `[worker:${workerId}]`;

  let running = true;

  // Graceful shutdown — wait for in-flight jobs then exit
  const shutdown = async () => {
    const totalInFlight = [...inFlightByQueue.values()].reduce((n, s) => n + s.size, 0);
    console.log(`${tag} Shutting down, waiting for ${totalInFlight} in-flight jobs...`);
    running = false;
    const allTasks = [...inFlightByQueue.values()].flatMap((s) => [...s]);
    if (allTasks.length > 0) {
      await Promise.allSettled(allTasks);
    }
    await pgmq.shutdown();
    console.log(`${tag} Shutdown complete.`);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const concurrencyDesc = QUEUES.map((q) => `${q}=${CONCURRENCY_BY_QUEUE[q] ?? 1}`).join(", ");
  console.log(
    `${tag} Started. concurrency={${concurrencyDesc}}, poll=${pollIntervalMs}ms`,
  );

  while (running) {
    for (const queue of QUEUES) {
      try {
        const inFlight = inFlightByQueue.get(queue)!;
        const cap = CONCURRENCY_BY_QUEUE[queue] ?? 1;
        const available = cap - inFlight.size;
        if (available <= 0) continue;

        const vt = VT_BY_QUEUE[queue] ?? 120;
        const messages = await pgmq.read(queue, vt, available);

        for (const msg of messages) {
          const task = processMessage(queue, msg, baseCtx, tag)
            .finally(() => inFlight.delete(task));
          inFlight.add(task);
        }
      } catch (err) {
        console.error(`${tag} Error polling ${queue}:`, err);
      }
    }

    await sleep(pollIntervalMs);
  }
}

async function processMessage(
  queue: string,
  msg: PgmqMessage,
  baseCtx: Omit<ExecutorContext, "queue" | "msgId" | "renewVt">,
  tag: string,
) {
  const jobId = msg.message.job_id as string;
  const jobType = (msg.message.job_type as BackgroundJobType) ?? QUEUE_TO_TYPE[queue];

  if (!jobId || !jobType) {
    console.error(`${tag} Invalid message in ${queue}:`, msg.message);
    await retryPgmqOp(
      () => baseCtx.pgmq.archive(queue, msg.msg_id),
      `archive(invalid) msg=${msg.msg_id} queue=${queue}`,
    );
    return;
  }

  const startTime = Date.now();
  console.log(`${tag} Processing job ${jobId} (${jobType})`);

  const executor = getExecutor(jobType);
  if (!executor) {
    console.error(`${tag} No executor for job type: ${jobType}`);
    await baseCtx.jobService.markFailed(jobId, "no_executor", `No executor registered for ${jobType}`);
    await retryPgmqOp(
      () => baseCtx.pgmq.archive(queue, msg.msg_id),
      `archive(no-executor) msg=${msg.msg_id} queue=${queue}`,
    );
    return;
  }

  // Build per-message context with queue info and heartbeat helper
  const ctx: ExecutorContext = {
    ...baseCtx,
    queue,
    msgId: msg.msg_id,
    renewVt: async (vtSeconds: number) => {
      try {
        await baseCtx.pgmq.setVt(queue, msg.msg_id, vtSeconds);
      } catch (err) {
        // Best-effort: log but never propagate to avoid disrupting the executor
        console.warn(
          `${tag} Failed to renew VT for msg ${msg.msg_id} in ${queue}:`,
          err instanceof Error ? err.message : err,
        );
      }
    },
  };

  // Idempotency guard: skip if job already reached a terminal state
  // (e.g. re-delivered message after VT expired + deleteMsg failure)
  const TERMINAL_STATUSES = new Set(["succeeded", "dead_letter", "canceled"]);
  try {
    const existingJob = await ctx.jobService.getJobAdmin(jobId);
    if (TERMINAL_STATUSES.has(existingJob.status)) {
      console.log(
        `${tag} Skipping job ${jobId} — already ${existingJob.status}`,
      );
      await retryPgmqOp(
        () => ctx.pgmq.archive(queue, msg.msg_id),
        `archive(skip-terminal) job=${jobId} msg=${msg.msg_id} queue=${queue}`,
      );
      return;
    }
  } catch (guardErr) {
    // If job record is missing, archive the orphan message and bail
    console.warn(`${tag} Idempotency guard failed for job ${jobId}:`, guardErr instanceof Error ? guardErr.message : guardErr);
    await retryPgmqOp(
      () => ctx.pgmq.archive(queue, msg.msg_id),
      `archive(guard-error) job=${jobId} msg=${msg.msg_id} queue=${queue}`,
    );
    return;
  }

  // Increment attempt count (atomic — prevents race conditions)
  const { attempt_count, max_attempts } = await ctx.jobService.incrementAttempt(jobId);

  // Mark running
  await ctx.jobService.markRunning(jobId);

  try {
    const result = await executor(jobId, msg.message as Record<string, unknown>, ctx);
    await ctx.jobService.markSucceeded(jobId, result);
    await retryPgmqOp(
      () => ctx.pgmq.deleteMsg(queue, msg.msg_id),
      `deleteMsg(success) job=${jobId} msg=${msg.msg_id} queue=${queue}`,
    );
    console.log(`${tag} Job ${jobId} succeeded +${Date.now() - startTime}ms`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode = (err as { code?: string })?.code ?? "executor_error";

    // Non-retryable errors: retrying with the same input will always fail.
    // Dead-letter immediately so the caller (agent polling) gets fast feedback.
    const NON_RETRYABLE_CODES = new Set([
      "invalid_input",
      "model_not_found",
      "provider_not_found",
      "safety_filter",
    ]);
    const shouldDeadLetter =
      attempt_count >= max_attempts || NON_RETRYABLE_CODES.has(errorCode);

    if (shouldDeadLetter) {
      await ctx.jobService.markDeadLetter(jobId, errorCode, errorMessage);
      await retryPgmqOp(
        () => ctx.pgmq.archive(queue, msg.msg_id),
        `archive(dead-letter) job=${jobId} msg=${msg.msg_id} queue=${queue}`,
      );
      console.error(`${tag} Job ${jobId} dead-lettered after ${attempt_count} attempts +${Date.now() - startTime}ms: ${errorMessage}`);
    } else {
      await ctx.jobService.markFailed(jobId, errorCode, errorMessage);
      // Message will re-appear after VT expires for retry
      console.warn(`${tag} Job ${jobId} failed (attempt ${attempt_count}/${max_attempts}) +${Date.now() - startTime}ms: ${errorMessage}`);
    }
  }
}

/**
 * Retries a pgmq queue operation (delete/archive) up to maxRetries times with
 * linear backoff. On final failure, logs the error but does NOT throw — callers
 * must never crash because of a cleanup step failing.
 *
 * If deleteMsg fails after all retries, the message will reappear after VT
 * expires. The idempotency guard (Task 3) ensures re-execution is safe.
 */
async function retryPgmqOp(
  op: () => Promise<unknown>,
  label: string,
  maxRetries = 2,
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await op();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        console.warn(
          `[pgmq] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${msg}, retrying...`,
        );
        await sleep(1000 * (attempt + 1)); // linear backoff: 1 s, 2 s
      } else {
        console.error(
          `[pgmq] ${label} failed after ${maxRetries + 1} attempts: ${msg}`,
        );
      }
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
