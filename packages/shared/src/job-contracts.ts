import { z } from "zod";

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
  "video_generation",
  "code_execution",
]);
export type BackgroundJobType = z.infer<typeof backgroundJobTypeSchema>;

// --- Payloads ---

export const imageGenerationPayloadSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspect_ratio: z.string().optional(),
});
export type ImageGenerationPayload = z.infer<typeof imageGenerationPayloadSchema>;

export const videoGenerationPayloadSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  duration: z.number().int().optional(),
  resolution: z.string().optional(),
  aspect_ratio: z.string().optional(),
  input_images: z.array(z.string()).optional(),
  input_video: z.string().optional(),
  enable_audio: z.boolean().optional(),
});
export type VideoGenerationPayload = z.infer<typeof videoGenerationPayloadSchema>;

export const createVideoJobRequestSchema = z.object({
  project_id: z.string().uuid().optional(),
  canvas_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  thread_id: z.string().optional(),
  prompt: z.string().min(1),
  model: z.string().optional(),
  duration: z.number().int().optional(),
  resolution: z.string().optional(),
  aspect_ratio: z.string().optional(),
  input_images: z.array(z.string()).optional(),
  input_video: z.string().optional(),
  enable_audio: z.boolean().optional(),
});
export type CreateVideoJobRequest = z.infer<typeof createVideoJobRequestSchema>;

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
