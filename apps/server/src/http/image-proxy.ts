import type { FastifyInstance } from "fastify";

/**
 * Proxy endpoint for fetching external images server-side, bypassing browser CORS restrictions.
 * Used by the frontend to load generated images into Excalidraw canvas.
 */
export function registerImageProxyRoute(app: FastifyInstance) {
  app.get<{
    Querystring: { url: string };
  }>("/api/proxy-image", async (request, reply) => {
    const { url } = request.query;

    if (!url || typeof url !== "string") {
      return reply.status(400).send({ error: "Missing url parameter" });
    }

    // Only allow proxying from known image CDNs and Supabase Storage
    const allowed = [
      "replicate.delivery",
      "replicate.com",
      "pbxt.replicate.delivery",
      "supabase.co",
    ];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }

    if (!allowed.some((domain) => parsedUrl.hostname.endsWith(domain))) {
      return reply.status(403).send({ error: "Domain not allowed" });
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return reply
          .status(response.status)
          .send({ error: "Upstream fetch failed" });
      }

      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      const buffer = Buffer.from(await response.arrayBuffer());

      return reply
        .header("content-type", contentType)
        .header("cache-control", "public, max-age=86400")
        .send(buffer);
    } catch {
      return reply.status(502).send({ error: "Failed to fetch image" });
    }
  });
}
