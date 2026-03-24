import { z } from "zod";

export const placementSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const imageArtifactSchema = z.object({
  type: z.literal("image"),
  title: z.string().optional(),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema.optional(),
});

export const toolArtifactSchema = z.discriminatedUnion("type", [
  imageArtifactSchema,
]);

export type Placement = z.infer<typeof placementSchema>;
export type ImageArtifact = z.infer<typeof imageArtifactSchema>;
export type ToolArtifact = z.infer<typeof toolArtifactSchema>;
