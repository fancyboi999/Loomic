import { getServerBaseUrl } from "./env";

export type GoogleFontItem = {
  family: string;
  category: string;
  variants: string[];
};

export async function fetchGoogleFonts(
  search?: string,
  category?: string,
): Promise<GoogleFontItem[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);

  const url = `${getServerBaseUrl()}/api/fonts?${params}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { fonts: GoogleFontItem[] };
  return data.fonts;
}
