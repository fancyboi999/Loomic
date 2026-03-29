"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImageGenerationPreference } from "@loomic/shared";

import type { ReadyAttachment } from "@/hooks/use-image-attachments";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/toast";
import { ApiAuthError, createProject } from "@/lib/server-api";

/** sessionStorage key used to pass attachments from Home → Canvas auto-send. */
export const INITIAL_ATTACHMENTS_KEY = "loomic:initial-attachments";
export const INITIAL_IMAGE_GENERATION_PREFERENCE_KEY =
  "loomic:initial-image-generation-preference";

/**
 * Shared hook for creating an Untitled project and navigating to its canvas.
 * Used by Home page, Projects page, and Canvas logo menu.
 */
export function useCreateProject() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { error: toastError } = useToast();
  const [creating, setCreating] = useState(false);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;

  const create = useCallback(
    async (opts?: {
      prompt?: string;
      attachments?: ReadyAttachment[];
      imageGenerationPreference?: ImageGenerationPreference;
    }) => {
      const token = session?.access_token;
      if (!token || creating) return;

      // Persist attachments in sessionStorage BEFORE window.open so the
      // new tab's cloned sessionStorage already contains them.
      // (sessionStorage is per-tab; new tabs get a snapshot at open time.)
      if (opts?.attachments && opts.attachments.length > 0) {
        try {
          sessionStorage.setItem(
            INITIAL_ATTACHMENTS_KEY,
            JSON.stringify(opts.attachments),
          );
        } catch {
          // sessionStorage write failure is non-fatal
        }
      } else {
        sessionStorage.removeItem(INITIAL_ATTACHMENTS_KEY);
      }

      if (opts?.imageGenerationPreference) {
        try {
          sessionStorage.setItem(
            INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
            JSON.stringify(opts.imageGenerationPreference),
          );
        } catch {
          // sessionStorage write failure is non-fatal
        }
      } else {
        sessionStorage.removeItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY);
      }

      // Open the new tab synchronously within the user gesture so the
      // browser popup-blocker doesn't intervene. We'll set the real URL
      // once the API call returns.
      const newTab = window.open("about:blank", "_blank");

      setCreating(true);
      try {
        const result = await createProject(token, { name: "Untitled" });
        const canvasId = result.project.primaryCanvas.id;

        const url = opts?.prompt
          ? `/canvas?id=${canvasId}&prompt=${encodeURIComponent(opts.prompt)}`
          : `/canvas?id=${canvasId}`;

        if (newTab) {
          newTab.location.href = url;
        } else {
          // Popup was blocked despite sync open — fallback to in-page navigation
          routerRef.current.push(url);
        }
        setCreating(false);
      } catch (err) {
        // Close the blank tab on failure
        newTab?.close();
        if (err instanceof ApiAuthError) {
          await signOutRef.current();
          routerRef.current.replace("/login");
          return;
        }
        toastError("项目创建失败");
        setCreating(false);
      }
    },
    [session?.access_token, creating, toastError],
  );

  return { create, creating };
}
