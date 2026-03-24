"use client";

import type { WorkspaceSummary, ProjectSummary } from "@loomic/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CreateProjectDialog } from "../../components/create-project-dialog";
import { ProjectList } from "../../components/project-list";
import { ProjectSidebar } from "../../components/project-sidebar";
import { useAuth } from "../../lib/auth-context";
import {
  fetchViewer,
  fetchProjects,
  createProject,
  deleteProject,
  ApiAuthError,
} from "../../lib/server-api";
import { Button } from "../../components/ui/button";

export default function ProjectsPage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const accessToken = session?.access_token;

  // Keep stable references to avoid re-triggering loadData on every render
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setPageLoading(true);
    setLoadError(null);

    try {
      const viewer = await fetchViewer(accessToken);
      setWorkspace(viewer.workspace);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        routerRef.current.replace("/login");
        return;
      }
      setLoadError("Failed to load workspace. Please try again.");
      setPageLoading(false);
      return;
    }

    try {
      const data = await fetchProjects(accessToken);
      setProjects(data.projects);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        routerRef.current.replace("/login");
        return;
      }
      setLoadError("Failed to load projects. Please try again.");
    } finally {
      setPageLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      routerRef.current.replace("/login");
      return;
    }
    loadData();
  }, [authLoading, user, loadData]);

  async function handleCreate(data: { name: string; description?: string }) {
    if (!accessToken) return;
    const result = await createProject(accessToken, data);
    // Refresh list and highlight new project
    setHighlightId(result.project.id);
    setTimeout(() => setHighlightId(null), 3000);
    try {
      const updated = await fetchProjects(accessToken);
      setProjects(updated.projects);
    } catch {
      // Refresh failed but project was created -- add it manually
      setProjects((prev) => [result.project, ...prev]);
    }
  }

  async function handleDelete(projectId: string) {
    if (!accessToken) return;
    await deleteProject(accessToken, projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  if (authLoading || (!user && !loadError)) return null;

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <ProjectSidebar workspace={workspace} projects={projects} />
      <main className="flex-1 p-6">
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
      </main>
    </div>
  );
}
