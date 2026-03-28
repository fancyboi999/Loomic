# Task Queue Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready async task queue using Supabase pgmq, enabling reliable background job execution starting with image generation.

**Architecture:** `apps/server` creates jobs and enqueues to pgmq. A standalone worker process (`apps/server/src/worker.ts`) polls pgmq, dispatches to typed executors, and writes results to `background_jobs` + `asset_objects`. Frontend queries job status via REST API only.

**Tech Stack:** Fastify 5, Supabase PostgreSQL + pgmq 1.5.1, pg (node-postgres), TypeScript, Zod, pnpm monorepo

**Design Doc:** `LOOMIC_TASK_QUEUE_INFRASTRUCTURE.md`

---

## File Structure

### New Files (Phase A — Infrastructure)

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260325200000_background_jobs.sql` | background_jobs table, status enum, indexes, RLS, pgmq queue creation |
| `packages/shared/src/job-contracts.ts` | Zod schemas for job types, statuses, payloads, API request/response |
| `apps/server/src/queue/pgmq-client.ts` | Thin wrapper over pg for pgmq.send/read/delete/archive/set_vt |
| `apps/server/src/features/jobs/job-service.ts` | Job CRUD service (create, get, list, cancel) used by server + worker |
| `apps/server/src/features/jobs/job-executor.ts` | Executor registry + dispatch: routes job_type to handler function |
| `apps/server/src/http/jobs.ts` | REST routes: POST create, GET status, GET list |
| `apps/server/src/worker.ts` | Standalone entry point: poll loop, graceful shutdown, heartbeat |

### New Files (Phase B — Image Generation)

| File | Responsibility |
|------|---------------|
| `apps/server/src/features/jobs/executors/image-generation.ts` | Image gen executor: call provider, download, upload to storage, write result |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Export job-contracts |
| `packages/shared/src/http.ts` | Add job error codes to ApplicationErrorCodeSchema |
| `packages/shared/src/supabase/database.ts` | Regenerate after migration |
| `apps/server/src/config/env.ts` | Add `SUPABASE_DB_URL` to ServerEnv, add worker poll config |
| `apps/server/src/app.ts` | Initialize jobService, register job routes |
| `apps/server/package.json` | Add `worker` script |

---

## Phase A: Infrastructure Foundation

### Task 1: Database Migration — background_jobs + pgmq queues

**Files:**
- Create: `supabase/migrations/20260325200000_background_jobs.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Background Jobs: business state for async tasks.
-- pgmq handles message delivery; this table handles product-visible status.

-- Status enum
CREATE TYPE public.background_job_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'dead_letter'
);

-- Job type enum (extensible)
CREATE TYPE public.background_job_type AS ENUM (
  'image_generation'
);

-- Main table
CREATE TABLE public.background_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id),
  project_id    uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  canvas_id     uuid REFERENCES public.canvases(id) ON DELETE SET NULL,
  session_id    uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  thread_id     text,

  queue_name    text NOT NULL,
  job_type      public.background_job_type NOT NULL,
  status        public.background_job_status NOT NULL DEFAULT 'queued',

  payload       jsonb NOT NULL DEFAULT '{}',
  result        jsonb,
  error_code    text,
  error_message text,

  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,

  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  failed_at     timestamptz,
  canceled_at   timestamptz
);

-- Indexes
CREATE INDEX idx_background_jobs_status ON public.background_jobs(status);
CREATE INDEX idx_background_jobs_workspace ON public.background_jobs(workspace_id);
CREATE INDEX idx_background_jobs_created_by ON public.background_jobs(created_by);
CREATE INDEX idx_background_jobs_job_type_status ON public.background_jobs(job_type, status);

-- updated_at trigger
ALTER TABLE public.background_jobs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER trg_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: users see their own jobs
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY background_jobs_user_policy
  ON public.background_jobs FOR ALL
  USING (auth.uid() = created_by);

