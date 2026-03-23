"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";

import { useAuth } from "../../lib/auth-context";
import { CanvasEditor } from "../../components/canvas-editor";
import { ChatSidebar } from "../../components/chat-sidebar";
import { fetchCanvas, ApiAuthError } from "../../lib/server-api";

function CanvasPageContent() {
  const searchParams = useSearchParams();
  const canvasId = searchParams.get("id");
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [canvasData, setCanvasData] = useState<{
    id: string;
    name: string;
    content: {
      elements: Record<string, unknown>[];
      appState: Record<string, unknown>;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;

  const accessToken = session?.access_token;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      routerRef.current.replace("/login");
      return;
    }
    if (!canvasId || !accessToken) return;

    setPageLoading(true);
    fetchCanvas(accessToken, canvasId)
      .then((data) => {
        setCanvasData(data.canvas);
        setPageLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiAuthError) {
          signOutRef.current().then(() => routerRef.current.replace("/login"));
          return;
        }
        setError("Failed to load canvas.");
        setPageLoading(false);
      });
  }, [authLoading, user, accessToken, canvasId]);

  if (!canvasId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">No canvas ID specified.</p>
      </div>
    );
  }

  if (authLoading || pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          <p className="text-sm text-muted-foreground">Loading canvas...</p>
        </div>
      </div>
    );
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
    <div className="flex h-screen w-screen">
      <div className="flex-1 relative">
        <CanvasEditor
          canvasId={canvasData.id}
          accessToken={accessToken}
          initialContent={canvasData.content}
        />
      </div>
      <ChatSidebar
        accessToken={accessToken}
        canvasId={canvasData.id}
        open={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
      />
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <CanvasPageContent />
    </Suspense>
  );
}
