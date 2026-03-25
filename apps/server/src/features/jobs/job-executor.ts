import type { BackgroundJobType } from "@loomic/shared";

import type { JobService } from "./job-service.js";
import type { PgmqClient } from "../../queue/pgmq-client.js";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type { ServerEnv } from "../../config/env.js";

export type ExecutorContext = {
  jobService: JobService;
  pgmq: PgmqClient;
  getAdminClient: () => AdminSupabaseClient;
  env: ServerEnv;
};

export type JobExecutor = (
  jobId: string,
  payload: Record<string, unknown>,
  ctx: ExecutorContext,
) => Promise<Record<string, unknown>>;

const executors = new Map<BackgroundJobType, JobExecutor>();

export function registerExecutor(jobType: BackgroundJobType, executor: JobExecutor): void {
  executors.set(jobType, executor);
}

export function getExecutor(jobType: BackgroundJobType): JobExecutor | undefined {
  return executors.get(jobType);
}
