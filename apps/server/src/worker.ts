// @credits-system — Worker process: handles job failure refunds (credit refund on generation error)
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
import { createCreditService, type CreditService } from "./features/credits/credit-service.js";
import { getExecutor, type ExecutorContext } from "./features/jobs/job-executor.js";
import { createAdminSupabaseClient } from "./supabase/admin.js";
import { createUserSupabaseClientFactory } from "./supabase/user.js";

// Import executors to trigger registration via side effects
import "./features/jobs/executors/image-generation.js";
import "./features/jobs/executors/video-generation.js";

import type { BackgroundJobType } from "@loomic/shared";

// Register all image/video providers via shared helper (keeps parity with app.ts)
import { registerAllProviders } from "./generation/providers/register-all.js";

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

  // Register all generation providers (shared with app.ts)
  registerAllProviders(env);

  const pgmq = createPgmqClient(env.supabaseDbUrl);
  const createUserClient = createUserSupabaseClientFactory(env);

  let adminClient: ReturnType<typeof createAdminSupabaseClient> | undefined;
  const getAdminClient = () => {
    adminClient ??= createAdminSupabaseClient(env);
    return adminClient;
  };

  const jobService = createJobService({ createUserClient, getAdminClient, pgmq });
  const creditService = createCreditService({ getAdminClient });

  // Base context — per-message fields (queue, msgId, renewVt) are added in processMessage
  const baseCtx = {
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
          const ctx: ExecutorContext = {
              ...baseCtx,
              queue,
              msgId: msg.msg_id,
              renewVt: async (vtSeconds: number) => {
                try { await pgmq.setVt(queue, msg.msg_id, vtSeconds); }
                catch (e) { console.warn(`[renewVt] failed for msg ${msg.msg_id}:`, e); }
              },
            };
            const task = processMessage(queue, msg, ctx, creditService, tag)
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
  ctx: ExecutorContext,
  creditService: CreditService,
  tag: string,
) {
  const jobId = msg.message.job_id as string;
  const jobType = (msg.message.job_type as BackgroundJobType) ?? QUEUE_TO_TYPE[queue];

  if (!jobId || !jobType) {
    console.error(`${tag} Invalid message in ${queue}:`, msg.message);
    await ctx.pgmq.archive(queue, msg.msg_id);
    return;
  }

  const startTime = Date.now();
  console.log(`${tag} Processing job ${jobId} (${jobType})`);

  const executor = getExecutor(jobType);
  if (!executor) {
    console.error(`${tag} No executor for job type: ${jobType}`);
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
      await ctx.pgmq.archive(queue, msg.msg_id);

      // Auto-refund credits for dead-lettered jobs
      await refundDeadLetteredJob(jobId, ctx, creditService, tag);

      console.error(`${tag} Job ${jobId} dead-lettered after ${attempt_count} attempts +${Date.now() - startTime}ms: ${errorMessage}`);
    } else {
      await ctx.jobService.markFailed(jobId, errorCode, errorMessage);
      // Message will re-appear after VT expires for retry
      console.warn(`${tag} Job ${jobId} failed (attempt ${attempt_count}/${max_attempts}) +${Date.now() - startTime}ms: ${errorMessage}`);
    }
  }
}

/**
 * Refund credits for a dead-lettered job if credits were deducted.
 * Only dead-lettered (permanently failed) jobs get refunds — not cancelled jobs.
 */
async function refundDeadLetteredJob(
  jobId: string,
  ctx: ExecutorContext,
  creditService: CreditService,
  tag: string,
) {
  try {
    const admin = ctx.getAdminClient();
    const { data: jobRow } = await admin
      .from("background_jobs")
      .select("credits_cost, workspace_id, created_by")
      .eq("id", jobId)
      .single();

    if (!jobRow) return;

    const creditsCost = jobRow.credits_cost ?? 0;
    const workspaceId = jobRow.workspace_id;
    const createdBy = jobRow.created_by;

    if (creditsCost <= 0 || !workspaceId || !createdBy) return;

    const txId = await creditService.refundCredits(
      workspaceId,
      createdBy,
      creditsCost,
      jobId,
      "Auto-refund: job failed",
    );
    console.log(`${tag} Refunded ${creditsCost} credits for job ${jobId} (tx: ${txId})`);
  } catch (refundErr) {
    // Log but don't crash the worker — the job is already dead-lettered
    console.error(`${tag} Failed to refund credits for job ${jobId}:`, refundErr);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
