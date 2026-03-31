import type { FastifyInstance, FastifyReply } from "fastify";

import type { BackgroundJobStatus, BackgroundJobType, ImageQualityLevel } from "@loomic/shared";
import {
  applicationErrorResponseSchema,
  createImageJobRequestSchema,
  createVideoJobRequestSchema,
  getPlanConfig,
  jobListResponseSchema,
  jobResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import {
  JobServiceError,
  type JobService,
} from "../features/jobs/job-service.js";
import {
  CreditServiceError,
  type CreditService,
} from "../features/credits/credit-service.js";
import {
  TierGuardError,
  type TierGuard,
} from "../features/credits/tier-guard.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerJobRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    creditService?: CreditService;
    jobService: JobService;
    tierGuard?: TierGuard;
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

      // Credit checks (skip if credit system not configured)
      const model = payload.model ?? "black-forest-labs/flux-kontext-pro";
      let creditsCost = 0;

      if (options.creditService && options.tierGuard) {
        const sub = await options.creditService.getSubscription(viewer.workspace.id);
        const planConfig = getPlanConfig(sub.plan);
        // Use the plan's max resolution as the quality for cost calculation
        const quality: ImageQualityLevel = planConfig.maxResolution;
        options.tierGuard.checkModelAccess(sub.plan, model);
        await options.tierGuard.checkConcurrency(viewer.workspace.id, sub.plan);
        creditsCost = options.tierGuard.calculateCreditCost(model, "image_generation", { quality });
      }

      const job = await options.jobService.createJob(user, {
        workspaceId: viewer.workspace.id,
        ...(payload.project_id !== undefined
          ? { projectId: payload.project_id }
          : {}),
        ...(payload.canvas_id !== undefined
          ? { canvasId: payload.canvas_id }
          : {}),
        ...(payload.session_id !== undefined
          ? { sessionId: payload.session_id }
          : {}),
        ...(payload.thread_id !== undefined
          ? { threadId: payload.thread_id }
          : {}),
        jobType: "image_generation",
        payload: {
          prompt: payload.prompt,
          ...(payload.model !== undefined ? { model: payload.model } : {}),
          ...(payload.aspect_ratio !== undefined
            ? { aspect_ratio: payload.aspect_ratio }
            : {}),
        },
      });

      // Deduct credits after job creation (we need the job ID for tracking)
      if (options.creditService && creditsCost > 0) {
        try {
          const txId = await options.creditService.deductCredits(
            viewer.workspace.id,
            user.id,
            creditsCost,
            job.id,
            `Image generation: ${model}`,
          );
          await options.jobService.setCreditsInfo(job.id, creditsCost, txId);
        } catch (deductError) {
          // Deduction failed — cancel the job and re-throw
          await options.jobService.cancelJob(user, job.id).catch(() => {});
          throw deductError;
        }
      }

      return reply.code(201).send(jobResponseSchema.parse({ job }));
    } catch (error) {
      if (isZodError(error)) {
        return reply
          .code(400)
          .send({ issues: error.issues, message: "Invalid request body" });
      }
      return sendJobError(error, reply, "job_create_failed");
    }
  });

  // POST /api/jobs/video-generation — create video generation job
  app.post("/api/jobs/video-generation", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const payload = createVideoJobRequestSchema.parse(request.body);
      const viewer = await options.viewerService.ensureViewer(user);

      // Credit checks (skip if credit system not configured)
      const model = payload.model ?? "wan-video/wan-2.6";
      let creditsCost = 0;

      if (options.creditService && options.tierGuard) {
        const sub = await options.creditService.getSubscription(viewer.workspace.id);
        options.tierGuard.checkModelAccess(sub.plan, model);
        await options.tierGuard.checkConcurrency(viewer.workspace.id, sub.plan);
        creditsCost = options.tierGuard.calculateCreditCost(
          model,
          "video_generation",
          payload.duration != null ? { duration: payload.duration } : {},
        );
      }

      const job = await options.jobService.createJob(user, {
        workspaceId: viewer.workspace.id,
        ...(payload.project_id !== undefined
          ? { projectId: payload.project_id }
          : {}),
        ...(payload.canvas_id !== undefined
          ? { canvasId: payload.canvas_id }
          : {}),
        ...(payload.session_id !== undefined
          ? { sessionId: payload.session_id }
          : {}),
        ...(payload.thread_id !== undefined
          ? { threadId: payload.thread_id }
          : {}),
        jobType: "video_generation",
        payload: {
          prompt: payload.prompt,
          ...(payload.model !== undefined ? { model: payload.model } : {}),
          ...(payload.duration !== undefined ? { duration: payload.duration } : {}),
          ...(payload.resolution !== undefined ? { resolution: payload.resolution } : {}),
          ...(payload.aspect_ratio !== undefined ? { aspect_ratio: payload.aspect_ratio } : {}),
          ...(payload.input_images !== undefined ? { input_images: payload.input_images } : {}),
          ...(payload.input_video !== undefined ? { input_video: payload.input_video } : {}),
          ...(payload.enable_audio !== undefined ? { enable_audio: payload.enable_audio } : {}),
        },
      });

      // Deduct credits after job creation
      if (options.creditService && creditsCost > 0) {
        try {
          const txId = await options.creditService.deductCredits(
            viewer.workspace.id,
            user.id,
            creditsCost,
            job.id,
            `Video generation: ${model}`,
          );
          await options.jobService.setCreditsInfo(job.id, creditsCost, txId);
        } catch (deductError) {
          await options.jobService.cancelJob(user, job.id).catch(() => {});
          throw deductError;
        }
      }

      return reply.code(201).send(jobResponseSchema.parse({ job }));
    } catch (error) {
      if (isZodError(error)) {
        return reply
          .code(400)
          .send({ issues: error.issues, message: "Invalid request body" });
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
      const filters: { status?: BackgroundJobStatus; jobType?: BackgroundJobType } = {};
      if (query.status) filters.status = query.status as BackgroundJobStatus;
      if (query.job_type) filters.jobType = query.job_type as BackgroundJobType;
      const jobs = await options.jobService.listJobs(user, filters);

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

function sendUnauthenticated(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: {
        code: "unauthorized",
        message: "Missing or invalid bearer token.",
      },
    }),
  );
}

type JobErrorFallbackCode =
  | "job_not_found"
  | "job_create_failed"
  | "job_query_failed"
  | "job_cancel_failed";

function sendJobError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode: JobErrorFallbackCode,
) {
  if (error instanceof JobServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }
  if (error instanceof TierGuardError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }
  if (error instanceof CreditServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }
  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: fallbackCode,
        message: "An unexpected error occurred.",
      },
    }),
  );
}

function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
