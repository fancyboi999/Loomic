"use client";

import type { WorkspaceSummary, ProjectSummary } from "@loomic/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LoadingScreen } from "@/components/loading-screen";
import { ProjectList } from "@/components/project-list";
import { ProjectsSkeleton } from "@/components/skeletons/projects-skeleton";
import { useCreateProject } from "@/hooks/use-create-project";
import { useAuth } from "@/lib/auth-context";
import {
  fetchViewer,
  fetchProjects,
  ApiAuthError,
} from "@/lib/server-api";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { create: createNewProject, creating } = useCreateProject();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
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

  const handleDeleted = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  if (creating) {
    return <LoadingScreen />;
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
    return <ProjectsSkeleton />;
  }

  return (
    <div className="p-6">
      <ProjectList
        projects={projects}
        highlightId={highlightId}
        onCreateClick={() => createNewProject()}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
