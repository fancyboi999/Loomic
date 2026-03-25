"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";

import type { ImageArtifact } from "@loomic/shared";
import { LoadingScreen } from "../../components/loading-screen";
import { useAuth } from "../../lib/auth-context";
import { CanvasEditor } from "../../components/canvas-editor";
import { ChatSidebar } from "../../components/chat-sidebar";
import { CanvasEmptyHint } from "../../components/canvas-empty-hint";
import { CanvasLogoMenu } from "../../components/canvas-logo-menu";
import { EditableProjectName } from "../../components/editable-project-name";
import { insertImageOnCanvas } from "../../lib/canvas-elements";
import { fetchCanvas, fetchProject, ApiAuthError } from "../../lib/server-api";
import { BrandKitSelector } from "../../components/brand-kit-selector";
import { useJobPolling } from "@/hooks/use-job-polling";
import type { PendingJob } from "@/hooks/use-job-polling";
import { CanvasGeneratingOverlay } from "@/components/canvas-generating-overlay";

function CanvasPageContent() {
  const searchParams = useSearchParams();
  const canvasId = searchParams.get("id");
  const initialPrompt = searchParams.get("prompt") ?? undefined;
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [canvasData, setCanvasData] = useState<{
    id: string;
    name: string;
    projectId: string;
    content: {
      elements: Record<string, unknown>[];
      appState: Record<string, unknown>;
      files: Record<string, Record<string, unknown>>;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled");

  const excalidrawApiRef = useRef<any>(null);
  const [excalidrawApi, setExcalidrawApi] = useState<any>(null);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;

  const accessToken = session?.access_token;
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const { pendingJobs, addJob, completedJobs, clearCompletedJob } = useJobPolling(accessToken ?? "");

  const handleApiReady = useCallback((api: any) => {
    excalidrawApiRef.current = api;
    setExcalidrawApi(api);
  }, []);

  const handleImageGenerated = useCallback((artifact: ImageArtifact) => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    insertImageOnCanvas(api, artifact).catch((err) => {
      console.warn("Failed to insert image on canvas:", err);
    });
  }, []);

  const handleJobSubmitted = useCallback((job: {
    jobId: string;
    title?: string;
    model?: string;
    placement?: { x: number; y: number; width: number; height: number };
  }) => {
    addJob({
      jobId: job.jobId,
      ...(job.title !== undefined ? { title: job.title } : {}),
      ...(job.model !== undefined ? { model: job.model } : {}),
      placement: job.placement ?? { x: 0, y: 0, width: 512, height: 512 },
      startedAt: Date.now(),
    });
  }, [addJob]);

  useEffect(() => {
    const api = excalidrawApiRef.current;
    if (!api || completedJobs.length === 0) return;

    const jobsToProcess = completedJobs.filter((job) => {
      if (job.status !== "succeeded" || !job.result) return false;
      const result = job.result as { signed_url?: string };
      return !!result.signed_url;
    });

    if (jobsToProcess.length === 0) return;

    // Clear jobs immediately to prevent re-processing on next render
    for (const job of jobsToProcess) {
      clearCompletedJob(job.id);
    }

    // Insert images sequentially to avoid race condition on scene updates
    (async () => {
      for (const job of jobsToProcess) {
        const result = job.result as {
          signed_url?: string;
          width?: number;
          height?: number;
          mime_type?: string;
        };
        const artifact: ImageArtifact = {
          type: "image",
          title: job._title,
          url: result.signed_url!,
          mimeType: result.mime_type ?? "image/png",
          width: result.width ?? 512,
          height: result.height ?? 512,
          placement: job._placement,
        };
        try {
          await insertImageOnCanvas(api, artifact);
        } catch (err) {
          console.warn("Failed to insert image on canvas:", err);
        }
      }
    })();
  }, [completedJobs, clearCompletedJob]);

  // Only re-fetch when canvasId changes or on initial auth resolution.
  // Token refreshes (e.g. tab switch back) should NOT trigger a reload —
  // we depend on user.id (stable string) instead of the user object ref.
  const userId = user?.id;

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      routerRef.current.replace("/login");
      return;
    }
    const token = accessTokenRef.current;
    if (!canvasId || !token) return;

    setPageLoading(true);
    fetchCanvas(token, canvasId)
      .then((data) => {
        const c = data.canvas;
        setCanvasData({
          id: c.id,
          name: c.name,
          projectId: c.projectId,
          content: {
            elements: c.content.elements ?? [],
            appState: c.content.appState ?? {},
            files: (c.content as any).files ?? {},
          },
        });
        setPageLoading(false);
        // Fetch project to get brand_kit_id and name
        fetchProject(token, c.projectId)
          .then((projectData) => {
            setBrandKitId(projectData.project.brand_kit_id);
            setProjectName(projectData.project.name ?? "Untitled");
          })
          .catch((err) => console.warn("Failed to fetch project for brand kit:", err));
      })
      .catch((err) => {
        if (err instanceof ApiAuthError) {
          signOutRef.current().then(() => routerRef.current.replace("/login"));
          return;
        }
        setError("Failed to load canvas.");
        setPageLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId, canvasId]);

  if (!canvasId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">No canvas ID specified.</p>
      </div>
    );
  }

  if (authLoading || pageLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!canvasData || !accessToken) return null;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Top-left navigation bar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
        <CanvasLogoMenu
          accessToken={accessToken}
          projectId={canvasData.projectId}
          canvasId={canvasData.id}
          excalidrawApi={excalidrawApi}
        />
        <EditableProjectName
          accessToken={accessToken}
          projectId={canvasData.projectId}
          initialName={projectName}
        />
        <BrandKitSelector
          accessToken={accessToken}
          projectId={canvasData.projectId}
          currentBrandKitId={brandKitId}
          onBrandKitChange={(kitId) => setBrandKitId(kitId)}
        />
      </div>
      <div className="flex-1 relative min-w-0 overflow-hidden">
        <CanvasEditor
          canvasId={canvasData.id}
          projectId={canvasData.projectId}
          accessToken={accessToken}
          initialContent={canvasData.content}
          onApiReady={handleApiReady}
        />
        <CanvasEmptyHint
          excalidrawApi={excalidrawApi}
          onOpenChat={() => setChatOpen(true)}
        />
        <CanvasGeneratingOverlay
          items={pendingJobs}
          excalidrawApi={excalidrawApi}
        />
      </div>
      <ChatSidebar
        accessToken={accessToken}
        canvasId={canvasData.id}
        open={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        onImageGenerated={handleImageGenerated}
        onJobSubmitted={handleJobSubmitted}
        pendingJobs={pendingJobs}
        initialPrompt={initialPrompt}
      />
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CanvasPageContent />
    </Suspense>
  );
}