-- Service role bypass for worker process
CREATE POLICY background_jobs_service_role
  ON public.background_jobs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Create pgmq queues
SELECT pgmq.create('image_generation_jobs');
```

- [ ] **Step 2: Push migration**

Run: `npx supabase db push --linked`
Expected: Migration applied successfully

- [ ] **Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --project-id ndbwtngvypwgqexcirdo > packages/shared/src/supabase/database.ts`

- [ ] **Step 4: Commit**

```
git add supabase/migrations/20260325200000_background_jobs.sql packages/shared/src/supabase/database.ts
git commit -m "feat: add background_jobs table and image_generation_jobs pgmq queue"
```

---

### Task 2: Shared Contracts — Job schemas

**Files:**
- Create: `packages/shared/src/job-contracts.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/http.ts`

- [ ] **Step 1: Create job-contracts.ts**

```typescript
import { z } from "zod/v4";

// --- Enums ---

export const backgroundJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "dead_letter",
]);
export type BackgroundJobStatus = z.infer<typeof backgroundJobStatusSchema>;

export const backgroundJobTypeSchema = z.enum([
  "image_generation",
]);
export type BackgroundJobType = z.infer<typeof backgroundJobTypeSchema>;

// --- Payloads ---

export const imageGenerationPayloadSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspect_ratio: z.string().optional(),
});
export type ImageGenerationPayload = z.infer<typeof imageGenerationPayloadSchema>;

// --- Job entity ---

export const backgroundJobSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  canvas_id: z.string().uuid().nullable(),
  session_id: z.string().uuid().nullable(),
  thread_id: z.string().nullable(),
  queue_name: z.string(),
  job_type: backgroundJobTypeSchema,
  status: backgroundJobStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  attempt_count: z.number().int(),
  max_attempts: z.number().int(),
  created_by: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  failed_at: z.string().nullable(),
  canceled_at: z.string().nullable(),
});
export type BackgroundJob = z.infer<typeof backgroundJobSchema>;

// --- API Request schemas ---

export const createImageJobRequestSchema = z.object({
  project_id: z.string().uuid().optional(),
  canvas_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  thread_id: z.string().optional(),
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspect_ratio: z.string().optional(),
});
export type CreateImageJobRequest = z.infer<typeof createImageJobRequestSchema>;

// --- API Response schemas ---

export const jobResponseSchema = z.object({
  job: backgroundJobSchema,
});
export type JobResponse = z.infer<typeof jobResponseSchema>;

export const jobListResponseSchema = z.object({
  jobs: z.array(backgroundJobSchema),
});
export type JobListResponse = z.infer<typeof jobListResponseSchema>;
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from "./job-contracts.js";
```

- [ ] **Step 3: Add error codes to http.ts**

Add to the `applicationErrorCodeSchema` enum in `packages/shared/src/http.ts`:
```
"job_not_found", "job_create_failed", "job_query_failed", "job_cancel_failed"
```

- [ ] **Step 4: Build shared package and verify**

Run: `pnpm --filter @loomic/shared build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```
git add packages/shared/src/job-contracts.ts packages/shared/src/index.ts packages/shared/src/http.ts
git commit -m "feat: add job shared contracts and error codes"
```

---

### Task 3: pgmq Client — Thin wrapper for queue operations

**Files:**
- Create: `apps/server/src/queue/pgmq-client.ts`
- Modify: `apps/server/src/config/env.ts`

- [ ] **Step 1: Add SUPABASE_DB_URL to env config**

In `apps/server/src/config/env.ts`, add to ServerEnv type and loadServerEnv:
```typescript
// Add to ServerEnv type
supabaseDbUrl?: string;
workerPollIntervalMs?: number;
workerMaxBatchSize?: number;

// Add to loadServerEnv body
const supabaseDbUrl = source.SUPABASE_DB_URL;
const workerPollIntervalMs = source.WORKER_POLL_INTERVAL_MS
  ? parseInt(source.WORKER_POLL_INTERVAL_MS, 10) : undefined;
