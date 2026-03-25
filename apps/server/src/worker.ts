import { loadServerEnv } from "./config/env.js";
import { createPgmqClient, type PgmqMessage } from "./queue/pgmq-client.js";
import { createJobService } from "./features/jobs/job-service.js";
import { getExecutor, type ExecutorContext } from "./features/jobs/job-executor.js";
import { createAdminSupabaseClient } from "./supabase/admin.js";
import { createUserSupabaseClientFactory } from "./supabase/user.js";

// Import executors to trigger registration via side effects
import "./features/jobs/executors/image-generation.js";

import type { BackgroundJobType } from "@loomic/shared";

// Register image providers (same as app.ts does)
import { registerImageProvider } from "./generation/providers/registry.js";
import { ReplicateImageProvider } from "./generation/providers/replicate-image.js";

const QUEUES = ["image_generation_jobs"] as const;

const QUEUE_TO_TYPE: Record<string, BackgroundJobType> = {
  image_generation_jobs: "image_generation",
};

const VT_BY_QUEUE: Record<string, number> = {
  image_generation_jobs: 120,
};

async function main() {
  const env = loadServerEnv();

  if (!env.supabaseDbUrl) {
    console.error("SUPABASE_DB_URL is required for worker process.");
    process.exit(1);
  }

  // Register image providers (worker needs them too)
  if (env.replicateApiToken) {
    registerImageProvider(new ReplicateImageProvider(env.replicateApiToken));
  }

  const pgmq = createPgmqClient(env.supabaseDbUrl);
  const createUserClient = createUserSupabaseClientFactory(env);

  let adminClient: ReturnType<typeof createAdminSupabaseClient> | undefined;
  const getAdminClient = () => {
    adminClient ??= createAdminSupabaseClient(env);
    return adminClient;
  };

  const jobService = createJobService({ createUserClient, getAdminClient, pgmq });

  const ctx: ExecutorContext = {
    jobService,
    pgmq,
    getAdminClient,
    env,
  };

  const pollIntervalMs = env.workerPollIntervalMs ?? 2000;
  const maxBatchSize = env.workerMaxBatchSize ?? 5;

  let running = true;

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[worker] Shutting down...");
    running = false;
    await pgmq.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`[worker] Started. Polling ${QUEUES.join(", ")} every ${pollIntervalMs}ms`);

  while (running) {
    for (const queue of QUEUES) {
      try {
        const vt = VT_BY_QUEUE[queue] ?? 120;
        const messages = await pgmq.read(queue, vt, maxBatchSize);

        for (const msg of messages) {
          await processMessage(queue, msg, ctx);
        }
      } catch (err) {
        console.error(`[worker] Error polling ${queue}:`, err);
      }
    }

    await sleep(pollIntervalMs);
  }
}

async function processMessage(
  queue: string,
  msg: PgmqMessage,
  ctx: ExecutorContext,
) {
  const jobId = msg.message.job_id as string;
  const jobType = (msg.message.job_type as BackgroundJobType) ?? QUEUE_TO_TYPE[queue];

  if (!jobId || !jobType) {
    console.error(`[worker] Invalid message in ${queue}:`, msg.message);
    await ctx.pgmq.archive(queue, msg.msg_id);
    return;
  }

  console.log(`[worker] Processing job ${jobId} (${jobType})`);

  const executor = getExecutor(jobType);
  if (!executor) {
    console.error(`[worker] No executor for job type: ${jobType}`);
    await ctx.jobService.markFailed(jobId, "no_executor", `No executor registered for ${jobType}`);
    await ctx.pgmq.archive(queue, msg.msg_id);
    return;
  }

  // Increment attempt count
  const { attempt_count, max_attempts } = await ctx.jobService.incrementAttempt(jobId);

  // Mark running
  await ctx.jobService.markRunning(jobId);

  try {
    const result = await executor(jobId, msg.message as Record<string, unknown>, ctx);
    await ctx.jobService.markSucceeded(jobId, result);
    await ctx.pgmq.deleteMsg(queue, msg.msg_id);
    console.log(`[worker] Job ${jobId} succeeded`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode = (err as { code?: string })?.code ?? "executor_error";

    if (attempt_count >= max_attempts) {
      await ctx.jobService.markDeadLetter(jobId, errorCode, errorMessage);
      await ctx.pgmq.archive(queue, msg.msg_id);
      console.error(`[worker] Job ${jobId} dead-lettered after ${attempt_count} attempts: ${errorMessage}`);
    } else {
      await ctx.jobService.markFailed(jobId, errorCode, errorMessage);
      // Message will re-appear after VT expires for retry
      console.warn(`[worker] Job ${jobId} failed (attempt ${attempt_count}/${max_attempts}): ${errorMessage}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
