import { registerExecutor, type ExecutorContext } from "../job-executor.js";
import { generateImage } from "../../../generation/image-generation.js";

registerExecutor("image_generation", async (jobId, rawPayload, ctx: ExecutorContext) => {
  const payload = rawPayload as {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    workspace_id?: string;
    job_id?: string;
  };

  // Look up the job to get the real created_by user ID and workspace_id
  const admin = ctx.getAdminClient();
  const { data: jobRow } = await admin
    .from("background_jobs")
    .select("created_by, workspace_id")
    .eq("id", jobId)
    .single();

  const createdBy: string | null = jobRow?.created_by ?? null;
  const workspaceId: string = payload.workspace_id ?? jobRow?.workspace_id ?? jobId;

  // Resolve provider and model
  // payload.model may be e.g. "replicate/flux-dev" or just "flux-dev"
  // providerName is the first segment; fall back to "replicate"
  const rawModel = payload.model ?? "replicate";
  const providerName = rawModel.includes("/") ? (rawModel.split("/")[0] as string) : "replicate";
  const model = rawModel;

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

    // Generate a short-lived signed URL (1 hour) for the result consumer
    const { data: urlData } = await admin.storage
      .from("project-assets")
      .createSignedUrl(objectPath, 3600);

    return {
      asset_id: (assetRow as { id: string }).id,
      signed_url: urlData?.signedUrl ?? null,
      object_path: objectPath,
      width: generated.width,
      height: generated.height,
      mime_type: generated.mimeType ?? "image/png",
    };
  } finally {
    clearInterval(heartbeatTimer);
  }
});
