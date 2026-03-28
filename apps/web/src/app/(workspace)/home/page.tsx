"use client";

import type { ProjectSummary } from "@loomic/shared";
import type { ReadyAttachment } from "@/hooks/use-image-attachments";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Trash2 } from "lucide-react";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { HomePrompt, type HomePromptHandle } from "@/components/home-prompt";
import { LoadingScreen } from "@/components/loading-screen";
import { LoomicLogo } from "@/components/icons/loomic-logo";
import { HomeProjectsSkeleton } from "@/components/skeletons/home-skeleton";
import { useCreateProject } from "@/hooks/use-create-project";
import { useDeleteProject } from "@/hooks/use-delete-project";
import { useImageAttachments } from "@/hooks/use-image-attachments";
import { useAuth } from "@/lib/auth-context";
import { ApiAuthError, fetchProjects } from "@/lib/server-api";

/** Maximum number of recent projects shown on the home page. */
const RECENT_PROJECTS_LIMIT = 4;

const EXAMPLE_PROMPT = "帮我设计一个现代简约的品牌 Logo";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const cardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

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

  const { create: createNewProject, creating } = useCreateProject();
  const handleDeleted = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const { pendingId, deleting, requestDelete, confirmDelete, cancelDelete } =
    useDeleteProject({ onDeleted: handleDeleted });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const promptRef = useRef<HomePromptHandle>(null);

  // Ref pattern: avoid token changes cascading through dep arrays
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;

  // Image attachments for the home prompt.
  // No projectId yet — uploads go to the general bucket; the project is created on submit.
  const {
    attachments: imageAttachments,
    addFiles,
    removeAttachment,
    clearAll: clearAttachments,
    isUploading,
    readyAttachments,
  } = useImageAttachments(session?.access_token ?? "");
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
    (prompt: string, attachments?: ReadyAttachment[]) => {
      clearAttachments();
      createNewProject({
        prompt,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });
    },
    [createNewProject, clearAttachments],
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
  if (creating) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex h-full flex-col items-center overflow-auto px-6 py-16">
      {/* Hero */}
      <motion.div
        initial="hidden"
        animate="visible"
        className="flex w-full max-w-3xl flex-col items-center text-center"
      >
        {/* Logo + brand name */}
        <motion.div variants={fadeUp} custom={0} className="mb-4 flex items-center gap-2">
          <LoomicLogo className="size-8 text-black" />
          <span className="text-xl font-semibold text-foreground">Loomic</span>
        </motion.div>

        <motion.h1 variants={fadeUp} custom={1} className="mb-2 text-2xl font-bold text-foreground">
          让创意设计更简单
        </motion.h1>
        <motion.p variants={fadeUp} custom={2} className="mb-8 text-base text-muted-foreground">
          你的 AI 设计助手，从想法到作品
        </motion.p>

        {/* Prompt input */}
        <motion.div variants={fadeUp} custom={3} className="w-full">
          <HomePrompt
            ref={promptRef}
            onSubmit={handlePromptSubmit}
            disabled={creating}
            attachments={imageAttachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            isUploading={isUploading}
            readyAttachments={readyAttachments}
          />
        </motion.div>

        {/* Example pill */}
        <motion.div variants={fadeUp} custom={4} className="mt-3 flex items-center gap-2">
          <motion.button
            type="button"
            onClick={handlePillClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            <SparkleIcon className="h-3 w-3" />
            设计
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Recent projects */}
      <div className="mt-14 w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
          className="mb-4 flex items-center justify-between"
        >
          <h2 className="text-lg font-medium text-foreground">最近项目</h2>
          <Link
            href="/projects"
            className="flex items-center gap-1 text-base text-muted-foreground transition-colors hover:text-foreground"
          >
            查看全部
            <span className="flex h-6 w-6 -rotate-90 items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 13 8" className="h-[6px] w-[10px]">
                <path stroke="currentColor" d="m1 .657 5.657 5.657L12.314.657" />
              </svg>
            </span>
          </Link>
        </motion.div>

        {projectsLoading ? (
          <HomeProjectsSkeleton />
        ) : (
          <motion.div
            variants={cardStagger}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {/* New project card */}
            <motion.button
              variants={cardItem}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={creating}
              onClick={() => createNewProject()}
              className="aspect-[286/208] cursor-pointer rounded-xl bg-card p-3 shadow-card transition-shadow duration-300 hover:shadow-md sm:rounded-2xl"
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" className="h-6 w-6 text-foreground">
                  <path fill="currentColor" fillRule="evenodd" d="M6.417 2.917a.583.583 0 0 1 1.166 0v3.5h3.5a.583.583 0 0 1 0 1.166h-3.5v3.5a.583.583 0 1 1-1.166 0v-3.5h-3.5a.583.583 0 1 1 0-1.166h3.5z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold text-foreground">新建项目</span>
              </div>
            </motion.button>

            {/* Project cards */}
            {projects.map((project) => (
              <motion.div
                key={project.id}
                variants={cardItem}
                whileHover={{ y: -4 }}
                className="group relative aspect-[286/208] cursor-pointer rounded-lg bg-card p-3 text-left shadow-card transition-shadow duration-300 hover:shadow-md"
                onClick={() =>
                  router.push(`/canvas?id=${project.primaryCanvas.id}`)
                }
              >
                {/* Trash icon — hover reveal */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDelete(project.id);
                  }}
                  className="absolute top-5 right-5 z-10 size-8 flex items-center justify-center rounded-[4px] bg-[rgba(51,51,51,0.8)] text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-black/70"
                >
                  <Trash2 size={14} />
                </button>
                {/* Thumbnail */}
                <div className="aspect-[395/227] w-full overflow-hidden rounded-lg bg-muted">
                  {project.thumbnailUrl && (
                    <img
                      src={project.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                </div>
                {/* Info */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="truncate text-sm text-foreground">
                    {project.name}
                  </div>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  更新于 {formatDate(project.updatedAt)}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <DeleteProjectDialog
        open={pendingId !== null}
        deleting={deleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
