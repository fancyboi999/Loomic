import { z } from "zod";

export const imageArtifactSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const toolArtifactSchema = z.discriminatedUnion("type", [
  imageArtifactSchema,
]);

export type ImageArtifact = z.infer<typeof imageArtifactSchema>;
export type ToolArtifact = z.infer<typeof toolArtifactSchema>;
