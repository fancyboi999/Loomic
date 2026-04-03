import { z } from "zod";

// === Enums ===

export const skillCategorySchema = z.enum([
  "design",
  "generation",
  "code",
  "data",
  "writing",
  "custom",
]);
export type SkillCategory = z.infer<typeof skillCategorySchema>;

export const skillSourceSchema = z.enum(["system", "community", "user"]);
export type SkillSource = z.infer<typeof skillSourceSchema>;

// === Entity Schemas ===

export const skillListItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string(),
  author: z.string(),
  version: z.string(),
  category: skillCategorySchema,
  iconName: z.string().nullable(),
  source: skillSourceSchema,
  isFeatured: z.boolean(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  // Populated when listing for a workspace:
  installed: z.boolean().optional(),
  enabled: z.boolean().optional(),
  installedAt: z.string().datetime({ offset: true }).optional(),
});
export type SkillListItem = z.infer<typeof skillListItemSchema>;

// === Skill File Entry ===

export const skillFileEntrySchema = z.object({
  id: z.string().min(1),
  filePath: z.string().min(1),
  content: z.string(),
  mimeType: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type SkillFileEntry = z.infer<typeof skillFileEntrySchema>;

export const skillDetailSchema = skillListItemSchema.extend({
  license: z.string().nullable(),
  skillContent: z.string(),
  createdBy: z.string().nullable(),
  sourceUrl: z.string().nullable().optional(),
  packageName: z.string().nullable().optional(),
  files: z.array(skillFileEntrySchema).optional(),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;

// === Request Schemas ===

export const skillCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  category: skillCategorySchema,
  skillContent: z.string().min(1),
  iconName: z.string().max(100).optional(),
  files: z.array(z.object({
    filePath: z.string().min(1).max(500),
    content: z.string(),
    mimeType: z.string().max(100).optional(),
  })).optional(),
});
export type SkillCreateRequest = z.infer<typeof skillCreateRequestSchema>;

export const skillUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  category: skillCategorySchema.optional(),
  skillContent: z.string().min(1).optional(),
  iconName: z.string().max(100).optional(),
});
export type SkillUpdateRequest = z.infer<typeof skillUpdateRequestSchema>;

export const workspaceSkillToggleRequestSchema = z.object({
  enabled: z.boolean(),
});
export type WorkspaceSkillToggleRequest = z.infer<
  typeof workspaceSkillToggleRequestSchema
>;

// === Response Schemas ===

export const skillListResponseSchema = z.object({
  skills: z.array(skillListItemSchema),
});
export type SkillListResponse = z.infer<typeof skillListResponseSchema>;

export const skillDetailResponseSchema = z.object({
  skill: skillDetailSchema,
});
export type SkillDetailResponse = z.infer<typeof skillDetailResponseSchema>;

export const workspaceSkillListResponseSchema = z.object({
  skills: z.array(skillListItemSchema),
});
export type WorkspaceSkillListResponse = z.infer<
  typeof workspaceSkillListResponseSchema
>;

export const skillFilesResponseSchema = z.object({
  files: z.array(skillFileEntrySchema),
});
export type SkillFilesResponse = z.infer<typeof skillFilesResponseSchema>;
