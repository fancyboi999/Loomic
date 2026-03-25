"use client";

import type { ProjectSummary } from "@loomic/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CreateProjectDialog } from "@/components/create-project-dialog";
import { HomePrompt, type HomePromptHandle } from "@/components/home-prompt";
import { LoomicLogo } from "@/components/icons/loomic-logo";
import { HomeProjectsSkeleton } from "@/components/skeletons/home-skeleton";
import { useAuth } from "@/lib/auth-context";
import { ApiAuthError, createProject, fetchProjects } from "@/lib/server-api";

/** Maximum number of recent projects shown on the home page. */
const RECENT_PROJECTS_LIMIT = 4;

const EXAMPLE_PROMPT = "帮我设计一个现代简约的品牌 Logo";

// ---------------------------------------------------------------------------
// Sparkle icon for the example pill
// ---------------------------------------------------------------------------
function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="sparkle"
    >
      <path d="M8 0a.5.5 0 0 1 .473.337l1.524 4.416 4.416 1.524a.5.5 0 0 1 0 .946l-4.416 1.524-1.524 4.416a.5.5 0 0 1-.946 0L5.003 8.747.587 7.223a.5.5 0 0 1 0-.946l4.416-1.524L6.527.337A.5.5 0 0 1 8 0Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Date formatter (reused from project-list.tsx convention)
// ---------------------------------------------------------------------------
function formatDate(dateString: string): string {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Home Page
// ---------------------------------------------------------------------------
export default function HomePage() {
  const { session, signOut } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const promptRef = useRef<HomePromptHandle>(null);

  // Ref pattern: avoid token changes cascading through dep arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const routerRef = useRef(router);
  routerRef.current = router;
  const hasInitialized = useRef(false);

  const getToken = useCallback(() => accessTokenRef.current, []);

  // -----------------------------------------------------------------------
  // Load recent projects
  // -----------------------------------------------------------------------
  const loadProjects = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setProjectsLoading(true);
    try {
      const data = await fetchProjects(token);
      setProjects(data.projects.slice(0, RECENT_PROJECTS_LIMIT));
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOutRef.current();
        routerRef.current.replace("/login");
        return;
      }
      // Silently fail — the section just stays empty.
      console.warn("[home] failed to load recent projects", err);
    } finally {
      setProjectsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadProjects();
  }, [loadProjects]);

  // -----------------------------------------------------------------------
  // Prompt submit → create project → navigate to canvas
  // -----------------------------------------------------------------------
  const handlePromptSubmit = useCallback(
    async (prompt: string) => {
      const token = getToken();
      if (!token || submitting) return;

      setSubmitting(true);
      try {
        const result = await createProject(token, {
          name: prompt.substring(0, 50),
        });
        const canvasId = result.project.primaryCanvas.id;
        routerRef.current.push(
          `/canvas?id=${canvasId}&prompt=${encodeURIComponent(prompt)}`,
        );
      } catch (err) {
        if (err instanceof ApiAuthError) {
          await signOutRef.current();
          routerRef.current.replace("/login");
          return;
        }
        console.error("[home] failed to create project from prompt", err);
      } finally {
        setSubmitting(false);
      }
    },
    [getToken, submitting],
  );

  // -----------------------------------------------------------------------
  // CreateProjectDialog submit → create project → navigate to canvas
  // -----------------------------------------------------------------------
  const handleDialogCreate = useCallback(
    async (data: { name: string; description?: string }) => {
      const token = getToken();
      if (!token) return;
      const result = await createProject(token, data);
      const canvasId = result.project.primaryCanvas.id;
      routerRef.current.push(`/canvas?id=${canvasId}`);
    },
    [getToken],
  );

  // -----------------------------------------------------------------------
  // Pill click → fill prompt
  // -----------------------------------------------------------------------
  const handlePillClick = useCallback(() => {
    promptRef.current?.fill(EXAMPLE_PROMPT);
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col items-center overflow-auto px-4 py-16">
      {/* Hero */}
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        {/* Logo + brand name */}
        <div className="mb-4 flex items-center gap-2">
          <LoomicLogo className="size-8 text-black" />
          <span className="text-xl font-semibold text-[#0E1014]">Loomic</span>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-[#0E1014]">
          让创意设计更简单
        </h1>
        <p className="mb-8 text-sm text-[#A8A8A8]">
          你的 AI 设计助手，从想法到作品
        </p>

        {/* Prompt input */}
        <div className="w-full">
          <HomePrompt
            ref={promptRef}
            onSubmit={handlePromptSubmit}
            disabled={submitting}
          />
        </div>

        {/* Example pill */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePillClick}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            <SparkleIcon className="h-3 w-3" />
            设计
          </button>
        </div>
      </div>

      {/* Recent projects */}
      <div className="mt-14 w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#0E1014]">最近项目</h2>
          <Link
            href="/projects"
            className="text-xs text-[#A8A8A8] transition-colors hover:text-[#0E1014]"
          >
            查看全部
          </Link>
        </div>

        {projectsLoading ? (
          <HomeProjectsSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {/* New project card */}
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="flex aspect-[286/208] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E3E3E3] transition-colors hover:border-[#C0C0C0] hover:bg-[#FAFAFA]"
            >
              <span className="text-2xl text-[#C0C0C0]">+</span>
              <span className="text-xs text-[#919191]">新建项目</span>
            </button>

            {/* Project cards */}
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() =>
                  router.push(`/canvas?id=${project.primaryCanvas.id}`)
                }
                className="group cursor-pointer overflow-hidden rounded-lg bg-white text-left transition-shadow hover:shadow-md"
              >
                {/* Thumbnail */}
                <div className="aspect-[395/227] overflow-hidden rounded-lg bg-[#F5F5F5]">
                  {project.thumbnailUrl && (
                    <img
                      src={project.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                {/* Info */}
                <div className="px-1 py-2">
                  <div className="truncate text-sm font-medium text-[#0E1014]">
                    {project.name}
                  </div>
                  <div className="px-1 text-[11px] text-[#919191]">
                    更新于 {formatDate(project.updatedAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create project dialog (opened from "+ 新建项目" card) */}
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleDialogCreate}
      />
    </div>
  );
}