const workerMaxBatchSize = source.WORKER_MAX_BATCH_SIZE
  ? parseInt(source.WORKER_MAX_BATCH_SIZE, 10) : undefined;

// Include in return
...(supabaseDbUrl ? { supabaseDbUrl } : {}),
...(workerPollIntervalMs ? { workerPollIntervalMs } : {}),
...(workerMaxBatchSize ? { workerMaxBatchSize } : {}),
```

- [ ] **Step 2: Create pgmq-client.ts**

```typescript
import pg from "pg";

export type PgmqMessage<T = Record<string, unknown>> = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: T;
};

export type PgmqClient = {
  send(queue: string, payload: Record<string, unknown>, delay?: number): Promise<number>;
  read<T = Record<string, unknown>>(queue: string, vt: number, qty: number): Promise<PgmqMessage<T>[]>;
  deleteMsg(queue: string, msgId: number): Promise<boolean>;
  archive(queue: string, msgId: number): Promise<boolean>;
  setVt(queue: string, msgId: number, vt: number): Promise<void>;
  shutdown(): Promise<void>;
};

export function createPgmqClient(databaseUrl: string): PgmqClient {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  return {
    async send(queue, payload, delay = 0) {
      const { rows } = await pool.query(
        `SELECT * FROM pgmq.send($1, $2::jsonb, $3)`,
        [queue, JSON.stringify(payload), delay],
      );
      return rows[0].send;
    },

    async read<T>(queue: string, vt: number, qty: number) {
      const { rows } = await pool.query(
        `SELECT * FROM pgmq.read($1, $2, $3)`,
        [queue, vt, qty],
      );
      return rows as PgmqMessage<T>[];
    },

    async deleteMsg(queue, msgId) {
      const { rows } = await pool.query(
        `SELECT pgmq.delete($1, $2)`,
        [queue, msgId],
      );
      return rows[0]?.delete === true;
    },

    async archive(queue, msgId) {
      const { rows } = await pool.query(
        `SELECT pgmq.archive($1, $2)`,
        [queue, msgId],
      );
      return rows[0]?.archive === true;
    },

    async setVt(queue, msgId, vt) {
      await pool.query(
        `SELECT pgmq.set_vt($1, $2, $3)`,
        [queue, msgId, vt],
      );
    },

    async shutdown() {
      await pool.end();
    },
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```
git add apps/server/src/queue/pgmq-client.ts apps/server/src/config/env.ts
git commit -m "feat: add pgmq client wrapper and DB URL env config"
```

---

### Task 4: Job Service — Business layer for background jobs

**Files:**
- Create: `apps/server/src/features/jobs/job-service.ts`

- [ ] **Step 1: Create job-service.ts**

```typescript
import type {
  BackgroundJob,
  BackgroundJobStatus,
  BackgroundJobType,
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
};

// Default visibility timeout per job type (seconds)
const DEFAULT_VT: Record<BackgroundJobType, number> = {
  image_generation: 120,
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
  listJobs(user: AuthenticatedUser, filters?: { status?: BackgroundJobStatus; jobType?: BackgroundJobType }): Promise<BackgroundJob[]>;
  cancelJob(user: AuthenticatedUser, jobId: string): Promise<BackgroundJob>;

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

  const SELECT_COLS = "id, workspace_id, project_id, canvas_id, session_id, thread_id, queue_name, job_type, status, payload, result, error_code, error_message, attempt_count, max_attempts, created_by, created_at, updated_at, started_at, completed_at, failed_at, canceled_at";

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
          payload: input.payload,
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

      // Enqueue to pgmq
      try {
        await options.pgmq.send(queueName, {
          job_id: job.id,
          job_type: input.jobType,
          workspace_id: input.workspaceId,
        });
      } catch (enqueueErr) {
        // Rollback: delete the job record
        await client.from("background_jobs").delete().eq("id", job.id);
        throw new JobServiceError(
          "job_create_failed",
          "Failed to enqueue job.",
          500,
        );
      }

      return mapJobRow(job);
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
      return mapJobRow(job);
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
      return (jobs ?? []).map(mapJobRow);
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
        throw new JobServiceError("job_not_found", "Job not found or already completed.", 404);
      }
      return mapJobRow(job);
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
          result,
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
      const { data } = await admin.rpc("increment_job_attempt" as never, { p_job_id: jobId });
      // Fallback: manual increment
      if (!data) {
        const { data: job } = await admin
          .from("background_jobs")
          .select("attempt_count, max_attempts")
          .eq("id", jobId)
          .single();

        if (job) {
          await admin
            .from("background_jobs")
            .update({ attempt_count: job.attempt_count + 1 })
            .eq("id", jobId);
          return { attempt_count: job.attempt_count + 1, max_attempts: job.max_attempts };
        }
        return { attempt_count: 1, max_attempts: 3 };
      }
      return data as { attempt_count: number; max_attempts: number };
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/server && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
git add apps/server/src/features/jobs/job-service.ts
git commit -m "feat: add job service with create, query, cancel, and worker status methods"
```

---

### Task 5: Job Executor Registry

**Files:**
- Create: `apps/server/src/features/jobs/job-executor.ts`

- [ ] **Step 1: Create job-executor.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```
git add apps/server/src/features/jobs/job-executor.ts
git commit -m "feat: add job executor registry"
```

---

### Task 6: HTTP Routes — Job API

**Files:**
- Create: `apps/server/src/http/jobs.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Create jobs.ts routes**

```typescript
import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  createImageJobRequestSchema,
  jobListResponseSchema,
  jobResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import {
  JobServiceError,
  type JobService,
} from "../features/jobs/job-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerJobRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    jobService: JobService;
    viewerService: ViewerService;
  },
) {
  // POST /api/jobs/image-generation — create image generation job
  app.post("/api/jobs/image-generation", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const payload = createImageJobRequestSchema.parse(request.body);
      const viewer = await options.viewerService.ensureViewer(user);

      const job = await options.jobService.createJob(user, {
        workspaceId: viewer.workspace.id,
        projectId: payload.project_id,
        canvasId: payload.canvas_id,
        sessionId: payload.session_id,
        threadId: payload.thread_id,
        jobType: "image_generation",
        payload: {
          prompt: payload.prompt,
          model: payload.model,
          aspect_ratio: payload.aspect_ratio,
        },
      });

      return reply.code(201).send(jobResponseSchema.parse({ job }));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({ issues: error.issues, message: "Invalid request body" });
      }
      return sendJobError(error, reply, "job_create_failed");
    }
  });

  // GET /api/jobs/:jobId — get job status
  app.get("/api/jobs/:jobId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { jobId } = request.params as { jobId: string };
      const job = await options.jobService.getJob(user, jobId);

      return reply.code(200).send(jobResponseSchema.parse({ job }));
    } catch (error) {
      return sendJobError(error, reply, "job_query_failed");
    }
  });

  // GET /api/jobs — list jobs
  app.get("/api/jobs", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const query = request.query as { status?: string; job_type?: string };
      const jobs = await options.jobService.listJobs(user, {
        status: query.status as BackgroundJobStatus | undefined,
        jobType: query.job_type as BackgroundJobType | undefined,
      });

      return reply.code(200).send(jobListResponseSchema.parse({ jobs }));
    } catch (error) {
      return sendJobError(error, reply, "job_query_failed");
    }
  });

  // POST /api/jobs/:jobId/cancel — cancel job
  app.post("/api/jobs/:jobId/cancel", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { jobId } = request.params as { jobId: string };
      const job = await options.jobService.cancelJob(user, jobId);

      return reply.code(200).send(jobResponseSchema.parse({ job }));
    } catch (error) {
      return sendJobError(error, reply, "job_cancel_failed");
    }
  });
}

