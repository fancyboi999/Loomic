import type {
  BackgroundJob,
  BackgroundJobStatus,
  BackgroundJobType,
  Json,
} from "@loomic/shared";

import type { PgmqClient } from "../../queue/pgmq-client.js";
import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";
import type { AdminSupabaseClient } from "../../supabase/admin.js";

// Queue name mapping
const QUEUE_MAP: Record<BackgroundJobType, string> = {
  image_generation: "image_generation_jobs",
  video_generation: "video_generation_jobs",
};

export class JobServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "job_not_found"
    | "job_create_failed"
    | "job_query_failed"
    | "job_cancel_failed";

  constructor(
    code: JobServiceError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.name = "JobServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CreateJobInput = {
  workspaceId: string;
  projectId?: string;
  canvasId?: string;
  sessionId?: string;
  threadId?: string;
  jobType: BackgroundJobType;
  payload: Record<string, unknown>;
};

export type JobService = {
  createJob(user: AuthenticatedUser, input: CreateJobInput): Promise<BackgroundJob>;
  getJob(user: AuthenticatedUser, jobId: string): Promise<BackgroundJob>;
  listJobs(
    user: AuthenticatedUser,
    filters?: { status?: BackgroundJobStatus; jobType?: BackgroundJobType },
  ): Promise<BackgroundJob[]>;
  cancelJob(user: AuthenticatedUser, jobId: string): Promise<BackgroundJob>;
  getJobAdmin(jobId: string): Promise<BackgroundJob>;

  // Worker-only methods (use admin client, no user auth)
  markRunning(jobId: string): Promise<void>;
  markSucceeded(jobId: string, result: Record<string, unknown>): Promise<void>;
  markFailed(jobId: string, errorCode: string, errorMessage: string): Promise<void>;
  markDeadLetter(jobId: string, errorCode: string, errorMessage: string): Promise<void>;
  incrementAttempt(jobId: string): Promise<{ attempt_count: number; max_attempts: number }>;
};

