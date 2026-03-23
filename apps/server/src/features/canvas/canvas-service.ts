import type { CanvasContent, CanvasDetail } from "@loomic/shared";

import type { AuthenticatedUser, UserSupabaseClient } from "../../supabase/user.js";

export class CanvasServiceError extends Error {
  readonly statusCode: number;
  readonly code: "canvas_not_found" | "canvas_save_failed";

  constructor(
    code: "canvas_not_found" | "canvas_save_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CanvasService = {
  getCanvas(user: AuthenticatedUser, canvasId: string): Promise<CanvasDetail>;
  saveCanvasContent(
    user: AuthenticatedUser,
    canvasId: string,
    content: CanvasContent,
  ): Promise<void>;
};

export function createCanvasService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): CanvasService {
  return {
    async getCanvas(user, canvasId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("canvases")
        .select("id, name, project_id, content")
        .eq("id", canvasId)
        .single();

      if (error || !data) {
        throw new CanvasServiceError("canvas_not_found", "Canvas not found.", 404);
      }

      return {
        id: data.id,
        name: data.name,
        projectId: data.project_id,
        content: (data.content as CanvasContent) ?? { elements: [], appState: {} },
      };
    },

    async saveCanvasContent(user, canvasId, content) {
      const client = options.createUserClient(user.accessToken);
      const { error } = await client
        .from("canvases")
        .update({ content: content as unknown as Record<string, unknown> })
        .eq("id", canvasId);

      if (error) {
        throw new CanvasServiceError("canvas_save_failed", "Unable to save canvas.", 500);
      }
    },
  };
}
