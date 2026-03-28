import { registerExecutor, type ExecutorContext } from "../job-executor.js";
import { generateImage } from "../../../generation/image-generation.js";
import { resolveImageProviderName } from "../../../generation/providers/registry.js";

registerExecutor("image_generation", async (jobId, _rawPayload, ctx: ExecutorContext) => {
  // Read the full job row including payload from the database.
  // The PGMQ message only contains { job_id, job_type, workspace_id },
  // so we must fetch prompt/model/aspect_ratio from background_jobs.payload.
  const admin = ctx.getAdminClient();
  const { data: jobRow } = await admin
    .from("background_jobs")
    .select("created_by, workspace_id, payload")
    .eq("id", jobId)
    .single();

  if (!jobRow) throw new Error(`Job ${jobId} not found in database`);

  const payload = (jobRow.payload ?? {}) as {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    title?: string;
    input_images?: string[];
  };

  if (!payload.prompt) throw new Error(`Job ${jobId} has no prompt in payload`);

  const createdBy: string | null = jobRow.created_by ?? null;
  const workspaceId: string = jobRow.workspace_id ?? jobId;

  // Resolve provider dynamically from model ID via registry
  const model = payload.model ?? "black-forest-labs/flux-kontext-pro";
  const providerName = resolveImageProviderName(model);

  const heartbeatTimer = setInterval(() => {
    // Best-effort heartbeat placeholder — VT extension requires msg_id not
    // available at this level. No-op intentionally.
  }, 60_000);

  try {
    // Generate image via the registered provider
    const generated = await generateImage(providerName, {
      prompt: payload.prompt,
      model,
      ...(payload.aspect_ratio !== undefined ? { aspectRatio: payload.aspect_ratio } : {}),
      ...(payload.input_images?.length ? { inputImages: payload.input_images } : {}),
    });

    // Download the generated image from the provider CDN
    const response = await fetch(generated.url);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage under the project-assets bucket
    const timestamp = Date.now();
    const objectPath = `${workspaceId}/generated/${timestamp}-${jobId}.png`;

    const { error: uploadError } = await admin.storage
      .from("project-assets")
      .upload(objectPath, buffer, {
        contentType: generated.mimeType ?? "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Insert asset_objects record — only include created_by if we have a valid user UUID
    const { data: assetRow, error: assetError } = await admin
      .from("asset_objects")
      .insert({
        workspace_id: workspaceId,
        bucket: "project-assets",
        object_path: objectPath,
        mime_type: generated.mimeType ?? "image/png",
        byte_size: buffer.length,
        ...(createdBy ? { created_by: createdBy } : {}),
      })
      .select("id")
      .single();

    if (assetError || !assetRow) {
      throw new Error(
        `Failed to create asset record: ${assetError?.message ?? "unknown error"}`,
      );
    }

    // Generate a public URL for the result consumer
    const { data: urlData } = admin.storage
      .from("project-assets")
      .getPublicUrl(objectPath);

    return {
      asset_id: (assetRow as { id: string }).id,
      signed_url: urlData.publicUrl,
      object_path: objectPath,
      width: generated.width,
      height: generated.height,
      mime_type: generated.mimeType ?? "image/png",
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
});
