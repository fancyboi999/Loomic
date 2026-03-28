"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/toast";
import { ApiAuthError, deleteProject } from "@/lib/server-api";

/**
 * Shared hook for deleting a project with confirmation dialog state.
 * Used by Home page, Projects page, and Canvas logo menu.
 */
export function useDeleteProject(opts?: {
  onDeleted?: (projectId: string) => void;
}) {
  const { session, signOut } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  /** Step 1: open confirm dialog */
  const requestDelete = useCallback((projectId: string) => {
    setPendingId(projectId);
  }, []);

  /** Step 2: user confirms */
  const confirmDelete = useCallback(async () => {
    const token = session?.access_token;
    if (!token || !pendingId) return;

    setDeleting(true);
    try {
      await deleteProject(token, pendingId);
      toastSuccess("项目已删除");
      opts?.onDeleted?.(pendingId);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        return;
      }
      toastError("项目删除失败");
    } finally {
      setDeleting(false);
      setPendingId(null);
    }
  }, [session?.access_token, pendingId, toastSuccess, toastError, opts]);

  /** Step 3: user cancels */
  const cancelDelete = useCallback(() => {
    setPendingId(null);
  }, []);

  return {
    /** The project ID pending confirmation, null if no dialog open */
    pendingId,
    /** Whether the delete API call is in progress */
    deleting,
    /** Open confirm dialog for a project */
    requestDelete,
    /** Confirm and execute deletion */
    confirmDelete,
    /** Cancel and close dialog */
    cancelDelete,
  };
}
