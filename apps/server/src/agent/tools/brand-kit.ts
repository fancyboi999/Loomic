import { tool } from "langchain";
import { z } from "zod";

const brandKitSchema = z.object({});

export function createBrandKitTool(
  deps: { createUserClient: (accessToken: string) => any },
  brandKitId: string,
) {
  return tool(
    async (_input, config) => {
      const accessToken = (config as any)?.configurable?.access_token;
      if (!accessToken) {
        return JSON.stringify({ error: "No access token available" });
      }

      const client = deps.createUserClient(accessToken);

      // Fetch kit
      const { data: kit } = await client
        .from("brand_kits")
        .select("id, name, guidance_text")
        .eq("id", brandKitId)
        .maybeSingle();

      if (!kit) {
        return JSON.stringify({ error: "Brand kit not found" });
      }

      // Fetch assets
      const { data: assets } = await client
        .from("brand_kit_assets")
        .select("asset_type, display_name, role, text_content, file_url, metadata")
        .eq("kit_id", brandKitId)
        .order("sort_order", { ascending: true });

      const safeAssets = assets ?? [];

      // Resolve signed URLs for file-based assets (logo/image)
      const fileAssets = safeAssets.filter((a: any) => a.file_url);
      if (fileAssets.length > 0) {
        const paths = fileAssets.map((a: any) => a.file_url as string);
        const { data: signedData } = await client.storage
          .from("brand-kit-assets")
          .createSignedUrls(paths, 3600);

        if (signedData) {
          const urlByPath = new Map(
            signedData
              .filter((e: any) => e.signedUrl && e.path)
              .map((e: any) => [e.path, e.signedUrl]),
          );
          for (const asset of fileAssets) {
            const url = urlByPath.get(asset.file_url);
            if (url) asset.file_url = url;
          }
        }
      }

      const result = {
        kit_name: kit.name,
        design_guidance: kit.guidance_text ?? "",
        colors: safeAssets
          .filter((a: any) => a.asset_type === "color")
          .map((a: any) => ({
            name: a.display_name,
            hex: a.text_content,
            role: a.role,
          })),
        fonts: safeAssets
          .filter((a: any) => a.asset_type === "font")
          .map((a: any) => ({
            name: a.display_name,
            family: a.text_content,
            weight: (a.metadata as any)?.weight ?? "400",
            role: a.role,
          })),
        logos: safeAssets
          .filter((a: any) => a.asset_type === "logo")
          .map((a: any) => ({
            name: a.display_name,
            url: a.file_url,
            role: a.role,
          })),
        images: safeAssets
          .filter((a: any) => a.asset_type === "image")
          .map((a: any) => ({
            name: a.display_name,
            url: a.file_url,
          })),
      };

      return JSON.stringify(result, null, 2);
    },
    {
      name: "get_brand_kit",
      description:
        "查询当前项目绑定的品牌套件信息，包含设计指南、颜色、字体、Logo等品牌资产。当用户提到品牌、风格、设计规范时使用此工具。",
      schema: brandKitSchema,
    },
  );
}