export function createJobService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
  getAdminClient: () => AdminSupabaseClient;
  pgmq: PgmqClient;
}): JobService {
  function mapJobRow(row: Record<string, unknown>): BackgroundJob {
    return {
      id: row.id as string,
      workspace_id: row.workspace_id as string,
      project_id: (row.project_id as string) ?? null,
      canvas_id: (row.canvas_id as string) ?? null,
      session_id: (row.session_id as string) ?? null,
      thread_id: (row.thread_id as string) ?? null,
      queue_name: row.queue_name as string,
      job_type: row.job_type as BackgroundJob["job_type"],
      status: row.status as BackgroundJob["status"],
      payload: (row.payload as Record<string, unknown>) ?? {},
      result: (row.result as Record<string, unknown>) ?? null,
      error_code: (row.error_code as string) ?? null,
      error_message: (row.error_message as string) ?? null,
      attempt_count: row.attempt_count as number,
      max_attempts: row.max_attempts as number,
      created_by: row.created_by as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      started_at: (row.started_at as string) ?? null,
      completed_at: (row.completed_at as string) ?? null,
      failed_at: (row.failed_at as string) ?? null,
      canceled_at: (row.canceled_at as string) ?? null,
    };
  }

  const SELECT_COLS =
    "id, workspace_id, project_id, canvas_id, session_id, thread_id, queue_name, job_type, status, payload, result, error_code, error_message, attempt_count, max_attempts, created_by, created_at, updated_at, started_at, completed_at, failed_at, canceled_at";

  return {
    async createJob(user, input) {
      const client = options.createUserClient(user.accessToken);
      const queueName = QUEUE_MAP[input.jobType];

      const { data: job, error } = await client
        .from("background_jobs")
        .insert({
          workspace_id: input.workspaceId,
          project_id: input.projectId ?? null,
          canvas_id: input.canvasId ?? null,
          session_id: input.sessionId ?? null,
          thread_id: input.threadId ?? null,
          queue_name: queueName,
          job_type: input.jobType,
          payload: input.payload as Json,
          created_by: user.id,
        })
        .select(SELECT_COLS)
        .single();

      if (error || !job) {
        throw new JobServiceError(
          "job_create_failed",
          "Failed to create job record.",
          500,
        );
      }

      // Enqueue to pgmq — rollback on failure
      try {
        await options.pgmq.send(queueName, {
          job_id: job.id,
          job_type: input.jobType,
          workspace_id: input.workspaceId,
        });
      } catch (enqueueErr) {
        console.error("[job-service] pgmq.send failed:", enqueueErr);
        await client.from("background_jobs").delete().eq("id", job.id);
        throw new JobServiceError(
          "job_create_failed",
          "Failed to enqueue job.",
          500,
        );
      }

      return mapJobRow(job as unknown as Record<string, unknown>);
    },

    async getJob(user, jobId) {
      const client = options.createUserClient(user.accessToken);
      const { data: job, error } = await client
        .from("background_jobs")
        .select(SELECT_COLS)
        .eq("id", jobId)
        .maybeSingle();

      if (error) {
        throw new JobServiceError("job_query_failed", "Failed to query job.", 500);
      }
      if (!job) {
        throw new JobServiceError("job_not_found", "Job not found.", 404);
      }
      return mapJobRow(job as unknown as Record<string, unknown>);
    },

    async listJobs(user, filters) {
      const client = options.createUserClient(user.accessToken);
      let query = client
        .from("background_jobs")
        .select(SELECT_COLS)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.jobType) query = query.eq("job_type", filters.jobType);

      const { data: jobs, error } = await query;
      if (error) {
        throw new JobServiceError("job_query_failed", "Failed to list jobs.", 500);
      }
      return (jobs ?? []).map((row) =>
        mapJobRow(row as unknown as Record<string, unknown>),
      );
    },

    async cancelJob(user, jobId) {
      const client = options.createUserClient(user.accessToken);
      const { data: job, error } = await client
        .from("background_jobs")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", jobId)
        .in("status", ["queued", "running"])
        .select(SELECT_COLS)
        .maybeSingle();

      if (error) {
        throw new JobServiceError("job_cancel_failed", "Failed to cancel job.", 500);
      }
      if (!job) {
        throw new JobServiceError(
          "job_not_found",
          "Job not found or already completed.",
          404,
        );
      }
      return mapJobRow(job as unknown as Record<string, unknown>);
    },

    async getJobAdmin(jobId) {
      const admin = options.getAdminClient();
      const { data: job, error } = await admin
        .from("background_jobs")
        .select(SELECT_COLS)
        .eq("id", jobId)
        .maybeSingle();

      if (error) {
        throw new JobServiceError("job_query_failed", "Failed to query job.", 500);
      }
      if (!job) {
        throw new JobServiceError("job_not_found", "Job not found.", 404);
      }
      return mapJobRow(job as unknown as Record<string, unknown>);
    },

    // --- Worker-only methods (admin client, bypasses RLS) ---

    async markRunning(jobId) {
      const admin = options.getAdminClient();
      await admin
        .from("background_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("status", "queued");
    },

    async markSucceeded(jobId, result) {
      const admin = options.getAdminClient();
      await admin
        .from("background_jobs")
        .update({
          status: "succeeded",
          result: result as Json,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    },

    async markFailed(jobId, errorCode, errorMessage) {
      const admin = options.getAdminClient();
      await admin
        .from("background_jobs")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
          failed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    },

    async markDeadLetter(jobId, errorCode, errorMessage) {
      const admin = options.getAdminClient();
      await admin
        .from("background_jobs")
        .update({
          status: "dead_letter",
          error_code: errorCode,
          error_message: errorMessage,
          failed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    },

    async incrementAttempt(jobId) {
      const admin = options.getAdminClient();
      const { data: job } = await admin
        .from("background_jobs")
        .select("attempt_count, max_attempts")
        .eq("id", jobId)
        .single();

      if (job) {
        const newCount = (job.attempt_count ?? 0) + 1;
        await admin
          .from("background_jobs")
          .update({ attempt_count: newCount })
          .eq("id", jobId);
        return { attempt_count: newCount, max_attempts: job.max_attempts ?? 3 };
      }
      return { attempt_count: 1, max_attempts: 3 };
    },
  };
}