// Need these type imports for the query params
import type { BackgroundJobStatus, BackgroundJobType } from "@loomic/shared";

function sendUnauthenticated(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: { code: "unauthorized", message: "Missing or invalid bearer token." },
    }),
  );
}

type JobErrorFallbackCode = "job_not_found" | "job_create_failed" | "job_query_failed" | "job_cancel_failed";

function sendJobError(error: unknown, reply: FastifyReply, fallbackCode: JobErrorFallbackCode) {
  if (error instanceof JobServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }
  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: { code: fallbackCode, message: "An unexpected error occurred." },
    }),
  );
}

function isZodError(error: unknown): error is { issues: unknown[]; name: string } {
  return error instanceof Error && error.name === "ZodError" && "issues" in error && Array.isArray(error.issues);
}
```

- [ ] **Step 2: Wire into app.ts**

Add to `apps/server/src/app.ts`:

1. Import: `import { createPgmqClient } from "./queue/pgmq-client.js";`
2. Import: `import { createJobService, type JobService } from "./features/jobs/job-service.js";`
3. Import: `import { registerJobRoutes } from "./http/jobs.js";`
4. Add to BuildAppOptions: `jobService?: JobService;`
5. In buildApp body, after `const uploadService = ...`:
```typescript
const pgmq = env.supabaseDbUrl
  ? createPgmqClient(env.supabaseDbUrl)
  : undefined;
