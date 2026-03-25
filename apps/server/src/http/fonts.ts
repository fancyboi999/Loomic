import type { FastifyInstance } from "fastify";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { ServerEnv } from "../config/env.js";

type GoogleFontItem = {
  family: string;
  category: string;
  variants: string[];
};

type FontsCache = {
  fonts: GoogleFontItem[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let fontsCache: FontsCache | null = null;

function getProxyDispatcher() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxyUrl) return undefined;
  return new ProxyAgent(proxyUrl);
}

async function loadGoogleFonts(apiKey: string): Promise<GoogleFontItem[]> {
  if (!apiKey) return [];

  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`;
  const dispatcher = getProxyDispatcher();
  const res = await undiciFetch(url, dispatcher ? { dispatcher } : {});
  if (!res.ok) {
    console.error(`Google Fonts API error: ${res.status}`);
    return fontsCache?.fonts ?? [];
  }

  const data = (await res.json()) as { items: Array<{ family: string; category: string; variants: string[] }> };
  return (data.items ?? []).map((item) => ({
    family: item.family,
    category: item.category,
    variants: item.variants,
  }));
}

async function getCachedFonts(apiKey: string): Promise<GoogleFontItem[]> {
  if (fontsCache && Date.now() - fontsCache.fetchedAt < CACHE_TTL_MS) {
    return fontsCache.fonts;
  }
  const fonts = await loadGoogleFonts(apiKey);
  if (fonts.length > 0) {
    fontsCache = { fonts, fetchedAt: Date.now() };
  }
  return fonts;
}

export function registerFontsRoutes(
  app: FastifyInstance,
  options: { env: ServerEnv },
) {
  app.get("/api/fonts", async (request, reply) => {
    const { search, category } = request.query as {
      search?: string;
      category?: string;
    };

    let fonts = await getCachedFonts(options.env.googleFontsApiKey ?? "");

    if (search) {
      const q = search.toLowerCase();
      fonts = fonts.filter((f) => f.family.toLowerCase().includes(q));
    }
    if (category) {
      fonts = fonts.filter((f) => f.category === category);
    }

    return reply.send({ fonts });
  });
}
