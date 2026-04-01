import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";

import type { AdminSupabaseClient } from "../supabase/admin.js";
import type {
  PaymentService,
  WebhookPayload,
} from "../features/payments/payment-service.js";

export async function registerPaymentWebhookRoute(
  app: FastifyInstance,
  options: {
    getAdminClient: () => AdminSupabaseClient;
    paymentService: PaymentService;
    webhookSecret: string;
  },
) {
  // Register a custom content-type parser to capture the raw body for
  // HMAC signature verification while still parsing JSON.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/api/payments/webhook", async (request, reply) => {
    const rawBody = request.body as string;

    // ── 1. Verify webhook signature ──────────────────────────
    const signature = request.headers["x-signature"] as string | undefined;
    if (!signature) {
      return reply.code(401).send({ error: "Missing X-Signature header" });
    }

    const expected = crypto
      .createHmac("sha256", options.webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return reply.code(401).send({ error: "Invalid webhook signature" });
    }

    // ── 2. Parse body ────────────────────────────────────────
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
      return reply.code(400).send({ error: "Invalid JSON body" });
    }

    const eventName = payload.meta?.event_name;
    if (!eventName) {
      return reply.code(400).send({ error: "Missing meta.event_name" });
    }

    const workspaceId = payload.meta?.custom_data?.workspace_id ?? null;

    // ── 3. Log to payment_events audit table ─────────────────
    // NOTE: payment_events table is added via migration but not yet in the
    // generated Database type — use `as any` until types are regenerated.
    const admin = options.getAdminClient();
    const eventId = payload.data?.id ?? null;

    const { error: insertError } = await (admin as any)
      .from("payment_events")
      .insert({
        event_name: eventName,
        lemon_squeezy_event_id: eventId,
        workspace_id: workspaceId,
        payload: payload as unknown as Record<string, unknown>,
        processed: false,
      });

    if (insertError) {
      console.error("[Webhook] Failed to log payment event:", (insertError as any).message);
      // Continue processing even if audit logging fails
    }

    // ── 4. Process event ─────────────────────────────────────
    try {
      await options.paymentService.handleWebhookEvent(eventName, payload);

      // Mark as processed
      if (eventId) {
        await (admin as any)
          .from("payment_events")
          .update({ processed: true })
          .eq("lemon_squeezy_event_id", eventId);
      }
    } catch (processingError) {
      const errorMessage =
        processingError instanceof Error
          ? processingError.message
          : "Unknown error";

      console.error(`[Webhook] Error processing ${eventName}:`, errorMessage);

      // Record error in audit trail
      if (eventId) {
        await (admin as any)
          .from("payment_events")
          .update({ error_message: errorMessage })
          .eq("lemon_squeezy_event_id", eventId);
      }

      // Still return 200 to prevent Lemon Squeezy from retrying endlessly.
      // The error is logged for manual investigation.
    }

    return reply.code(200).send({ received: true });
  });
}