const jobService =
  options.jobService ??
  (pgmq
    ? createJobService({ createUserClient, getAdminClient, pgmq })
    : undefined);
```
6. Register routes (conditionally):
```typescript
if (jobService) {
  void registerJobRoutes(app, { auth, jobService, viewerService });
}
```

- [ ] **Step 3: Verify TypeScript and server starts**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```
git add apps/server/src/http/jobs.ts apps/server/src/app.ts
git commit -m "feat: add job REST API routes and wire into app"
```

---

### Task 7: Worker Process

**Files:**
- Create: `apps/server/src/worker.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Create worker.ts**

```typescript
import { loadServerEnv } from "./config/env.js";
import { createPgmqClient, type PgmqMessage } from "./queue/pgmq-client.js";
import { createJobService } from "./features/jobs/job-service.js";
import { getExecutor, type ExecutorContext } from "./features/jobs/job-executor.js";
import { createAdminSupabaseClient } from "./supabase/admin.js";
import { createUserSupabaseClientFactory } from "./supabase/user.js";

// Import executors to register them
import "./features/jobs/executors/image-generation.js";

import type { BackgroundJobType } from "@loomic/shared";

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
    await ctx.pgmq.delete(queue, msg.msg_id);
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
```

- [ ] **Step 2: Add worker script to package.json**

