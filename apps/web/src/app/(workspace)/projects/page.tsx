"use client";

import type { WorkspaceSummary, ProjectSummary } from "@loomic/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { LoadingScreen } from "@/components/loading-screen";
import { ProjectList } from "@/components/project-list";
import { useAuth } from "@/lib/auth-context";
import {
  fetchViewer,
  fetchProjects,
  createProject,
  deleteProject,
  ApiAuthError,
} from "@/lib/server-api";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  const { session, signOut } = useAuth();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Ref pattern: prevent token refresh from cascading through dependency arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;
  const hasInitialized = useRef(false);

  const getToken = useCallback(() => accessTokenRef.current, []);

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setPageLoading(true);
    setLoadError(null);

    try {
      const [viewer, data] = await Promise.all([
        fetchViewer(token),
        fetchProjects(token),
      ]);
      setWorkspace(viewer.workspace);
      setProjects(data.projects);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        routerRef.current.replace("/login");
        return;
      }
      setLoadError("Failed to load data. Please try again.");
    } finally {
      setPageLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadData();
  }, [loadData]);

  async function handleCreate(data: { name: string; description?: string }) {
    const token = getToken();
    if (!token) return;
    const result = await createProject(token, data);
    // Refresh list and highlight new project
    setHighlightId(result.project.id);
    setTimeout(() => setHighlightId(null), 3000);
    try {
      const updated = await fetchProjects(token);
      setProjects(updated.projects);
    } catch {
      // Refresh failed but project was created -- add it manually
      setProjects((prev) => [result.project, ...prev]);
    }
  }

  async function handleDelete(projectId: string) {
    const token = getToken();
    if (!token) return;
    await deleteProject(token, projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="p-6">
      <ProjectList
        projects={projects}
        highlightId={highlightId}
        onCreateClick={() => setDialogOpen(true)}
        onDelete={handleDelete}
      />
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}