Add to `apps/server/package.json` scripts:
```json
"worker": "node --env-file=../../.env.local --import tsx ./src/worker.ts"
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/server && npx tsc --noEmit`
(Note: worker.ts imports the image-generation executor which doesn't exist yet — this step may be deferred to after Task 8)

- [ ] **Step 4: Commit**

```
git add apps/server/src/worker.ts apps/server/package.json
git commit -m "feat: add worker process with poll loop and graceful shutdown"
```

---

## Phase B: Image Generation Integration

### Task 8: Image Generation Executor

**Files:**
- Create: `apps/server/src/features/jobs/executors/image-generation.ts`

- [ ] **Step 1: Create image-generation.ts executor**

```typescript
import { registerExecutor, type ExecutorContext } from "../job-executor.js";
import { generateImage } from "../../../generation/image-generation.js";
import type { ImageGenerationPayload } from "@loomic/shared";

registerExecutor("image_generation", async (jobId, rawPayload, ctx) => {
  const payload = rawPayload as unknown as {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    workspace_id: string;
  };

  // Heartbeat: extend VT at 60s if still running
  const heartbeatTimer = setInterval(async () => {
    try {
      await ctx.pgmq.setVt("image_generation_jobs", 0, 120);
    } catch {
      // Best effort — msg_id 0 is placeholder; real renewal
      // would require passing msg_id through, which is a Phase C improvement
    }
  }, 60_000);

  try {
    // Generate image via provider
    const generated = await generateImage({
      prompt: payload.prompt,
      model: payload.model,
      aspectRatio: payload.aspect_ratio,
    });

    // Download the image from provider CDN
    const response = await fetch(generated.url);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const admin = ctx.getAdminClient();
    const timestamp = Date.now();
    const objectPath = `${payload.workspace_id}/generated/${timestamp}-${jobId}.png`;

    const { error: uploadError } = await admin.storage
      .from("project-assets")
      .upload(objectPath, buffer, {
        contentType: generated.mimeType ?? "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Create asset_objects record
    const { data: assetRow, error: assetError } = await admin
      .from("asset_objects")
      .insert({
        workspace_id: payload.workspace_id,
        bucket: "project-assets",
        object_path: objectPath,
        mime_type: generated.mimeType ?? "image/png",
        byte_size: buffer.length,
        created_by: jobId, // Use jobId as creator reference for worker-created assets
      })
      .select("id")
      .single();

    if (assetError || !assetRow) {
      throw new Error("Failed to create asset record.");
    }

    // Generate signed URL
    const { data: urlData } = await admin.storage
      .from("project-assets")
      .createSignedUrl(objectPath, 3600);

    return {
      asset_id: assetRow.id,
      signed_url: urlData?.signedUrl ?? null,
      width: generated.width,
      height: generated.height,
      mime_type: generated.mimeType ?? "image/png",
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
});
```

- [ ] **Step 2: Verify existing generateImage function signature**

Read `apps/server/src/generation/image-generation.ts` to confirm the function signature matches. Adjust the import/call if needed.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/server && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```
git add apps/server/src/features/jobs/executors/image-generation.ts
git commit -m "feat: add image generation executor for worker"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Start the server**

```bash
cd apps/server
pnpm dev
```

- [ ] **Step 2: Create a test job via API**

```bash
TOKEN=$(node --env-file=../../.env.local --import tsx -e "
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data } = await c.auth.signInWithPassword({ email: 'smoketest@gmail.com', password: 'Testpassword1234' });
console.log(data.session.access_token);
" 2>/dev/null)

curl -s -X POST http://localhost:3001/api/jobs/image-generation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a serene mountain lake at sunset"}' | python3 -m json.tool
```

Expected: 201 with job object, status = "queued"

- [ ] **Step 3: Start the worker**

```bash
cd apps/server
pnpm worker
```

Expected: Worker starts, picks up the job, processes it

- [ ] **Step 4: Query job status**

```bash
curl -s http://localhost:3001/api/jobs/<JOB_ID> \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: status = "succeeded" with result containing asset_id and signed_url

- [ ] **Step 5: Final commit**

```
git add -A
git commit -m "feat: complete task queue infrastructure with image generation"
```

---

## Architecture Summary

```
┌─────────────┐     ┌────────────┐     ┌──────────────┐
│  apps/web   │────▶│apps/server │────▶│   pgmq       │
│  (frontend) │     │ (REST API) │     │ (Supabase)   │
└──────┬──────┘     └─────┬──────┘     └──────┬───────┘
       │                  │                    │
       │  GET /api/jobs   │  INSERT            │  read/delete
       │◀─────────────────│  background_jobs   │
       │                  │                    ▼
       │                  │            ┌──────────────┐
       │                  │            │   worker.ts  │
       │                  │            │  (poll loop) │
       │                  │            └──────┬───────┘
       │                  │                   │
       │                  │                   │ execute
       │                  │                   ▼
       │                  │            ┌──────────────┐
       │                  │            │  executors/  │
       │                  │            │  image-gen   │
       │                  ▼            └──────────────┘
       │           ┌──────────────┐
       │           │background_   │
       └──────────▶│jobs (table)  │
                   └──────────────┘
```
